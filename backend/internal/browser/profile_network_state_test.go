package browser

import (
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/database"
	"path/filepath"
	"testing"
)

func TestUpdateWithoutNetworkModePreservesTorProfile(t *testing.T) {
	manager := NewManager(config.DefaultConfig(), t.TempDir())
	created, err := manager.Create(ProfileInput{
		ProfileName: "tor profile",
		NetworkMode: NetworkModeTor,
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}

	updated, err := manager.Update(created.ProfileId, ProfileInput{
		ProfileName: "tor profile renamed",
		UserDataDir: created.UserDataDir,
		CoreId:      created.CoreId,
	})
	if err != nil {
		t.Fatalf("Update with omitted network mode returned error: %v", err)
	}
	if updated.NetworkMode != NetworkModeTor {
		t.Fatalf("NetworkMode = %q, want %q", updated.NetworkMode, NetworkModeTor)
	}
	if updated.ProxyId != "" || updated.ProxyConfig != "" {
		t.Fatalf("Tor update retained proxy fields: %+v", updated)
	}
}

func TestCreateWithoutNetworkModeDefaultsToProxy(t *testing.T) {
	manager := NewManager(config.DefaultConfig(), t.TempDir())
	profile, err := manager.Create(ProfileInput{ProfileName: "default network mode"})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}
	if profile.NetworkMode != NetworkModeProxy {
		t.Fatalf("NetworkMode = %q, want %q", profile.NetworkMode, NetworkModeProxy)
	}
}

func TestApplyDefaultsClearsLegacyTorProxyState(t *testing.T) {
	manager := NewManager(config.DefaultConfig(), t.TempDir())
	profile := &Profile{
		ProfileId:          "legacy-tor",
		NetworkMode:        NetworkModeTor,
		ProxyId:            "legacy-proxy",
		ProxyConfig:        "socks5://legacy",
		ProxyBindSourceID:  "legacy-source",
		ProxyBindSourceURL: "https://legacy.example/source",
		ProxyBindName:      "legacy import",
		ProxyBindUpdatedAt: "2026-09-01T00:00:00Z",
	}

	if changed := manager.ApplyDefaults(profile); !changed {
		t.Fatal("ApplyDefaults should report legacy Tor state cleanup")
	}
	assertTorProxyStateCleared(t, profile)
}

func TestLoadProfilesRepairsLegacyTorProxyStateFromConfig(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Browser.Profiles = []config.BrowserProfileConfig{{
		ProfileId:          "legacy-tor",
		ProfileName:        "legacy tor",
		UserDataDir:        "legacy-tor",
		NetworkMode:        NetworkModeTor,
		ProxyId:            "legacy-proxy",
		ProxyConfig:        "socks5://legacy",
		ProxyBindSourceID:  "legacy-source",
		ProxyBindSourceURL: "https://legacy.example/source",
		ProxyBindName:      "legacy import",
		ProxyBindUpdatedAt: "2026-09-01T00:00:00Z",
		CreatedAt:          "2026-09-01T00:00:00Z",
		UpdatedAt:          "2026-09-01T00:00:00Z",
	}}
	manager := NewManager(cfg, t.TempDir())
	manager.InitData()
	profile, ok := manager.Profiles["legacy-tor"]
	if !ok {
		t.Fatal("legacy profile was not loaded")
	}
	assertTorProxyStateCleared(t, profile)
}

func TestLoadProfilesRepairsLegacyTorProxyStateInSQLite(t *testing.T) {
	db, err := database.NewDB(filepath.Join(t.TempDir(), "profiles.db"))
	if err != nil {
		t.Fatalf("NewDB returned error: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatalf("Migrate returned error: %v", err)
	}

	dao := NewSQLiteProfileDAO(db.GetConn())
	seed := &Profile{
		ProfileId:       "legacy-tor",
		ProfileName:     "legacy tor",
		UserDataDir:     "legacy-tor",
		NetworkMode:     NetworkModeTor,
		FingerprintArgs: []string{},
		LaunchArgs:      []string{},
		Tags:            []string{},
		Keywords:        []string{},
		CreatedAt:       "2026-09-01T00:00:00Z",
		UpdatedAt:       "2026-09-01T00:00:00Z",
	}
	if err := dao.Upsert(seed); err != nil {
		t.Fatalf("seed Upsert returned error: %v", err)
	}
	if _, err := db.GetConn().Exec(`
		UPDATE browser_profiles
		SET proxy_id = ?, proxy_config = ?,
		    proxy_bind_source_id = ?, proxy_bind_source_url = ?,
		    proxy_bind_name = ?, proxy_bind_updated_at = ?
		WHERE profile_id = ?`,
		"legacy-proxy", "socks5://legacy", "legacy-source",
		"https://legacy.example/source", "legacy import", "2026-09-01T00:00:00Z", seed.ProfileId); err != nil {
		t.Fatalf("seed legacy proxy state: %v", err)
	}

	manager := NewManager(config.DefaultConfig(), t.TempDir())
	manager.ProfileDAO = dao
	manager.InitData()
	loaded, ok := manager.Profiles[seed.ProfileId]
	if !ok {
		t.Fatal("legacy profile was not loaded")
	}
	assertTorProxyStateCleared(t, loaded)

	stored, err := dao.GetById(seed.ProfileId)
	if err != nil {
		t.Fatalf("GetById returned error: %v", err)
	}
	assertTorProxyStateCleared(t, stored)
}

func assertTorProxyStateCleared(t *testing.T, profile *Profile) {
	t.Helper()
	if profile.NetworkMode != NetworkModeTor {
		t.Fatalf("NetworkMode = %q, want %q", profile.NetworkMode, NetworkModeTor)
	}
	if profile.ProxyId != "" || profile.ProxyConfig != "" ||
		profile.ProxyBindSourceID != "" || profile.ProxyBindSourceURL != "" ||
		profile.ProxyBindName != "" || profile.ProxyBindUpdatedAt != "" {
		t.Fatalf("Tor profile retained proxy-only state: %+v", profile)
	}
}
