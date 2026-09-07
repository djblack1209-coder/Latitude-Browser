package proxy

import (
	"net/http"
	"reflect"
	"testing"
	"time"

	"ant-chrome/backend/internal/config"
)

func TestNormalizeCheckSettingsAddsMultiTargetSpeedFallbacks(t *testing.T) {
	settings := NormalizeCheckSettings(config.ProxyCheckConfig{})
	if len(settings.Targets) < 4 {
		t.Fatalf("normalized target count = %d, want at least four speed/IP targets", len(settings.Targets))
	}

	speedCount := 0
	for _, target := range settings.Targets {
		if target.Type == "speed" {
			speedCount++
			if target.Method != http.MethodGet {
				t.Fatalf("default speed target %q method = %q, want GET", target.ID, target.Method)
			}
			if target.TimeoutMs != 8000 {
				t.Fatalf("default speed target %q timeout = %d, want 8000", target.ID, target.TimeoutMs)
			}
		}
	}
	if speedCount < 3 {
		t.Fatalf("default speed target count = %d, want at least three fallbacks", speedCount)
	}
}

func TestBuildSpeedTestConfigUsesSelectedTargetAsPreferredThenFallbacks(t *testing.T) {
	settings := config.ProxyCheckConfig{
		SpeedTargetID: "secondary",
		Targets: []config.ProxyCheckTarget{
			{ID: "primary", Type: "speed", URL: "https://primary.test/204", Method: "HEAD", TimeoutMs: 4000, ExpectedStatus: []int{204}},
			{ID: "secondary", Type: "speed", URL: "https://secondary.test/ok", Method: "GET", TimeoutMs: 9000, ExpectedStatus: []int{200}},
		},
	}

	got := BuildSpeedTestConfig(settings)
	if got == nil {
		t.Fatal("BuildSpeedTestConfig returned nil")
	}
	if got.Timeout != 9*time.Second {
		t.Fatalf("client timeout = %s, want 9s", got.Timeout)
	}
	if got.TCPTimeout != 15*time.Second {
		t.Fatalf("TCP timeout = %s, want default 15s", got.TCPTimeout)
	}
	if got.Method != http.MethodGet {
		t.Fatalf("preferred method = %q, want GET", got.Method)
	}
	if got.URLs[0] != "https://secondary.test/ok" || got.URLs[1] != "https://primary.test/204" {
		t.Fatalf("target order = %#v, want selected target followed by fallback", got.URLs)
	}
	if !reflect.DeepEqual(got.ExpectedStatus, []int{200, 204}) {
		t.Fatalf("union expected statuses = %#v, want [200 204]", got.ExpectedStatus)
	}
	if got.Targets[1].Method != http.MethodHead {
		t.Fatalf("fallback method = %q, want HEAD", got.Targets[1].Method)
	}
}

func TestSpeedTestTargetSpecsPreservesLegacyURLsAndAppliesMethod(t *testing.T) {
	got := speedTestTargetSpecs(&SpeedTestConfig{
		Method:         http.MethodHead,
		URLs:           []string{"https://one.test", "https://two.test", "https://one.test"},
		Timeout:        2 * time.Second,
		ExpectedStatus: []int{204},
	})
	if len(got) != 2 {
		t.Fatalf("target count = %d, want duplicate-free count 2", len(got))
	}
	for _, target := range got {
		if target.Method != http.MethodHead || target.Timeout != 2*time.Second || !reflect.DeepEqual(target.ExpectedStatus, []int{204}) {
			t.Fatalf("legacy target normalization = %#v", target)
		}
	}
}
