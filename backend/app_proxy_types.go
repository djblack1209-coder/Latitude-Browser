package backend

import "ant-chrome/backend/internal/proxy"

type ProxyBuildDiagnostic = proxy.ProxyBuildDiagnostic
type ProxyRuntimeDiagnostic = proxy.ProxyRuntimeDiagnostic

// ProxyValidationResult 代理验证结果
type ProxyValidationResult struct {
	Supported bool   `json:"supported"`
	ErrorMsg  string `json:"errorMsg"`
}

// ProxyTestResult 代理测试结果
type ProxyTestResult struct {
	ProxyId   string `json:"proxyId"`
	Ok        bool   `json:"ok"`
	LatencyMs int64  `json:"latencyMs"`
	Engine    string `json:"engine"`
	Error     string `json:"error"`
	Stage     string `json:"stage"`
	Code      string `json:"code"`
	TargetURL string `json:"targetUrl"`
	Attempted int    `json:"attempted"`
}

func buildProxyTestResult(result proxy.TestResult) ProxyTestResult {
	return ProxyTestResult{
		ProxyId:   result.ProxyId,
		Ok:        result.Ok,
		LatencyMs: result.LatencyMs,
		Engine:    result.Engine,
		Error:     result.Error,
		Stage:     string(result.Stage),
		Code:      string(result.Code),
		TargetURL: result.TargetURL,
		Attempted: result.Attempted,
	}
}

type ProxyBrowserProbeRequest struct {
	ProxyId     string   `json:"proxyId"`
	URLs        []string `json:"urls"`
	Concurrency int      `json:"concurrency"`
	TimeoutMs   int      `json:"timeoutMs"`
}

type ProxyBrowserProbeResult struct {
	ProxyId     string `json:"proxyId"`
	Ok          bool   `json:"ok"`
	TotalMs     int64  `json:"totalMs"`
	AverageMs   int64  `json:"averageMs"`
	P95Ms       int64  `json:"p95Ms"`
	Bytes       int64  `json:"bytes"`
	Completed   int    `json:"completed"`
	Failed      int    `json:"failed"`
	Concurrency int    `json:"concurrency"`
	Error       string `json:"error"`
	Stage       string `json:"stage"`
	Code        string `json:"code"`
	TargetURL   string `json:"targetUrl"`
}

// ProxyBridgeWarmupResult 代理桥接预热结果。
type ProxyBridgeWarmupResult struct {
	ProxyId   string `json:"proxyId"`
	Ok        bool   `json:"ok"`
	Engine    string `json:"engine"`
	SocksURL  string `json:"socksUrl"`
	LatencyMs int64  `json:"latencyMs"`
	Error     string `json:"error"`
	// Stage/Code/TargetURL/Attempted follow the shared health contract. Warmup
	// does not issue an external request, so TargetURL stays empty and Attempted
	// counts bridge-start attempts rather than target requests.
	Stage     string `json:"stage"`
	Code      string `json:"code"`
	TargetURL string `json:"targetUrl"`
	Attempted int    `json:"attempted"`
	// Native Wails responses are available; browser-preview fallbacks override
	// this with false on the frontend.
	Available bool `json:"available"`
}

// ProxyIPHealthResult 代理出口 IP 健康信息（透传第三方接口结果）
type ProxyIPHealthResult struct {
	ProxyId        string                 `json:"proxyId"`
	Ok             bool                   `json:"ok"`
	Source         string                 `json:"source"`
	Error          string                 `json:"error"`
	Engine         string                 `json:"engine"`
	Stage          string                 `json:"stage"`
	Code           string                 `json:"code"`
	TargetURL      string                 `json:"targetUrl"`
	IP             string                 `json:"ip"`
	FraudScore     int64                  `json:"fraudScore"`
	IsResidential  bool                   `json:"isResidential"`
	IsBroadcast    bool                   `json:"isBroadcast"`
	Country        string                 `json:"country"`
	Region         string                 `json:"region"`
	City           string                 `json:"city"`
	AsOrganization string                 `json:"asOrganization"`
	RawData        map[string]interface{} `json:"rawData"`
	UpdatedAt      string                 `json:"updatedAt"`
}
