package proxy

import (
	"ant-chrome/backend/internal/apppath"
	"ant-chrome/backend/internal/config"
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const defaultTorBootstrapTimeout = 75 * time.Second

var torBootstrapMarker = []byte("Bootstrapped ")

type TorProfileRuntimeStatus struct {
	ProfileID        string `json:"profileId"`
	State            string `json:"state"`
	Ready            bool   `json:"ready"`
	PID              int    `json:"pid"`
	SocksAddress     string `json:"socksAddress"`
	BootstrapPercent int    `json:"bootstrapPercent"`
	StartedAt        string `json:"startedAt"`
	LastError        string `json:"lastError,omitempty"`
}

type torCommandFactory func(binaryPath string, args ...string) *exec.Cmd

type TorManager struct {
	AppRoot string

	configMu             sync.RWMutex
	configuredBinaryPath string

	mu              sync.Mutex
	runtimes        map[string]*torProfileRuntime
	lastGenerations map[string]string
	commandFactory  torCommandFactory
	startTimeout    time.Duration

	// OnRuntimeDied is retained for compatibility with callers that do not
	// need generation identity. New app integrations should use
	// OnRuntimeDiedWithGeneration.
	OnRuntimeDied               func(profileID string, err error)
	OnRuntimeDiedWithGeneration func(profileID string, generation string, err error)
}

type torProfileRuntime struct {
	profileID  string
	generation string
	dataDir    string
	port       int
	cmd        *exec.Cmd
	startedAt  time.Time
	readyCh    chan struct{}
	doneCh     chan struct{}

	mu               sync.Mutex
	state            string
	bootstrapPercent int
	lastError        string
	ready            bool
	stopping         bool
}

func NewTorManager(cfg *config.Config, appRoot string) *TorManager {
	return newTorManagerWithOptions(cfg, appRoot, exec.Command, defaultTorBootstrapTimeout)
}

func newTorManagerWithOptions(cfg *config.Config, appRoot string, factory torCommandFactory, timeout time.Duration) *TorManager {
	if factory == nil {
		factory = exec.Command
	}
	if timeout <= 0 {
		timeout = defaultTorBootstrapTimeout
	}
	return &TorManager{
		configuredBinaryPath: torBinaryPathFromConfig(cfg),
		AppRoot:              strings.TrimSpace(appRoot),
		runtimes:             make(map[string]*torProfileRuntime),
		lastGenerations:      make(map[string]string),
		commandFactory:       factory,
		startTimeout:         timeout,
	}
}

func torBinaryPathFromConfig(cfg *config.Config) string {
	if cfg == nil {
		return ""
	}
	return strings.TrimSpace(cfg.Browser.TorBinaryPath)
}

func (m *TorManager) UpdateConfig(cfg *config.Config) {
	if m == nil {
		return
	}
	m.configMu.Lock()
	m.configuredBinaryPath = torBinaryPathFromConfig(cfg)
	m.configMu.Unlock()
}

func (m *TorManager) ConfiguredBinaryPath() string {
	if m == nil {
		return ""
	}
	m.configMu.RLock()
	defer m.configMu.RUnlock()
	return m.configuredBinaryPath
}

func (m *TorManager) ValidateBinaryPath(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", fmt.Errorf("Tor 可执行文件路径尚未配置")
	}
	resolved := resolveEnvPath(path, m.AppRoot)
	absolute, err := filepath.Abs(resolved)
	if err != nil {
		return "", fmt.Errorf("解析 Tor 可执行文件路径失败: %w", err)
	}
	info, err := os.Stat(absolute)
	if err != nil {
		return "", fmt.Errorf("Tor 可执行文件不可用: %w", err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("Tor 路径不是普通文件: %s", absolute)
	}
	if goruntime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0 {
		return "", fmt.Errorf("Tor 文件没有可执行权限: %s", absolute)
	}
	return filepath.Clean(absolute), nil
}

func (m *TorManager) AcquireProfile(profileID string) (string, string, error) {
	if m == nil {
		return "", "", fmt.Errorf("Tor 运行时管理器未初始化")
	}
	profileID = strings.TrimSpace(profileID)
	if profileID == "" {
		return "", "", fmt.Errorf("Tor 运行时缺少实例 ID")
	}

	// Keep the reservation and the command construction under one manager lock.
	// This prevents two concurrent acquires for the same profile from rewriting
	// one persistent torrc with different SOCKS ports before either is visible.
	m.mu.Lock()
	if current := m.runtimes[profileID]; current != nil {
		status := current.status()
		m.mu.Unlock()
		if status.Ready {
			return status.SocksAddress, profileID, nil
		}
		return "", "", fmt.Errorf("Tor 运行时正在启动，请稍后重试")
	}

	binaryPath, err := m.ValidateBinaryPath(m.ConfiguredBinaryPath())
	if err != nil {
		m.mu.Unlock()
		return "", "", err
	}
	port, err := nextAvailablePort()
	if err != nil {
		m.mu.Unlock()
		return "", "", fmt.Errorf("Tor SOCKS 端口分配失败: %w", err)
	}
	dataDir, torrcPath, err := m.prepareProfileState(profileID, port)
	if err != nil {
		m.mu.Unlock()
		return "", "", err
	}

	cmd := m.commandFactory(binaryPath, "-f", torrcPath)
	cmd.Dir = filepath.Dir(binaryPath)
	hideWindow(cmd)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		m.mu.Unlock()
		return "", "", fmt.Errorf("Tor 标准输出捕获失败: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		m.mu.Unlock()
		return "", "", fmt.Errorf("Tor 错误输出捕获失败: %w", err)
	}
	if err := cmd.Start(); err != nil {
		m.mu.Unlock()
		return "", "", fmt.Errorf("Tor 进程启动失败: %w", err)
	}

	runtime := &torProfileRuntime{
		profileID:  profileID,
		generation: fmt.Sprintf("%d", time.Now().UnixNano()),
		dataDir:    dataDir,
		port:       port,
		cmd:        cmd,
		startedAt:  time.Now(),
		readyCh:    make(chan struct{}),
		doneCh:     make(chan struct{}),
		state:      "starting",
	}
	m.runtimes[profileID] = runtime
	m.mu.Unlock()

	go m.scanTorOutput(runtime, stdout)
	go m.scanTorOutput(runtime, stderr)
	go m.waitTorProcess(runtime)

	deadline := time.NewTimer(m.startTimeout)
	defer deadline.Stop()
	select {
	case <-runtime.readyCh:
		remaining := m.startTimeout - time.Since(runtime.startedAt)
		if remaining <= 0 {
			remaining = 500 * time.Millisecond
		}
		if remaining > 5*time.Second {
			remaining = 5 * time.Second
		}
		if err := waitSocks5Ready("127.0.0.1", port, remaining); err != nil {
			runtime.setError(err)
			_ = m.stopRuntime(profileID, runtime)
			return "", "", fmt.Errorf("Tor SOCKS 就绪校验失败: %w", err)
		}
		runtime.markReady()
		return torSocksAddress(port), profileID, nil
	case <-runtime.doneCh:
		status := runtime.status()
		if status.LastError == "" {
			status.LastError = "Tor 进程在完成引导前退出"
		}
		return "", "", fmt.Errorf("%s", status.LastError)
	case <-deadline.C:
		err := fmt.Errorf("Tor 引导在 %s 内未完成", m.startTimeout.Round(time.Second))
		runtime.setError(err)
		_ = m.stopRuntime(profileID, runtime)
		return "", "", err
	}
}

func (m *TorManager) ReleaseProfile(profileID string) {
	if m == nil {
		return
	}
	profileID = strings.TrimSpace(profileID)
	m.mu.Lock()
	runtime := m.runtimes[profileID]
	m.mu.Unlock()
	if runtime != nil {
		_ = m.stopRuntime(profileID, runtime)
	}
}

func (m *TorManager) StopAll() {
	_ = m.StopAllWithError()
}

func (m *TorManager) StopAllWithError() error {
	if m == nil {
		return nil
	}
	m.mu.Lock()
	items := make(map[string]*torProfileRuntime, len(m.runtimes))
	for profileID, runtime := range m.runtimes {
		items[profileID] = runtime
	}
	m.mu.Unlock()
	var errs []error
	for profileID, runtime := range items {
		if err := m.stopRuntime(profileID, runtime); err != nil {
			errs = append(errs, fmt.Errorf("profile %s: %w", profileID, err))
		}
	}
	return errors.Join(errs...)
}

func (m *TorManager) HasRunning() bool {
	if m == nil {
		return false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.runtimes) > 0
}

func (m *TorManager) ProfileReady(profileID string) bool {
	if m == nil {
		return false
	}
	m.mu.Lock()
	runtime := m.runtimes[strings.TrimSpace(profileID)]
	m.mu.Unlock()
	return runtime != nil && runtime.status().Ready
}

// RuntimeGenerationMatches lets the app reject a delayed death callback from
// an old Tor process after the same profile has already acquired a new one.
func (m *TorManager) RuntimeGenerationMatches(profileID string, generation string) bool {
	if m == nil || strings.TrimSpace(profileID) == "" || strings.TrimSpace(generation) == "" {
		return false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if runtime := m.runtimes[strings.TrimSpace(profileID)]; runtime != nil {
		runtime.mu.Lock()
		current := runtime.generation == strings.TrimSpace(generation)
		runtime.mu.Unlock()
		return current
	}
	return m.lastGenerations[strings.TrimSpace(profileID)] == strings.TrimSpace(generation)
}

func (m *TorManager) Status() []TorProfileRuntimeStatus {
	if m == nil {
		return nil
	}
	m.mu.Lock()
	statuses := make([]TorProfileRuntimeStatus, 0, len(m.runtimes))
	for _, runtime := range m.runtimes {
		statuses = append(statuses, runtime.status())
	}
	m.mu.Unlock()
	sort.Slice(statuses, func(i, j int) bool { return statuses[i].ProfileID < statuses[j].ProfileID })
	return statuses
}

func (m *TorManager) prepareProfileState(profileID string, port int) (string, string, error) {
	digest := sha256.Sum256([]byte(profileID))
	profileDir := apppath.Resolve(m.AppRoot, filepath.Join("data", "tor", "profiles", hex.EncodeToString(digest[:16])))
	if err := os.MkdirAll(profileDir, 0o700); err != nil {
		return "", "", fmt.Errorf("创建 Tor 实例目录失败: %w", err)
	}
	if err := os.Chmod(profileDir, 0o700); err != nil && goruntime.GOOS != "windows" {
		return "", "", fmt.Errorf("设置 Tor 实例目录权限失败: %w", err)
	}
	dataDir := filepath.Join(profileDir, "data")
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return "", "", fmt.Errorf("创建 Tor DataDirectory 失败: %w", err)
	}
	if err := os.Chmod(dataDir, 0o700); err != nil && goruntime.GOOS != "windows" {
		return "", "", fmt.Errorf("设置 Tor DataDirectory 权限失败: %w", err)
	}
	torrcPath := filepath.Join(profileDir, "torrc")
	contents := buildManagedTorrc(dataDir, port)
	if err := os.WriteFile(torrcPath, []byte(contents), 0o600); err != nil {
		return "", "", fmt.Errorf("写入 Tor 配置失败: %w", err)
	}
	if err := os.Chmod(torrcPath, 0o600); err != nil && goruntime.GOOS != "windows" {
		return "", "", fmt.Errorf("设置 Tor 配置权限失败: %w", err)
	}
	return dataDir, torrcPath, nil
}

func buildManagedTorrc(dataDir string, port int) string {
	quotedDataDir := strings.ReplaceAll(filepath.ToSlash(dataDir), `\`, `\\`)
	quotedDataDir = strings.ReplaceAll(quotedDataDir, `"`, `\"`)
	return strings.Join([]string{
		"ClientOnly 1",
		fmt.Sprintf(`DataDirectory "%s"`, quotedDataDir),
		fmt.Sprintf("SocksPort 127.0.0.1:%d IsolateClientAddr IsolateClientProtocol IsolateSOCKSAuth IsolateDestAddr IsolateDestPort", port),
		"SocksPolicy accept 127.0.0.1",
		"SocksPolicy reject *",
		"SafeSocks 1",
		"TestSocks 1",
		"Log notice stdout",
		"",
	}, "\n")
}

func (m *TorManager) scanTorOutput(runtime *torProfileRuntime, reader io.Reader) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 4096), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if percent, ok := parseTorBootstrapPercent(line); ok {
			runtime.setBootstrap(percent)
		}
	}
	if err := scanner.Err(); err != nil {
		runtime.setError(fmt.Errorf("读取 Tor 输出失败: %w", err))
	}
}

