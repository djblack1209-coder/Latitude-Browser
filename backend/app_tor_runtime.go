package backend

import (
	"ant-chrome/backend/internal/logger"
	"ant-chrome/backend/internal/proxy"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type TorRuntimeStatus struct {
	Experimental    bool                            `json:"experimental"`
	ProductionReady bool                            `json:"productionReady"`
	Configured      bool                            `json:"configured"`
	BinaryPath      string                          `json:"binaryPath"`
	BinaryValid     bool                            `json:"binaryValid"`
	ActiveProfiles  []proxy.TorProfileRuntimeStatus `json:"activeProfiles"`
	Message         string                          `json:"message"`
}

func (a *App) GetTorStatus() TorRuntimeStatus {
	if a == nil {
		return TorRuntimeStatus{
			Experimental:    true,
			ProductionReady: false,
			Message:         "Tor 运行时管理器尚未初始化。",
		}
	}
	a.torConfigMu.RLock()
	defer a.torConfigMu.RUnlock()
	return a.getTorStatusLocked()
}

func (a *App) getTorStatusLocked() TorRuntimeStatus {
	status := TorRuntimeStatus{
		Experimental:    true,
		ProductionReady: false,
		Message:         "实验性 Tor 传输：仅提供受管本地 Tor 路由，不等同于 Tor Browser，也不构成匿名或无泄漏保证。",
	}
	if a.torMgr == nil {
		status.Message = "Tor 运行时管理器尚未初始化。"
		return status
	}
	status.BinaryPath = a.torMgr.ConfiguredBinaryPath()
	status.Configured = strings.TrimSpace(status.BinaryPath) != ""
	status.ActiveProfiles = a.torMgr.Status()
	if status.Configured {
		_, err := a.torMgr.ValidateBinaryPath(status.BinaryPath)
		status.BinaryValid = err == nil
		if err != nil {
			status.Message = fmt.Sprintf("Tor 路径校验失败：%v", err)
		}
	}
	return status
}

func (a *App) SetTorRuntimePath(path string) (TorRuntimeStatus, error) {
	releaseActivity, activityErr := a.dataActivity.begin()
	if activityErr != nil {
		return TorRuntimeStatus{}, activityErr
	}
	defer releaseActivity()
	if a == nil {
		return TorRuntimeStatus{Experimental: true, ProductionReady: false}, fmt.Errorf("Tor 运行时管理器尚未初始化")
	}
	a.torConfigMu.Lock()
	defer a.torConfigMu.Unlock()
	if a.config == nil || a.torMgr == nil {
		return a.getTorStatusLocked(), fmt.Errorf("Tor 运行时管理器尚未初始化")
	}
	if a.torMgr.HasRunning() {
		return a.getTorStatusLocked(), fmt.Errorf("仍有 Tor 实例运行，停止相关浏览器后才能修改 Tor 路径")
	}
	path = strings.TrimSpace(path)
	if path != "" {
		resolved, err := a.torMgr.ValidateBinaryPath(path)
		if err != nil {
			return a.getTorStatusLocked(), err
		}
		path = resolved
	}
	previous := a.config.Browser.TorBinaryPath
	a.config.Browser.TorBinaryPath = path
	if err := a.config.Save(a.resolveAppPath("config.yaml")); err != nil {
		a.config.Browser.TorBinaryPath = previous
		return a.getTorStatusLocked(), fmt.Errorf("保存 Tor 路径失败: %w", err)
	}
	a.torMgr.UpdateConfig(a.config)
	return a.getTorStatusLocked(), nil
}

func (a *App) handleTorRuntimeDied(profileID string, deathErr error) {
	// Compatibility entry point for older callers and tests that do not carry
	// the Tor generation. The generation-aware callback is installed during
	// normal startup; this path intentionally cannot make a generation claim.
	a.handleTorRuntimeDiedGeneration(profileID, "", deathErr)
}

func (a *App) handleTorRuntimeDiedGeneration(profileID, generation string, deathErr error) {
	if a == nil {
		return
	}
	profileID = strings.TrimSpace(profileID)
	generation = strings.TrimSpace(generation)
	if profileID == "" {
		return
	}
	if generation != "" && a.torMgr != nil && !a.torMgr.RuntimeGenerationMatches(profileID, generation) {
		logger.New("Tor").Warn("忽略过期 Tor 运行时退出回调", logger.F("profile_id", profileID), logger.F("generation", generation))
		return
	}

	go func() {
		// The generation check and dependent-browser stop must be atomic with
		// respect to browser starts. Without this gate an old callback could pass
		// the check, yield, and stop a newly started replacement browser.
		a.torLifecycleMu.Lock()
		defer a.torLifecycleMu.Unlock()
		if generation != "" && a.torMgr != nil && !a.torMgr.RuntimeGenerationMatches(profileID, generation) {
			logger.New("Tor").Warn("忽略已被新运行时取代的 Tor 退出回调", logger.F("profile_id", profileID), logger.F("generation", generation))
			return
		}
		cause := "Tor 运行时意外退出"
		if deathErr != nil {
			cause = fmt.Sprintf("Tor 运行时意外退出（%v）", deathErr)
		}
		message := cause + "，已停止依赖该传输的浏览器实例，避免回退到直连。"
		stopped := false
		forced := false
		var stopErr error

		if a.browserMgr != nil {
			if _, err := a.BrowserInstanceStop(profileID); err == nil {
				stopped = true
			} else {
				stopErr = err
				// BrowserInstanceStop may fail after a CDP close attempt. Take one
				// bounded process-level fallback, but only against the PID/debug
				// endpoint observed before the fallback. Never mark a replacement
				// browser as stopped.
				pid, debugPort, cmd := a.trackedBrowserProcessSnapshot(profileID)
				if cmd != nil {
					if err := a.stopProcessCmd(cmd); err != nil {
						stopErr = fmt.Errorf("浏览器停止失败：%w", err)
					}
				}
				if waitBrowserProcessStopped(pid, debugPort, 2*time.Second) {
					stopped = a.markBrowserStoppedIfSameProcess(profileID, pid, debugPort)
					forced = stopped
				}
			}
		} else {
			stopErr = fmt.Errorf("浏览器管理器未初始化")
		}

		if !stopped {
			if stopErr == nil {
				stopErr = fmt.Errorf("未找到可确认已停止的浏览器进程")
			}
			message = cause + "，未能确认依赖浏览器已停止；已阻止继续复用，请立即关闭实例。"
			logger.New("Tor").Error("Tor 退出后停止浏览器失败", logger.F("profile_id", profileID), logger.F("error", stopErr.Error()))
		} else if forced {
			message = cause + "，已强制停止依赖该传输的浏览器实例，避免回退到直连。"
		}

		if a.browserMgr != nil {
			a.browserMgr.Mutex.Lock()
			if profile := a.browserMgr.Profiles[profileID]; profile != nil {
				profile.LastError = message
			}
			a.browserMgr.Mutex.Unlock()
		}
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "tor:runtime:died", map[string]interface{}{
				"profileId": profileID,
				"error":     message,
				"stopped":   stopped,
				"forced":    forced,
			})
		}
	}()
}

