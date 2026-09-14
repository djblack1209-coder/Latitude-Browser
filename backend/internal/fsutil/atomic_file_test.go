package fsutil

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

var errAtomicFixture = errors.New("injected file failure")

type faultyAtomicFile struct {
	*os.File
	failure string
}

func (f faultyAtomicFile) Write(p []byte) (int, error) {
	if f.failure == "write" {
		return 0, errAtomicFixture
	}
	if f.failure == "short" {
		return len(p) - 1, nil
	}
	return f.File.Write(p)
}
func (f faultyAtomicFile) Sync() error {
	if f.failure == "sync" {
		return errAtomicFixture
	}
	return f.File.Sync()
}
func (f faultyAtomicFile) Close() error {
	err := f.File.Close()
	if f.failure == "close" {
		return errAtomicFixture
	}
	return err
}

func TestAtomicWritePreservesOldFileOnEveryFailure(t *testing.T) {
	for _, failure := range []string{"create", "write", "short", "sync", "close", "rename", "success"} {
		t.Run(failure, func(t *testing.T) {
			root := t.TempDir()
			path := filepath.Join(root, "proxies.yaml")
			if err := os.WriteFile(path, []byte("old catalog"), 0600); err != nil {
				t.Fatal(err)
			}
			err := atomicWriteFile(path, []byte("new catalog"), 0600, func(dir string) (atomicFile, error) {
				if failure == "create" {
					return nil, errAtomicFixture
				}
				file, err := os.CreateTemp(dir, ".test-")
				if err != nil {
					return nil, err
				}
				return faultyAtomicFile{file, failure}, nil
			}, func(src, dest string) error {
				if failure == "rename" {
					return errAtomicFixture
				}
				return os.Rename(src, dest)
			})
			want := "old catalog"
			if failure == "success" {
				want = "new catalog"
				if err != nil {
					t.Fatal(err)
				}
			} else if err == nil {
				t.Fatal("injected failure returned success")
			}
			got, readErr := os.ReadFile(path)
			if readErr != nil || string(got) != want {
				t.Fatalf("destination=%q err=%v", got, readErr)
			}
			entries, err := os.ReadDir(root)
			if err != nil || len(entries) != 1 {
				t.Fatalf("temporary files leaked: %v %v", entries, err)
			}
		})
	}
}
