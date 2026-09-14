package backend

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/logger"
	"context"
	"errors"
	"fmt"
	"os/exec"
	goruntime "runtime"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) shutdown(ctx context.Context) {
	log := logger.New("App")
	if a.shouldStopRuntimeServicesOnShutdown() {
		log.Info("应用正在关闭...")
		if err := a.stopRuntimeServices(); err != nil {
			log.Error("应用关闭前未能确认全部运行时已停止；保留受管状态", logger.F("error", err.Error()))
			return
		}
	} else {
		log.Info("应用正在关闭（保留当前已打开的浏览器实例）...")
	}
	a.finalizeShutdown()
}

func (a *App) GetInterceptor() *logger.MethodInterceptor {
	return a.interceptor
}

// ForceQuit 仅在确认受管进程停止后授权原生窗口退出。错误返回前端，允许重试。
func (a *App) ForceQuit() error {
	if !a.requestQuit(quitModeFull) {
		return fmt.Errorf("应用正在退出，请等待当前清理完成")
	}
	if err := a.stopRuntimeServices(); err != nil {
		a.cancelQuitRequest()
		logger.New("App").Error("强制退出已取消：未能确认全部运行时已停止", logger.F("error", err.Error()))
		return err
	}
	a.completeQuitRequest()
	return nil
}

// QuitAppOnly 保留普通浏览器；存在受管 Tor 时升级为完整退出，避免留下无保护实例。
func (a *App) QuitAppOnly() error {
	// Close the start gate immediately, without blocking the native UI on Tor
	// bootstrap. Then wait for the current start to finish before checking if
	// its newly created browser/transport requires full cleanup.
	if !a.requestQuit(quitModeAppOnly) {
		return fmt.Errorf("应用正在退出，请等待当前清理完成")
	}
	a.torLifecycleMu.Lock()
	torActive := (a.torMgr != nil && a.torMgr.HasRunning()) || a.hasRunningTorBrowserProfiles()
	if torActive {
		a.quitMu.Lock()
		a.quitMode = quitModeFull
		a.quitMu.Unlock()
	}
	a.torLifecycleMu.Unlock()

	if torActive {
		if err := a.stopRuntimeServices(); err != nil {
			a.cancelQuitRequest()
			logger.New("App").Error("仅退出应用已取消：未能确认 Tor 浏览器及其运行时已停止", logger.F("error", err.Error()))
			return err
		}
	}
	a.completeQuitRequest()
	return nil
}

func (a *App) requestQuit(mode quitMode) bool {
	a.quitMu.Lock()
	defer a.quitMu.Unlock()
	if a.quitRequested {
		return false
	}
	// A second native close while cleanup is in flight must stay blocked.
	// forceQuit is granted only by completeQuitRequest after cleanup succeeds.
	a.forceQuit = false
	a.quitMode = mode
	a.quitRequested = true
	return true
}

func (a *App) isQuitRequested() bool {
	a.quitMu.Lock()
	defer a.quitMu.Unlock()
	return a.quitRequested
}

func (a *App) completeQuitRequest() {
	a.quitMu.Lock()
	a.forceQuit = true
	a.quitMu.Unlock()
	if a.ctx != nil {
		runtime.Quit(a.ctx)
	}
}

func (a *App) cancelQuitRequest() {
	a.quitMu.Lock()
	a.forceQuit = false
	a.quitRequested = false
	a.quitMode = quitModeFull
	a.quitMu.Unlock()
}

func (a *App) hasRunningTorBrowserProfiles() bool {
	if a == nil || a.browserMgr == nil {
		return false
	}
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	for _, profile := range a.browserMgr.Profiles {
		if profile != nil && profile.Running && browser.IsTorNetworkMode(profile.NetworkMode) {
			return true
		}
	}
	return false
}

func Start(a *App, ctx context.Context) {
	a.startup(ctx)
}

func Stop(a *App, ctx context.Context) {
	a.shutdown(ctx)
}

func platformSupportsCloseConfirmation() bool {
	return platformSupportsCloseConfirmationForOS(goruntime.GOOS)
}

func platformSupportsCloseConfirmationForOS(goos string) bool {
	switch strings.ToLower(strings.TrimSpace(goos)) {
	case "windows", "darwin", "linux":
		return true
	default:
		return false
	}
}

func (a *App) shouldStopRuntimeServicesOnShutdown() bool {
	a.quitMu.Lock()
	defer a.quitMu.Unlock()
	return a.quitMode != quitModeAppOnly
}

func ShouldBlockClose(a *App, ctx context.Context) bool {
	a.quitMu.Lock()
	forceQuit := a.forceQuit
	quitRequested := a.quitRequested
	a.quitMu.Unlock()
	if forceQuit {
		return false
	}
	if quitRequested {
		return true
	}
	// OnShutdown cannot veto an OS close. Intercept it before teardown on all
	// desktop platforms, not just the Windows tray flow, so failures are shown
	// while the manager is still alive and able to retry.
	if !platformSupportsCloseConfirmation() {
		return false
	}
	runtime.EventsEmit(ctx, "app:request-close")
	return true
}

