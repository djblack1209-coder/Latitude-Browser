package backend

import (
	"ant-chrome/backend/internal/backup"
	"ant-chrome/backend/internal/browser"
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBackupExternalProfilesRoundTripAndDeduplicateNestedTrees(t *testing.T) {
	a := newBackupTestApp(t)
	external := t.TempDir()
	nested := filepath.Join(external, "nested")
	if err := os.Mkdir(nested, 0700); err != nil {
		t.Fatal(err)
	}
	for file, content := range map[string]string{filepath.Join(external, "parent-marker"): "parent data", filepath.Join(nested, "child-marker"): "child data"} {
		if err := os.WriteFile(file, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := a.db.GetConn().Exec(`INSERT INTO browser_groups (group_id,group_name) VALUES ('g','Group')`); err != nil {
		t.Fatal(err)
	}
	for id, dir := range map[string]string{"parent": external, "child": nested} {
		if _, err := a.db.GetConn().Exec(`INSERT INTO browser_profiles (profile_id,profile_name,user_data_dir,group_id,created_at,updated_at) VALUES (?,?,?,'g',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, id, id, dir); err != nil {
			t.Fatal(err)
		}
		a.browserMgr.Profiles[id] = &browser.Profile{ProfileId: id, UserDataDir: dir}
	}
	archive := filepath.Join(external, "external.zip")
	if _, err := a.backupExportToPath(archive); err != nil {
		t.Fatal(err)
	}
	r, err := zip.OpenReader(archive)
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{}
	for _, file := range r.File {
		if strings.HasSuffix(file.Name, "external.zip") || strings.Contains(file.Name, ".latitude-backup-") {
			t.Error("external profile archive included its own output")
		}
		counts[filepath.Base(file.Name)]++
	}
	r.Close()
	if counts["parent-marker"] != 1 || counts["child-marker"] != 1 {
		t.Fatalf("overlapping profile trees were duplicated or omitted: %v", counts)
	}
	target := newBackupTestApp(t)
	target.browserMgr.ProfileDAO = browser.NewSQLiteProfileDAO(target.db.GetConn())
	target.browserMgr.ProxyDAO = browser.NewSQLiteProxyDAO(target.db.GetConn())
	target.browserMgr.CoreDAO = browser.NewSQLiteCoreDAO(target.db.GetConn())
	target.browserMgr.GroupDAO = browser.NewSQLiteGroupDAO(target.db.GetConn())
	target.browserMgr.BookmarkDAO = browser.NewSQLiteBookmarkDAO(target.db.GetConn())
	target.browserMgr.ExtensionDAO = browser.NewSQLiteExtensionDAO(target.db.GetConn())
	t.Cleanup(func() {
		if target.speedScheduler != nil {
			target.speedScheduler.Stop()
		}
	})
	result, err := target.backupImportFromPathLocked(archive, true)
	if err != nil {
		t.Fatal(err)
	}
	if result["partial"] != false {
		t.Fatalf("partial import: %#v", result)
	}
	for id, file := range map[string]string{"parent": "parent-marker", "child": "child-marker"} {
		var dir, group string
		if err := target.db.GetConn().QueryRow(`SELECT user_data_dir,group_id FROM browser_profiles WHERE profile_id=?`, id).Scan(&dir, &group); err != nil {
			t.Fatal(err)
		}
		if !backupPathWithin(dir, filepath.Join(target.appRoot, "data", "restored-profiles")) || group != "g" {
			t.Fatalf("unsafe path or lost relation: %s %s", dir, group)
		}
		if data, err := os.ReadFile(filepath.Join(dir, file)); err != nil || string(data) != id+" data" {
			t.Fatalf("restored %s mismatch: %q %v", id, data, err)
		}
	}
	if data, _ := os.ReadFile(filepath.Join(external, "parent-marker")); string(data) != "parent data" {
		t.Fatal("import changed source-machine data")
	}
}

func TestBackupMissingRequiredProfilePreservesPreviousArchive(t *testing.T) {
	a := newBackupTestApp(t)
	if _, err := a.db.GetConn().Exec(`INSERT INTO browser_profiles (profile_id,profile_name,user_data_dir,created_at,updated_at) VALUES ('missing','Missing','missing-directory',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(t.TempDir(), "old.zip")
	if err := os.WriteFile(archive, []byte("previous backup"), 0600); err != nil {
		t.Fatal(err)
	}
	done := false
	_, err := a.backupExportToPathWithProgress(archive, func(phase string, _ int, _ string, _ *backupProgressMeta) { done = done || phase == "done" })
	if err == nil || !strings.Contains(err.Error(), "missing") {
		t.Fatalf("missing profile not rejected: %v", err)
	}
	if data, _ := os.ReadFile(archive); done || string(data) != "previous backup" {
		t.Fatal("failed export published an incomplete backup")
	}
}

func TestBackupUnreadableProfilePreservesPreviousArchive(t *testing.T) {
	a := newBackupTestApp(t)
	external := t.TempDir()
	file := filepath.Join(external, "private-data")
	if err := os.WriteFile(file, []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(file, 0); err != nil {
		t.Skipf("read failure fixture unavailable: %v", err)
	}
	defer os.Chmod(file, 0600)
	if _, err := os.ReadFile(file); err == nil {
		t.Skip("platform/user can still read a mode-000 file")
	}
	if _, err := a.db.GetConn().Exec(`INSERT INTO browser_profiles (profile_id,profile_name,user_data_dir,created_at,updated_at) VALUES ('unreadable','Unreadable',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, external); err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(t.TempDir(), "old.zip")
	if err := os.WriteFile(archive, []byte("previous backup"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := a.backupExportToPath(archive); err == nil {
		t.Fatal("read failure exported success")
	}
	if data, _ := os.ReadFile(archive); string(data) != "previous backup" {
		t.Fatal("read failure replaced previous backup")
	}
}

func TestBackupProfileMappingRejectsUntrustedDestinationsBeforeMutation(t *testing.T) {
	a := newBackupTestApp(t)
	for _, archivePath := range []string{"../outside", "/tmp/outside", "payload/browser/profiles/../../outside", "payload/system/config.yaml", "payload/browser/profiles/"} {
		if _, err := a.backupProfileDataDestination(archivePath); err == nil {
			t.Errorf("accepted unsafe mapping: %s", archivePath)
		}
	}
	manifest := backup.Manifest{ProfileData: []backup.ProfileDataMapping{{ProfileID: "unknown", ArchivePath: "../outside"}}}
	if err := a.backupPrepareProfileData(t.TempDir(), manifest); err == nil {
		t.Fatal("invalid mapping accepted")
	}
}
