package proxy

import (
	"strings"
	"testing"

	"ant-chrome/backend/internal/config"
)

func TestNormalizeBrowserPageProbeConfigDefaultsToCombinedStack(t *testing.T) {
	got := normalizeBrowserPageProbeConfig(nil)
	if got.ConnectorType != config.BrowserConnectorXray {
		t.Fatalf("connector type = %q, want %q", got.ConnectorType, config.BrowserConnectorXray)
	}
}

func TestProbeBrowserPageConnectivityUsesConfiguredConnectorStack(t *testing.T) {
	cfg := config.DefaultConfig()
	proxyID := "p1"
	proxies := []config.BrowserProxy{{
		ProxyId:     proxyID,
		ProxyConfig: "vless://00000000-0000-0000-0000-000000000000@example.com:443",
	}}

	cfg.Browser.DefaultConnectorType = config.BrowserConnectorMihomo
	result := ProbeBrowserPageConnectivity(proxyID, proxies, nil, nil, nil, &BrowserPageProbeConfig{
		ConnectorType: cfg.Browser.DefaultConnectorType,
	})
	if result.Ok {
		t.Fatal("expected probe setup to fail without a Mihomo manager")
	}
	if !strings.Contains(result.Error, "Mihomo 管理器未初始化") {
		t.Fatalf("error = %q, want Mihomo manager error proving connector propagation", result.Error)
	}
}

func TestProbeBrowserPageConnectivityUsesSingBoxInsideCombinedStack(t *testing.T) {
	proxyID := "p1"
	proxies := []config.BrowserProxy{{
		ProxyId:     proxyID,
		ProxyConfig: "anytls://pass@example.com:443?sni=example.com",
	}}
	result := ProbeBrowserPageConnectivity(proxyID, proxies, nil, nil, nil, &BrowserPageProbeConfig{
		ConnectorType: config.BrowserConnectorXray,
	})
	if result.Ok {
		t.Fatal("expected probe setup to fail without a sing-box manager")
	}
	if !strings.Contains(result.Error, "sing-box 管理器未初始化") {
		t.Fatalf("error = %q, want sing-box manager error proving combined-stack selection", result.Error)
	}
}

func TestProbeBrowserPageConnectivityDoesNotFallbackToMihomo(t *testing.T) {
	proxyID := "p1"
	proxies := []config.BrowserProxy{{ProxyId: proxyID, ProxyConfig: mieruClashNode}}
	result := ProbeBrowserPageConnectivity(proxyID, proxies, nil, nil, nil, &BrowserPageProbeConfig{
		ConnectorType: config.BrowserConnectorXray,
	})
	if result.Ok {
		t.Fatal("expected xray combined stack to reject a mihomo-only protocol")
	}
	if !strings.Contains(result.Error, "browser.default_connector_type=mihomo") {
		t.Fatalf("error = %q, want actionable stack mismatch", result.Error)
	}
}
