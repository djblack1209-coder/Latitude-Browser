package proxy

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"ant-chrome/backend/internal/config"
)

func TestTorManagerAcquireReadyAndRelease(t *testing.T) {
	manager := newFakeTorManager(t, "ready", 3*time.Second)
	socksURL, key, err := manager.AcquireProfile("profile-a")
	if err != nil {
		t.Fatalf("AcquireProfile: %v", err)
	}
	if key != "profile-a" || !strings.HasPrefix(socksURL, "socks5://127.0.0.1:") {
		t.Fatalf("unexpected acquisition: url=%q key=%q", socksURL, key)
	}
	if !manager.ProfileReady("profile-a") {
		t.Fatal("profile should be ready")
	}
	statuses := manager.Status()
	if len(statuses) != 1 || statuses[0].BootstrapPercent != 100 || !statuses[0].Ready {
		t.Fatalf("unexpected status: %+v", statuses)
	}

	manager.mu.Lock()
	runtimeState := manager.runtimes["profile-a"]
	manager.mu.Unlock()
	if runtimeState == nil {
		t.Fatal("missing runtime")
	}
	profileRoot := filepath.Dir(runtimeState.dataDir)
	torrcPath := filepath.Join(profileRoot, "torrc")
	torrc, err := os.ReadFile(torrcPath)
	if err != nil {
		t.Fatalf("read torrc: %v", err)
	}
	for _, expected := range []string{
		"ClientOnly 1",
		"SocksPort 127.0.0.1:",
		"IsolateClientProtocol",
		"IsolateSOCKSAuth",
		"IsolateDestAddr",
		"SocksPolicy reject *",
		"SafeSocks 1",
		"TestSocks 1",
	} {
		if !strings.Contains(string(torrc), expected) {
			t.Fatalf("torrc missing %q:\n%s", expected, torrc)
		}
	}
	if runtime.GOOS != "windows" {
		if info, err := os.Stat(profileRoot); err != nil || info.Mode().Perm() != 0o700 {
			t.Fatalf("profile root mode: info=%v err=%v", info, err)
		}
		if info, err := os.Stat(torrcPath); err != nil || info.Mode().Perm() != 0o600 {
			t.Fatalf("torrc mode: info=%v err=%v", info, err)
		}
	}

	manager.ReleaseProfile(key)
	if manager.HasRunning() {
		t.Fatal("release should stop runtime")
	}
	if _, err := os.Stat(runtimeState.dataDir); err != nil {
		t.Fatalf("persistent DataDirectory was removed: %v", err)
	}
}

func TestTorManagerBootstrapTimeoutFailsClosed(t *testing.T) {
	manager := newFakeTorManager(t, "timeout", 150*time.Millisecond)
	_, _, err := manager.AcquireProfile("profile-timeout")
	if err == nil || !strings.Contains(err.Error(), "引导") {
		t.Fatalf("expected bootstrap timeout, got %v", err)
	}
	if manager.HasRunning() {
		t.Fatal("failed bootstrap must not leave sidecar running")
	}
}

func TestTorManagerConcurrentAcquireSameProfileUsesSingleRuntime(t *testing.T) {
	manager := newFakeTorManager(t, "ready", 3*time.Second)
	defer manager.StopAll()

	type result struct {
		url string
		err error
	}
	results := make(chan result, 8)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			url, _, err := manager.AcquireProfile("same-profile")
			results <- result{url: url, err: err}
		}()
	}
	wg.Wait()
	close(results)

	var readyURL string
	for result := range results {
		if result.err != nil {
			if !strings.Contains(result.err.Error(), "正在启动") {
				t.Fatalf("unexpected concurrent acquire error: %v", result.err)
			}
			continue
		}
		if readyURL == "" {
			readyURL = result.url
		} else if result.url != readyURL {
			t.Fatalf("concurrent acquires returned different SOCKS URLs: %q vs %q", readyURL, result.url)
		}
	}
	if readyURL == "" {
		t.Fatal("no concurrent acquire reached ready state")
	}
	statuses := manager.Status()
	if len(statuses) != 1 || statuses[0].ProfileID != "same-profile" {
		t.Fatalf("concurrent acquire created unexpected runtimes: %+v", statuses)
	}
}

func TestTorManagerGenerationGuardsDelayedDeathCallback(t *testing.T) {
	manager := newFakeTorManager(t, "crash", 3*time.Second)
	defer manager.StopAll()
	callbacks := make(chan struct {
		profileID  string
		generation string
	}, 2)
	manager.OnRuntimeDiedWithGeneration = func(profileID, generation string, _ error) {
		callbacks <- struct {
			profileID  string
			generation string
		}{profileID: profileID, generation: generation}
	}

	if _, _, err := manager.AcquireProfile("generation-profile"); err != nil {
		t.Fatalf("first AcquireProfile: %v", err)
	}
	first := <-callbacks
	if first.generation == "" || !manager.RuntimeGenerationMatches(first.profileID, first.generation) {
		t.Fatalf("first generation should remain known after removal: %+v", first)
	}

	if _, _, err := manager.AcquireProfile("generation-profile"); err != nil {
		t.Fatalf("second AcquireProfile: %v", err)
	}
	manager.mu.Lock()
	secondRuntime := manager.runtimes["generation-profile"]
	manager.mu.Unlock()
	if secondRuntime == nil {
		t.Fatal("second runtime missing")
	}
	secondRuntime.mu.Lock()
	secondGeneration := secondRuntime.generation
	secondRuntime.mu.Unlock()
	if secondGeneration == first.generation {
		t.Fatalf("runtime generation was reused: %q", secondGeneration)
	}
	if manager.RuntimeGenerationMatches("generation-profile", first.generation) {
		t.Fatal("stale generation matched an active replacement runtime")
	}
	second := <-callbacks
	if second.generation != secondGeneration {
		t.Fatalf("second callback generation = %q, want %q", second.generation, secondGeneration)
	}
}

