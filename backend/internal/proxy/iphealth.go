package proxy

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"ant-chrome/backend/internal/config"
)

const DefaultIPHealthURL = "https://my.ippure.com/v1/info"

type IPHealthConfig struct {
	URL     string
	Source  string
	Parser  string
	Timeout time.Duration
}

// FetchDefaultIPHealthInfo 使用传入的检测目标查询出口 IP 健康信息。
// 返回值为第三方接口原始 JSON（map 形式），不做本地评分计算。
func FetchDefaultIPHealthInfo(
	proxyId string,
	proxies []config.BrowserProxy,
	xrayMgr *XrayManager,
	singboxMgr *SingBoxManager,
) (map[string]interface{}, error) {
	return FetchIPHealthInfo(proxyId, proxies, xrayMgr, singboxMgr, nil, config.BrowserConnectorXray, nil)
}

func FetchIPHealthInfo(
	proxyId string,
	proxies []config.BrowserProxy,
	xrayMgr *XrayManager,
	singboxMgr *SingBoxManager,
	clashMgr *ClashManager,
	connectorType string,
	cfg *IPHealthConfig,
) (map[string]interface{}, error) {
	if cfg == nil {
		cfg = &IPHealthConfig{}
	}
	targetURL := strings.TrimSpace(cfg.URL)
	if targetURL == "" {
		targetURL = DefaultIPHealthURL
	}
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 20 * time.Second
	}
	source := resolveIPHealthSource(cfg, targetURL)
	parser := resolveIPHealthParser(cfg.Parser)
	meta := map[string]interface{}{
		"_source":    source,
		"_targetUrl": targetURL,
		"_parser":    parser,
		"_stage":     string(HealthStageResolveConfig),
		"_code":      string(HealthCodeUnknown),
	}
	if targetURL == "" {
		err := fmt.Errorf("IP 健康检测目标 URL 为空")
		setHealthFailureMeta(meta, err, HealthStageResolveConfig, HealthCodeTargetEmpty)
		return meta, err
	}

	src := resolveProxyConfig("", proxies, proxyId)
	if src == "" {
		err := fmt.Errorf("未找到代理配置")
		setHealthFailureMeta(meta, err, HealthStageResolveConfig, HealthCodeConfigEmpty)
		return meta, err
	}
	meta["_engine"] = speedTestProbeEngine(src, proxies, proxyId, connectorType)

	client, err := buildIPHealthHTTPClient(src, proxyId, proxies, xrayMgr, singboxMgr, clashMgr, connectorType, timeout)
	if err != nil {
		wrapped := fmt.Errorf("创建 IP 健康检测客户端失败（source=%s）: %w", source, err)
		stage, code := ClassifyHealthError(err, HealthStagePrepareBridge)
		setHealthFailureMeta(meta, wrapped, stage, code)
		return meta, wrapped
	}

	req, err := http.NewRequest(http.MethodGet, targetURL, nil)
	if err != nil {
		wrapped := fmt.Errorf("创建 IP 健康检测请求失败（source=%s）: %w", source, err)
		stage, code := ClassifyHealthError(err, HealthStageRequest)
		setHealthFailureMeta(meta, wrapped, stage, code)
		return meta, wrapped
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "LatitudeBrowser/1.0")

	resp, err := client.Do(req)
	if err != nil {
		wrapped := fmt.Errorf("调用 IP 健康检测接口失败（source=%s）: %w", source, err)
		stage, code := ClassifyHealthError(err, HealthStageRequest)
		setHealthFailureMeta(meta, wrapped, stage, code)
		return meta, wrapped
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		wrapped := fmt.Errorf("读取 IP 健康检测响应失败（source=%s）: %w", source, err)
		setHealthFailureMeta(meta, wrapped, HealthStageRequest, HealthCodeResponseReadFailed)
		return meta, wrapped
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet := bodySnippet(body, 180)
		wrapped := fmt.Errorf("IP 健康检测 HTTP %d（source=%s）: %s", resp.StatusCode, source, snippet)
		setHealthFailureMeta(meta, wrapped, HealthStageValidateResult, HealthCodeUnexpectedStatus)
		meta["_statusCode"] = resp.StatusCode
		if snippet != "" {
			meta["_bodySnippet"] = snippet
		}
		return meta, wrapped
	}

	result, err := parseIPHealthBody(body, cfg.Parser)
	if err != nil {
		snippet := bodySnippet(body, 180)
		wrapped := fmt.Errorf("IP 健康检测响应解析失败（source=%s, parser=%s）: %w", source, parser, err)
		setHealthFailureMeta(meta, wrapped, HealthStageValidateResult, HealthCodeResponseParseFailed)
		if snippet != "" {
			meta["_bodySnippet"] = snippet
		}
		return meta, wrapped
	}
	result["_source"] = source
	result["_targetUrl"] = targetURL
	result["_parser"] = parser
	result["_engine"] = meta["_engine"]
	result["_stage"] = string(HealthStageComplete)
	result["_code"] = string(HealthCodeOK)
	return result, nil
}

func setHealthFailureMeta(meta map[string]interface{}, err error, stage HealthStage, code HealthCode) {
	if meta == nil {
		return
	}
	meta["_stage"] = string(stage)
	meta["_code"] = string(code)
	if err != nil {
		meta["error"] = err.Error()
	}
}

func parseIPHealthBody(body []byte, parser string) (map[string]interface{}, error) {
	if strings.EqualFold(strings.TrimSpace(parser), "cloudflare_trace") {
		result := map[string]interface{}{}
		for _, line := range strings.Split(string(body), "\n") {
			key, value, ok := strings.Cut(strings.TrimSpace(line), "=")
			if ok && strings.TrimSpace(key) != "" {
				result[strings.TrimSpace(key)] = strings.TrimSpace(value)
			}
		}
		if ip := mapString(result, "ip"); ip != "" {
			result["ip"] = ip
		}
		return result, nil
	}
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func mapString(data map[string]interface{}, key string) string {
	value, ok := data[key]
	if !ok || value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return fmt.Sprint(value)
}

func buildIPHealthHTTPClient(
	src string,
	proxyId string,
	proxies []config.BrowserProxy,
	xrayMgr *XrayManager,
	singboxMgr *SingBoxManager,
	clashMgr *ClashManager,
	connectorType string,
	timeout time.Duration,
) (*http.Client, error) {
	return buildProxyHTTPClient(src, proxyId, proxies, xrayMgr, singboxMgr, clashMgr, connectorType, timeout)
}

func resolveIPHealthSource(cfg *IPHealthConfig, targetURL string) string {
	if cfg != nil {
		if source := strings.TrimSpace(cfg.Source); source != "" {
			return source
		}
		if parser := strings.TrimSpace(cfg.Parser); parser != "" {
			return parser
		}
	}
	if DefaultIPHealthURL != "" && strings.EqualFold(strings.TrimSpace(targetURL), DefaultIPHealthURL) {
		return "ip_health"
	}
	if parsed, err := url.Parse(strings.TrimSpace(targetURL)); err == nil {
		if host := strings.ToLower(strings.TrimSpace(parsed.Hostname())); host != "" {
			return host
		}
	}
	return "ip_health"
}

func resolveIPHealthParser(parser string) string {
	normalized := strings.TrimSpace(parser)
	if normalized == "" {
		return "json"
	}
	return normalized
}

func bodySnippet(body []byte, max int) string {
	s := strings.TrimSpace(string(body))
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
