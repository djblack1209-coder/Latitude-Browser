package backend

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSnapshotRestoreCorruptArchivePreservesOriginal(t *testing.T) {
	root := t.TempDir()
	cfg := config.DefaultConfig()
	mgr := browser.NewManager(cfg, root)
	data := filepath.Join(root, "profile")
	if err := os.MkdirAll(data, 0700); err != nil {
		t.Fatal(err)
	}
	original := filepath.Join(data, "keep.txt")
	if err := os.WriteFile(original, []byte("existing user state"), 0600); err != nil {
		t.Fatal(err)
	}
	mgr.Profiles["p"] = &browser.Profile{ProfileId: "p", UserDataDir: data}
	a := &App{appRoot: root, config: cfg, browserMgr: mgr}
	dir, err := a.snapshotDir("p")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "snap_bad.meta.json"), []byte("{}"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "snap_bad.zip"), []byte("corrupt zip"), 0600); err != nil {
		t.Fatal(err)
	}
	err = a.BrowserSnapshotRestore("p", "snap")
	if err == nil {
		t.Fatal("expected corrupt zip failure")
	}
	if data, readErr := os.ReadFile(original); readErr != nil || string(data) != "existing user state" {
		t.Fatalf("failed restore lost original: %q %v", data, readErr)
	}
	t.Logf("corrupt restore rejected and original preserved: %v", err)
}

func TestSnapshotMaintenanceBlocksMutationsAndStart(t *testing.T) {
	root := t.TempDir()
	cfg := config.DefaultConfig()
	mgr := browser.NewManager(cfg, root)
	mgr.Profiles["p"] = &browser.Profile{ProfileId: "p", ProfileName: "original", UserDataDir: filepath.Join(root, "profile")}
	app := &App{appRoot: root, config: cfg, browserMgr: mgr, quitRequested: true}
	profile, release, err := app.beginSnapshotMaintenance("p")
	if err != nil {
		t.Fatal(err)
	}
	released := false
	defer func() {
		if !released {
			release()
		}
	}()
	if profile == mgr.Profiles["p"] {
		t.Fatal("maintenance returned a mutable profile pointer")
	}
	if !mgr.Mutex.TryLock() {
		t.Fatal("archive maintenance held the UI read mutex")
	}
	mgr.Mutex.Unlock()
	if app.torLifecycleMu.TryLock() {
		app.torLifecycleMu.Unlock()
		t.Fatal("start gate not held")
	}
	if _, err := mgr.Update("p", BrowserProfileInput{ProfileName: "changed"}); err == nil {
		t.Fatal("profile update crossed maintenance")
	}
	if err := mgr.Delete("p"); err == nil {
		t.Fatal("profile deletion crossed maintenance")
	}
	if mgr.Profiles["p"].ProfileName != "original" {
		t.Fatal("rejected mutation changed profile")
	}
	started := make(chan struct{})
	finished := make(chan error, 1)
	go func() { close(started); _, err := app.BrowserInstanceStart("p"); finished <- err }()
	<-started
	select {
	case <-finished:
		t.Fatal("start crossed active maintenance")
	default:
	}
	release()
	released = true
	select {
	case err := <-finished:
		if err == nil {
			t.Fatal("quit fixture unexpectedly started browser")
		}
	case <-time.After(time.Second):
		t.Fatal("start gate was not released")
	}
	if mgr.DataMaintenanceActive() {
		t.Fatal("maintenance state leaked")
	}
}
