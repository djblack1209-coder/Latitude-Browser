package backend

import (
	"ant-chrome/backend/internal/backup"
	"ant-chrome/backend/internal/browser"
	"archive/zip"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func enableBackupImportDAOs(t *testing.T, a *App) {
	a.browserMgr.ProfileDAO = browser.NewSQLiteProfileDAO(a.db.GetConn())
	a.browserMgr.ProxyDAO = browser.NewSQLiteProxyDAO(a.db.GetConn())
	a.browserMgr.CoreDAO = browser.NewSQLiteCoreDAO(a.db.GetConn())
	a.browserMgr.GroupDAO = browser.NewSQLiteGroupDAO(a.db.GetConn())
	a.browserMgr.BookmarkDAO = browser.NewSQLiteBookmarkDAO(a.db.GetConn())
	a.browserMgr.ExtensionDAO = browser.NewSQLiteExtensionDAO(a.db.GetConn())
	t.Cleanup(func() {
		if a.speedScheduler != nil {
			a.speedScheduler.Stop()
		}
	})
}
func reverseBackupProfileManifest(t *testing.T, src string) string {
	t.Helper()
	r, err := zip.OpenReader(src)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	out := filepath.Join(t.TempDir(), "reversed.zip")
	f, err := os.Create(out)
	if err != nil {
		t.Fatal(err)
	}
	w := zip.NewWriter(f)
	for _, entry := range r.File {
		rc, err := entry.Open()
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			t.Fatal(err)
		}
		if entry.Name == "manifest.json" {
			var m backup.Manifest
			if err = json.Unmarshal(data, &m); err != nil {
				t.Fatal(err)
			}
			for i, j := 0, len(m.ProfileData)-1; i < j; i, j = i+1, j-1 {
				m.ProfileData[i], m.ProfileData[j] = m.ProfileData[j], m.ProfileData[i]
			}
			data, err = json.Marshal(m)
			if err != nil {
				t.Fatal(err)
			}
		}
		h := entry.FileHeader
		h.UncompressedSize64 = uint64(len(data))
		dst, err := w.CreateHeader(&h)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = dst.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err = w.Close(); err != nil {
		t.Fatal(err)
	}
	if err = f.Close(); err != nil {
		t.Fatal(err)
	}
	return out
}

func TestBackupSharedExternalMergeIsIndependentOfManifestOrder(t *testing.T) {
	for _, reverse := range []bool{false, true} {
		t.Run(map[bool]string{false: "A-first", true: "B-first"}[reverse], func(t *testing.T) {
			source := newBackupTestApp(t)
			external := t.TempDir()
			os.WriteFile(filepath.Join(external, "marker"), []byte("shared incoming data"), 0600)
			for _, id := range []string{"A", "B"} {
				if _, err := source.db.GetConn().Exec(`INSERT INTO browser_profiles(profile_id,profile_name,user_data_dir,created_at,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, id, id, external); err != nil {
					t.Fatal(err)
				}
			}
			archive := filepath.Join(t.TempDir(), "shared.zip")
			if _, err := source.backupExportToPath(archive); err != nil {
				t.Fatal(err)
			}
			if reverse {
				archive = reverseBackupProfileManifest(t, archive)
			}
			target := newBackupTestApp(t)
			enableBackupImportDAOs(t, target)
			oldDir := filepath.Join(target.appRoot, "data", "old-A")
			os.MkdirAll(oldDir, 0700)
			os.WriteFile(filepath.Join(oldDir, "old-marker"), []byte("keep A"), 0600)
			if _, err := target.db.GetConn().Exec(`INSERT INTO browser_profiles(profile_id,profile_name,user_data_dir,created_at,updated_at) VALUES('A','Original A',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, oldDir); err != nil {
				t.Fatal(err)
			}
			result, err := target.backupImportFromPathLocked(archive, false)
			if err != nil {
				t.Fatal(err)
			}
			if result["partial"] != false || result["componentFailed"] != 0 || result["skipped"].(int) < 1 {
				t.Fatalf("unexpected merge result: %#v", result)
			}
			var aDir, aName, bDir string
			target.db.GetConn().QueryRow(`SELECT user_data_dir,profile_name FROM browser_profiles WHERE profile_id='A'`).Scan(&aDir, &aName)
			target.db.GetConn().QueryRow(`SELECT user_data_dir FROM browser_profiles WHERE profile_id='B'`).Scan(&bDir)
			if aDir != oldDir || aName != "Original A" {
				t.Fatal("conflicting existing profile changed")
			}
			if data, _ := os.ReadFile(filepath.Join(oldDir, "old-marker")); string(data) != "keep A" {
				t.Fatal("existing A files changed")
			}
			if data, err := os.ReadFile(filepath.Join(bDir, "marker")); err != nil || string(data) != "shared incoming data" {
				t.Fatalf("imported B data missing: %q %v", data, err)
			}
			again, err := target.backupImportFromPathLocked(archive, false)
			if err != nil || again["partial"] != false || again["componentFailed"] != 0 {
				t.Fatalf("repeated merge: %#v %v", again, err)
			}
		})
	}
}

func TestBackupProfileMappingAllConflictsAndCopyFailure(t *testing.T) {
	for _, scenario := range []string{"all-ID-conflicts", "directory-conflict", "copy-failure"} {
		t.Run(scenario, func(t *testing.T) {
			a := newBackupTestApp(t)
			extract := t.TempDir()
			archivePath := "payload/browser/profiles/shared"
			source := filepath.Join(extract, filepath.FromSlash(archivePath))
			os.MkdirAll(source, 0700)
			os.WriteFile(filepath.Join(source, "marker"), []byte("incoming"), 0600)
			dst, err := a.backupProfileDataDestination(archivePath)
			if err != nil {
				t.Fatal(err)
			}
			manifest := backup.Manifest{ProfileData: []backup.ProfileDataMapping{{ProfileID: "A", ArchivePath: archivePath}, {ProfileID: "B", ArchivePath: archivePath}}}
			switch scenario {
			case "all-ID-conflicts":
				for _, id := range []string{"A", "B"} {
					if _, err := a.db.GetConn().Exec(`INSERT INTO browser_profiles(profile_id,profile_name,user_data_dir,created_at,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, id, id, "preserved-"+id); err != nil {
						t.Fatal(err)
					}
				}
			case "directory-conflict":
				if _, err := a.db.GetConn().Exec(`INSERT INTO browser_profiles(profile_id,profile_name,user_data_dir,created_at,updated_at) VALUES('Existing','Existing',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, dst); err != nil {
					t.Fatal(err)
				}
			case "copy-failure":
				manifest.ProfileData = manifest.ProfileData[:1]
				if _, err := a.db.GetConn().Exec(`INSERT INTO browser_profiles(profile_id,profile_name,user_data_dir,created_at,updated_at) VALUES('A','A',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, dst); err != nil {
					t.Fatal(err)
				}
				os.MkdirAll(filepath.Dir(dst), 0700)
				os.WriteFile(dst, []byte("block destination"), 0600)
			}
			stats := &backupMergeStats{}
			err = a.backupImportProfileData(extract, manifest, false, stats)
			if scenario == "copy-failure" {
				if err == nil {
					t.Fatal("directory copy failure accepted")
				}
				if got, _ := os.ReadFile(dst); string(got) != "block destination" {
					t.Fatal("copy failure destroyed destination")
				}
				os.Remove(dst)
				if err := a.backupImportProfileData(extract, manifest, false, stats); err != nil {
					t.Fatal(err)
				}
				if got, _ := os.ReadFile(filepath.Join(dst, "marker")); string(got) != "incoming" {
					t.Fatal("retry omitted profile data")
				}
			} else {
				if err != nil {
					t.Fatal(err)
				}
				if stats.Imported != 0 {
					t.Fatal("conflicting mappings copied data")
				}
				if _, err := os.Stat(dst); !os.IsNotExist(err) {
					t.Fatalf("skipped mapping created a destination: %v", err)
				}
			}
		})
	}
}
