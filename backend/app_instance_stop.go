package backend

import (
	"ant-chrome/backend/internal/logger"
	"fmt"
	"time"
)

func (a *App) BrowserInstanceStop(profileId string) (*BrowserProfile, error) {
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	return a.browserInstanceStopLocked(profileId)
}

// browserInstanceStopLocked is the lifecycle-gated stop primitive. Callers
// must hold browserMgr.Mutex; the Tor death path additionally holds the Tor
// lifecycle gate so a replacement generation cannot race this operation.
func (a *App) browserInstanceStopLocked(profileId string) (*BrowserProfile, error) {
	log := logger.New("Browser")

	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists {
		return nil, fmt.Errorf("profile not found")
	}

	cmd := a.browserMgr.BrowserProcesses[profileId]
	debugPort := profile.DebugPort
	pid := profile.Pid
	if pid <= 0 && cmd != nil && cmd.Process != nil {
		pid = cmd.Process.Pid
	}
	if cmd == nil && debugPort <= 0 && pid <= 0 {
		err := fmt.Errorf("实例停止失败：没有可确认的浏览器进程或调试端口")
		profile.LastError = err.Error()
		return profile, err
	}
	if tryCloseBrowserViaCDP(debugPort, 5*time.Second) {
		// A successful CDP close is only a request. Wait until both the process
		// and debug endpoint confirm termination before clearing tracked state.
		stopped := waitBrowserProcessStopped(pid, debugPort, 2*time.Second)
		if !stopped && cmd != nil && cmd.Process != nil && cmd.Process.Pid == pid {
			// Chromium can close CDP before its process has exited. Reap only the
			// exact launcher we still own; a persisted/untracked PID alone is not
			// enough authority to kill a process that may have been replaced.
			log.Warn("CDP 已关闭，继续停止仍在运行的受管浏览器进程", logger.F("profile_id", profileId), logger.F("pid", pid))
			if err := a.stopBrowserProcess(cmd); err != nil {
				profile.LastError = err.Error()
				return profile, err
			}
			stopped = waitBrowserProcessStopped(pid, debugPort, 2*time.Second)
		}
		if !stopped {
			err := fmt.Errorf("实例停止失败：CDP 已请求关闭，但无法确认浏览器已退出（PID %d，调试端口 %d）", pid, debugPort)
			log.Error("实例停止失败", logger.F("profile_id", profileId), logger.F("method", "cdp"), logger.F("debug_port", debugPort), logger.F("pid", pid), logger.F("reason", err.Error()))
			profile.LastError = err.Error()
			return profile, err
		}
		a.markProfileStoppedLocked(profileId, profile)
		log.Info("实例停止", logger.F("profile_id", profileId), logger.F("method", "cdp"), logger.F("debug_port", debugPort))
		return profile, nil
	}

	if cmd != nil && cmd.Process != nil {
		if err := a.stopBrowserProcess(cmd); err != nil {
			log.Error("实例停止失败", logger.F("profile_id", profileId), logger.F("error", err))
			profile.LastError = err.Error()
			return profile, err
		}
	}

	if !waitBrowserProcessStopped(pid, debugPort, 2*time.Second) {
		err := fmt.Errorf("实例停止失败：浏览器仍在运行或停止状态无法确认（PID %d，调试端口 %d）", pid, debugPort)
		log.Error("实例停止失败", logger.F("profile_id", profileId), logger.F("debug_port", debugPort), logger.F("pid", pid), logger.F("reason", err.Error()))
		profile.LastError = err.Error()
		return profile, err
	}

	a.markProfileStoppedLocked(profileId, profile)
	log.Info("实例停止", logger.F("profile_id", profileId))
	return profile, nil
}

func (a *App) BrowserInstanceRestart(profileId string) (*BrowserProfile, error) {
	if _, err := a.BrowserInstanceStop(profileId); err != nil {
		return nil, err
	}
	return a.BrowserInstanceStart(profileId)
}
