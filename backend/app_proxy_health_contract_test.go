package backend

import (
	"testing"

	"ant-chrome/backend/internal/proxy"
)

func TestBuildProxyTestResultExposesHealthContract(t *testing.T) {
	result := buildProxyTestResult(proxy.TestResult{
		ProxyId:   "proxy-1",
		Ok:        false,
		LatencyMs: 321,
		Engine:    "xray",
		Error:     "connection refused",
		Stage:     proxy.HealthStageRequest,
		Code:      proxy.HealthCodeTargetUnreachable,
		TargetURL: "https://connectivity.example",
		Attempted: 3,
	})
	if result.Stage != string(proxy.HealthStageRequest) || result.Code != string(proxy.HealthCodeTargetUnreachable) {
		t.Fatalf("health contract = (%q, %q), want (%q, %q)", result.Stage, result.Code, proxy.HealthStageRequest, proxy.HealthCodeTargetUnreachable)
	}
	if result.TargetURL != "https://connectivity.example" || result.Attempted != 3 {
		t.Fatalf("health context = (%q, %d), want (https://connectivity.example, 3)", result.TargetURL, result.Attempted)
	}
}

func TestBuildProxyIPHealthResultPreservesDiagnosticMetadata(t *testing.T) {
	result := buildProxyIPHealthResult("proxy-2", map[string]interface{}{
		"_source":    "ip_health",
		"_engine":    "sing-box",
		"_stage":     string(proxy.HealthStageValidateResult),
		"_code":      string(proxy.HealthCodeUnexpectedStatus),
		"_targetUrl": "https://ip.example",
	}, testingError("IP 健康检测 HTTP 403"))
	if result.Ok {
		t.Fatal("expected IP health result to fail")
	}
	if result.Engine != "sing-box" || result.Stage != string(proxy.HealthStageValidateResult) || result.Code != string(proxy.HealthCodeUnexpectedStatus) {
		t.Fatalf("diagnostic metadata = (%q, %q, %q), want (sing-box, validate_result, unexpected_status)", result.Engine, result.Stage, result.Code)
	}
	if result.TargetURL != "https://ip.example" {
		t.Fatalf("TargetURL = %q, want https://ip.example", result.TargetURL)
	}
}

type testingError string

func (e testingError) Error() string { return string(e) }
