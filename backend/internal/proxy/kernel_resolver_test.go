package proxy

import (
	"strings"
	"testing"

	"ant-chrome/backend/internal/config"
)

func TestResolveProxyKernelDefaultPriority(t *testing.T) {
	cases := []struct {
		name       string
		proxy      string
		wantKernel string
	}{
		{name: "vless uses xray", proxy: "vless://00000000-0000-0000-0000-000000000000@example.com:443", wantKernel: ProxyKernelXray},
		{name: "hysteria2 uses sing-box", proxy: "hysteria2://pass@example.com:443", wantKernel: ProxyKernelSingBox},
		{name: "anytls URI uses sing-box", proxy: "anytls://pass@example.com:443?sni=example.com", wantKernel: ProxyKernelSingBox},
		{name: "mieru uses mihomo", proxy: mieruClashNode, wantKernel: ProxyKernelMihomo},
		{name: "http uses native", proxy: "http://127.0.0.1:8080", wantKernel: ProxyKernelNative},
		{name: "socks5 without auth uses native", proxy: "socks5://127.0.0.1:1080", wantKernel: ProxyKernelNative},
		{name: "socks5 with auth uses xray", proxy: "socks5://user:pass@127.0.0.1:1080", wantKernel: ProxyKernelXray},
		{name: "http with auth uses xray", proxy: "http://user:pass@127.0.0.1:8080", wantKernel: ProxyKernelXray},
		{name: "https with auth uses xray", proxy: "https://user:pass@127.0.0.1:8443", wantKernel: ProxyKernelXray},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ResolveProxyKernel(tc.proxy, nil, "", "")
			if err != nil {
				t.Fatalf("ResolveProxyKernel returned error: %v", err)
			}
			if got.Kernel != tc.wantKernel {
				t.Fatalf("kernel = %q, want %q; resolution=%+v", got.Kernel, tc.wantKernel, got)
			}
		})
	}
}

func TestResolveProxyKernelRejectsUnsupportedPreferredKernel(t *testing.T) {
	_, err := ResolveProxyKernel(mieruClashNode, nil, "", ProxyKernelXray)
	if err == nil {
		t.Fatal("expected mieru + xray preference to be rejected")
	}
}

func TestResolveProxyKernelReadsPreferredKernelFromProxy(t *testing.T) {
	proxyID := "p1"
	got, err := ResolveProxyKernel("", []config.BrowserProxy{{ProxyId: proxyID, ProxyConfig: mieruClashNode, PreferredKernel: ProxyKernelMihomo}}, proxyID, "")
	if err != nil {
		t.Fatalf("ResolveProxyKernel returned error: %v", err)
	}
	if got.Kernel != ProxyKernelMihomo || got.PreferredKernel != ProxyKernelMihomo {
		t.Fatalf("unexpected resolution: %+v", got)
	}
}

func TestResolveProxyKernelForConnectorPrefersMihomoStack(t *testing.T) {
	got, err := ResolveProxyKernelForConnector("vless://00000000-0000-0000-0000-000000000000@example.com:443", nil, "", config.BrowserConnectorMihomo)
	if err != nil {
		t.Fatalf("ResolveProxyKernelForConnector returned error: %v", err)
	}
	if got.Kernel != ProxyKernelMihomo {
		t.Fatalf("kernel = %q, want %q; resolution=%+v", got.Kernel, ProxyKernelMihomo, got)
	}
}

func TestResolveProxyKernelForConnectorRoutesSingBoxProtocolsInsideCombinedStack(t *testing.T) {
	protocols := []string{
		"hysteria2://pass@example.com:443",
		"tuic://00000000-0000-0000-0000-000000000000:pass@example.com:443",
		"anytls://pass@example.com:443?sni=example.com",
	}
	for _, proxyConfig := range protocols {
		got, err := ResolveProxyKernelForConnector(proxyConfig, nil, "", config.BrowserConnectorXray)
		if err != nil {
			t.Fatalf("ResolveProxyKernelForConnector(%q) returned error: %v", proxyConfig, err)
		}
		if got.Kernel != ProxyKernelSingBox {
			t.Fatalf("proxy %q kernel = %q, want %q; resolution=%+v", proxyConfig, got.Kernel, ProxyKernelSingBox, got)
		}
	}
}

