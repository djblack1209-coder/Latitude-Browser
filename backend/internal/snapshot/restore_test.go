package snapshot

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func createRestoreFixture(t *testing.T) (string, string) {
	t.Helper()
	src := t.TempDir()
	if err := os.WriteFile(filepath.Join(src, "new.txt"), []byte("new data"), 0600); err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(t.TempDir(), "snapshot.zip")
	if err := ZipDir(src, archive); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(t.TempDir(), "profile")
	if err := os.Mkdir(target, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "old.txt"), []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	return archive, target
}

func assertOldRestoreData(t *testing.T, target string) {
	t.Helper()
	got, err := os.ReadFile(filepath.Join(target, "old.txt"))
	if err != nil || string(got) != "original" {
		t.Fatalf("original lost: %q %v", got, err)
	}
	if _, err := os.Stat(filepath.Join(target, "new.txt")); !os.IsNotExist(err) {
		t.Fatal("uncommitted new data remains")
	}
}

func TestRestoreDirectoryFailureAndRecovery(t *testing.T) {
	for _, failure := range []string{"extract-write", "promote", "rollback", "success"} {
		t.Run(failure, func(t *testing.T) {
			archive, target := createRestoreFixture(t)
			rename := func(src, dest string) error {
				if failure != "success" && dest == target && !strings.HasSuffix(src, ".previous") {
					return errors.New("promotion failed")
				}
				if failure == "rollback" && strings.HasSuffix(src, ".previous") {
					return errors.New("rollback failed")
				}
				return os.Rename(src, dest)
			}
			extract := UnzipTo
			if failure == "extract-write" {
				extract = func(src, dest string) error {
					_ = os.WriteFile(filepath.Join(dest, "partial"), []byte("partial"), 0600)
					return errors.New("disk full")
				}
			}
			err := restoreDirectory(archive, target, rename, extract)
			if failure == "success" {
				if err != nil {
					t.Fatal(err)
				}
				data, err := os.ReadFile(filepath.Join(target, "new.txt"))
				if err != nil || string(data) != "new data" {
					t.Fatalf("new data missing: %q %v", data, err)
				}
				if _, err := os.Stat(filepath.Join(target, "old.txt")); !os.IsNotExist(err) {
					t.Fatal("success retained old file in target")
				}
				return
			}
			if err == nil {
				t.Fatal("failure returned success")
			}
			if failure == "rollback" {
				data, err := os.ReadFile(restoreJournalPath(target))
				if err != nil {
					t.Fatal("recovery record lost", err)
				}
				var journal restoreJournal
				if err := json.Unmarshal(data, &journal); err != nil {
					t.Fatal(err)
				}
				old, err := os.ReadFile(filepath.Join(filepath.Dir(target), journal.Stage+".previous", "old.txt"))
				if err != nil || string(old) != "original" {
					t.Fatal("last old copy was removed")
				}
				if err := RecoverRestore(target); err != nil {
					t.Fatal(err)
				}
			}
			assertOldRestoreData(t, target)
			if _, err := os.Stat(restoreJournalPath(target)); !os.IsNotExist(err) {
				t.Fatal("completed rollback left journal")
			}
		})
	}
}

func TestRestoreDirectoryRecoversInterruptedRenames(t *testing.T) {
	for _, phase := range []string{"prepared", "old-moved", "new-promoted"} {
		t.Run(phase, func(t *testing.T) {
			archive, target := createRestoreFixture(t)
			stage, err := os.MkdirTemp(filepath.Dir(target), "."+filepath.Base(target)+".latitude-stage-")
			if err != nil {
				t.Fatal(err)
			}
			if err := UnzipTo(archive, stage); err != nil {
				t.Fatal(err)
			}
			data, _ := json.Marshal(restoreJournal{Stage: filepath.Base(stage), HadOriginal: true})
			if err := os.WriteFile(restoreJournalPath(target), data, 0600); err != nil {
				t.Fatal(err)
			}
			if phase != "prepared" {
				if err := os.Rename(target, stage+".previous"); err != nil {
					t.Fatal(err)
				}
			}
			if phase == "new-promoted" {
				if err := os.Rename(stage, target); err != nil {
					t.Fatal(err)
				}
			}
			if err := RecoverRestore(target); err != nil {
				t.Fatal(err)
			}
			assertOldRestoreData(t, target)
			if err := RecoverRestore(target); err != nil {
				t.Fatalf("recovery not idempotent: %v", err)
			}
		})
	}
}

func TestRestoreDirectoryRejectsCRCAndMissingTargetUsesStaging(t *testing.T) {
	_, target := createRestoreFixture(t)
	archive := filepath.Join(t.TempDir(), "crc.zip")
	f, _ := os.Create(archive)
	w := zip.NewWriter(f)
	h := &zip.FileHeader{Name: "new.txt", Method: zip.Store}
	out, _ := w.CreateHeader(h)
	_, _ = out.Write([]byte("unique-checksum-payload"))
	_ = w.Close()
	_ = f.Close()
	data, _ := os.ReadFile(archive)
	i := strings.Index(string(data), "unique-checksum-payload")
	if i < 0 {
		t.Fatal("fixture payload missing")
	}
	data[i] ^= 1
	_ = os.WriteFile(archive, data, 0600)
	if err := RestoreDirectory(archive, target); err == nil {
		t.Fatal("bad CRC accepted")
	}
	assertOldRestoreData(t, target)
	missing := filepath.Join(t.TempDir(), "missing")
	if err := RestoreDirectory(archive, missing); err == nil {
		t.Fatal("bad CRC accepted for missing target")
	}
	if _, err := os.Stat(missing); !os.IsNotExist(err) {
		t.Fatal("failed extraction published missing target")
	}
}
