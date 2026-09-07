package backend

import (
	"strings"
	"testing"

	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/proxy"
)

func TestWarmupProxyBridgeUsesConfiguredConnectorStack(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Browser.DefaultConnectorType = config.BrowserConnectorMihomo
	app := &App{config: cfg}
	proxyID := "p1"
	proxies := []BrowserProxy{{
		ProxyId:     proxyID,
		ProxyConfig: "vless://00000000-0000-0000-0000-000000000000@example.com:443",
	}}

	result := app.warmupProxyBridge(proxyID, "", proxies)
	if result.Ok {
		t.Fatalf("warmup should fail without a Mihomo manager: %+v", result)
	}
	if result.Engine != proxy.ProxyKernelMihomo {
		t.Fatalf("engine = %q, want %q", result.Engine, proxy.ProxyKernelMihomo)
	}
	if !strings.Contains(result.Error, "mihomo 管理器不可用") {
		t.Fatalf("error = %q, want Mihomo manager error", result.Error)
	}
	if result.Stage != string(proxy.HealthStageResolveKernel) || result.Code != string(proxy.HealthCodeKernelUnavailable) {
		t.Fatalf("diagnostics = (%q, %q), want (%q, %q)", result.Stage, result.Code, proxy.HealthStageResolveKernel, proxy.HealthCodeKernelUnavailable)
	}
	if result.Attempted != 0 || result.TargetURL != "" || !result.Available {
		t.Fatalf("warmup context = attempted=%d target=%q available=%v, want 0/empty/true", result.Attempted, result.TargetURL, result.Available)
	}
}

func TestWarmupProxyBridgeDirectUsesCompleteHealthContract(t *testing.T) {
	cfg := config.DefaultConfig()
	app := &App{config: cfg}
	result := app.warmupProxyBridge("direct-proxy", "direct://", nil)
	if !result.Ok {
		t.Fatalf("direct warmup should succeed: %+v", result)
	}
	if result.Stage != string(proxy.HealthStageComplete) || result.Code != string(proxy.HealthCodeDirect) {
		t.Fatalf("diagnostics = (%q, %q), want (%q, %q)", result.Stage, result.Code, proxy.HealthStageComplete, proxy.HealthCodeDirect)
	}
	if result.Attempted != 0 || result.TargetURL != "" || !result.Available {
		t.Fatalf("warmup context = attempted=%d target=%q available=%v, want 0/empty/true", result.Attempted, result.TargetURL, result.Available)
	}
}
