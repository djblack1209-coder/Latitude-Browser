package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadPersistsCanonicalProductName(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte("app:\n  name: Ant Browser\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.App.Name != ProductDisplayName {
		t.Fatalf("app name = %q, want %q", cfg.App.Name, ProductDisplayName)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "Ant Browser") {
		t.Fatalf("legacy product name persisted in config: %s", data)
	}
	if !strings.Contains(string(data), ProductDisplayName) {
		t.Fatalf("canonical product name missing from config: %s", data)
	}
}
