package backend

import (
	"os/exec"
	"testing"

	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
)

func TestExitedBrowserMonitorCannotStopReplacement(t *testing.T) {
	oldCmd := &exec.Cmd{}
	replacementCmd := &exec.Cmd{}
	app := &App{browserMgr: browser.NewManager(config.DefaultConfig(), t.TempDir())}
	profile := &BrowserProfile{ProfileId: "restarted", Running: true, LastError: "replacement-state"}
	app.browserMgr.Profiles[profile.ProfileId] = profile
	app.browserMgr.BrowserProcesses[profile.ProfileId] = replacementCmd
	monitor := &browserProcessMonitor{cmd: oldCmd, waitDone: make(chan struct{})}
	close(monitor.waitDone)

	app.waitBrowserProcess(profile.ProfileId, monitor)
	if !profile.Running || app.browserMgr.BrowserProcesses[profile.ProfileId] != replacementCmd || profile.LastError != "replacement-state" {
		t.Fatal("an old process exit cleared a replacement browser generation")
	}
}

func TestExitedBrowserMonitorStopsItsOwnGeneration(t *testing.T) {
	cmd := &exec.Cmd{}
	app := &App{browserMgr: browser.NewManager(config.DefaultConfig(), t.TempDir())}
	profile := &BrowserProfile{ProfileId: "current", Running: true}
	app.browserMgr.Profiles[profile.ProfileId] = profile
	app.browserMgr.BrowserProcesses[profile.ProfileId] = cmd
	monitor := &browserProcessMonitor{cmd: cmd, waitDone: make(chan struct{})}
	close(monitor.waitDone)

	app.waitBrowserProcess(profile.ProfileId, monitor)
	if profile.Running || app.browserMgr.BrowserProcesses[profile.ProfileId] != nil {
		t.Fatal("the current process exit did not release browser ownership")
	}
}
