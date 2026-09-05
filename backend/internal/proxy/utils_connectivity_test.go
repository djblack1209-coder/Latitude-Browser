package proxy

import (
	"testing"
	"time"

	"ant-chrome/backend/internal/config"
)

func TestTestRealConnectivityWithRawConfigDoesNotResolveProxyPool(t *testing.T) {
	proxyID := "same-id"
	result := TestRealConnectivityWithRawConfig(
		proxyID,
		"",
		[]config.BrowserProxy{{ProxyId: proxyID, ProxyConfig: "http://127.0.0.1:9"}},
		nil,
		nil,
		nil,
		config.BrowserConnectorXray,
		&SpeedTestConfig{URLs: []string{"http://127.0.0.1:1"}, Timeout: time.Millisecond},
	)

	if result.ProxyId != proxyID {
		t.Fatalf("result proxy id = %q, want %q", result.ProxyId, proxyID)
	}
	if result.Ok {
		t.Fatal("raw empty config unexpectedly reported success")
	}
	if result.Error != "代理配置为空" {
		t.Fatalf("result error = %q, want raw config empty error", result.Error)
	}
}
