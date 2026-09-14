package proxy

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/logger"
)

// ─── Clash 标准测速 URL ───
// 使用多个轻量、无内容目标，避免单一站点的 DNS、地区或策略故障把
// 一个本来可用的代理误判为失败。DefaultSpeedTestURL 保留为兼容入口。

const DefaultSpeedTestURL = "http://www.gstatic.com/generate_204"

// SpeedTestTarget 描述一个测速目标及其请求策略。
// ExpectedStatus 为空时接受所有 2xx 响应。
type SpeedTestTarget struct {
	URL            string
	Method         string
	Timeout        time.Duration
	ExpectedStatus []int
}

// SpeedTestConfig 测速参数
type SpeedTestConfig struct {
	Timeout        time.Duration
	TCPTimeout     time.Duration
	Method         string
	URLs           []string
	ExpectedStatus []int
	Targets        []SpeedTestTarget
}

var DefaultSpeedTestConfig = SpeedTestConfig{
	Timeout:    8 * time.Second,
	TCPTimeout: 15 * time.Second,
	Method:     http.MethodGet,
	URLs: []string{
		DefaultSpeedTestURL,
		"https://cp.cloudflare.com/generate_204",
		"http://www.msftconnecttest.com/connecttest.txt",
		"https://www.cloudflare.com/cdn-cgi/trace",
	},
	Targets: []SpeedTestTarget{
		{URL: DefaultSpeedTestURL, Method: http.MethodGet, Timeout: 8 * time.Second, ExpectedStatus: []int{http.StatusNoContent}},
		{URL: "https://cp.cloudflare.com/generate_204", Method: http.MethodGet, Timeout: 8 * time.Second, ExpectedStatus: []int{http.StatusNoContent}},
		{URL: "http://www.msftconnecttest.com/connecttest.txt", Method: http.MethodGet, Timeout: 8 * time.Second, ExpectedStatus: []int{http.StatusOK}},
		{URL: "https://www.cloudflare.com/cdn-cgi/trace", Method: http.MethodGet, Timeout: 8 * time.Second, ExpectedStatus: []int{http.StatusOK}},
	},
}

// ─── 对外入口 ───

// SpeedTest 使用向后兼容的 xray 组合栈执行轻量 HTTP 延迟测试。
func SpeedTest(
	proxyId string,
	proxies []config.BrowserProxy,
	xrayMgr *XrayManager,
	singboxMgr *SingBoxManager,
	cfg *SpeedTestConfig,
) TestResult {
	return SpeedTestWithConnector(proxyId, proxies, xrayMgr, singboxMgr, nil, config.BrowserConnectorXray, cfg)
}

// SpeedTestWithConnector 严格按 connectorType 指定的全局连接栈执行测速；
// 单代理 preferredKernel 只能在该连接栈内部选择，不允许跨栈自动回退。
func SpeedTestWithConnector(
	proxyId string,
	proxies []config.BrowserProxy,
	xrayMgr *XrayManager,
	singboxMgr *SingBoxManager,
	clashMgr *ClashManager,
	connectorType string,
	cfg *SpeedTestConfig,
) TestResult {
	connectorType = config.NormalizeBrowserConnectorType(connectorType)
	return lightHTTPDelayTestWithConnector(proxyId, proxies, xrayMgr, singboxMgr, clashMgr, connectorType, cfg)
}

