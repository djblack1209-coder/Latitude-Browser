package backend

import (
	"testing"

	"ant-chrome/backend/internal/config"
)

func TestBuildProxyBrowserProbeConfigPropagatesConnectorStack(t *testing.T) {
	cfg := buildProxyBrowserProbeConfig(ProxyBrowserProbeRequest{}, config.BrowserConnectorMihomo)
	if cfg.ConnectorType != config.BrowserConnectorMihomo {
		t.Fatalf("connector type = %q, want %q", cfg.ConnectorType, config.BrowserConnectorMihomo)
	}
}
