package backend

import (
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/proxy"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// BrowserProxyTestSpeed 手动触发单个代理测速并持久化结果
func (a *App) BrowserProxyTestSpeed(proxyId string) ProxyTestResult {
	releaseActivity, activityErr := a.dataActivity.begin()
	if activityErr != nil {
		return ProxyTestResult{ProxyId: proxyId, Error: activityErr.Error()}
	}
	defer releaseActivity()
	proxies := a.getLatestProxies()
	connectorType := a.defaultProxyConnectorType()
	result := proxy.SpeedTestWithConnector(proxyId, proxies, a.xrayMgr, a.singboxMgr, a.clashMgr, connectorType, a.proxySpeedTestConfig())
	a.persistProxySpeedResult(result)
	return buildProxyTestResult(result)
}

const (
	defaultProxySpeedConcurrency = 5
	maxProxySpeedConcurrency     = 10
)

// BrowserProxyBatchTestSpeed 批量并发测速，concurrency 控制并发数（默认 5，最高 10）。
func (a *App) BrowserProxyBatchTestSpeed(proxyIds []string, concurrency int) []ProxyTestResult {
	releaseActivity, activityErr := a.dataActivity.begin()
	if activityErr != nil {
		return blockedProxySpeeds(proxyIds, activityErr)
	}
	defer releaseActivity()
	if len(proxyIds) == 0 {
		return []ProxyTestResult{}
	}
	if concurrency <= 0 {
		concurrency = defaultProxySpeedConcurrency
	}
	if concurrency > maxProxySpeedConcurrency {
		concurrency = maxProxySpeedConcurrency
	}
	if concurrency > len(proxyIds) {
		concurrency = len(proxyIds)
	}

	proxies := a.getLatestProxies()
	connectorType := a.defaultProxyConnectorType()
	results := make([]ProxyTestResult, len(proxyIds))
	type speedJob struct {
		Idx     int
		ProxyId string
	}
	jobs := make(chan speedJob, len(proxyIds))
	var wg sync.WaitGroup

	for worker := 0; worker < concurrency; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobs {
				result := proxy.SpeedTestWithConnector(job.ProxyId, proxies, a.xrayMgr, a.singboxMgr, a.clashMgr, connectorType, a.proxySpeedTestConfig())
				a.persistProxySpeedResult(result)
				item := buildProxyTestResult(result)
				results[job.Idx] = item

				if a.ctx != nil {
					runtime.EventsEmit(a.ctx, "proxy:speed:result", item)
				}
			}
		}()
	}

	for i, proxyID := range proxyIds {
		jobs <- speedJob{Idx: i, ProxyId: proxyID}
	}
	close(jobs)

	wg.Wait()
	return results
}

// persistProxySpeedResult keeps the legacy speed columns updated and, when the
// active DAO supports it, stores the structured health contract for diagnostics.
// The optional interface is intentional: older integrations implementing ProxyDAO
// continue to work without a breaking interface change.
func (a *App) persistProxySpeedResult(result proxy.TestResult) {
	if a == nil || a.browserMgr == nil || a.browserMgr.ProxyDAO == nil {
		return
	}
	testedAt := time.Now().Format(time.RFC3339)
	_ = a.browserMgr.ProxyDAO.UpdateSpeedResult(result.ProxyId, result.Ok, result.LatencyMs, testedAt)
	if diagnosticDAO, ok := a.browserMgr.ProxyDAO.(interface {
		UpdateSpeedDiagnostic(proxyId string, ok bool, latencyMs int64, testedAt, engine, stage, code, targetURL, errorMessage string) error
	}); ok {
		_ = diagnosticDAO.UpdateSpeedDiagnostic(
			result.ProxyId,
			result.Ok,
			result.LatencyMs,
			testedAt,
			result.Engine,
			string(result.Stage),
			string(result.Code),
			result.TargetURL,
			result.Error,
		)
	}
}

func (a *App) testProxySpeedWithConnector(proxyId string, proxies []BrowserProxy, connectorType string) proxy.TestResult {
	return proxy.SpeedTestWithConnector(proxyId, proxies, a.xrayMgr, a.singboxMgr, a.clashMgr, config.NormalizeBrowserConnectorType(connectorType), a.proxySpeedTestConfig())
}

func (a *App) defaultProxyConnectorType() string {
	if a == nil || a.config == nil {
		return config.BrowserConnectorXray
	}
	return config.NormalizeBrowserConnectorType(a.config.Browser.DefaultConnectorType)
}

// BrowserProxyCheckIPHealth 检测单个代理的出口 IP 健康信息
func (a *App) BrowserProxyCheckIPHealth(proxyId string) ProxyIPHealthResult {
	releaseActivity, activityErr := a.dataActivity.begin()
	if activityErr != nil {
		return ProxyIPHealthResult{ProxyId: proxyId, Error: activityErr.Error()}
	}
	defer releaseActivity()
	proxies := a.getLatestProxies()
	connectorType := a.defaultProxyConnectorType()
	data, err := proxy.FetchIPHealthInfo(proxyId, proxies, a.xrayMgr, a.singboxMgr, a.clashMgr, connectorType, a.proxyIPHealthConfig())
	result := buildProxyIPHealthResult(proxyId, data, err)
	a.persistProxyIPHealthResult(result)
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "proxy:iphealth:result", result)
	}
	return result
}

