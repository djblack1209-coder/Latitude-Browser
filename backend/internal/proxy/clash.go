package proxy

import (
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/logger"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
)

// ClashManager Clash 进程管理器
type ClashManager struct {
	Config       *config.Config
	AppRoot      string // 应用根目录，所有相对路径基于此解析
	Processes    map[string]*exec.Cmd
	NodeBridges  map[string]*MihomoNodeBridge
	mu           sync.Mutex
	launchLocks  map[string]*bridgeLaunchLock
	restartMu    sync.Mutex
	lifecycle    bridgeLifecycle
	leases       bridgeLeaseBook[*MihomoNodeBridge]
	stopCh       chan struct{}
	stopOnce     sync.Once
	profileExits map[string]<-chan struct{}
}

// NewClashManager 创建 Clash 管理器
func NewClashManager(cfg *config.Config, appRoot string) *ClashManager {
	manager := &ClashManager{
		Config:       cfg,
		AppRoot:      appRoot,
		Processes:    make(map[string]*exec.Cmd),
		NodeBridges:  make(map[string]*MihomoNodeBridge),
		launchLocks:  make(map[string]*bridgeLaunchLock),
		stopCh:       make(chan struct{}),
		profileExits: make(map[string]<-chan struct{}),
	}
	go manager.cleanupMihomoLoop(manager.stopCh)
	return manager
}

// ClashProfile Clash 配置接口
type ClashProfile interface {
	GetProfileId() string
	GetClashEnabled() bool
	GetClashRunning() bool
	GetClashConfigPath() string
	GetClashProxyPort() int
	SetClashRunning(bool)
	SetClashPid(int)
	SetClashProxyPort(int)
	SetClashLastError(string)
}

// StartForProfile 为配置启动 Clash 进程
func (m *ClashManager) StartForProfile(profile ClashProfile, userDataDir string) error {
	done, err := m.lifecycle.begin()
	if err != nil {
		return err
	}
	defer done()
	log := logger.New("Clash")
	if !profile.GetClashEnabled() {
		return nil
	}
	if profile.GetClashRunning() {
		return nil
	}
	// Resolve the binary through the same managed-runtime lookup used by the
	// independent Mihomo connector.  The old code required an absolute
	// ClashBinaryPath, which meant a packaged `bin/mihomo` (or a downloaded
	// platform runtime) could pass preflight but still fail at profile start.
	clashBinaryPath, err := m.resolveMihomoBinary()
	if err != nil {
		profile.SetClashLastError(err.Error())
		log.Error("Clash 启动失败", logger.F("profile_id", profile.GetProfileId()), logger.F("error", err))
		return err
	}
	templatePath := strings.TrimSpace(profile.GetClashConfigPath())
	if templatePath == "" {
		err := fmt.Errorf("clash config path not configured")
		profile.SetClashLastError(err.Error())
		log.Error("Clash 启动失败", logger.F("profile_id", profile.GetProfileId()), logger.F("error", err))
		return err
	}
	if _, err := os.Stat(templatePath); err != nil {
		profile.SetClashLastError(err.Error())
		log.Error("Clash 启动失败", logger.F("profile_id", profile.GetProfileId()), logger.F("error", err))
		return err
	}
	port := profile.GetClashProxyPort()
	if port == 0 {
		p, err := nextAvailablePort()
		if err != nil {
			profile.SetClashLastError(err.Error())
			log.Error("Clash 端口分配失败", logger.F("profile_id", profile.GetProfileId()), logger.F("error", err))
			return err
		}
		port = p
		profile.SetClashProxyPort(port)
	}
	args := []string{
		"-f", templatePath,
		"-d", userDataDir,
	}
	cmd := exec.CommandContext(m.lifecycle.context(), clashBinaryPath, args...)
	hideWindow(cmd)
	if err := cmd.Start(); err != nil {
		profile.SetClashLastError(err.Error())
		log.Error("Clash 启动失败", logger.F("profile_id", profile.GetProfileId()), logger.F("error", err))
		return err
	}
	exitDone := make(chan struct{})
	go func() { _ = cmd.Wait(); close(exitDone) }()
	m.lifecycle.track(cmd, exitDone)
	m.mu.Lock()
	if m.profileExits == nil {
		m.profileExits = make(map[string]<-chan struct{})
	}
	m.profileExits[profile.GetProfileId()] = exitDone
	m.Processes[profile.GetProfileId()] = cmd
	m.mu.Unlock()
	profile.SetClashRunning(true)
	profile.SetClashPid(cmd.Process.Pid)
	profile.SetClashLastError("")
	log.Info("Clash 内核进程已启动", logger.F("engine", "clash"), logger.F("profile_id", profile.GetProfileId()), logger.F("pid", cmd.Process.Pid), logger.F("port", port))
	return nil
}

// StopForProfile 停止配置的 Clash 进程
func (m *ClashManager) StopForProfile(profile ClashProfile) error {
	m.mu.Lock()
	cmd := m.Processes[profile.GetProfileId()]
	done := m.profileExits[profile.GetProfileId()]
	m.mu.Unlock()
	if err := stopOwnedBridgeProcess(cmd, done); err != nil {
		return err
	}
	m.mu.Lock()
	if m.Processes[profile.GetProfileId()] == cmd {
		delete(m.Processes, profile.GetProfileId())
		delete(m.profileExits, profile.GetProfileId())
	}
	m.mu.Unlock()
	profile.SetClashRunning(false)
	profile.SetClashPid(0)
	return nil
}

// StopAll closes admission, drains launches and confirms every owned Wait.
func (m *ClashManager) StopAll() error {
	m.restartMu.Lock()
	defer m.restartMu.Unlock()
	m.stopOnce.Do(func() {
		if m.stopCh != nil {
			close(m.stopCh)
		}
	})
	err := m.lifecycle.stop()
	m.mu.Lock()
	if err == nil {
		m.leases.items = nil
	}
	for key, b := range m.NodeBridges {
		if b == nil || processExited(b.ExitDone) {
			delete(m.NodeBridges, key)
		}
	}
	for key, done := range m.profileExits {
		if processExited(done) {
			delete(m.Processes, key)
			delete(m.profileExits, key)
		}
	}
	m.mu.Unlock()
	return err
}

// ResumeAfterMaintenance reopens only after every owned process has exited.
func (m *ClashManager) ResumeAfterMaintenance(cfg *config.Config) error {
	m.restartMu.Lock()
	defer m.restartMu.Unlock()
	if m.lifecycle.isStopped() && cfg != nil {
		m.Config = cfg
	}
	resumed, err := m.lifecycle.resume()
	if err != nil || !resumed {
		return err
	}
	m.stopCh = make(chan struct{})
	m.stopOnce = sync.Once{}
	go m.cleanupMihomoLoop(m.stopCh)
	return nil
}
