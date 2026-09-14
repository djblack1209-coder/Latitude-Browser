package snapshot

import (
	"archive/zip"
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestZipDirPreservesDestinationOnFailure(t *testing.T) {
	dest := filepath.Join(t.TempDir(), "existing.zip")
	old := []byte("original archive")
	if err := os.WriteFile(dest, old, 0600); err != nil {
		t.Fatal(err)
	}
	if err := ZipDir(filepath.Join(t.TempDir(), "missing"), dest); err == nil {
		t.Fatal("missing source accepted")
	}
	got, err := os.ReadFile(dest)
	if err != nil || !bytes.Equal(got, old) {
		t.Fatalf("failed archive creation replaced old destination: %q %v", got, err)
	}
}

type faultyArchiveOutput struct {
	*os.File
	failure string
}

func (f faultyArchiveOutput) Write(data []byte) (int, error) {
	if f.failure == "zip-close" {
		return 0, errors.New("final ZIP write failed")
	}
	return f.File.Write(data)
}
func (f faultyArchiveOutput) Sync() error {
	if f.failure == "sync" {
		return errors.New("sync failed")
	}
	return f.File.Sync()
}
func (f faultyArchiveOutput) Close() error {
	err := f.File.Close()
	if f.failure == "close" {
		return errors.New("close failed")
	}
	return err
}

func TestZipDirPropagatesFinalizationFailures(t *testing.T) {
	for _, failure := range []string{"zip-close", "sync", "close", "rename"} {
		t.Run(failure, func(t *testing.T) {
			src := t.TempDir()
			dest := filepath.Join(t.TempDir(), "archive.zip")
			if err := os.WriteFile(dest, []byte("old archive"), 0600); err != nil {
				t.Fatal(err)
			}
			err := zipDir(src, dest, func(dir string) (archiveOutput, error) {
				f, err := os.CreateTemp(dir, ".fixture-")
				if err != nil {
					return nil, err
				}
				return faultyArchiveOutput{f, failure}, nil
			}, func(src, dest string) error {
				if failure == "rename" {
					return errors.New("rename failed")
				}
				return os.Rename(src, dest)
			})
			if err == nil {
				t.Fatal("finalization failure returned success")
			}
			data, _ := os.ReadFile(dest)
			if string(data) != "old archive" {
				t.Fatal("old archive changed")
			}
			entries, _ := os.ReadDir(filepath.Dir(dest))
			if len(entries) != 1 {
				t.Fatal("temporary archive leaked")
			}
		})
	}
}

func TestUnzipLimitsDuplicatesAndSpace(t *testing.T) {
	for _, test := range []string{"entries", "file", "total", "space", "duplicate", "success"} {
		t.Run(test, func(t *testing.T) {
			archive := filepath.Join(t.TempDir(), "limits.zip")
			f, _ := os.Create(archive)
			w := zip.NewWriter(f)
			for _, name := range []string{"one", "two"} {
				if test == "duplicate" {
					name = "same"
				}
				out, _ := w.Create(name)
				_, _ = out.Write([]byte("hello"))
			}
			if err := w.Close(); err != nil {
				t.Fatal(err)
			}
			if err := f.Close(); err != nil {
				t.Fatal(err)
			}
			limits := ArchiveLimits{MaxEntries: 10, MaxFileBytes: 10, MaxTotalBytes: 20}
			switch test {
			case "entries":
				limits.MaxEntries = 1
			case "file":
				limits.MaxFileBytes = 4
			case "total":
				limits.MaxTotalBytes = 9
			}
			dest := t.TempDir()
			err := unzipTo(archive, dest, limits, func(string) (uint64, error) {
				if test == "space" {
					return 0, nil
				}
				return 100, nil
			})
			if test == "success" {
				if err != nil {
					t.Fatal(err)
				}
				for _, name := range []string{"one", "two"} {
					got, _ := os.ReadFile(filepath.Join(dest, name))
					if string(got) != "hello" {
						t.Fatal("round trip bytes differ")
					}
				}
			} else {
				if err == nil {
					t.Fatal("invalid archive accepted")
				}
				entries, _ := os.ReadDir(dest)
				if len(entries) != 0 {
					t.Fatal("failed preflight wrote files")
				}
			}
		})
	}
}

func TestZipDirDoesNotFollowSymlinks(t *testing.T) {
	src := t.TempDir()
	outside := filepath.Join(t.TempDir(), "private.txt")
	if err := os.WriteFile(outside, []byte("outside data"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(src, "link")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if err := os.WriteFile(filepath.Join(src, "keep.txt"), []byte("profile data"), 0600); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(t.TempDir(), "snapshot.zip")
	if err := ZipDir(src, dest); err != nil {
		t.Fatal(err)
	}
	r, err := zip.OpenReader(dest)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	for _, file := range r.File {
		if file.Name == "link" {
			t.Error("archive followed an external symlink")
		}
	}
}

func TestUnzipRejectsUnsafeEntriesBeforeWriting(t *testing.T) {
	for _, name := range []string{"../escape", "/absolute", "C:/absolute", `..\escape`} {
		t.Run(name, func(t *testing.T) {
			archive := filepath.Join(t.TempDir(), "unsafe.zip")
			f, err := os.Create(archive)
			if err != nil {
				t.Fatal(err)
			}
			w := zip.NewWriter(f)
			first, _ := w.Create("keep.txt")
			_, _ = first.Write([]byte("replacement"))
			bad, _ := w.Create(name)
			_, _ = bad.Write([]byte("invalid"))
			if err := w.Close(); err != nil {
				t.Fatal(err)
			}
			if err := f.Close(); err != nil {
				t.Fatal(err)
			}
			dest := t.TempDir()
			if err := UnzipTo(archive, dest); err == nil {
				t.Error("unsafe entry accepted")
			}
			entries, _ := os.ReadDir(dest)
			if len(entries) != 0 {
				t.Error("unsafe archive wrote data before full preflight")
			}
		})
	}
}