func parseTorBootstrapPercent(line string) (int, bool) {
	index := strings.Index(line, string(torBootstrapMarker))
	if index < 0 {
		return 0, false
	}
	value := line[index+len(torBootstrapMarker):]
	end := strings.IndexByte(value, '%')
	if end <= 0 {
		return 0, false
	}
	percent, err := strconv.Atoi(strings.TrimSpace(value[:end]))
	if err != nil || percent < 0 || percent > 100 {
		return 0, false
	}
	return percent, true
}

func (m *TorManager) waitTorProcess(runtime *torProfileRuntime) {
	err := runtime.cmd.Wait()
	runtime.mu.Lock()
	wasReady := runtime.ready
	stopping := runtime.stopping
	if err != nil && !stopping {
		runtime.lastError = fmt.Sprintf("Tor 进程意外退出: %v", err)
	}
	if runtime.lastError == "" && !stopping {
		runtime.lastError = "Tor 进程意外退出"
	}
	runtime.state = "stopped"
	runtime.ready = false
	generation := runtime.generation
	profileID := runtime.profileID
	runtime.mu.Unlock()

	m.removeRuntime(profileID, runtime)
	close(runtime.doneCh)
	if wasReady && !stopping {
		deathErr := err
		if deathErr == nil {
			deathErr = fmt.Errorf("Tor 进程意外退出")
		}
		if m.OnRuntimeDiedWithGeneration != nil {
			m.OnRuntimeDiedWithGeneration(profileID, generation, deathErr)
		} else if m.OnRuntimeDied != nil {
			m.OnRuntimeDied(profileID, deathErr)
		}
	}
}