func TestResolveProxyKernelForConnectorHonorsPreferenceInsideSelectedStack(t *testing.T) {
	proxyID := "p1"
	proxies := []config.BrowserProxy{{
		ProxyId:         proxyID,
		ProxyConfig:     "vless://00000000-0000-0000-0000-000000000000@example.com:443",
		PreferredKernel: ProxyKernelXray,
	}}
	got, err := ResolveProxyKernelForConnector("", proxies, proxyID, config.BrowserConnectorXray)
	if err != nil {
		t.Fatalf("ResolveProxyKernelForConnector returned error: %v", err)
	}
	if got.Kernel != ProxyKernelXray {
		t.Fatalf("kernel = %q, want explicit %q; resolution=%+v", got.Kernel, ProxyKernelXray, got)
	}
}

func TestResolveProxyKernelForConnectorRejectsCrossStackPreference(t *testing.T) {
	cases := []struct {
		name              string
		connectorType     string
		preferredKernel   string
		wantErrorContains string
	}{
		{
			name:              "xray combined stack rejects mihomo preference",
			connectorType:     config.BrowserConnectorXray,
			preferredKernel:   ProxyKernelMihomo,
			wantErrorContains: "preferredKernel=mihomo",
		},
		{
			name:              "mihomo stack rejects xray preference",
			connectorType:     config.BrowserConnectorMihomo,
			preferredKernel:   ProxyKernelXray,
			wantErrorContains: "preferredKernel=xray",
		},
		{
			name:              "mihomo stack rejects sing-box preference",
			connectorType:     config.BrowserConnectorMihomo,
			preferredKernel:   ProxyKernelSingBox,
			wantErrorContains: "preferredKernel=sing-box",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			proxyID := "p1"
			proxies := []config.BrowserProxy{{
				ProxyId:         proxyID,
				ProxyConfig:     "vless://00000000-0000-0000-0000-000000000000@example.com:443",
				PreferredKernel: tc.preferredKernel,
			}}
			_, err := ResolveProxyKernelForConnector("", proxies, proxyID, tc.connectorType)
			if err == nil {
				t.Fatal("expected cross-stack preferred kernel to be rejected")
			}
			if !strings.Contains(err.Error(), tc.wantErrorContains) || !strings.Contains(err.Error(), "browser.default_connector_type") {
				t.Fatalf("error = %q, want actionable stack conflict", err)
			}
		})
	}
}

func TestResolveProxyKernelForConnectorDoesNotFallbackAcrossStacks(t *testing.T) {
	_, err := ResolveProxyKernelForConnector(mieruClashNode, nil, "", config.BrowserConnectorXray)
	if err == nil {
		t.Fatal("expected xray combined stack to reject mihomo-only protocol")
	}
	if !strings.Contains(err.Error(), "browser.default_connector_type=mihomo") {
		t.Fatalf("error = %q, want actionable mihomo stack switch guidance", err)
	}
}

func TestResolveProxyKernelForConnectorUsesConfiguredStack(t *testing.T) {
	cfg := config.DefaultConfig()
	proxyConfig := "hysteria2://pass@example.com:443"

	cfg.Browser.DefaultConnectorType = config.BrowserConnectorXray
	combined, err := ResolveProxyKernelForConnector(proxyConfig, nil, "", cfg.Browser.DefaultConnectorType)
	if err != nil {
		t.Fatalf("combined stack resolution returned error: %v", err)
	}
	if combined.Kernel != ProxyKernelSingBox {
		t.Fatalf("combined stack kernel = %q, want %q", combined.Kernel, ProxyKernelSingBox)
	}

	cfg.Browser.DefaultConnectorType = config.BrowserConnectorMihomo
	mihomo, err := ResolveProxyKernelForConnector(proxyConfig, nil, "", cfg.Browser.DefaultConnectorType)
	if err != nil {
		t.Fatalf("mihomo stack resolution returned error: %v", err)
	}
	if mihomo.Kernel != ProxyKernelMihomo {
		t.Fatalf("mihomo stack kernel = %q, want %q", mihomo.Kernel, ProxyKernelMihomo)
	}
}

func TestResolveProxyKernelForConnectorRoutesStandardProxyThroughMihomoStack(t *testing.T) {
	got, err := ResolveProxyKernelForConnector("socks5://127.0.0.1:1080", nil, "", config.BrowserConnectorMihomo)
	if err != nil {
		t.Fatalf("ResolveProxyKernelForConnector returned error: %v", err)
	}
	if got.Kernel != ProxyKernelMihomo {
		t.Fatalf("kernel = %q, want %q; resolution=%+v", got.Kernel, ProxyKernelMihomo, got)
	}
}
