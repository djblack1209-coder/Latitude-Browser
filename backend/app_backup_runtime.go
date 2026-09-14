package backend

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"errors"
	"fmt"
	"os/exec"
)

func (a *App) backupStopRuntimeForMaintenance() error {
	var stopErrs []error
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
			stopErrs = append(stopErrs, fmt.Errorf("停止 Tor 运行时失败: %w", torErr))
		}
	}
	// Preserve ownership metadata whenever maintenance cannot prove that every
	// browser and Tor runtime is gone. The caller aborts before mutating data.

	if a.singboxMgr != nil {
		if err := a.singboxMgr.StopAll(); err != nil {
			stopErrs = append(stopErrs, err)
		}
	}
	if a.clashMgr != nil {
		if err := a.clashMgr.StopAll(); err != nil {
			stopErrs = append(stopErrs, err)
		}
	}
	if len(stopErrs) == 0 {
		a.clearProfileProxyBridges()
	}
	if a.speedScheduler != nil {
		a.speedScheduler.Stop()
		a.speedScheduler = nil
	}
	return errors.Join(stopErrs...)
}

func (a *App) backupReloadAfterMutation() error {
	if err := a.reloadConfigLocked(); err != nil {
		return err
	}

	if a.browserMgr != nil {
		a.browserMgr.Config = a.config
		a.browserMgr.Mutex.Lock()
		a.browserMgr.Profiles = make(map[string]*browser.Profile)
		a.browserMgr.BrowserProcesses = make(map[string]*exec.Cmd)
		a.browserMgr.XrayBridges = make(map[string]*browser.XrayBridge)
		a.browserMgr.Mutex.Unlock()
	}
	if a.xrayMgr != nil {
		a.xrayMgr.Config = a.config
	}
	if a.clashMgr != nil {
		a.clashMgr.Config = a.config
	}
	if a.singboxMgr != nil {
		a.singboxMgr.Config = a.config
	}
	a.migrateToSQLite()
	if a.browserMgr != nil {
		a.browserMgr.InitData()
	}
	a.autoDetectCores()
	a.loadProxies()

	if a.launchCodeSvc != nil {
		_ = a.launchCodeSvc.LoadAll()
	}
	if a.browserMgr != nil {
		a.browserMgr.CodeProvider = a.launchCodeSvc
	}

	if a.browserMgr != nil && a.browserMgr.ProxyDAO != nil {
		a.speedScheduler = browser.NewProxySpeedScheduler(
			a.browserMgr.ProxyDAO,
			func(proxyID string) (bool, int64, string) {
				connectorType := config.NormalizeBrowserConnectorType(a.config.Browser.DefaultConnectorType)
				r := a.testProxySpeedWithConnector(proxyID, a.getLatestProxies(), connectorType)
				return r.Ok, r.LatencyMs, r.Error
			},
			browser.DefaultProxySpeedInterval,
			browser.DefaultProxySpeedConcurrency,
		)
		a.speedScheduler.BeginActivity = a.dataActivity.begin
		a.speedScheduler.Start()
	}
	return nil
}
