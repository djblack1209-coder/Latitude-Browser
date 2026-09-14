package backend

import (
	"ant-chrome/backend/internal/backup"
	"ant-chrome/backend/internal/snapshot"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBackupExportEnforcesImportLimits(t *testing.T) {
	for _, kind := range []string{"entries", "file", "total"} {
		t.Run(kind, func(t *testing.T) {
			root := t.TempDir()
			for _, name := range []string{"one", "two"} {
				if err := os.WriteFile(filepath.Join(root, name), make([]byte, 1500), 0600); err != nil {
					t.Fatal(err)
				}
			}
			scope := backup.Scope{Entries: []backup.ScopeEntry{{ID: "data", SourcePath: root, ArchivePath: "payload/data/", EntryType: backup.EntryTypeDir, Required: true}}}
			limits := snapshot.ArchiveLimits{MaxEntries: 100, MaxFileBytes: 10000, MaxTotalBytes: 10000}
			switch kind {
			case "entries":
				limits.MaxEntries = 2
			case "file":
				limits.MaxFileBytes = 1000
			case "total":
				limits.MaxTotalBytes = 3000
			}
			output := filepath.Join(t.TempDir(), "old.zip")
			if err := os.WriteFile(output, []byte("previous"), 0600); err != nil {
				t.Fatal(err)
			}
			_, _, _, err := backupWritePackageZipWithOptions(output, scope, backup.BuildManifest(scope, "Latitude Browser", "fixture", time.Now()), nil, backupArchiveOptions{limits: limits})
			if err == nil {
				t.Fatal("export ignored import limit")
			}
			if data, _ := os.ReadFile(output); string(data) != "previous" {
				t.Fatal("limit failure replaced old backup")
			}
		})
	}
}

func TestBackupProductionExportPassesProductionImportRules(t *testing.T) {
	a := newBackupTestApp(t)
	if err := os.WriteFile(filepath.Join(a.appRoot, "data", "带 空格.json"), []byte(`{"kept":true}`), 0600); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(t.TempDir(), "valid.zip")
	if _, err := a.backupExportToPath(output); err != nil {
		t.Fatal(err)
	}
	extracted, _, err := backupExtractAndValidate(output)
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(extracted)
	if data, _ := os.ReadFile(filepath.Join(extracted, "payload", "app", "data", "带 空格.json")); string(data) != `{"kept":true}` {
		t.Fatal("accepted archive lost a portable file")
	}
}

func TestBackupExportRejectsImporterIncompatibleNamespace(t *testing.T) {
	for _, names := range [][]string{{"payload/bad:name"}, {"payload/A", "payload/a"}, {"payload/file", "payload/file/child"}, {"manifest.json"}} {
		t.Run(names[0], func(t *testing.T) {
			root := t.TempDir()
			scope := backup.Scope{}
			for i, name := range names {
				source := filepath.Join(t.TempDir(), "source")
				if err := os.WriteFile(source, []byte("fixture"), 0600); err != nil {
					t.Fatal(err)
				}
				scope.Entries = append(scope.Entries, backup.ScopeEntry{ID: string(rune('a' + i)), EntryType: backup.EntryTypeFile, SourcePath: source, ArchivePath: name, Required: true})
			}
			output := filepath.Join(root, "old.zip")
			if err := os.WriteFile(output, []byte("previous backup"), 0600); err != nil {
				t.Fatal(err)
			}
			done := false
			_, _, _, err := backupWritePackageZip(output, scope, backup.BuildManifest(scope, "Latitude Browser", "fixture", time.Now()), func(phase string, _ int, _ string, _ *backupProgressMeta) { done = done || phase == "done" })
			if err == nil {
				t.Error("export accepted an archive namespace rejected by import")
			}
			if done {
				t.Error("invalid export emitted success")
			}
			if data, _ := os.ReadFile(output); string(data) != "previous backup" {
				t.Error("invalid export replaced previous backup")
			}
		})
	}
}
