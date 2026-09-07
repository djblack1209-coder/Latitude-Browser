package proxy

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"ant-chrome/backend/internal/config"
)

// TestConnectorProtocolFamilyContract keeps the protocol-to-stack contract in one
// table. These tests intentionally stop before starting a real connector process;
// they verify the decision that every speed, IP-health, page-probe, and browser
// request must share.
func TestConnectorProtocolFamilyContract(t *testing.T) {
	tests := []struct {
		name           string
		proxyConfig    string
		combinedKernel string
		mihomoKernel   string
		combinedError  string
		mihomoError    string
	}{
		{name: "vmess", proxyConfig: "vmess://00000000-0000-0000-0000-000000000000@example.com:443", combinedKernel: ProxyKernelXray, mihomoKernel: ProxyKernelMihomo},
		{name: "vless", proxyConfig: "vless://00000000-0000-0000-0000-000000000000@example.com:443", combinedKernel: ProxyKernelXray, mihomoKernel: ProxyKernelMihomo},
		{name: "trojan", proxyConfig: "trojan://password@example.com:443", combinedKernel: ProxyKernelXray, mihomoKernel: ProxyKernelMihomo},
		{name: "shadowsocks", proxyConfig: "ss://YWVzLTI1Ni1nY206cGFzcw==@example.com:443", combinedKernel: ProxyKernelXray, mihomoKernel: ProxyKernelMihomo},
		{name: "hysteria2", proxyConfig: "hysteria2://password@example.com:443", combinedKernel: ProxyKernelSingBox, mihomoKernel: ProxyKernelMihomo},
		{name: "tuic", proxyConfig: "tuic://00000000-0000-0000-0000-000000000000:password@example.com:443", combinedKernel: ProxyKernelSingBox, mihomoKernel: ProxyKernelMihomo},
		{name: "anytls", proxyConfig: "anytls://password@example.com:443?sni=example.com", combinedKernel: ProxyKernelSingBox, mihomoKernel: ProxyKernelMihomo},
		{name: "http", proxyConfig: "http://127.0.0.1:8080", combinedKernel: ProxyKernelNative, mihomoKernel: ProxyKernelMihomo},
		{name: "socks5", proxyConfig: "socks5://127.0.0.1:1080", combinedKernel: ProxyKernelNative, mihomoKernel: ProxyKernelMihomo},
		{name: "mieru is mihomo only", proxyConfig: mieruClashNode, combinedError: "browser.default_connector_type=mihomo", mihomoKernel: ProxyKernelMihomo},
		{name: "wireguard is mihomo only", proxyConfig: "type: wireguard\nserver: example.com\nport: 51820\nprivate-key: test", combinedError: "browser.default_connector_type=mihomo", mihomoKernel: ProxyKernelMihomo},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			combined, combinedErr := ResolveProxyKernelForConnector(tc.proxyConfig, nil, "", config.BrowserConnectorXray)
			if tc.combinedError != "" {
				if combinedErr == nil {
					t.Fatalf("combined stack unexpectedly accepted %s: %+v", tc.name, combined)
				}
				if !strings.Contains(combinedErr.Error(), tc.combinedError) {
					t.Fatalf("combined stack error = %q, want substring %q", combinedErr, tc.combinedError)
				}
			} else {
				if combinedErr != nil {
					t.Fatalf("combined stack resolution failed: %v", combinedErr)
				}
				if combined.Kernel != tc.combinedKernel {
					t.Fatalf("combined kernel = %q, want %q; resolution=%+v", combined.Kernel, tc.combinedKernel, combined)
				}
			}

			mihomo, mihomoErr := ResolveProxyKernelForConnector(tc.proxyConfig, nil, "", config.BrowserConnectorMihomo)
			if mihomoErr != nil {
				t.Fatalf("Mihomo stack resolution failed: %v", mihomoErr)
			}
			if mihomo.Kernel != tc.mihomoKernel {
				t.Fatalf("Mihomo kernel = %q, want %q; resolution=%+v", mihomo.Kernel, tc.mihomoKernel, mihomo)
			}
		})
	}
}

