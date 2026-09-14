package fsutil

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

type atomicFile interface {
	io.Writer
	Name() string
	Chmod(os.FileMode) error
	Sync() error
	Close() error
}

// AtomicWriteFile leaves an existing destination intact on every pre-commit
// failure. A successful rename is the commit point; cleanup cannot reverse it.
func AtomicWriteFile(path string, data []byte, mode os.FileMode) error {
	return atomicWriteFile(path, data, mode, func(dir string) (atomicFile, error) {
		return os.CreateTemp(dir, ".latitude-write-*")
	}, os.Rename)
}

func atomicWriteFile(path string, data []byte, mode os.FileMode, create func(string) (atomicFile, error), rename func(string, string) error) error {
	if info, err := os.Lstat(path); err == nil {
		if !info.Mode().IsRegular() {
			return fmt.Errorf("发布目标不是普通文件: %s", path)
		}
		if info.Mode().Perm()&0222 == 0 {
			return &os.PathError{Op: "replace", Path: path, Err: os.ErrPermission}
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	f, err := create(filepath.Dir(path))
	if err != nil {
		return err
	}
	closed := false
	defer func() {
		if !closed {
			_ = f.Close()
		}
		_ = os.Remove(f.Name())
	}()
	if err := f.Chmod(mode); err != nil {
		return err
	}
	n, err := f.Write(data)
	if err != nil {
		return err
	}
	if n != len(data) {
		return io.ErrShortWrite
	}
	if err := f.Sync(); err != nil {
		return err
	}
	err = f.Close()
	closed = true
	if err != nil {
		return err
	}
	if err := rename(f.Name(), path); err != nil {
		return fmt.Errorf("发布文件失败: %w", err)
	}
	return nil
}