func (m *TorManager) stopRuntime(profileID string, runtime *torProfileRuntime) error {
	if runtime == nil {
		return nil
	}
	runtime.mu.Lock()
	if runtime.stopping {
		runtime.mu.Unlock()
		select {
		case <-runtime.doneCh:
			return nil
		case <-time.After(3 * time.Second):
			return fmt.Errorf("Tor 进程停止超时，仍保留受管运行时状态")
		}
	}
	runtime.stopping = true
	runtime.state = "stopping"
	cmd := runtime.cmd
	runtime.mu.Unlock()

	if cmd != nil && cmd.Process != nil {
		if err := cmd.Process.Kill(); err != nil && !isTorProcessAlreadyFinished(err) {
			runtime.setError(fmt.Errorf("Tor 进程停止失败: %w", err))
			if torProcessAlive(cmd) {
				return err
			}
		}
	}
	select {
	case <-runtime.doneCh:
		return nil
	case <-time.After(3 * time.Second):
		if torProcessAlive(cmd) {
			err := fmt.Errorf("Tor 进程停止超时，PID %d 仍在运行", torProcessPID(cmd))
			runtime.setError(err)
			return err
		}
		// Keep the runtime in the map until waitTorProcess reaps it. A dead
		// process with an unclosed Wait must not be silently forgotten.
		err := fmt.Errorf("Tor 进程停止后未完成回收，PID %d 状态未知", torProcessPID(cmd))
		runtime.setError(err)
		return err
	}
}