func lightHTTPDelayTestWithConnector(
	proxyId string,
	proxies []config.BrowserProxy,
	xrayMgr *XrayManager,
	singboxMgr *SingBoxManager,
	clashMgr *ClashManager,
	connectorType string,
	cfg *SpeedTestConfig,
) TestResult {
	log := logger.New("SpeedTest")

	if cfg == nil {
		c := DefaultSpeedTestConfig
		cfg = &c
	}
	connectorType = config.NormalizeBrowserConnectorType(connectorType)
	base := TestResult{ProxyId: proxyId, Engine: connectorType, Stage: HealthStageResolveConfig, Code: HealthCodeUnknown}

	src := resolveProxyConfig("", proxies, proxyId)
	if src == "" {
		base.Code = HealthCodeConfigEmpty
		base.Error = "代理配置为空"
		return base
	}

	if strings.EqualFold(strings.TrimSpace(src), "direct://") {
		return TestResult{ProxyId: proxyId, Ok: true, LatencyMs: 0, Engine: "direct", Stage: HealthStageComplete, Code: HealthCodeDirect}
	}

	targetSpecs := speedTestTargetSpecs(cfg)
	testURLs := speedTestTargetURLList(targetSpecs)
	if len(targetSpecs) == 0 {
		base.Code = HealthCodeTargetEmpty
		base.Error = "测速目标 URL 为空"
		return base
	}
	engine := speedTestProbeEngine(src, proxies, proxyId, connectorType)
	base.Engine = engine
	base.Stage = HealthStageResolveKernel

	resolution, resolutionErr := ResolveProxyKernelForConnector(src, proxies, proxyId, connectorType)
	if resolutionErr != nil {
		stage, code := ClassifyHealthError(resolutionErr, HealthStageResolveKernel)
		base.Stage, base.Code, base.Error = stage, code, resolutionErr.Error()
		return base
	}
	if resolution.Kernel != "" {
		base.Engine = resolution.Kernel
	}
	log.Info("开始代理测速",
		logger.F("proxy_id", proxyId),
		logger.F("engine", base.Engine),
		logger.F("timeout_ms", cfg.Timeout.Milliseconds()),
		logger.F("tcp_timeout_ms", cfg.TCPTimeout.Milliseconds()),
		logger.F("targets", strings.Join(testURLs, ",")),
	)

	client, err := buildSpeedTestHTTPClient(src, proxyId, proxies, xrayMgr, singboxMgr, clashMgr, connectorType, cfg)
	if err != nil {
		log.Warn("代理测速 HTTP 客户端创建失败",
			logger.F("proxy_id", proxyId),
			logger.F("error", err.Error()),
		)
		stage, code := ClassifyHealthError(err, HealthStagePrepareBridge)
		base.Stage, base.Code, base.Error = stage, code, err.Error()
		return base
	}

	var lastErr error
	var lastLatency int64
	var lastTarget string
	var lastStage HealthStage = HealthStageRequest
	var lastCode HealthCode = HealthCodeUnknown
	for _, target := range targetSpecs {
		testURL := target.URL
		base.Attempted++
		lastTarget = testURL
		latency, statusCode, err := doSpeedTestRequestWithTarget(client, target)
		lastLatency = latency
		if err != nil {
			lastErr = err
			lastStage, lastCode = ClassifyHealthError(err, HealthStageRequest)
			log.Warn("代理测速请求失败",
				logger.F("proxy_id", proxyId),
				logger.F("engine", base.Engine),
				logger.F("url", target.URL),
				logger.F("method", target.Method),
				logger.F("latency_ms", latency),
				logger.F("error", err.Error()),
			)
			continue
		}
		if speedTestStatusOKForTarget(statusCode, target.ExpectedStatus) {
			log.Info("代理测速成功",
				logger.F("proxy_id", proxyId),
				logger.F("engine", base.Engine),
				logger.F("url", target.URL),
				logger.F("method", target.Method),
				logger.F("status", statusCode),
				logger.F("latency_ms", latency),
			)
			return TestResult{
				ProxyId: proxyId, Ok: true, LatencyMs: latency, Engine: base.Engine,
				Stage: HealthStageComplete, Code: HealthCodeOK, TargetURL: target.URL, Attempted: base.Attempted,
			}
		}
		lastErr = fmt.Errorf("%s: HTTP %d", target.URL, statusCode)
		lastStage, lastCode = HealthStageValidateResult, HealthCodeUnexpectedStatus
		log.Warn("代理测速状态码不符合预期",
			logger.F("proxy_id", proxyId),
			logger.F("engine", base.Engine),
			logger.F("url", target.URL),
			logger.F("method", target.Method),
			logger.F("status", statusCode),
			logger.F("latency_ms", latency),
		)
	}

	if lastErr != nil {
		errorMessage := lastErr.Error()
		if runtimeError := speedTestRuntimeError(base.Engine, src, proxies, proxyId, xrayMgr); runtimeError != "" {
			errorMessage = runtimeError
			lastStage, lastCode = ClassifyHealthError(fmt.Errorf("%s", runtimeError), HealthStageRequest)
		}
		log.Warn("代理测速失败",
			logger.F("proxy_id", proxyId),
			logger.F("engine", base.Engine),
			logger.F("latency_ms", lastLatency),
			logger.F("error", errorMessage),
		)
		return TestResult{
			ProxyId: proxyId, Ok: false, LatencyMs: lastLatency, Engine: base.Engine, Error: errorMessage,
			Stage: lastStage, Code: lastCode, TargetURL: lastTarget, Attempted: base.Attempted,
		}
	}
	log.Warn("代理测速失败", logger.F("proxy_id", proxyId), logger.F("engine", base.Engine), logger.F("error", "测速失败"))
	return TestResult{
		ProxyId: proxyId, Ok: false, Engine: base.Engine, Error: "测速失败",
		Stage: HealthStageRequest, Code: HealthCodeUnknown, Attempted: base.Attempted,
	}
}

