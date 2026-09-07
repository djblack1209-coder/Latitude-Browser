package backend

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/logger"
	"ant-chrome/backend/internal/proxy"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func (a *App) cleanupFailedBrowserStart(cmd *exec.Cmd, monitor *browserProcessMonitor) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	stopErr := a.stopProcessCmd(cmd)
	if monitor != nil {
		select {
		case <-monitor.Done():
		case <-time.After(2 * time.Second):
			if isProcessAlive(cmd.Process.Pid) {
				if stopErr == nil {
					stopErr = fmt.Errorf("浏览器进程停止超时（PID %d）", cmd.Process.Pid)
				}
			}
		}
	}
	if isProcessAlive(cmd.Process.Pid) && stopErr == nil {
		stopErr = fmt.Errorf("浏览器进程仍在运行（PID %d）", cmd.Process.Pid)
	}
	return stopErr
}

func (a *App) ensureTorRuntimeReadyForBrowser(plan *browserStartPlan) error {
	if plan == nil || !browser.IsTorNetworkMode(plan.networkMode) {
		return nil
	}
	profileID := ""
	if plan.profile != nil {
		profileID = strings.TrimSpace(plan.profile.ProfileId)
	}
	if a == nil || a.torMgr == nil || profileID == "" || !a.torMgr.ProfileReady(profileID) {
		return fmt.Errorf("实例启动失败：受管 Tor 运行时在浏览器就绪前失效，已终止启动以避免网络回退")
	}
	return nil
}

