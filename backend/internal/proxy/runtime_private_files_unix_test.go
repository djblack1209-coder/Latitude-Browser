//go:build !windows

package proxy

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
)

func TestRuntimePrivateFilesUnderPermissiveUmask(t *testing.T) {
	if os.Getenv("LATITUDE_PERMISSION_FIXTURE") == "1" {
		syscall.Umask(0)
		TestRuntimeConfigFilesArePrivate(t)
		return
	}
	cmd := exec.Command(os.Args[0], "-test.run=^TestRuntimePrivateFilesUnderPermissiveUmask$")
	cmd.Env = append(os.Environ(), "LATITUDE_PERMISSION_FIXTURE=1")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("permissive umask child: %v\n%s", err, out)
	}
}

func TestRuntimePrivateFilesTightenOwnedPathsAndRejectLinks(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "_fixture", "node")
	if err := os.MkdirAll(dir, 0777); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{dir, filepath.Dir(dir)} {
		if err := os.Chmod(p, 0777); err != nil {
			t.Fatal(err)
		}
	}
	if err := preparePrivateRuntimeDir(dir); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{dir, filepath.Dir(dir)} {
		info, err := os.Stat(p)
		if err != nil || info.Mode().Perm() != 0700 {
			t.Fatalf("runtime path mode: %v %v", info, err)
		}
	}
	path := filepath.Join(dir, "stderr.log")
	if err := os.WriteFile(path, []byte("old"), 0666); err != nil {
		t.Fatal(err)
	}
	os.Chmod(path, 0666)
	f, err := openPrivateRuntimeLog(path)
	if err != nil {
		t.Fatal(err)
	}
	f.Close()
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0600 {
		t.Fatal("existing log remains readable by other users")
	}
	link := filepath.Join(dir, "linked.log")
	if err := os.Symlink(path, link); err != nil {
		t.Fatal(err)
	}
	if _, err := openPrivateRuntimeLog(link); err == nil {
		t.Fatal("followed runtime log symlink")
	}
	if err := writePrivateRuntimeConfig(link, []byte("secret")); err == nil {
		t.Fatal("followed runtime config symlink")
	}
	alias := filepath.Join(root, "_alias")
	if err := os.Symlink(filepath.Dir(dir), alias); err != nil {
		t.Fatal(err)
	}
	if err := preparePrivateRuntimeDir(filepath.Join(alias, "new")); err == nil {
		t.Fatal("followed runtime directory symlink")
	}
}