func TestSpeedTestWithConnectorUsesNativeHTTPProxyFixture(t *testing.T) {
	const targetURL = "http://speed-target.invalid/generate_204"
	proxyServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("proxy request method = %s, want GET", r.Method)
		}
		if r.URL.String() != targetURL {
			t.Errorf("proxy request URL = %q, want %q", r.URL.String(), targetURL)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer proxyServer.Close()

	proxyID := "http-fixture"
	result := SpeedTestWithConnector(
		proxyID,
		[]config.BrowserProxy{{ProxyId: proxyID, ProxyConfig: proxyServer.URL}},
		nil,
		nil,
		nil,
		config.BrowserConnectorXray,
		&SpeedTestConfig{Timeout: 2 * time.Second, TCPTimeout: 2 * time.Second, Method: http.MethodGet, URLs: []string{targetURL}},
	)
	if !result.Ok {
		t.Fatalf("speed test failed through local HTTP proxy: %+v", result)
	}
	if result.Engine != ProxyKernelNative {
		t.Fatalf("engine = %q, want native; result=%+v", result.Engine, result)
	}
	if result.Stage != HealthStageComplete || result.Code != HealthCodeOK {
		t.Fatalf("health state = (%q, %q), want (complete, ok); result=%+v", result.Stage, result.Code, result)
	}
	if result.TargetURL != targetURL || result.Attempted != 1 {
		t.Fatalf("target diagnostics = (%q, %d), want (%q, 1); result=%+v", result.TargetURL, result.Attempted, targetURL, result)
	}
	if result.ProxyId != proxyID {
		t.Fatalf("proxy id = %q, want %q", result.ProxyId, proxyID)
	}
}

