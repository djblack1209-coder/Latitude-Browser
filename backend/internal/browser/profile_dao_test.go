package browser

import (
	"ant-chrome/backend/internal/database"
	"path/filepath"
	"testing"
)

func TestSQLiteProfileDAOPersistsMemoryLimitMB(t *testing.T) {
	db, err := database.NewDB(filepath.Join(t.TempDir(), "profiles.db"))
	if err != nil {
		t.Fatalf("NewDB returned error: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if err := db.Migrate(); err != nil {
		t.Fatalf("Migrate returned error: %v", err)
	}

	dao := NewSQLiteProfileDAO(db.GetConn())
	profile := &Profile{
		ProfileId:       "profile-memory-limit",
		ProfileName:     "memory limit",
		MemoryLimitMB:   768,
		FingerprintArgs: []string{},
		LaunchArgs:      []string{},
		Tags:            []string{},
		Keywords:        []string{},
		CreatedAt:       "2026-07-26T00:00:00Z",
		UpdatedAt:       "2026-07-26T00:00:00Z",
	}

	if err := dao.Upsert(profile); err != nil {
		t.Fatalf("Upsert returned error: %v", err)
	}

	stored, err := dao.GetById(profile.ProfileId)
	if err != nil {
		t.Fatalf("GetById returned error: %v", err)
	}
	if stored.MemoryLimitMB != profile.MemoryLimitMB {
		t.Fatalf("MemoryLimitMB = %d, want %d", stored.MemoryLimitMB, profile.MemoryLimitMB)
	}

	listed, err := dao.List()
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if len(listed) != 1 {
		t.Fatalf("List length = %d, want 1", len(listed))
	}
	if listed[0].MemoryLimitMB != profile.MemoryLimitMB {
		t.Fatalf("listed MemoryLimitMB = %d, want %d", listed[0].MemoryLimitMB, profile.MemoryLimitMB)
	}
}

func TestSQLiteProfileDAOPersistsTorNetworkModeAcrossQueries(t *testing.T) {
	db, err := database.NewDB(filepath.Join(t.TempDir(), "profiles.db"))
	if err != nil {
		t.Fatalf("NewDB returned error: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatalf("Migrate returned error: %v", err)
	}

	dao := NewSQLiteProfileDAO(db.GetConn())
	profile := &Profile{
		ProfileId:       "profile-tor-mode",
		ProfileName:     "tor mode",
		NetworkMode:     NetworkModeTor,
		GroupId:         "group-a",
		FingerprintArgs: []string{},
		LaunchArgs:      []string{},
		Tags:            []string{},
		Keywords:        []string{},
		CreatedAt:       "2026-09-06T00:00:00Z",
		UpdatedAt:       "2026-09-06T00:00:00Z",
	}
	if err := dao.Upsert(profile); err != nil {
		t.Fatalf("Upsert returned error: %v", err)
	}
	stored, err := dao.GetById(profile.ProfileId)
	if err != nil {
		t.Fatalf("GetById returned error: %v", err)
	}
	if stored.NetworkMode != NetworkModeTor {
		t.Fatalf("NetworkMode = %q, want %q", stored.NetworkMode, NetworkModeTor)
	}
	grouped, err := dao.ListByGroup("group-a", false, nil)
	if err != nil {
		t.Fatalf("ListByGroup returned error: %v", err)
	}
	if len(grouped) != 1 || grouped[0].NetworkMode != NetworkModeTor {
		t.Fatalf("grouped profiles = %+v", grouped)
	}
}
