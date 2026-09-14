package backend

import (
	"ant-chrome/backend/internal/automation"
	"ant-chrome/backend/internal/backup"
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/database"
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"gopkg.in/yaml.v3"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestBackupExcludesItsTemporaryArchive(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "payload.txt"), []byte("data"), 0600); err != nil {
		t.Fatal(err)
	}
	scope := backup.Scope{Entries: []backup.ScopeEntry{{ID: "data", EntryType: backup.EntryTypeDir, SourcePath: root, ArchivePath: "payload/data/", Required: true}}}
	output := filepath.Join(root, "backup.zip")
	_, _, _, err := backupWritePackageZip(output, scope, backup.BuildManifest(scope, "Latitude Browser", "test", time.Now()), nil)
	if err != nil {
		t.Fatal(err)
	}
	r, err := zip.OpenReader(output)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	for _, f := range r.File {
		if strings.Contains(f.Name, "backup.zip") || strings.Contains(f.Name, ".latitude-backup-") {
			t.Errorf("archive included itself: %s", f.Name)
		}
	}
}

func newBackupTestApp(t *testing.T) *App {
	t.Helper()
	root := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.Database.SQLite.Path = "data/custom.db"
	if err := os.MkdirAll(filepath.Join(root, "data"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := cfg.Save(filepath.Join(root, "config.yaml")); err != nil {
		t.Fatal(err)
	}
	db, err := database.NewDB(filepath.Join(root, cfg.Database.SQLite.Path))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatal(err)
	}
	return &App{appRoot: root, config: cfg, db: db, browserMgr: browser.NewManager(cfg, root)}
}

func TestBackupRoundTripUsesSnapshotAndPreservesMetadata(t *testing.T) {
	a := newBackupTestApp(t)
	if _, err := a.db.GetConn().Exec(`INSERT INTO browser_proxies (proxy_id,proxy_name,proxy_config,preferred_kernel,last_test_engine,last_test_code) VALUES ('proxy','Node','socks5://127.0.0.1:1080','mihomo','mihomo','READY'); INSERT INTO browser_profiles (profile_id,profile_name,user_data_dir,network_mode,memory_limit_mb,restore_last_session,deleted_at,created_at,updated_at) VALUES ('profile','Saved','saved-profile','direct',512,'true','yesterday',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(a.appRoot, "data", "saved-profile"), 0700); err != nil {
		t.Fatal(err)
	}
	zipPath := filepath.Join(a.appRoot, "data", "backup.zip")
	if _, err := a.backupExportToPath(zipPath); err != nil {
		t.Fatal(err)
	}
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range r.File {
		if strings.Contains(f.Name, "custom.db") || strings.HasSuffix(f.Name, "-wal") || strings.HasSuffix(f.Name, "-shm") || strings.Contains(f.Name, "backup.zip") {
			t.Errorf("live database or archive leaked into package: %s", f.Name)
		}
	}
	r.Close()
	dir, _, err := backupExtractAndValidate(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(dir)
	source := backupFindDatabaseFile(filepath.Join(dir, "payload"))
	if source == "" {
		t.Fatal("importer cannot find exported snapshot")
	}
	target := newBackupTestApp(t)
	for i := 0; i < 2; i++ {
		if err := target.backupMergeDatabaseFromSource(source, false, &backupMergeStats{}); err != nil {
			t.Fatalf("merge %d: %v", i, err)
		}
	}
	var kernel, engine, code string
	if err := target.db.GetConn().QueryRow("SELECT preferred_kernel,last_test_engine,last_test_code FROM browser_proxies WHERE proxy_id='proxy'").Scan(&kernel, &engine, &code); err != nil {
		t.Fatal(err)
	}
	if kernel != "mihomo" || engine != "mihomo" || code != "READY" {
		t.Fatalf("lost proxy metadata: %q/%q/%q", kernel, engine, code)
	}
	var network, restore, deleted string
	var memory int
	if err := target.db.GetConn().QueryRow("SELECT network_mode,memory_limit_mb,restore_last_session,deleted_at FROM browser_profiles WHERE profile_id='profile'").Scan(&network, &memory, &restore, &deleted); err != nil {
		t.Fatal(err)
	}
	if network != "direct" || memory != 512 || restore != "true" || deleted != "yesterday" {
		t.Fatalf("lost profile metadata: %q %d %q %q", network, memory, restore, deleted)
	}
}

func TestBackupRefusesActiveWorkAndReleasesGatesAfterFailure(t *testing.T) {
	a := newBackupTestApp(t)
	release, err := a.dataActivity.begin()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.backupExportToPath(filepath.Join(t.TempDir(), "busy.zip")); err == nil {
		t.Fatal("export crossed active work")
	}
	release()
	a.browserMgr.Profiles["p"] = &browser.Profile{ProfileId: "p", Running: true}
	if _, err := a.backupExportToPath(filepath.Join(t.TempDir(), "running.zip")); err == nil {
		t.Fatal("export accepted active profile")
	}
	delete(a.browserMgr.Profiles, "p")
	bad := filepath.Join(t.TempDir(), "file")
	os.WriteFile(bad, []byte("file"), 0600)
	if _, err := a.backupExportToPath(filepath.Join(bad, "fail.zip")); err == nil {
		t.Fatal("bad destination accepted")
	}
	if _, err := a.backupExportToPath(filepath.Join(t.TempDir(), "recovered.zip")); err != nil {
		t.Fatalf("failure left app frozen: %v", err)
	}
}

func TestDataActivityGateRejectsWritesWithoutPublishing(t *testing.T) {
	a := newBackupTestApp(t)
	release, err := a.dataActivity.freeze()
	if err != nil {
		t.Fatal(err)
	}
	if err := a.SaveProxyCheckSettings(ProxyCheckSettings{}); err == nil {
		t.Fatal("settings crossed gate")
	}
	if _, err := a.AutomationScriptSave(automation.ScriptRecord{}); err == nil {
		t.Fatal("script crossed gate")
	}
	if _, err := a.AutomationScriptRunWithOptions(automation.ScriptRunRequest{}); err == nil {
		t.Fatal("script run crossed gate")
	}
	if err := a.BookmarkSave(nil); err == nil {
		t.Fatal("bookmark save crossed gate")
	}
	release()
	one, err := a.dataActivity.begin()
	if err != nil {
		t.Fatal(err)
	}
	two, err := a.dataActivity.begin()
	if err != nil {
		t.Fatal(err)
	}
	one()
	one()
	if thaw, err := a.dataActivity.freeze(); err == nil {
		thaw()
		t.Fatal("nested writer was lost")
	}
	two()
	thaw, err := a.dataActivity.freeze()
	if err != nil {
		t.Fatal(err)
	}
	thaw()
}

func TestBackupFreezesWritesForEntireArchiveWindow(t *testing.T) {
	a := newBackupTestApp(t)
	entered := make(chan struct{})
	unblock := make(chan struct{})
	finished := make(chan error, 1)
	var once sync.Once
	go func() {
		_, err := a.backupExportToPathWithProgress(filepath.Join(t.TempDir(), "held.zip"), func(phase string, _ int, _ string, _ *backupProgressMeta) {
			if phase == "writing" {
				once.Do(func() { close(entered); <-unblock })
			}
		})
		finished <- err
	}()
	select {
	case <-entered:
	case <-time.After(3 * time.Second):
		t.Fatal("export did not enter archive window")
	}
	released := false
	defer func() {
		if !released {
			close(unblock)
		}
	}()
	if err := a.SaveProxyCheckSettings(ProxyCheckSettings{}); err == nil {
		t.Error("settings crossed archive window")
	}
	if err := a.browserMgr.Delete("unused"); err == nil || !strings.Contains(err.Error(), "维护") {
		t.Errorf("profile operation not gated: %v", err)
	}
	if _, err := a.AutomationScriptSave(automation.ScriptRecord{}); err == nil {
		t.Error("automation crossed archive window")
	}
	if release, err := a.dataActivity.begin(); err == nil {
		release()
		t.Error("download/scheduler lease crossed archive window")
	}
	close(unblock)
	released = true
	select {
	case err := <-finished:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("export did not release locks")
	}
	if err := a.SaveProxyCheckSettings(ProxyCheckSettings{}); err != nil {
		t.Fatalf("post-export writes still frozen: %v", err)
	}
}

func TestBackupFullImportRoundTripRelationsAndFiles(t *testing.T) {
	a := newBackupTestApp(t)
	sqlText := `INSERT INTO browser_groups (group_id,group_name) VALUES ('group','Saved Group');
 INSERT INTO browser_cores (core_id,core_name,core_path,is_default) VALUES ('core','Saved Core','chrome/saved',1);
 INSERT INTO browser_proxies (proxy_id,proxy_name,proxy_config,preferred_kernel) VALUES ('proxy','Saved Node','socks5://127.0.0.1:1080','mihomo');
 INSERT INTO browser_profiles (profile_id,profile_name,user_data_dir,core_id,proxy_id,proxy_config,group_id,network_mode,proxy_bind_name,created_at,updated_at) VALUES ('profile','Saved Profile','saved-profile','core','proxy','socks5://127.0.0.1:1080','group','proxy','Saved Node',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
 INSERT INTO browser_extensions (extension_id,name,install_dir,icon_data_url) VALUES ('ext','Saved Extension','data/extensions/ext','data:image/png;base64,fixture');
 INSERT INTO browser_profile_extensions (profile_id,extension_id) VALUES ('profile','ext');
 INSERT INTO browser_profile_extension_settings (profile_id,configured) VALUES ('profile',1);
 INSERT INTO browser_bookmarks (name,url,open_on_start) VALUES ('Saved Bookmark','https://example.test/',1);`
	if _, err := a.db.GetConn().Exec(sqlText); err != nil {
		t.Fatal(err)
	}
	for name, content := range map[string]string{"data/saved-profile/Default/Preferences": "saved preferences", "data/extensions/ext/manifest.json": "extension", "chrome/saved/marker": "core"} {
		path := filepath.Join(a.appRoot, name)
		os.MkdirAll(filepath.Dir(path), 0700)
		if err := os.WriteFile(path, []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	archive := filepath.Join(t.TempDir(), "full.zip")
	if _, err := a.backupExportToPath(archive); err != nil {
		t.Fatal(err)
	}
	target := newBackupTestApp(t)
	conn := target.db.GetConn()
	target.browserMgr.ProfileDAO = browser.NewSQLiteProfileDAO(conn)
	target.browserMgr.ProxyDAO = browser.NewSQLiteProxyDAO(conn)
	target.browserMgr.CoreDAO = browser.NewSQLiteCoreDAO(conn)
	target.browserMgr.GroupDAO = browser.NewSQLiteGroupDAO(conn)
	target.browserMgr.BookmarkDAO = browser.NewSQLiteBookmarkDAO(conn)
	target.browserMgr.ExtensionDAO = browser.NewSQLiteExtensionDAO(conn)
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
		t.Fatalf("round trip only partially imported: %#v", result)
	}
	var group, core, proxyID, extension, icon string
	err = conn.QueryRow(`SELECT p.group_id,p.core_id,p.proxy_id,e.extension_id,e.icon_data_url FROM browser_profiles p JOIN browser_groups g ON p.group_id=g.group_id JOIN browser_cores c ON p.core_id=c.core_id JOIN browser_proxies x ON p.proxy_id=x.proxy_id JOIN browser_profile_extensions pe ON p.profile_id=pe.profile_id JOIN browser_extensions e ON pe.extension_id=e.extension_id WHERE p.profile_id='profile'`).Scan(&group, &core, &proxyID, &extension, &icon)
	if err != nil || group != "group" || core != "core" || proxyID != "proxy" || extension != "ext" || icon != "data:image/png;base64,fixture" {
		t.Fatalf("broken restored relations: %s/%s/%s/%s/%s %v", group, core, proxyID, extension, icon, err)
	}
	for name, content := range map[string]string{"data/saved-profile/Default/Preferences": "saved preferences", "data/extensions/ext/manifest.json": "extension", "chrome/saved/marker": "core"} {
		data, err := os.ReadFile(filepath.Join(target.appRoot, name))
		if err != nil || string(data) != content {
			t.Fatalf("restored file differs: %s %v", name, err)
		}
	}
	if target.config.Database.SQLite.Path != "data/custom.db" {
		t.Fatal("reset/import detached configuration from the open database")
	}
}

func TestBackupExternalDatabaseAndMismatchedConfiguration(t *testing.T) {
	a := newBackupTestApp(t)
	a.db.Close()
	external := filepath.Join(t.TempDir(), "outside.sqlite")
	var err error
	a.db, err = database.NewDB(external)
	if err != nil {
		t.Fatal(err)
	}
	defer a.db.Close()
	if err = a.db.Migrate(); err != nil {
		t.Fatal(err)
	}
	a.config.Database.SQLite.Path = external
	if err = a.config.Save(filepath.Join(a.appRoot, "config.yaml")); err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(t.TempDir(), "external.zip")
	if _, err = a.backupExportToPath(archive); err != nil {
		t.Fatal(err)
	}
	dir, _, err := backupExtractAndValidate(archive)
	if err != nil {
		t.Fatal(err)
	}
	os.RemoveAll(dir)
	before, _ := os.ReadFile(archive)
	a.config.Database.SQLite.Path = "data/different.db"
	if _, err = a.backupExportToPath(archive); err == nil {
		t.Fatal("stale database configuration accepted")
	}
	after, _ := os.ReadFile(archive)
	if !bytes.Equal(before, after) {
		t.Fatal("failed export replaced previous backup")
	}
}

type backupFaultFile struct {
	*os.File
	failure string
}

func (f backupFaultFile) Write(data []byte) (int, error) {
	if f.failure == "write" {
		return 0, errors.New("injected write failure")
	}
	return f.File.Write(data)
}
func (f backupFaultFile) Sync() error {
	if f.failure == "sync" {
		return errors.New("injected sync failure")
	}
	return f.File.Sync()
}
func (f backupFaultFile) Close() error {
	err := f.File.Close()
	if f.failure == "close" {
		return errors.New("injected close failure")
	}
	return err
}
func TestBackupPublicationFailuresPreservePreviousArchive(t *testing.T) {
	for _, failure := range []string{"write", "sync", "close", "rename", "cancel"} {
		t.Run(failure, func(t *testing.T) {
			root := t.TempDir()
			output := filepath.Join(root, "previous.zip")
			os.WriteFile(output, []byte("previous backup"), 0600)
			source := filepath.Join(root, "config.yaml")
			os.WriteFile(source, []byte("source data"), 0600)
			scope := backup.Scope{Entries: []backup.ScopeEntry{{ID: "config", EntryType: backup.EntryTypeFile, SourcePath: source, ArchivePath: "payload/config.yaml", Required: true}}}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			done := false
			options := backupArchiveOptions{ctx: ctx, create: func(dir string) (backupArchiveOutput, error) {
				f, err := os.CreateTemp(dir, ".latitude-backup-*")
				if err != nil {
					return nil, err
				}
				if failure == "cancel" {
					cancel()
				}
				return backupFaultFile{f, failure}, nil
			}, rename: func(src, dst string) error {
				if failure == "rename" {
					return errors.New("injected rename failure")
				}
				return os.Rename(src, dst)
			}}
			_, _, _, err := backupWritePackageZipWithOptions(output, scope, backup.BuildManifest(scope, "Latitude Browser", "test", time.Now()), func(phase string, _ int, _ string, _ *backupProgressMeta) {
				if phase == "done" {
					done = true
				}
			}, options)
			if err == nil || done {
				t.Fatal("failed publication reported success")
			}
			got, _ := os.ReadFile(output)
			if string(got) != "previous backup" {
				t.Fatal("failed export destroyed previous archive")
			}
			entries, _ := os.ReadDir(root)
			if len(entries) != 2 {
				t.Fatalf("temporary files leaked: %v", entries)
			}
		})
	}
}

func TestBackupInvalidPackagesFailBeforeResetOrRuntimeStop(t *testing.T) {
	for _, failure := range []string{"zip", "config", "database"} {
		t.Run(failure, func(t *testing.T) {
			a := newBackupTestApp(t)
			if _, err := a.db.GetConn().Exec("CREATE TABLE kept (value TEXT); INSERT INTO kept VALUES ('original')"); err != nil {
				t.Fatal(err)
			}
			originalConfig, _ := os.ReadFile(filepath.Join(a.appRoot, "config.yaml"))
			originalScheduler := browser.NewProxySpeedScheduler(nil, nil, time.Hour, 1)
			a.speedScheduler = originalScheduler
			output := filepath.Join(t.TempDir(), "bad.zip")
			if failure == "zip" {
				os.WriteFile(output, []byte("not zip"), 0600)
			} else {
				source := filepath.Join(t.TempDir(), "app.db")
				release, err := a.db.Snapshot(context.Background(), source)
				if err != nil {
					t.Fatal(err)
				}
				release()
				dbBytes, _ := os.ReadFile(source)
				cfgBytes := originalConfig
				if failure == "config" {
					bad := *a.config
					bad.LaunchServer.Auth.Enabled = true
					bad.LaunchServer.Auth.APIKey = ""
					cfgBytes, err = yaml.Marshal(bad)
					if err != nil {
						t.Fatal(err)
					}
				} else {
					dbBytes = []byte("invalid SQLite")
				}
				f, err := os.Create(output)
				if err != nil {
					t.Fatal(err)
				}
				w := zip.NewWriter(f)
				manifest := backup.Manifest{Format: backup.PackageFormat, ManifestVersion: backup.ManifestVersion, Entries: []backup.ManifestEntry{{ID: "system_config_main", ArchivePath: "payload/system/config.yaml", Required: true}, {ID: "database_sqlite_main", ArchivePath: "payload/app/database/app.db", Required: true}}}
				manifestBytes, _ := json.Marshal(manifest)
				for name, data := range map[string][]byte{"manifest.json": manifestBytes, "payload/system/config.yaml": cfgBytes, "payload/app/database/app.db": dbBytes} {
					entry, err := w.Create(name)
					if err != nil {
						t.Fatal(err)
					}
					if _, err = entry.Write(data); err != nil {
						t.Fatal(err)
					}
				}
				if err = w.Close(); err != nil {
					t.Fatal(err)
				}
				f.Close()
			}
			if _, err := a.backupImportFromPathLocked(output, true); err == nil {
				t.Fatal("invalid package accepted")
			}
			if a.speedScheduler != originalScheduler {
				t.Fatal("invalid package stopped runtime before preflight")
			}
			var value string
			if err := a.db.GetConn().QueryRow("SELECT value FROM kept").Scan(&value); err != nil || value != "original" {
				t.Fatalf("invalid package changed live data: %s %v", value, err)
			}
			got, _ := os.ReadFile(filepath.Join(a.appRoot, "config.yaml"))
			if !bytes.Equal(got, originalConfig) {
				t.Fatal("invalid package changed live configuration")
			}
		})
	}
}