func TestSpeedTestWithConnectorDirectFixture(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodHead {
			t.Errorf("target request method = %s, want HEAD", r.Method)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer target.Close()

	result := SpeedTestWithConnector(
		"direct-fixture",
		[]config.BrowserProxy{{ProxyId: "direct-fixture", ProxyConfig: "direct://"}},
		nil,
		nil,
		nil,
		config.BrowserConnectorXray,
		&SpeedTestConfig{Timeout: 2 * time.Second, TCPTimeout: 2 * time.Second, URLs: []string{target.URL}},
	)
	if !result.Ok {
		t.Fatalf("direct fixture speed test failed: %+v", result)
	}
	if result.Engine != "direct" {
		t.Fatalf("engine = %q, want direct; result=%+v", result.Engine, result)
	}
}

func TestFetchIPHealthInfoUsesConfiguredConnectorAndParsesFixture(t *testing.T) {
	const targetURL = "http://ip-health-target.invalid/v1/info"
	proxyServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("IP health request method = %s, want GET", r.Method)
		}
		if r.URL.String() != targetURL {
			t.Errorf("IP health request URL = %q, want %q", r.URL.String(), targetURL)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"ip":"198.51.100.42","country":"ZZ","risk":false}`)
	}))
	defer proxyServer.Close()

	proxyID := "ip-health-fixture"
	result, err := FetchIPHealthInfo(
		proxyID,
		[]config.BrowserProxy{{ProxyId: proxyID, ProxyConfig: proxyServer.URL}},
		nil,
		nil,
		nil,
		config.BrowserConnectorXray,
		&IPHealthConfig{URL: targetURL, Source: "fixture", Parser: "json", Timeout: 2 * time.Second},
	)
	if err != nil {
		t.Fatalf("IP health check failed through local HTTP proxy: %v; result=%+v", err, result)
	}
	if got := mapString(result, "ip"); got != "198.51.100.42" {
		t.Fatalf("ip = %q, want 198.51.100.42; result=%+v", got, result)
	}
	if got := mapString(result, "_source"); got != "fixture" {
		t.Fatalf("source = %q, want fixture; result=%+v", got, result)
	}
	if got := mapString(result, "_targetUrl"); got != targetURL {
		t.Fatalf("target URL = %q, want %q; result=%+v", got, targetURL, result)
	}
}

func TestFetchIPHealthInfoCloudflareTraceParserUsesDirectFixture(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = fmt.Fprint(w, "fl=42f1\nip=203.0.113.9\nloc=ZZ\nwarp=off\n")
	}))
	defer server.Close()

	result, err := FetchIPHealthInfo(
		"direct-ip-health",
		[]config.BrowserProxy{{ProxyId: "direct-ip-health", ProxyConfig: "direct://"}},
		nil,
		nil,
		nil,
		config.BrowserConnectorMihomo,
		&IPHealthConfig{URL: server.URL, Source: "trace-fixture", Parser: "cloudflare_trace", Timeout: 2 * time.Second},
	)
	if err != nil {
		t.Fatalf("Cloudflare trace fixture failed: %v; result=%+v", err, result)
	}
	if got := mapString(result, "ip"); got != "203.0.113.9" {
		t.Fatalf("ip = %q, want 203.0.113.9; result=%+v", got, result)
	}
	if got := mapString(result, "warp"); got != "off" {
		t.Fatalf("warp = %q, want off; result=%+v", got, result)
	}
}

func TestIPHealthRejectsMihomoOnlyProtocolOnCombinedStack(t *testing.T) {
	proxyID := "mihomo-only-ip-health"
	result, err := FetchIPHealthInfo(
		proxyID,
		[]config.BrowserProxy{{ProxyId: proxyID, ProxyConfig: mieruClashNode}},
		nil,
		nil,
		nil,
		config.BrowserConnectorXray,
		&IPHealthConfig{URL: "http://ip-health.invalid/v1/info", Parser: "json", Timeout: time.Second},
	)
	if err == nil {
		t.Fatalf("IP health check unexpectedly accepted Mihomo-only protocol: %+v", result)
	}
	if !strings.Contains(err.Error(), "browser.default_connector_type=mihomo") {
		t.Fatalf("error = %q, want actionable stack guidance", err)
	}
	if !strings.Contains(mapString(result, "error"), "browser.default_connector_type=mihomo") {
		t.Fatalf("metadata error = %q, want actionable stack guidance", mapString(result, "error"))
	}
}

func TestSpeedAndIPHealthUseSingBoxInsideCombinedStack(t *testing.T) {
	proxyID := "sing-box-fixture"
	proxies := []config.BrowserProxy{{ProxyId: proxyID, ProxyConfig: "hysteria2://password@example.com:443"}}

	speed := SpeedTestWithConnector(
		proxyID, proxies, nil, nil, nil, config.BrowserConnectorXray,
		&SpeedTestConfig{Timeout: time.Second, TCPTimeout: time.Second, URLs: []string{"http://speed.invalid/generate_204"}},
	)
	if speed.Ok {
		t.Fatalf("speed test unexpectedly succeeded without sing-box manager: %+v", speed)
	}
	if speed.Engine != ProxyKernelSingBox {
		t.Fatalf("speed engine = %q, want sing-box; result=%+v", speed.Engine, speed)
	}
	if !strings.Contains(speed.Error, "sing-box 管理器未初始化") {
		t.Fatalf("speed error = %q, want sing-box manager error", speed.Error)
	}
	if speed.Stage != HealthStageResolveKernel || speed.Code != HealthCodeKernelUnavailable {
		t.Fatalf("speed health state = (%q, %q), want (resolve_kernel, kernel_unavailable); result=%+v", speed.Stage, speed.Code, speed)
	}

	health, err := FetchIPHealthInfo(
		proxyID, proxies, nil, nil, nil, config.BrowserConnectorXray,
		&IPHealthConfig{URL: "http://ip-health.invalid/v1/info", Parser: "json", Timeout: time.Second},
	)
	if err == nil {
		t.Fatalf("IP health unexpectedly succeeded without sing-box manager: %+v", health)
	}
	if !strings.Contains(err.Error(), "sing-box 管理器未初始化") {
		t.Fatalf("IP health error = %q, want sing-box manager error", err)
	}
}