func (a *App) stopRuntimeServices() error {
	a.stopServicesMu.Lock()
	defer a.stopServicesMu.Unlock()
	a.torLifecycleMu.Lock()
	defer a.torLifecycleMu.Unlock()

	var stopErrs []error
	if a.automationMgr != nil {
		a.automationMgr.StopAllTasks()
	}
	if a.speedScheduler != nil {
		a.speedScheduler.Stop()
		a.speedScheduler = nil
	}
	browsersStopped := a.stopTrackedBrowserProcesses()
	if !browsersStopped {
		stopErrs = append(stopErrs, fmt.Errorf("未能确认全部浏览器进程已停止"))
	}
	if a.xrayMgr != nil {
		if err := a.xrayMgr.StopAll(); err != nil {
			stopErrs = append(stopErrs, err)
		}
	}
	var torErr error
	if a.torMgr != nil {
		torErr = a.torMgr.StopAllWithError()
		if torErr != nil {
			logger.New("Tor").Error("应用关闭时 Tor 运行时停止失败", logger.F("error", torErr.Error()))
			stopErrs = append(stopErrs, torErr)
		}
	}
	// Keep bridge references when a browser or Tor runtime remains alive;
	// clearing them would make a later bounded retry unable to release the
	// still-owned transport.

	if a.clashMgr != nil {
		if err := a.clashMgr.StopAll(); err != nil {
			stopErrs = append(stopErrs, err)
		}
	}
	if a.singboxMgr != nil {
		if err := a.singboxMgr.StopAll(); err != nil {
			stopErrs = append(stopErrs, err)
		}
	}
	if len(stopErrs) == 0 {
		a.clearProfileProxyBridges()
	}
	return errors.Join(stopErrs...)
}

func (a *App) stopTrackedBrowserProcesses() bool {
	if a == nil || a.browserMgr == nil {
		return true
	}

	a.browserMgr.Mutex.Lock()
	tracked := make(map[string]*exec.Cmd, len(a.browserMgr.BrowserProcesses))
	for profileID, cmd := range a.browserMgr.BrowserProcesses {
		tracked[profileID] = cmd
	}
	a.browserMgr.Mutex.Unlock()

	stopErrors := make(map[string]error)
	for profileID, cmd := range tracked {
		if err := a.stopProcessCmd(cmd); err != nil {
			stopErrors[profileID] = err
		}
	}

	// Detached browser instances have no tracked launcher command after
	// Chromium hands off to its long-lived process. Reuse the normal stop
	// path (CDP first, then process kill) for every still-running profile so a
	// full app shutdown does not silently leave a browser alive.
	a.browserMgr.Mutex.Lock()
	pendingIDs := make([]string, 0)
	for profileID, profile := range a.browserMgr.Profiles {
		if profile != nil && profile.Running {
			pendingIDs = append(pendingIDs, profileID)
		}
	}
	a.browserMgr.Mutex.Unlock()
	for _, profileID := range pendingIDs {
		if _, err := a.BrowserInstanceStop(profileID); err != nil {
			stopErrors[profileID] = err
		} else {
			delete(stopErrors, profileID)
		}
	}

	allStopped := true
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	remaining := make(map[string]*exec.Cmd)
	for profileID, profile := range a.browserMgr.Profiles {
		cmd := a.browserMgr.BrowserProcesses[profileID]
		if profile == nil {
			if cmd != nil && cmd.Process != nil && isProcessAlive(cmd.Process.Pid) {
				remaining[profileID] = cmd
				allStopped = false
			}
			continue
		}

		if profile.Running {
			stopErr, hadStopError := stopErrors[profileID]
			stillLive := isBrowserProfileLive(profile, cmd)
			if hadStopError || stillLive {
				allStopped = false
				if hadStopError {
					profile.LastError = fmt.Sprintf("应用关闭时停止浏览器失败：%v", stopErr)
				} else {
					profile.LastError = "应用关闭时未能确认浏览器实例已停止；为避免直连回退，保留运行状态"
				}
				if cmd != nil {
					remaining[profileID] = cmd
				}
				continue
			}
			a.markProfileStoppedLocked(profileID, profile)
			continue
		}

		if cmd != nil && cmd.Process != nil && isProcessAlive(cmd.Process.Pid) {
			allStopped = false
			remaining[profileID] = cmd
		}
	}
	a.browserMgr.BrowserProcesses = remaining
	return allStopped
}

func (a *App) finalizeShutdown() {
	a.finalizeOnce.Do(func() {
		if a.launchServer != nil {
			_ = a.launchServer.Stop()
		}
		if a.db != nil {
			_ = a.db.Close()
		}
		_ = logger.Close()
	})
}
