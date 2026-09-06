package apppath

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMigrateLegacyStateRootForOSRenamesExistingRoot(t *testing.T) {
	parent := t.TempDir()
	legacy := filepath.Join(parent, "ant-browser")
	canonical := filepath.Join(parent, "latitude-browser")
	if err := os.MkdirAll(filepath.Join(legacy, "data"), 0o755); err != nil {
		t.Fatal(err)
	}
	configPath := filepath.Join(legacy, "config.yaml")
	if err := os.WriteFile(configPath, []byte("app:\n  name: Ant Browser\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := migrateLegacyStateRootForOS(canonical, legacy); err != nil {
		t.Fatalf("migrate legacy state root: %v", err)
	}
	if _, err := os.Stat(canonical); err != nil {
		t.Fatalf("canonical state root missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(canonical, "config.yaml")); err != nil {
		t.Fatalf("migrated config missing: %v", err)
	}
	if _, err := os.Stat(legacy); !os.IsNotExist(err) {
		t.Fatalf("legacy state root still exists, err=%v", err)
	}
}

func TestMigrateLegacyStateRootForOSDoesNotOverwriteCanonicalRoot(t *testing.T) {
	parent := t.TempDir()
	legacy := filepath.Join(parent, "ant-browser")
	canonical := filepath.Join(parent, "latitude-browser")
	if err := os.MkdirAll(legacy, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(canonical, 0o755); err != nil {
		t.Fatal(err)
	}
	canonicalMarker := filepath.Join(canonical, "marker")
	if err := os.WriteFile(canonicalMarker, []byte("canonical"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := migrateLegacyStateRootForOS(canonical, legacy); err != nil {
		t.Fatalf("migrate legacy state root: %v", err)
	}
	contents, err := os.ReadFile(canonicalMarker)
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != "canonical" {
		t.Fatalf("canonical state root was overwritten: %q", contents)
	}
	if _, err := os.Stat(legacy); err != nil {
		t.Fatalf("legacy root should remain when canonical root exists: %v", err)
	}
}
