package backend

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/proxy"
	"errors"
	"strings"
	"sync"
	"time"
)

func (a *App) BrowserProxyList() []BrowserProxy {
	a.proxyStateMu.RLock()
	defer a.proxyStateMu.RUnlock()
	return browser.ListProxiesWithFallback(a.browserMgr.ProxyDAO, append([]BrowserProxy(nil), a.config.Browser.Proxies...))
}

// BrowserProxyListGroups 获取所有代理分组名称
func (a *App) BrowserProxyListGroups() []string {
	return browser.ListProxyGroups(a.browserMgr.ProxyDAO)
}

// BrowserProxyListByGroup 按分组名称查询代理
func (a *App) BrowserProxyListByGroup(groupName string) []BrowserProxy {
	a.proxyStateMu.RLock()
	defer a.proxyStateMu.RUnlock()
	return browser.ListProxiesByGroupWithFallback(a.browserMgr.ProxyDAO, groupName, append([]BrowserProxy(nil), a.config.Browser.Proxies...))
}

// BrowserProxyClearSpeedDiagnostic clears the persisted speed result and
// structured diagnostic for one proxy. It is intentionally idempotent: a
// missing proxy or already-empty result simply returns false/true respectively
// according to the DAO operation result.
func (a *App) BrowserProxyClearSpeedDiagnostic(proxyId string) bool {
	proxyId = strings.TrimSpace(proxyId)
	if a == nil || a.browserMgr == nil || a.browserMgr.ProxyDAO == nil || proxyId == "" {
		return false
	}
	if diagnosticDAO, ok := a.browserMgr.ProxyDAO.(interface {
		ClearSpeedDiagnostic(proxyId string) error
	}); ok {
		return diagnosticDAO.ClearSpeedDiagnostic(proxyId) == nil
	}
	return false
}

// ValidateProxyConfig 验证代理配置是否支持
func (a *App) ValidateProxyConfig(proxyConfig string, proxyId string) ProxyValidationResult {
	proxies := a.getLatestProxies()
	supported, errorMsg := proxy.ValidateProxyConfig(proxyConfig, proxies, proxyId)
	return ProxyValidationResult{
		Supported: supported,
		ErrorMsg:  errorMsg,
	}
}

// TestProxyConnectivity 测试代理连通性
func (a *App) TestProxyConnectivity(proxyId string, proxyConfig string) ProxyTestResult {
	proxies := a.getLatestProxies()
	result := proxy.TestConnectivity(proxyId, proxyConfig, proxies, nil)
	if result.Engine == "" {
		result.Engine = "tcp"
	}
	return buildProxyTestResult(result)
}

// TestProxyRealConnectivity 通过真实 HTTP 请求测试代理连通性（Wails 绑定）
// 参考 Clash URLTest 策略：多 URL fallback + 复用桥接 + TCP ping 降级
func (a *App) TestProxyRealConnectivity(proxyId string) ProxyTestResult {
	releaseActivity, activityErr := a.dataActivity.begin()
	if activityErr != nil {
		return ProxyTestResult{ProxyId: proxyId, Error: activityErr.Error()}
	}
	defer releaseActivity()
	proxies := a.getLatestProxies()
	connectorType := config.NormalizeBrowserConnectorType(a.config.Browser.DefaultConnectorType)
	result := proxy.TestRealConnectivityWithRuntimeConfig(proxyId, proxies, a.xrayMgr, a.singboxMgr, a.clashMgr, connectorType, a.proxySpeedTestConfig())
	return buildProxyTestResult(result)
}

// TestProxyRealConnectivityWithConfig 使用调用方提供的代理配置执行真实 HTTP 测试。
// proxyId 仅作为结果标识，不会覆盖 proxyConfig，也不会写入代理池。
func (a *App) TestProxyRealConnectivityWithConfig(proxyId string, proxyConfig string) ProxyTestResult {
	releaseActivity, activityErr := a.dataActivity.begin()
	if activityErr != nil {
		return ProxyTestResult{ProxyId: proxyId, Error: activityErr.Error()}
	}
	defer releaseActivity()
	proxies := a.getLatestProxies()
	connectorType := config.NormalizeBrowserConnectorType(a.config.Browser.DefaultConnectorType)
	result := proxy.TestRealConnectivityWithRawConfig(proxyId, proxyConfig, proxies, a.xrayMgr, a.singboxMgr, a.clashMgr, connectorType, a.proxySpeedTestConfig())
	return buildProxyTestResult(result)
}

// BrowserProxyWarmupBridge 只预热本地代理桥接，不执行外网测速。
func (a *App) BrowserProxyWarmupBridge(proxyId string) ProxyBridgeWarmupResult {
	proxies := a.getLatestProxies()
	return a.warmupProxyBridge(proxyId, "", proxies)
}

// BrowserProxyWarmupBridgeWithConfig 预热指定代理配置，proxyConfig 仅本次预热生效。
func (a *App) BrowserProxyWarmupBridgeWithConfig(proxyId string, proxyConfig string) ProxyBridgeWarmupResult {
	proxies := a.getLatestProxies()
	return a.warmupProxyBridge(proxyId, proxyConfig, proxies)
}

