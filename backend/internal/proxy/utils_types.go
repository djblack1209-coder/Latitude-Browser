package proxy

// TestResult 代理测试结果
type TestResult struct {
	ProxyId   string
	Ok        bool
	LatencyMs int64
	Engine    string
	Error     string
	Stage     HealthStage
	Code      HealthCode
	TargetURL string
	Attempted int
}
