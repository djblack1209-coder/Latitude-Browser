package backend

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/database"
	"path/filepath"
	"testing"
)

func TestMigrateToSQLiteClearsLegacyTorProxyState(t *testing.T) {
	root := t.TempDir()
	db, err := database.NewDB(filepath.Join(root, "profiles.db"))
	if err != nil {
		t.Fatalf("NewDB returned error: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatalf("Migrate returned error: %v", err)
	}

	cfg := config.DefaultConfig()
	cfg.Browser.Cores = nil
	cfg.Browser.Proxies = nil
	cfg.Browser.Profiles = []config.BrowserProfileConfig{{
		ProfileId:          "legacy-tor",
		ProfileName:        "legacy tor",
		UserDataDir:        "legacy-tor",
		NetworkMode:        browser.NetworkModeTor,
		ProxyId:            "legacy-proxy",
		ProxyConfig:        "socks5://legacy",
		ProxyBindSourceID:  "legacy-source",
		ProxyBindSourceURL: "https://legacy.example/source",
		ProxyBindName:      "legacy import",
		ProxyBindUpdatedAt: "2026-09-01T00:00:00Z",
		FingerprintArgs:    []string{},
		LaunchArgs:         []string{},
		Tags:               []string{},
		Keywords:           []string{},
		CreatedAt:          "2026-09-01T00:00:00Z",
		UpdatedAt:          "2026-09-01T00:00:00Z",
	}}

	app := NewApp(root)
	app.config = cfg
	app.browserMgr = browser.NewManager(cfg, root)
	conn := db.GetConn()
	app.browserMgr.ProfileDAO = browser.NewSQLiteProfileDAO(conn)
	app.browserMgr.ProxyDAO = browser.NewSQLiteProxyDAO(conn)
	app.browserMgr.CoreDAO = browser.NewSQLiteCoreDAO(conn)
	app.browserMgr.BookmarkDAO = browser.NewSQLiteBookmarkDAO(conn)
	app.browserMgr.GroupDAO = browser.NewSQLiteGroupDAO(conn)
	app.browserMgr.ExtensionDAO = browser.NewSQLiteExtensionDAO(conn)

	app.migrateToSQLite()

	profile, err := app.browserMgr.ProfileDAO.GetById("legacy-tor")
	if err != nil {
		t.Fatalf("GetById returned error: %v", err)
	}
	if profile.NetworkMode != browser.NetworkModeTor {
		t.Fatalf("NetworkMode = %q, want %q", profile.NetworkMode, browser.NetworkModeTor)
	}
	if profile.ProxyId != "" || profile.ProxyConfig != "" ||
		profile.ProxyBindSourceID != "" || profile.ProxyBindSourceURL != "" ||
		profile.ProxyBindName != "" || profile.ProxyBindUpdatedAt != "" {
		t.Fatalf("migration retained proxy-only state: %+v", profile)
	}
}