func buildSpeedTestHTTPClient(
	src string,
	proxyId string,
	proxies []config.BrowserProxy,
	xrayMgr *XrayManager,
	singboxMgr *SingBoxManager,
	clashMgr *ClashManager,
	connectorType string,
	cfg *SpeedTestConfig,
) (*http.Client, error) {
	timeout := effectiveSpeedTestClientTimeout(cfg)
	prepareTimeout := DefaultSpeedTestConfig.TCPTimeout
	if cfg != nil {
		if cfg.TCPTimeout > 0 {
			prepareTimeout = cfg.TCPTimeout
		}
	}
	if prepareTimeout <= 0 {
		prepareTimeout = timeout
	}

	type clientResult struct {
		client *http.Client
		err    error
	}
	resultCh := make(chan clientResult, 1)
	go func() {
		client, err := buildProxyHTTPClient(src, proxyId, proxies, xrayMgr, singboxMgr, clashMgr, connectorType, timeout)
		resultCh <- clientResult{client: client, err: err}
	}()

	timer := time.NewTimer(prepareTimeout)
	defer timer.Stop()
	select {
	case result := <-resultCh:
		return result.client, result.err
	case <-timer.C:
		return nil, fmt.Errorf("代理准备超时（%dms）", prepareTimeout.Milliseconds())
	}
}

func effectiveSpeedTestClientTimeout(cfg *SpeedTestConfig) time.Duration {
	timeout := DefaultSpeedTestConfig.Timeout
	if cfg != nil && cfg.Timeout > 0 {
		timeout = cfg.Timeout
	}
	for _, target := range speedTestTargetSpecs(cfg) {
		if target.Timeout > timeout {
			timeout = target.Timeout
		}
	}
	return timeout
}

func primarySpeedTestURL(cfg *SpeedTestConfig) string {
	targets := speedTestTargetSpecs(cfg)
	if len(targets) > 0 {
		return targets[0].URL
	}
	return strings.TrimSpace(DefaultSpeedTestURL)
}

func speedTestTargetURLs(cfg *SpeedTestConfig) []string {
	return speedTestTargetURLList(speedTestTargetSpecs(cfg))
}

func speedTestTargetURLList(targets []SpeedTestTarget) []string {
	urls := make([]string, 0, len(targets))
	for _, target := range targets {
		if url := strings.TrimSpace(target.URL); url != "" {
			urls = append(urls, url)
		}
	}
	return urls
}

func speedTestTargetSpecs(cfg *SpeedTestConfig) []SpeedTestTarget {
	if cfg == nil {
		defaults := cloneSpeedTestConfig(DefaultSpeedTestConfig)
		cfg = &defaults
	}
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = DefaultSpeedTestConfig.Timeout
	}
	method := normalizeSpeedTestMethod(cfg.Method)
	var raw []SpeedTestTarget
	if len(cfg.Targets) > 0 {
		raw = append(raw, cfg.Targets...)
	} else if len(cfg.URLs) > 0 {
		for _, url := range cfg.URLs {
			raw = append(raw, SpeedTestTarget{URL: url, Method: method, Timeout: timeout, ExpectedStatus: append([]int{}, cfg.ExpectedStatus...)})
		}
	} else {
		raw = append(raw, DefaultSpeedTestConfig.Targets...)
	}
	result := make([]SpeedTestTarget, 0, len(raw))
	seen := map[string]struct{}{}
	for _, target := range raw {
		target.URL = strings.TrimSpace(target.URL)
		if target.URL == "" {
			continue
		}
		key := strings.ToLower(target.URL)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		rawMethod := strings.TrimSpace(target.Method)
		if rawMethod == "" {
			target.Method = method
		} else {
			target.Method = normalizeSpeedTestMethod(rawMethod)
		}
		if target.Timeout <= 0 {
			target.Timeout = timeout
		}
		target.ExpectedStatus = append([]int{}, target.ExpectedStatus...)
		result = append(result, target)
	}
	return result
}

