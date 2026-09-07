package backend

import "fmt"

func (a *App) BrowserInstanceStart(profileId string) (*BrowserProfile, error) {
	return a.browserInstanceStartInternal(profileId, nil, nil, false, false, false, "", "")
}

func shouldPreferVisibleWindowForStartWithParams(startURLs []string) bool {
	return len(normalizeNonEmptyStrings(startURLs)) > 0
}

// BrowserInstanceStartDirect 仅本次启动走直连，不落库修改实例代理配置。
func (a *App) BrowserInstanceStartDirect(profileId string) (*BrowserProfile, error) {
	return a.browserInstanceStartInternal(profileId, nil, nil, false, false, true, "", "")
}

// BrowserInstanceStartWithParams 通过额外参数启动实例（仅本次启动生效，不落库）
func (a *App) BrowserInstanceStartWithParams(profileId string, extraLaunchArgs []string, startURLs []string, skipDefaultStartURLs bool) (*BrowserProfile, error) {
	preferVisibleWindow := shouldPreferVisibleWindowForStartWithParams(startURLs)
	return a.browserInstanceStartInternal(profileId, extraLaunchArgs, startURLs, skipDefaultStartURLs, preferVisibleWindow, false, "", "")
}

func (a *App) browserInstanceStartInternal(profileId string, extraLaunchArgs []string, startURLs []string, skipDefaultStartURLs bool, preferVisibleWindow bool, forceDirectProxy bool, proxyId string, proxyConfig string) (*BrowserProfile, error) {
	// A Tor death callback must either stop the browser belonging to its exact
	// runtime generation or observe a completed replacement start. Taking this
	// gate before the browser-manager lock gives starts and death handling one
	// stable lock order: Tor lifecycle, then browser manager.
	a.torLifecycleMu.Lock()
	if a.isQuitRequested() {
		a.torLifecycleMu.Unlock()
		return nil, fmt.Errorf("实例启动失败：应用正在退出，已拒绝创建新的浏览器或 Tor 运行时")
	}
	defer a.torLifecycleMu.Unlock()

	input := newBrowserStartInput(profileId, extraLaunchArgs, startURLs, skipDefaultStartURLs, preferVisibleWindow, forceDirectProxy, proxyId, proxyConfig)
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()

	profile, handled, err := a.resolveBrowserStartProfile(input)
	if err != nil || handled {
		return profile, err
	}

	plan, err := a.prepareBrowserStartPlan(input, profile)
	if err == errBrowserStartHandledByRecoveredRuntime {
		a.emitBrowserInstanceStarted(profile, true)
		return profile, nil
	}
	if err != nil {
		return profile, err
	}
	defer plan.releaseBridgeIfNeeded(a)

	return a.startBrowserProfileWithPlan(input, plan)
}
