package backend

import (
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/launchcode"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestInvalidControlConfigNeverFallsBackToAnonymous(t *testing.T) {
	for _, source := range []string{"launch_server:\n  auth:\n    enabled: true\n    api_key: '   '\n", "launch_server: [malformed"} {
		root := t.TempDir()
		path := filepath.Join(root, "config.yaml")
		if err := os.WriteFile(path, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		cfg := config.DefaultConfig()
		cfg.LaunchServer.Auth.Enabled = true
		cfg.LaunchServer.Auth.APIKey = "old-key"
		server := launchcode.NewLaunchServer(nil, nil, nil, 0)
		server.SetAPIAuthConfig(launchcode.APIAuthConfig{Enabled: true, APIKey: "old-key"})
		app := &App{appRoot: root, config: cfg, launchServer: server}
		if next, err := app.startupLoadConfig(); err == nil || next != nil {
			t.Fatal("startup accepted invalid configuration")
		}
		if err := app.ReloadConfig(); err == nil {
			t.Fatal("reload accepted invalid configuration")
		}
		if app.config != cfg || !server.APIAuthEnabled() {
			t.Fatal("failed reload replaced valid authentication")
		}
		req := httptest.NewRequest("GET", "http://localhost/api/health", nil)
		req.Header.Set(launchcode.DefaultAPIKeyHeader, "old-key")
		w := httptest.NewRecorder()
		launchcode.NewTestHandler(server).ServeHTTP(w, req)
		if w.Code != 200 {
			t.Fatalf("old authentication no longer works: %d", w.Code)
		}
		got, err := os.ReadFile(path)
		if err != nil || string(got) != source {
			t.Fatal("invalid config was overwritten")
		}
	}
}

func TestInvalidControlConfigSavePreservesFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	cfg := config.DefaultConfig()
	cfg.LaunchServer.Auth.Enabled = true
	cfg.LaunchServer.Auth.APIKey = "old-key"
	if err := cfg.Save(path); err != nil {
		t.Fatal(err)
	}
	old, _ := os.ReadFile(path)
	cfg.LaunchServer.Auth.APIKey = " "
	if err := cfg.Save(path); err == nil {
		t.Fatal("invalid security config saved")
	}
	got, _ := os.ReadFile(path)
	if string(got) != string(old) {
		t.Fatal("failed save changed config")
	}
}