// BrowserProxyBatchWarmupBridge 批量预热代理桥接，concurrency 控制并发数（默认 5）。
func (a *App) BrowserProxyBatchWarmupBridge(proxyIds []string, concurrency int) []ProxyBridgeWarmupResult {
	if len(proxyIds) == 0 {
		return []ProxyBridgeWarmupResult{}
	}
	if concurrency <= 0 {
		concurrency = 5
	}
	if concurrency > len(proxyIds) {
		concurrency = len(proxyIds)
	}

	proxies := a.getLatestProxies()
	results := make([]ProxyBridgeWarmupResult, len(proxyIds))
	type warmupJob struct {
		idx     int
		proxyId string
	}
	jobs := make(chan warmupJob, len(proxyIds))
	var wg sync.WaitGroup
	for worker := 0; worker < concurrency; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobs {
				results[job.idx] = a.warmupProxyBridge(job.proxyId, "", proxies)
			}
		}()
	}
	for i, proxyID := range proxyIds {
		jobs <- warmupJob{idx: i, proxyId: proxyID}
	}
	close(jobs)
	wg.Wait()
	return results
}

func (a *App) warmupProxyBridge(proxyId string, proxyConfig string, proxies []BrowserProxy) ProxyBridgeWarmupResult {
	releaseActivity, activityErr := a.dataActivity.begin()
	if activityErr != nil {
		return ProxyBridgeWarmupResult{ProxyId: proxyId, Available: true, Error: activityErr.Error()}
	}
	defer releaseActivity()
	startedAt := time.Now()
	proxyId = strings.TrimSpace(proxyId)
	result := ProxyBridgeWarmupResult{
		ProxyId:   proxyId,
		Stage:     string(proxy.HealthStageResolveConfig),
		Code:      string(proxy.HealthCodeUnknown),
		Available: true,
	}
	finishFailure := func(err error, fallbackStage proxy.HealthStage) ProxyBridgeWarmupResult {
		if err != nil {
			stage, code := proxy.ClassifyHealthError(err, fallbackStage)
			result.Stage = string(stage)
			result.Code = string(code)
			result.Error = err.Error()
		}
		result.LatencyMs = time.Since(startedAt).Milliseconds()
		return result
	}

	src := strings.TrimSpace(resolveProxyConfigForApp(proxyConfig, proxies, proxyId))
	if src == "" {
		return finishFailure(errors.New("代理配置为空"), proxy.HealthStageResolveConfig)
	}

	resolution, err := proxy.ResolveProxyKernelForConnector(src, proxies, proxyId, a.defaultProxyConnectorType())
	result.Engine = resolution.Kernel
	if err != nil {
		return finishFailure(err, proxy.HealthStageResolveKernel)
	}
	if resolution.Kernel == proxy.ProxyKernelNative {
		result.Ok = true
		result.Stage = string(proxy.HealthStageComplete)
		if strings.EqualFold(src, "direct://") {
			result.Engine = "direct"
			result.Code = string(proxy.HealthCodeDirect)
		} else {
			result.Code = string(proxy.HealthCodeOK)
		}
		result.LatencyMs = time.Since(startedAt).Milliseconds()
		return result
	}

	result.Stage = string(proxy.HealthStagePrepareBridge)
	var socksURL string
	switch resolution.Kernel {
	case proxy.ProxyKernelMihomo:
		if a.clashMgr == nil {
			return finishFailure(errors.New("mihomo 管理器不可用，请先下载 Mihomo 内核"), proxy.HealthStagePrepareBridge)
		}
		result.Attempted++
		socksURL, err = a.clashMgr.EnsureNodeBridge(src, proxies, proxyId)
	case proxy.ProxyKernelSingBox:
		if a.singboxMgr == nil {
			return finishFailure(errors.New("sing-box 管理器不可用"), proxy.HealthStagePrepareBridge)
		}
		result.Attempted++
		socksURL, err = a.singboxMgr.EnsureBridge(src, proxies, proxyId)
	case proxy.ProxyKernelXray:
		if a.xrayMgr == nil {
			return finishFailure(errors.New("xray 管理器不可用"), proxy.HealthStagePrepareBridge)
		}
		result.Attempted++
		socksURL, err = a.xrayMgr.EnsureBridge(src, proxies, proxyId)
	default:
		return finishFailure(errors.New("无法选择代理内核"), proxy.HealthStageResolveKernel)
	}
	if err != nil {
		return finishFailure(err, proxy.HealthStagePrepareBridge)
	}
	result.Ok = true
	result.Stage = string(proxy.HealthStageComplete)
	result.Code = string(proxy.HealthCodeOK)
	result.LatencyMs = time.Since(startedAt).Milliseconds()
	result.SocksURL = socksURL
	return result
}

func resolveProxyConfigForApp(proxyConfig string, proxies []BrowserProxy, proxyId string) string {
	proxyConfig = strings.TrimSpace(proxyConfig)
	proxyId = strings.TrimSpace(proxyId)
	if proxyId == "" {
		return proxyConfig
	}
	for _, item := range proxies {
		if strings.EqualFold(item.ProxyId, proxyId) {
			return strings.TrimSpace(item.ProxyConfig)
		}
	}
	return proxyConfig
}

// getLatestProxies 获取最新的代理列表，优先从数据库读取
func (a *App) getLatestProxies() []BrowserProxy {
	a.proxyStateMu.RLock()
	defer a.proxyStateMu.RUnlock()
	return browser.LatestProxiesWithFallback(a.browserMgr.ProxyDAO, append([]BrowserProxy(nil), a.config.Browser.Proxies...))
}
