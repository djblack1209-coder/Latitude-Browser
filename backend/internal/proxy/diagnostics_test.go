package proxy

import (
	"strings"
	"testing"

	"ant-chrome/backend/internal/config"
)

func TestMaskProxyConfigMasksURIUserInfoAndSensitiveQuery(t *testing.T) {
	got := MaskProxyConfigForLog("socks5://alice:secret@example.com:1080?token=token-value&remark=office")

	for _, leaked := range []string{"alice", "secret", "token-value"} {
		if strings.Contains(got, leaked) {
			t.Fatalf("masked proxy config contains %q: %s", leaked, got)
		}
	}
	if !strings.Contains(got, "socks5://***@example.com:1080") {
		t.Fatalf("masked proxy config lost safe URI context: %s", got)
	}
	if !strings.Contains(got, "token=***") {
		t.Fatalf("sensitive query parameter was not masked: %s", got)
	}
	if !strings.Contains(got, "remark=office") {
		t.Fatalf("non-sensitive query parameter should be preserved: %s", got)
	}
}

func TestMaskProxyConfigHidesOpaqueProxyPayload(t *testing.T) {
	got := MaskProxyConfigForLog("vmess://base64-secret-payload")
	if got != "vmess://***" {
		t.Fatalf("opaque proxy payload = %q, want vmess://***", got)
	}
}

func TestMaskProxyConfigMasksJSONCredentials(t *testing.T) {
	jsonConfig := `{"server":"proxy.example.com","username":"alice","password":"secret","access_token":"token-value"}`
	gotJSON := MaskProxyConfigForLog(jsonConfig)
	for _, leaked := range []string{"alice", "secret", "token-value"} {
		if strings.Contains(gotJSON, leaked) {
			t.Fatalf("masked JSON proxy config contains %q: %s", leaked, gotJSON)
		}
	}
	if !strings.Contains(gotJSON, `"server":"proxy.example.com"`) {
		t.Fatalf("masked JSON proxy config lost safe fields: %s", gotJSON)
	}
}

func TestMaskProxyConfigFailsClosedForYAMLCredentials(t *testing.T) {
	yamlConfig := "type: trojan\n" +
		"credentials:\n" +
		"  username: alice-yaml\n" +
		"  password: secret-yaml\n" +
		"  uuid: uuid-yaml\n" +
		"nested:\n" +
		"  auth:\n" +
		"    username: nested-user\n" +
		"    password: nested-password\n" +
		"    token: nested-token\n" +
		"block: |\n" +
		"  username: block-user\n" +
		"  password: block-password\n" +
		"  uuid: block-uuid\n"
	got := MaskProxyConfigForLog(yamlConfig)
	if got != redactedProxyConfig {
		t.Fatalf("YAML proxy config = %q, want fail-closed redaction", got)
	}
	for _, leaked := range []string{"alice-yaml", "secret-yaml", "uuid-yaml", "nested-user", "nested-password", "nested-token", "block-user", "block-password", "block-uuid"} {
		if strings.Contains(got, leaked) {
			t.Fatalf("fail-closed YAML redaction contains %q: %s", leaked, got)
		}
	}
}

func TestMaskProxyConfigFailsClosedForMalformedURI(t *testing.T) {
	for _, config := range []string{
		"socks5://alice:secret%@",
		"socks5://alice:secret@%",
		"http://[::1",
		"vmess://%zz",
	} {
		got := MaskProxyConfigForLog(config)
		if got != redactedProxyConfig {
			t.Fatalf("malformed proxy URI %q = %q, want fail-closed redaction", config, got)
		}
		if strings.Contains(got, "alice") || strings.Contains(got, "secret") {
			t.Fatalf("malformed proxy URI leaked credentials: %s", got)
		}
	}
}

func TestBuildProxyDiagnosticUsesConfiguredConnectorStack(t *testing.T) {
	proxyConfig := "ss://YWVzLTEyOC1nY206cGFzc3dvcmQ@example.com:8388"

	combined := BuildProxyDiagnostic(proxyConfig, nil, "", BuildDiagnosticOptions{
		ConnectorType: config.BrowserConnectorXray,
	})
	if !combined.Ok || combined.Engine != ProxyKernelXray {
		t.Fatalf("combined-stack diagnostic = %+v, want successful Xray diagnostic", combined)
	}

	mihomo := BuildProxyDiagnostic(proxyConfig, nil, "", BuildDiagnosticOptions{
		ConnectorType: config.BrowserConnectorMihomo,
	})
	if !mihomo.Ok || mihomo.Engine != ProxyKernelMihomo {
		t.Fatalf("mihomo-stack diagnostic = %+v, want successful Mihomo diagnostic", mihomo)
	}
}

func TestBuildProxyDiagnosticRejectsCrossStackFallback(t *testing.T) {
	diagnostic := BuildProxyDiagnostic(mieruClashNode, nil, "", BuildDiagnosticOptions{
		ConnectorType: config.BrowserConnectorXray,
	})
	if diagnostic.Ok {
		t.Fatalf("xray stack must not diagnose a mihomo-only node as usable: %+v", diagnostic)
	}
	if len(diagnostic.Errors) == 0 || !strings.Contains(diagnostic.Errors[0], "browser.default_connector_type=mihomo") {
		t.Fatalf("diagnostic errors = %#v, want actionable Mihomo stack-switch guidance", diagnostic.Errors)
	}
}
