package backend

import "ant-chrome/backend/internal/browser"

func (a *App) BrowserPlatformCapabilities() browser.PlatformCapabilities {
	return browser.CurrentPlatformCapabilities()
}
