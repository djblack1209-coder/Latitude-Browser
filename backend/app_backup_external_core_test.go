package backend

import (
	"ant-chrome/backend/internal/backup"
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBackupExternalCoreCannotOverwriteSourceComputerPath(t *testing.T) {
	for _, reset := range []bool{false, true} {
		t.Run(map[bool]string{false: "merge", true: "reset"}[reset], func(t *testing.T) {
			a := newBackupTestApp(t)
			outside := t.TempDir()
			marker := filepath.Join(outside, "marker")
			if err := os.WriteFile(marker, []byte("original"), 0600); err != nil {
				t.Fatal(err)
			}
			payload := t.TempDir()
			src := filepath.Join(payload, "browser", "cores", "external", "external-01")
			if err := os.MkdirAll(src, 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(src, "marker"), []byte("incoming"), 0600); err != nil {
				t.Fatal(err)
			}
			cfg := config.DefaultConfig()
			cfg.Browser.Cores = []config.BrowserCore{{CoreId: "outside", CorePath: outside}}
			issues := 0
			a.backupImportFileTrees(payload, cfg, reset, &backupMergeStats{}, func(string, string, error) { issues++ })
			data, err := os.ReadFile(marker)
			if err != nil || string(data) != "original" {
				t.Fatalf("outside directory modified: %q %v", data, err)
			}
			if issues == 0 {
				t.Fatal("unsafe external core was not reported")
			}
		})
	}
}

func TestBackupExportExternalCoreFailsBeforeReplacingDestination(t *testing.T) {
	a := newBackupTestApp(t)
	outside := t.TempDir()
	if _, err := a.db.GetConn().Exec(`INSERT INTO browser_cores(core_id,core_name,core_path,is_default,sort_order,created_at) VALUES('outside','Outside',?,0,0,CURRENT_TIMESTAMP)`, outside); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(t.TempDir(), "backup.zip")
	if err := os.WriteFile(dest, []byte("previous backup"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := a.backupExportToPath(dest); err == nil {
		t.Fatal("unsafe external core export succeeded")
	}
	data, err := os.ReadFile(dest)
	if err != nil || string(data) != "previous backup" {
		t.Fatalf("previous archive changed: %q %v", data, err)
	}
}

func TestBackupExternalCorePackageRejectedBeforeLiveMutation(t *testing.T) {
	for _, reset := range []bool{false, true} {
		t.Run(map[bool]string{false: "merge", true: "reset"}[reset], func(t *testing.T) {
			a := newBackupTestApp(t)
			if _, err := a.db.GetConn().Exec("CREATE TABLE kept (value TEXT); INSERT INTO kept VALUES ('original')"); err != nil {
				t.Fatal(err)
			}
			configBefore, err := os.ReadFile(filepath.Join(a.appRoot, "config.yaml"))
			if err != nil {
				t.Fatal(err)
			}
			scheduler := browser.NewProxySpeedScheduler(nil, nil, time.Hour, 1)
			a.speedScheduler = scheduler
			src := t.TempDir()
			if err := os.WriteFile(filepath.Join(src, "payload"), []byte("core"), 0600); err != nil {
				t.Fatal(err)
			}
			scope := backup.Scope{Entries: []backup.ScopeEntry{{ID: "browser_core_external_external-01", SourcePath: src, ArchivePath: "payload/browser/cores/external/external-01/", EntryType: backup.EntryTypeDir, Required: true}}}
			archive := filepath.Join(t.TempDir(), "legacy.zip")
			if _, _, _, err := backupWritePackageZip(archive, scope, backup.BuildManifest(scope, "Latitude Browser", "test", time.Now()), nil); err != nil {
				t.Fatal(err)
			}
			extracted, _, err := backupExtractAndValidate(archive)
			if err != nil {
				t.Fatalf("fixture failed generic archive validation: %v", err)
			}
			os.RemoveAll(extracted)
			if _, err := a.backupImportFromPathLocked(archive, reset); err == nil || !strings.Contains(err.Error(), "外置") {
				t.Fatalf("missing external core preflight error: %v", err)
			}
			if a.speedScheduler != scheduler {
				t.Fatal("runtime was stopped")
			}
			var value string
			if err := a.db.GetConn().QueryRow("SELECT value FROM kept").Scan(&value); err != nil || value != "original" {
				t.Fatalf("database changed: %s %v", value, err)
			}
			after, err := os.ReadFile(filepath.Join(a.appRoot, "config.yaml"))
			if err != nil || !bytes.Equal(after, configBefore) {
				t.Fatal("live config changed")
			}
		})
	}
}