func TestTorManagerUnexpectedDeathCallbackAfterReady(t *testing.T) {
	manager := newFakeTorManager(t, "crash", 3*time.Second)
	death := make(chan string, 1)
	manager.OnRuntimeDied = func(profileID string, err error) {
		death <- profileID + ":" + err.Error()
	}
	if _, _, err := manager.AcquireProfile("profile-crash"); err != nil {
		t.Fatalf("AcquireProfile: %v", err)
	}
	select {
	case got := <-death:
		if !strings.HasPrefix(got, "profile-crash:") {
			t.Fatalf("unexpected callback: %q", got)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for death callback")
	}
	if manager.HasRunning() {
		t.Fatal("dead runtime should be removed")
	}
}

func TestBuildManagedTorrcIsLoopbackOnly(t *testing.T) {
	torrc := buildManagedTorrc(filepath.Join(t.TempDir(), `dir "quoted"`), 19050)
	if strings.Contains(torrc, "0.0.0.0") || strings.Contains(torrc, "DNSPort") || strings.Contains(torrc, "ControlPort") {
		t.Fatalf("unexpected listener in torrc:\n%s", torrc)
	}
	if !strings.Contains(torrc, "SocksPort 127.0.0.1:19050") {
		t.Fatalf("SOCKS listener not loopback-only:\n%s", torrc)
	}
}

func newFakeTorManager(t *testing.T, mode string, timeout time.Duration) *TorManager {
	t.Helper()
	cfg := config.DefaultConfig()
	cfg.Browser.TorBinaryPath = os.Args[0]
	factory := func(_ string, args ...string) *exec.Cmd {
		cmdArgs := append([]string{"-test.run=TestTorHelperProcess", "--"}, args...)
		cmd := exec.Command(os.Args[0], cmdArgs...)
		cmd.Env = append(os.Environ(), "GO_WANT_TOR_HELPER=1", "TOR_HELPER_MODE="+mode)
		return cmd
	}
	return newTorManagerWithOptions(cfg, t.TempDir(), factory, timeout)
}

func TestTorHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_TOR_HELPER") != "1" {
		return
	}
	separator := -1
	for index, arg := range os.Args {
		if arg == "--" {
			separator = index
			break
		}
	}
	if separator < 0 || separator+2 >= len(os.Args) || os.Args[separator+1] != "-f" {
		os.Exit(2)
	}
	torrcPath := os.Args[separator+2]
	port, err := helperTorSocksPort(torrcPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(3)
	}
	listener, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(4)
	}
	defer listener.Close()
	go helperServeSocks(listener)

	mode := os.Getenv("TOR_HELPER_MODE")
	if mode != "timeout" {
		fmt.Fprintln(os.Stdout, "Bootstrapped 100% (done): Done")
	}
	if mode == "crash" {
		time.Sleep(500 * time.Millisecond)
		os.Exit(42)
	}
	select {}
}

func helperTorSocksPort(torrcPath string) (int, error) {
	file, err := os.Open(torrcPath)
	if err != nil {
		return 0, err
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 || fields[0] != "SocksPort" {
			continue
		}
		_, portString, err := net.SplitHostPort(fields[1])
		if err != nil {
			return 0, err
		}
		return strconv.Atoi(portString)
	}
	return 0, fmt.Errorf("SocksPort not found")
}

func helperServeSocks(listener net.Listener) {
	for {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		go func(conn net.Conn) {
			defer conn.Close()
			_ = conn.SetDeadline(time.Now().Add(time.Second))
			header := make([]byte, 2)
			if _, err := io.ReadFull(conn, header); err != nil || header[0] != 0x05 {
				return
			}
			methods := make([]byte, int(header[1]))
			if _, err := io.ReadFull(conn, methods); err != nil {
				return
			}
			_, _ = conn.Write([]byte{0x05, 0x00})
		}(conn)
	}
}

func TestTorManagerRealBinary(t *testing.T) {
	binaryPath := strings.TrimSpace(os.Getenv("LATITUDE_TOR_BINARY"))
	if binaryPath == "" {
		t.Skip("set LATITUDE_TOR_BINARY to run the real Tor bootstrap integration test")
	}
	cfg := config.DefaultConfig()
	cfg.Browser.TorBinaryPath = binaryPath
	manager := newTorManagerWithOptions(cfg, t.TempDir(), exec.Command, 90*time.Second)
	t.Cleanup(manager.StopAll)
	profileID := fmt.Sprintf("real-integration-%d", time.Now().UnixNano())
	socksURL, _, err := manager.AcquireProfile(profileID)
	if err != nil {
		t.Fatalf("real Tor bootstrap failed: %v", err)
	}
	if !strings.HasPrefix(socksURL, "socks5://127.0.0.1:") || !manager.ProfileReady(profileID) {
		t.Fatalf("unexpected real Tor state: url=%q status=%+v", socksURL, manager.Status())
	}
}
