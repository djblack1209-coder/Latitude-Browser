package backend

import (
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/logger"
	"ant-chrome/backend/internal/proxy"
	"fmt"
)

func (a *App) SaveBrowserProxies(proxies []BrowserProxy) error {
	a.maintenanceMu.Lock()
	defer a.maintenanceMu.Unlock()
	log := logger.New("Browser")
	normalized := proxy.NormalizeBrowserProxies(proxies, generateUUID)
	seen := make(map[string]bool, len(normalized))
	for _, item := range normalized {
		if seen[item.ProxyId] {
			return fmt.Errorf("代理 ID 重复: %s", item.ProxyId)
		}
		seen[item.ProxyId] = true
	}

	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	a.proxyStateMu.Lock()
	defer a.proxyStateMu.Unlock()

	if a.browserMgr.ProxyDAO != nil {
		if err := a.browserMgr.ProxyDAO.ReplaceAll(normalized); err != nil {
			log.Error("代理保存失败", logger.F("error", err))
			return err
		}
		a.config.Browser.Proxies = normalized
		log.Info("代理列表已保存到数据库", logger.F("count", len(normalized)))
		a.reconcileProfileProxyBindingsLocked()
		return nil
	}

	if err := config.SaveProxies(a.resolveAppPath("proxies.yaml"), normalized); err != nil {
		log.Error("代理列表保存失败", logger.F("error", err))
		return err
	}
	a.config.Browser.Proxies = normalized
	a.reconcileProfileProxyBindingsLocked()
	return nil
}
