package backend

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/proxy"
)

func TestGetTorStatusKeepsProductionGateClosed(t *testing.T) {
	cfg := config.DefaultConfig()
	app := &App{config: cfg, appRoot: t.TempDir()}
	app.torMgr = proxy.NewTorManager(cfg, app.appRoot)
	status := app.GetTorStatus()
	if !status.Experimental || status.ProductionReady {
		t.Fatalf("unexpected production gate: %+v", status)
	}
	if status.Configured || status.BinaryValid {
		t.Fatalf("unconfigured status should be invalid: %+v", status)
	}
}

func TestSetTorRuntimePathValidatesAndPersistsExplicitPath(t *testing.T) {
	cfg := config.DefaultConfig()
	app := &App{config: cfg, appRoot: t.TempDir()}
	app.torMgr = proxy.NewTorManager(cfg, app.appRoot)

	status, err := app.SetTorRuntimePath(os.Args[0])
	if err != nil {
		t.Fatalf("SetTorRuntimePath: %v", err)
	}
	if !status.Configured || !status.BinaryValid || !filepath.IsAbs(status.BinaryPath) {
		t.Fatalf("unexpected status: %+v", status)
	}
	loaded, err := LoadConfig(filepath.Join(app.appRoot, "config.yaml"))
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if loaded.Browser.TorBinaryPath != status.BinaryPath {
		t.Fatalf("persisted path = %q, want %q", loaded.Browser.TorBinaryPath, status.BinaryPath)
	}
}

func TestTorRuntimePathStatusConcurrent(t *testing.T) {
	cfg := config.DefaultConfig()
	app := &App{config: cfg, appRoot: t.TempDir()}
	app.torMgr = proxy.NewTorManager(cfg, app.appRoot)

	errs := make(chan error, 16)
	var wg sync.WaitGroup
	for index := 0; index < 8; index++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			if _, err := app.SetTorRuntimePath(os.Args[0]); err != nil {
				errs <- err
			}
		}()
		go func() {
			defer wg.Done()
			status := app.GetTorStatus()
			if status.ProductionReady {
				errs <- os.ErrInvalid
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("concurrent Tor config operation: %v", err)
	}
}

func TestBackupImportCannotReplaceTrustedTorBinaryPath(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Browser.TorBinaryPath = os.Args[0]
	app := &App{config: cfg, appRoot: t.TempDir()}
	app.torMgr = proxy.NewTorManager(cfg, app.appRoot)

	incoming := config.DefaultConfig()
	incoming.Browser.TorBinaryPath = filepath.Join(t.TempDir(), "untrusted-tor")
	if err := app.backupApplyIncomingConfig(incoming, true); err != nil {
		t.Fatalf("backupApplyIncomingConfig: %v", err)
	}
	if app.config.Browser.TorBinaryPath != os.Args[0] {
		t.Fatalf("backup replaced trusted Tor path: %q", app.config.Browser.TorBinaryPath)
	}
	if app.torMgr.ConfiguredBinaryPath() != os.Args[0] {
		t.Fatalf("manager path changed from trusted value: %q", app.torMgr.ConfiguredBinaryPath())
	}
}

func TestResolveBrowserStartProxyRejectsTorDirectOrProxyMix(t *testing.T) {
	profile := &BrowserProfile{ProfileId: "tor-profile", NetworkMode: browser.NetworkModeTor}
	app := &App{}
	_, _, _, err := app.resolveBrowserStartProxy(browserStartInput{ProfileID: profile.ProfileId, ForceDirectProxy: true}, profile)
	if err == nil || !strings.Contains(err.Error(), "不能") {
		t.Fatalf("expected direct/Tor rejection, got %v", err)
	}

	profile.ProxyConfig = "chain://a,b"
	_, _, _, err = app.resolveBrowserStartProxy(browserStartInput{ProfileID: profile.ProfileId}, profile)
	if err == nil || !strings.Contains(err.Error(), "不能") {
		t.Fatalf("expected proxy/Tor rejection, got %v", err)
	}
}

func TestTorRuntimeDeathStopsDependentBrowser(t *testing.T) {
	cmd := startTorBrowserTestProcess(t)
	app := &App{browserMgr: browser.NewManager(config.DefaultConfig(), t.TempDir())}
	app.browserMgr.Profiles["tor-profile"] = &browser.Profile{
		ProfileId:   "tor-profile",
		NetworkMode: browser.NetworkModeTor,
		Running:     true,
		Pid:         cmd.Process.Pid,
	}
	app.browserMgr.BrowserProcesses["tor-profile"] = cmd

	app.handleTorRuntimeDied("tor-profile", os.ErrProcessDone)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		app.browserMgr.Mutex.Lock()
		running := app.browserMgr.Profiles["tor-profile"].Running
		message := app.browserMgr.Profiles["tor-profile"].LastError
		app.browserMgr.Mutex.Unlock()
		if !running && strings.Contains(message, "避免回退到直连") {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("Tor runtime death did not stop dependent browser")
}

func TestBrowserInstanceStartRejectsAfterQuitRequested(t *testing.T) {
	app := &App{}
	app.requestQuit(quitModeFull)

	if _, err := app.BrowserInstanceStart("profile-after-quit"); err == nil || !strings.Contains(err.Error(), "应用正在退出") {
		t.Fatalf("expected start rejection while quit is requested, got %v", err)
	}

	app.cancelQuitRequest()
}

func TestQuitAppOnlyPromotesToFullShutdownForTorBrowser(t *testing.T) {
	cmd := startTorBrowserTestProcess(t)
	app := &App{browserMgr: browser.NewManager(config.DefaultConfig(), t.TempDir())}
	app.browserMgr.Profiles["tor-profile"] = &browser.Profile{
		ProfileId:   "tor-profile",
		NetworkMode: browser.NetworkModeTor,
		Running:     true,
		Pid:         cmd.Process.Pid,
	}
	app.browserMgr.BrowserProcesses["tor-profile"] = cmd

	app.QuitAppOnly()
	if app.quitMode != quitModeFull {
		t.Fatalf("quitMode = %v, want full", app.quitMode)
	}
	if app.browserMgr.Profiles["tor-profile"].Running {
		t.Fatal("Tor browser survived app-only quit")
	}
}

func startTorBrowserTestProcess(t *testing.T) *exec.Cmd {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=TestTorBrowserProcessHelper")
	cmd.Env = append(os.Environ(), "GO_WANT_TOR_BROWSER_HELPER=1")
	if err := cmd.Start(); err != nil {
		t.Fatalf("start helper process: %v", err)
	}
	waitDone := make(chan struct{})
	go func() {
		_ = cmd.Wait()
		close(waitDone)
	}()
	t.Cleanup(func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		<-waitDone
	})
	return cmd
}