func (a *App) trackedBrowserProcessSnapshot(profileID string) (int, int, *exec.Cmd) {
	if a == nil || a.browserMgr == nil {
		return 0, 0, nil
	}
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	profile := a.browserMgr.Profiles[profileID]
	cmd := a.browserMgr.BrowserProcesses[profileID]
	if profile == nil {
		return 0, 0, cmd
	}
	return profile.Pid, profile.DebugPort, cmd
}

func waitBrowserProcessStopped(pid, debugPort int, timeout time.Duration) bool {
	if pid <= 0 && debugPort <= 0 {
		return false
	}
	deadline := time.Now().Add(timeout)
	for {
		if !isProcessAlive(pid) && !canConnectDebugPort(debugPort, 100*time.Millisecond) {
			return true
		}
		if time.Now().After(deadline) {
			return false
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func (a *App) markBrowserStoppedIfSameProcess(profileID string, pid, debugPort int) bool {
	if a == nil || a.browserMgr == nil {
		return false
	}
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	profile := a.browserMgr.Profiles[profileID]
	if profile == nil || !profile.Running {
		return false
	}
	if pid <= 0 && debugPort <= 0 {
		return false
	}
	if (pid > 0 && profile.Pid != pid) || (debugPort > 0 && profile.DebugPort != debugPort) {
		return false
	}
	a.markProfileStoppedLocked(profileID, profile)
	return true
}