func (a *App) startBrowserProfileWithPlan(input browserStartInput, plan *browserStartPlan) (*BrowserProfile, error) {
	log := logger.New("Browser")
	profile := plan.profile
	a.clearDeferredStartTargets(input.ProfileID)
	a.markProfileLastLaunchArgsLocked(profile, plan.args)

	if err := a.ensureTorRuntimeReadyForBrowser(plan); err != nil {
		profile.LastError = err.Error()
		return profile, err
	}

	cmd := exec.Command(plan.chromeBinaryPath, plan.args...)
	cmd.Dir = filepath.Dir(plan.chromeBinaryPath)

	monitor, err := newBrowserProcessMonitor(cmd)
	if err != nil {
		startErr := fmt.Errorf("实例启动失败：无法建立浏览器错误输出捕获。可执行文件：%s。原因：%v。", plan.chromeBinaryPath, err)
		log.Error("浏览器错误输出捕获初始化失败",
			logger.F("profile_id", input.ProfileID),
			logger.F("chrome", plan.chromeBinaryPath),
			logger.F("error", err.Error()),
			logger.F("reason", startErr.Error()),
		)
		profile.LastError = startErr.Error()
		return profile, startErr
	}
	if err := cmd.Start(); err != nil {
		startErr := fmt.Errorf("%s", describeChromeProcessStartError(plan.chromeBinaryPath, err))
		log.Error("浏览器进程启动失败",
			logger.F("profile_id", input.ProfileID),
			logger.F("chrome", plan.chromeBinaryPath),
			logger.F("error", err.Error()),
			logger.F("reason", startErr.Error()),
		)
		profile.LastError = startErr.Error()
		return profile, startErr
	}
	memoryLimitCleanup, err := applyBrowserProcessMemoryLimit(cmd, profile.MemoryLimitMB)
	if err != nil {
		_ = a.stopProcessCmd(cmd)
		startErr := fmt.Errorf("实例启动失败：无法应用实例内存限制 %d MB。原因：%v。", profile.MemoryLimitMB, err)
		log.Error("浏览器进程内存限制应用失败",
			logger.F("profile_id", input.ProfileID),
			logger.F("chrome", plan.chromeBinaryPath),
			logger.F("memory_limit_mb", profile.MemoryLimitMB),
			logger.F("error", err.Error()),
			logger.F("reason", startErr.Error()),
		)
		profile.LastError = startErr.Error()
		return profile, startErr
	}
	defer func() {
		if memoryLimitCleanup != nil {
			memoryLimitCleanup()
		}
	}()
	monitor.Start()

	var lastStartErr error
	for attempt := 1; attempt <= plan.maxStartAttempts; attempt++ {
		stableDebugPort, readyErr := waitBrowserDebugPortStable(plan.assignedDebugPort, plan.userDataDir, plan.startReadyTimeout, plan.startStableWindow, monitor)
		if readyErr == nil {
			if torErr := a.ensureTorRuntimeReadyForBrowser(plan); torErr != nil {
				_ = a.stopProcessCmd(cmd)
				profile.LastError = torErr.Error()
				return profile, torErr
			}
			a.markProfileRunningLocked(input.ProfileID, profile, cmd, cmd.Process.Pid, stableDebugPort, true, "")
			if plan.acquiredProxyBridge.valid() {
				a.bindProfileProxyBridge(input.ProfileID, plan.acquiredProxyBridge)
				plan.releaseProxyBridge = false
			}
			if len(plan.deferredStartTargets) > 0 {
				deferredPlan := deferredStartTargetsPlan{targets: plan.deferredStartTargets, newTabs: plan.deferredStartNewTabs}
				if err := openDeferredStartTargets(stableDebugPort, deferredPlan); err != nil {
					warning := deferredStartTargetsWarning(plan.deferredStartTargets, err)
					profile.RuntimeWarning = warning
					profile.LastError = ""
					log.Warn("浏览器已就绪，但启动页延后打开失败",
						logger.F("profile_id", input.ProfileID),
						logger.F("debug_port", stableDebugPort),
						logger.F("target_count", len(plan.deferredStartTargets)),
						logger.F("error", err.Error()),
						logger.F("warning", warning),
					)
				}
			}

			launchArgsLog := strings.Join(plan.args, " ")
			if browser.IsTorNetworkMode(plan.networkMode) {
				launchArgsLog = "[managed Tor arguments redacted]"
			}
			log.Info("实例启动",
				logger.F("profile_id", input.ProfileID),
				logger.F("debug_port", stableDebugPort),
				logger.F("pid", profile.Pid),
				logger.F("proxy", proxy.MaskProxyConfigForLog(plan.effectiveProxy)),
				logger.F("memory_limit_mb", profile.MemoryLimitMB),
				logger.F("attempt", attempt),
				logger.F("max_attempts", plan.maxStartAttempts),
				logger.F("args", launchArgsLog),
			)
			a.emitBrowserInstanceStarted(profile, false)

			cleanup := memoryLimitCleanup
			memoryLimitCleanup = nil
			go func() {
				defer func() {
					if cleanup != nil {
						cleanup()
					}
				}()
				a.waitBrowserProcess(input.ProfileID, monitor)
			}()
			return profile, nil
		}

		startErr := fmt.Errorf("%s", describeBrowserReadyFailure(plan.chromeBinaryPath, plan.assignedDebugPort, plan.totalReadyTimeout, readyErr))
		lastStartErr = startErr
		log.Error("浏览器启动未就绪",
			logger.F("profile_id", input.ProfileID),
			logger.F("chrome", plan.chromeBinaryPath),
			logger.F("debug_port", plan.assignedDebugPort),
			logger.F("attempt", attempt),
			logger.F("max_attempts", plan.maxStartAttempts),
			logger.F("error", readyErr.Error()),
			logger.F("reason", startErr.Error()),
		)

		if attempt < plan.maxStartAttempts && shouldRetryBrowserReadyFailure(readyErr) {
			log.Warn("浏览器启动未就绪，继续检测",
				logger.F("profile_id", input.ProfileID),
				logger.F("debug_port", plan.assignedDebugPort),
				logger.F("attempt", attempt),
				logger.F("next_attempt", attempt+1),
				logger.F("max_attempts", plan.maxStartAttempts),
				logger.F("timeout_ms", plan.startReadyTimeout.Milliseconds()),
			)
			continue
		}

		break
	}

	pendingStartNotice := ""
	if shouldKeepBrowserRunningPendingDebugReady(plan.assignedDebugPort, monitor) {
		if torErr := a.ensureTorRuntimeReadyForBrowser(plan); torErr != nil {
			_ = a.stopProcessCmd(cmd)
			profile.LastError = torErr.Error()
			return profile, torErr
		}
		runtimeWarning := browserDebugPendingWarning(plan.totalReadyTimeout)
		pendingStartNotice = browserDebugPendingStartNotice(plan.totalReadyTimeout)
		a.markProfileRunningLocked(input.ProfileID, profile, cmd, cmd.Process.Pid, plan.assignedDebugPort, false, runtimeWarning)
		if len(plan.deferredStartTargets) > 0 {
			a.storeDeferredStartTargets(input.ProfileID, plan.deferredStartTargets, plan.deferredStartNewTabs)
		}
		if plan.acquiredProxyBridge.valid() {
			a.bindProfileProxyBridge(input.ProfileID, plan.acquiredProxyBridge)
			plan.releaseProxyBridge = false
		}

		log.Warn("浏览器窗口已启动，但调试接口在等待窗口内未就绪，转入后台附着",
			logger.F("profile_id", input.ProfileID),
			logger.F("debug_port", plan.assignedDebugPort),
			logger.F("pid", profile.Pid),
			logger.F("max_attempts", plan.maxStartAttempts),
			logger.F("warning", runtimeWarning),
		)
		a.emitBrowserInstanceStarted(profile, false)
		cleanup := memoryLimitCleanup
		memoryLimitCleanup = nil
		go func() {
			defer func() {
				if cleanup != nil {
					cleanup()
				}
			}()
			a.waitBrowserProcess(input.ProfileID, monitor)
		}()
		go a.waitBrowserDebugReadyAsync(input.ProfileID, plan.assignedDebugPort, browserAsyncDebugAttachTimeout)
	}

	if pendingStartNotice != "" {
		profile.LastError = pendingStartNotice
		return profile, fmt.Errorf("%s", pendingStartNotice)
	}

	if lastStartErr != nil {
		if cleanupErr := a.cleanupFailedBrowserStart(cmd, monitor); cleanupErr != nil {
			lastStartErr = fmt.Errorf("%s；清理启动失败的浏览器进程失败：%v", lastStartErr, cleanupErr)
		}
		a.clearDeferredStartTargets(input.ProfileID)
		profile.LastError = lastStartErr.Error()
		return profile, lastStartErr
	}

	a.clearDeferredStartTargets(input.ProfileID)
	startErr := fmt.Errorf("实例启动失败：浏览器在等待窗口内仍未就绪")
	if cleanupErr := a.cleanupFailedBrowserStart(cmd, monitor); cleanupErr != nil {
		startErr = fmt.Errorf("%s；清理启动失败的浏览器进程失败：%v", startErr, cleanupErr)
	}
	profile.LastError = startErr.Error()
	return profile, startErr
}