func TestBrowserInstanceStopKeepsRunningWithoutExitEvidence(t *testing.T) {
	app := &App{browserMgr: browser.NewManager(config.DefaultConfig(), t.TempDir())}
	app.browserMgr.Profiles["unknown-process"] = &browser.Profile{
		ProfileId: "unknown-process",
		Running:   true,
	}

	_, err := app.BrowserInstanceStop("unknown-process")
	if err == nil {
		t.Fatal("stop without PID, command, or debug endpoint should fail closed")
	}
	if !app.browserMgr.Profiles["unknown-process"].Running {
		t.Fatal("profile was marked stopped without process-exit evidence")
	}
}

func TestStopRuntimeServicesPreservesUnconfirmedBrowserState(t *testing.T) {
	app := &App{browserMgr: browser.NewManager(config.DefaultConfig(), t.TempDir())}
	app.browserMgr.Profiles["unconfirmed"] = &browser.Profile{
		ProfileId: "unconfirmed",
		Running:   true,
	}

	if err := app.stopRuntimeServices(); err == nil {
		t.Fatal("shutdown should report unconfirmed browser stop")
	}
	if !app.browserMgr.Profiles["unconfirmed"].Running {
		t.Fatal("shutdown cleared running state without exit confirmation")
	}
}

func TestBackupInitializeWaitsForTorLifecycleGate(t *testing.T) {
	app := &App{appRoot: t.TempDir()}
	app.torLifecycleMu.Lock()
	done := make(chan struct{})
	go func() {
		_, _ = app.backupInitializeLocked(false)
		close(done)
	}()

	select {
	case <-done:
		app.torLifecycleMu.Unlock()
		t.Fatal("backup initialization bypassed the Tor lifecycle gate")
	case <-time.After(100 * time.Millisecond):
	}

	app.torLifecycleMu.Unlock()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("backup initialization did not resume after the Tor lifecycle gate was released")
	}
}

func TestBackupMaintenanceAbortsOnUnconfirmedBrowserStop(t *testing.T) {
	app := &App{browserMgr: browser.NewManager(config.DefaultConfig(), t.TempDir())}
	app.browserMgr.Profiles["unconfirmed"] = &browser.Profile{
		ProfileId: "unconfirmed",
		Running:   true,
	}

	if err := app.backupStopRuntimeForMaintenance(); err == nil {
		t.Fatal("maintenance should abort when browser stop cannot be confirmed")
	}
	if !app.browserMgr.Profiles["unconfirmed"].Running {
		t.Fatal("maintenance cleared running state without exit confirmation")
	}
}

func TestTorRuntimeDeathWaitsForLifecycleGate(t *testing.T) {
	cmd := startTorBrowserTestProcess(t)
	app := &App{browserMgr: browser.NewManager(config.DefaultConfig(), t.TempDir())}
	app.browserMgr.Profiles["tor-profile"] = &browser.Profile{
		ProfileId:   "tor-profile",
		NetworkMode: browser.NetworkModeTor,
		Running:     true,
		Pid:         cmd.Process.Pid,
	}
	app.browserMgr.BrowserProcesses["tor-profile"] = cmd

	app.torLifecycleMu.Lock()
	app.handleTorRuntimeDied("tor-profile", os.ErrProcessDone)
	time.Sleep(100 * time.Millisecond)
	app.browserMgr.Mutex.Lock()
	runningWhileGated := app.browserMgr.Profiles["tor-profile"].Running
	app.browserMgr.Mutex.Unlock()
	if !runningWhileGated {
		app.torLifecycleMu.Unlock()
		t.Fatal("Tor death callback bypassed lifecycle gate")
	}
	app.torLifecycleMu.Unlock()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		app.browserMgr.Mutex.Lock()
		running := app.browserMgr.Profiles["tor-profile"].Running
		app.browserMgr.Mutex.Unlock()
		if !running {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("Tor death callback did not stop browser after lifecycle gate released")
}

func TestTorBrowserProcessHelper(t *testing.T) {
	if os.Getenv("GO_WANT_TOR_BROWSER_HELPER") != "1" {
		return
	}
	select {}
}