// BrowserProxyBatchCheckIPHealth 批量并发检测代理出口 IP 健康信息
func (a *App) BrowserProxyBatchCheckIPHealth(proxyIds []string, concurrency int) []ProxyIPHealthResult {
	releaseActivity, activityErr := a.dataActivity.begin()
	if activityErr != nil {
		return blockedProxyHealth(proxyIds, activityErr)
	}
	defer releaseActivity()
	if len(proxyIds) == 0 {
		return []ProxyIPHealthResult{}
	}
	if concurrency <= 0 {
		concurrency = 10
	}
	if concurrency > len(proxyIds) {
		concurrency = len(proxyIds)
	}

	proxies := a.getLatestProxies()
	connectorType := a.defaultProxyConnectorType()
	results := make([]ProxyIPHealthResult, len(proxyIds))
	type healthJob struct {
		Idx     int
		ProxyId string
	}
	jobs := make(chan healthJob, len(proxyIds))
	var wg sync.WaitGroup

	for worker := 0; worker < concurrency; worker++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range jobs {
				data, err := proxy.FetchIPHealthInfo(job.ProxyId, proxies, a.xrayMgr, a.singboxMgr, a.clashMgr, connectorType, a.proxyIPHealthConfig())
				result := buildProxyIPHealthResult(job.ProxyId, data, err)
				a.persistProxyIPHealthResult(result)
				results[job.Idx] = result
				if a.ctx != nil {
					runtime.EventsEmit(a.ctx, "proxy:iphealth:result", result)
				}
			}
		}()
	}

	for i, proxyID := range proxyIds {
		jobs <- healthJob{Idx: i, ProxyId: proxyID}
	}
	close(jobs)

	wg.Wait()
	return results
}

func buildProxyIPHealthResult(proxyId string, data map[string]interface{}, err error) ProxyIPHealthResult {
	if data == nil {
		data = map[string]interface{}{}
	}

	if err != nil {
		data["error"] = err.Error()
		return ProxyIPHealthResult{
			ProxyId:   proxyId,
			Ok:        false,
			Source:    mapStringDefault(data, "_source", "ip_health"),
			Error:     err.Error(),
			Engine:    mapString(data, "_engine"),
			Stage:     mapStringDefault(data, "_stage", string(proxy.HealthStageRequest)),
			Code:      mapStringDefault(data, "_code", string(proxy.HealthCodeUnknown)),
			TargetURL: mapString(data, "_targetUrl"),
			RawData:   data,
			UpdatedAt: time.Now().Format(time.RFC3339),
		}
	}

	return ProxyIPHealthResult{
		ProxyId:        proxyId,
		Ok:             true,
		Source:         mapStringDefault(data, "_source", "ip_health"),
		Error:          "",
		Engine:         mapString(data, "_engine"),
		Stage:          mapStringDefault(data, "_stage", string(proxy.HealthStageComplete)),
		Code:           mapStringDefault(data, "_code", string(proxy.HealthCodeOK)),
		TargetURL:      mapString(data, "_targetUrl"),
		IP:             mapString(data, "ip"),
		FraudScore:     mapInt64(data, "fraudScore"),
		IsResidential:  mapBool(data, "isResidential"),
		IsBroadcast:    mapBool(data, "isBroadcast"),
		Country:        mapString(data, "country"),
		Region:         mapString(data, "region"),
		City:           mapString(data, "city"),
		AsOrganization: mapString(data, "asOrganization"),
		RawData:        data,
		UpdatedAt:      time.Now().Format(time.RFC3339),
	}
}

func mapStringDefault(data map[string]interface{}, key string, fallback string) string {
	value := strings.TrimSpace(mapString(data, key))
	if value == "" {
		return fallback
	}
	return value
}

func (a *App) persistProxyIPHealthResult(result ProxyIPHealthResult) {
	if a == nil || a.browserMgr == nil || a.browserMgr.ProxyDAO == nil {
		return
	}
	payload, err := json.Marshal(result)
	if err != nil {
		return
	}
	_ = a.browserMgr.ProxyDAO.UpdateIPHealthResult(result.ProxyId, string(payload))
}

func mapString(data map[string]interface{}, key string) string {
	value, ok := data[key]
	if !ok || value == nil {
		return ""
	}
	switch item := value.(type) {
	case string:
		return item
	default:
		return fmt.Sprint(value)
	}
}

func mapInt64(data map[string]interface{}, key string) int64 {
	value, ok := data[key]
	if !ok || value == nil {
		return 0
	}
	switch item := value.(type) {
	case int:
		return int64(item)
	case int8:
		return int64(item)
	case int16:
		return int64(item)
	case int32:
		return int64(item)
	case int64:
		return item
	case uint:
		return int64(item)
	case uint8:
		return int64(item)
	case uint16:
		return int64(item)
	case uint32:
		return int64(item)
	case uint64:
		return int64(item)
	case float32:
		return int64(item)
	case float64:
		return int64(item)
	case json.Number:
		if integer, err := item.Int64(); err == nil {
			return integer
		}
		if decimal, err := item.Float64(); err == nil {
			return int64(decimal)
		}
	case string:
		if integer, err := strconv.ParseInt(item, 10, 64); err == nil {
			return integer
		}
		if decimal, err := strconv.ParseFloat(item, 64); err == nil {
			return int64(decimal)
		}
	}
	return 0
}

func mapBool(data map[string]interface{}, key string) bool {
	value, ok := data[key]
	if !ok || value == nil {
		return false
	}
	switch item := value.(type) {
	case bool:
		return item
	case string:
		return strings.EqualFold(item, "true") || item == "1"
	case int:
		return item != 0
	case int64:
		return item != 0
	case float64:
		return item != 0
	}
	return false
}