func speedTestProbeEngine(src string, proxies []config.BrowserProxy, proxyId string, connectorType string) string {
	resolution, err := ResolveProxyKernelForConnector(src, proxies, proxyId, connectorType)
	if err != nil {
		if resolution.Kernel != "" {
			return resolution.Kernel
		}
		return config.NormalizeBrowserConnectorType(connectorType)
	}
	if resolution.Kernel == ProxyKernelNative {
		return "native"
	}
	return resolution.Kernel
}

func speedTestRuntimeError(engine string, src string, proxies []config.BrowserProxy, proxyId string, xrayMgr *XrayManager) string {
	if engine != ProxyKernelXray || xrayMgr == nil {
		return ""
	}
	dnsServers := ""
	if proxyId != "" {
		for _, item := range proxies {
			if strings.EqualFold(item.ProxyId, proxyId) {
				dnsServers = item.DnsServers
				break
			}
		}
	}
	key := computeNodeKey(normalizeNodeScheme(src) + "\x00" + dnsServers)
	return latestXrayErrorSummary(filepath.Join(xrayMgr.resolveWorkdir(key), "xray-error.log"))
}

func latestXrayErrorSummary(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" || !strings.Contains(line, "[Error]") {
			continue
		}
		if idx := strings.Index(line, "[Error]"); idx >= 0 {
			line = strings.TrimSpace(line[idx+len("[Error]"):])
		}
		if len([]rune(line)) > 240 {
			line = string([]rune(line)[:240]) + "..."
		}
		return "xray 转发失败: " + line
	}
	return ""
}

func doSpeedTestRequest(client *http.Client, testURL string) (int64, int, error) {
	return doSpeedTestRequestWithTarget(client, SpeedTestTarget{URL: testURL, Method: http.MethodHead, Timeout: DefaultSpeedTestConfig.Timeout})
}

func doSpeedTestRequestWithTarget(client *http.Client, target SpeedTestTarget) (int64, int, error) {
	method := normalizeSpeedTestMethod(target.Method)
	latency, statusCode, err := doSpeedTestRequestWithMethodTimeout(client, method, target.URL, target.Timeout)
	if err != nil {
		return latency, statusCode, err
	}
	// HEAD is cheap, but a number of connectivity endpoints intentionally
	// reject it. Only then fall back to GET; never repeat the same HEAD request.
	if method == http.MethodHead && (statusCode == http.StatusMethodNotAllowed || statusCode == http.StatusNotImplemented) {
		return doSpeedTestRequestWithMethodTimeout(client, http.MethodGet, target.URL, target.Timeout)
	}
	return latency, statusCode, nil
}

func doSpeedTestRequestWithMethod(client *http.Client, method string, testURL string) (int64, int, error) {
	return doSpeedTestRequestWithMethodTimeout(client, method, testURL, 0)
}

func doSpeedTestRequestWithMethodTimeout(client *http.Client, method string, testURL string, timeout time.Duration) (int64, int, error) {
	start := time.Now()
	ctx := context.Background()
	var cancel context.CancelFunc
	if timeout > 0 {
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}
	req, err := http.NewRequestWithContext(ctx, normalizeSpeedTestMethod(method), testURL, nil)
	if err != nil {
		return 0, 0, fmt.Errorf("测速请求创建失败: %w", err)
	}
	resp, err := client.Do(req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return latency, 0, fmt.Errorf("测速超时（%dms）", timeout.Milliseconds())
		}
		return latency, 0, err
	}
	_ = resp.Body.Close()
	return latency, resp.StatusCode, nil
}

func speedTestStatusOK(statusCode int, cfg *SpeedTestConfig) bool {
	if cfg != nil && len(cfg.ExpectedStatus) > 0 {
		return speedTestStatusOKForTarget(statusCode, cfg.ExpectedStatus)
	}
	return isSpeedTestSuccessStatus(statusCode)
}

func speedTestStatusOKForTarget(statusCode int, expected []int) bool {
	if len(expected) > 0 {
		for _, candidate := range expected {
			if statusCode == candidate {
				return true
			}
		}
		return false
	}
	return isSpeedTestSuccessStatus(statusCode)
}
