package backend

import (
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/database"
	"os"
	"path/filepath"
	"testing"
)

func TestStartupDatabaseRejectsFailedMigration(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "legacy.db")
	db, err := database.NewDB(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.GetConn().Exec(`CREATE TABLE schema_migrations (unexpected_column TEXT); CREATE TABLE preserved (value TEXT); INSERT INTO preserved VALUES ('old data')`); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	cfg := config.DefaultConfig()
	cfg.Database.SQLite.Path = path
	app := &App{appRoot: root}
	opened, err := app.startupInitDatabase(cfg)
	if opened != nil {
		_ = opened.Close()
	}
	if err == nil || opened != nil {
		t.Error("failed migration must not return a usable database")
	}
	check, err := database.NewDB(path)
	if err != nil {
		t.Fatal(err)
	}
	defer check.Close()
	var value string
	if err := check.GetConn().QueryRow("SELECT value FROM preserved").Scan(&value); err != nil || value != "old data" {
		t.Fatalf("old database damaged: %q %v", value, err)
	}
}

func TestStartupDatabaseReturnsMigratedSchema(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Database.SQLite.Path = filepath.Join(t.TempDir(), "new.db")
	app := &App{appRoot: t.TempDir()}
	db, err := app.startupInitDatabase(cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var count int
	if err := db.GetConn().QueryRow("SELECT COUNT(*) FROM browser_proxies").Scan(&count); err != nil {
		t.Fatalf("database published before migration: %v", err)
	}
}

func TestStartupDatabaseFailureDoesNotStartConsumers(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Database.SQLite.Path = filepath.Join(t.TempDir(), "bad.db")
	if err := os.WriteFile(cfg.Database.SQLite.Path, []byte("not SQLite"), 0600); err != nil {
		t.Fatal(err)
	}
	a := &App{appRoot: t.TempDir()}
	calls := 0
	err := a.startupWithDatabase(cfg, func(*database.DB) { calls++ })
	if err == nil || calls != 0 || a.db != nil || a.browserMgr != nil || a.launchServer != nil || a.automationMgr != nil || a.speedScheduler != nil {
		t.Fatalf("startup published partial services: %v, calls=%d", err, calls)
	}
	data, _ := os.ReadFile(cfg.Database.SQLite.Path)
	if string(data) != "not SQLite" {
		t.Fatal("failed startup replaced old database")
	}
}