func isTorProcessAlreadyFinished(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, "process already finished") ||
		strings.Contains(message, "not found") ||
		strings.Contains(message, "no process") ||
		strings.Contains(message, "不存在")
}

func torProcessPID(cmd *exec.Cmd) int {
	if cmd == nil || cmd.Process == nil {
		return 0
	}
	return cmd.Process.Pid
}

func torProcessAlive(cmd *exec.Cmd) bool {
	if cmd == nil || cmd.Process == nil {
		return false
	}
	if cmd.ProcessState != nil && cmd.ProcessState.Exited() {
		return false
	}
	if goruntime.GOOS == "windows" {
		// ProcessState is the only portable signal available on Windows here;
		// be conservative and retain the managed runtime until Wait completes.
		return true
	}
	return cmd.Process.Signal(syscall.Signal(0)) == nil
}

func (m *TorManager) removeRuntime(profileID string, runtime *torProfileRuntime) {
	m.mu.Lock()
	if m.runtimes[profileID] == runtime {
		delete(m.runtimes, profileID)
		m.lastGenerations[profileID] = runtime.generation
	}
	m.mu.Unlock()
}

func (runtime *torProfileRuntime) setBootstrap(percent int) {
	runtime.mu.Lock()
	if percent > runtime.bootstrapPercent {
		runtime.bootstrapPercent = percent
	}
	if percent >= 100 && runtime.state == "starting" {
		runtime.state = "checking"
		select {
		case <-runtime.readyCh:
		default:
			close(runtime.readyCh)
		}
	}
	runtime.mu.Unlock()
}

func (runtime *torProfileRuntime) markReady() {
	runtime.mu.Lock()
	runtime.ready = true
	runtime.state = "ready"
	runtime.bootstrapPercent = 100
	runtime.lastError = ""
	runtime.mu.Unlock()
}

func (runtime *torProfileRuntime) setError(err error) {
	if err == nil {
		return
	}
	runtime.mu.Lock()
	runtime.lastError = err.Error()
	runtime.mu.Unlock()
}

func (runtime *torProfileRuntime) status() TorProfileRuntimeStatus {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	pid := 0
	if runtime.cmd != nil && runtime.cmd.Process != nil {
		pid = runtime.cmd.Process.Pid
	}
	return TorProfileRuntimeStatus{
		ProfileID:        runtime.profileID,
		State:            runtime.state,
		Ready:            runtime.ready,
		PID:              pid,
		SocksAddress:     torSocksAddress(runtime.port),
		BootstrapPercent: runtime.bootstrapPercent,
		StartedAt:        runtime.startedAt.Format(time.RFC3339),
		LastError:        runtime.lastError,
	}
}

func torSocksAddress(port int) string {
	return fmt.Sprintf("socks5://127.0.0.1:%d", port)
}
