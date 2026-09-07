package backend

import (
	"os"
	"path/filepath"
	"testing"

	"ant-chrome/backend/internal/config"
)

func writeTestCore(t *testing.T, root, core string) {
	t.Helper()
	path := filepath.Join(root, "bin", "linux-amd64", core)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("test core"), 0o755); err != nil {
		t.Fatal(err)
	}
}

func TestProxyCoreStatusExposesExplicitReadinessState(t *testing.T) {
	root := t.TempDir()
	writeTestCore(t, root, "xray")
	app := &App{appRoot: root, config: config.DefaultConfig()}
	target := proxyCoreTarget{GOOS: "linux", GOARCH: "amd64"}

	status := app.proxyCoreStatus(proxyCoreSpec{Core: "xray", BinaryBase: "xray", ConfigKey: "xray"}, target)
	if !status.Installed || !status.Active {
		t.Fatalf("expected active installed core, got %+v", status)
	}
	if status.State != ProxyCoreStateReady {
		t.Fatalf("state = %q, want %q", status.State, ProxyCoreStateReady)
	}

	app.config.Browser.DefaultConnectorType = config.BrowserConnectorMihomo
	status = app.proxyCoreStatus(proxyCoreSpec{Core: "xray", BinaryBase: "xray", ConfigKey: "xray"}, target)
	if status.State != ProxyCoreStateDownloaded {
		t.Fatalf("inactive app-managed core state = %q, want %q", status.State, ProxyCoreStateDownloaded)
	}
}

func TestProxyCoreStatusRejectsNonExecutableUnixCore(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "bin", "linux-amd64", "xray")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("not executable"), 0o644); err != nil {
		t.Fatal(err)
	}
	app := &App{appRoot: root, config: config.DefaultConfig()}
	status := app.proxyCoreStatus(proxyCoreSpec{Core: "xray", BinaryBase: "xray", ConfigKey: "xray"}, proxyCoreTarget{GOOS: "linux", GOARCH: "amd64"})
	if status.Installed || status.State != ProxyCoreStateMissing {
		t.Fatalf("non-executable core should be missing: %+v", status)
	}
}

func TestBrowserProxyConnectorPreflightRequiresCombinedStackCores(t *testing.T) {
	root := t.TempDir()
	writeTestCore(t, root, "xray")
	app := &App{appRoot: root, config: config.DefaultConfig()}

	result := app.BrowserProxyConnectorPreflight(ProxyConnectorPreflightRequest{
		ConnectorType: "xray",
		GOOS:          "linux",
		GOARCH:        "amd64",
	})
	if result.Ready {
		t.Fatalf("combined stack should not be ready without sing-box: %+v", result)
	}
	if result.State != ProxyCoreStateMissing {
		t.Fatalf("state = %q, want %q", result.State, ProxyCoreStateMissing)
	}
	if len(result.MissingCores) != 1 || result.MissingCores[0] != "sing-box" {
		t.Fatalf("missing cores = %#v, want [sing-box]", result.MissingCores)
	}

	writeTestCore(t, root, "sing-box")
	result = app.BrowserProxyConnectorPreflight(ProxyConnectorPreflightRequest{
		ConnectorType: "xray",
		GOOS:          "linux",
		GOARCH:        "amd64",
	})
	if !result.Ready || result.State != ProxyCoreStateReady {
		t.Fatalf("combined stack should be ready after both cores exist: %+v", result)
	}
	if len(result.Cores) != 2 || len(result.MissingCores) != 0 {
		t.Fatalf("unexpected core result: %+v", result)
	}
}

func TestBrowserProxyConnectorPreflightKeepsMihomoIndependent(t *testing.T) {
	root := t.TempDir()
	writeTestCore(t, root, "mihomo")
	app := &App{appRoot: root, config: config.DefaultConfig()}
	app.config.Browser.DefaultConnectorType = config.BrowserConnectorXray

	result := app.BrowserProxyConnectorPreflight(ProxyConnectorPreflightRequest{
		ConnectorType: "mihomo",
		GOOS:          "linux",
		GOARCH:        "amd64",
	})
	if !result.Ready || result.ConnectorType != config.BrowserConnectorMihomo {
		t.Fatalf("mihomo preflight should be ready independently: %+v", result)
	}
	if len(result.RequiredCores) != 1 || result.RequiredCores[0] != "mihomo" {
		t.Fatalf("required cores = %#v, want [mihomo]", result.RequiredCores)
	}
}

func TestBrowserProxyConnectorPreflightFindsPackagedMihomoRuntime(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "bin", "mihomo")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("mihomo"), 0o755); err != nil {
		t.Fatal(err)
	}
	app := &App{appRoot: root, config: config.DefaultConfig()}

	result := app.BrowserProxyConnectorPreflight(ProxyConnectorPreflightRequest{
		ConnectorType: config.BrowserConnectorMihomo,
		GOOS:          "darwin",
		GOARCH:        "arm64",
	})
	if !result.Ready || result.State != ProxyCoreStateReady {
		t.Fatalf("packaged Mihomo runtime should satisfy preflight: %+v", result)
	}
	if len(result.Cores) != 1 || result.Cores[0].Source != "runtime" {
		t.Fatalf("unexpected packaged Mihomo status: %+v", result.Cores)
	}
}

func TestBrowserProxyConnectorPreflightReportsUnavailableWithoutConfig(t *testing.T) {
	result := (&App{}).BrowserProxyConnectorPreflight(ProxyConnectorPreflightRequest{
		ConnectorType: "xray",
		GOOS:          "linux",
		GOARCH:        "amd64",
	})
	if result.Ready || result.State != ProxyCoreStateUnavailable {
		t.Fatalf("preflight state = %q, ready=%v, want unavailable/false: %+v", result.State, result.Ready, result)
	}
}
