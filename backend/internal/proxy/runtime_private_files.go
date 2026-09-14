package proxy

import (
	"fmt"
	"os"
	"path/filepath"

	"ant-chrome/backend/internal/fsutil"
)

func preparePrivateRuntimeDir(dir string) error {
	// Only tighten the two application-owned runtime levels, never the user's
	// configured data root or its ancestors.
	for _, p := range []string{filepath.Dir(dir), dir} {
		if err := os.MkdirAll(p, 0700); err != nil {
			return err
		}
		info, err := os.Lstat(p)
		if err != nil {
			return err
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("代理运行目录不是普通目录: %s", p)
		}
		if err := os.Chmod(p, 0700); err != nil {
			return err
		}
	}
	return nil
}
func writePrivateRuntimeConfig(path string, data []byte) error {
	return fsutil.AtomicWriteFile(path, data, 0600)
}
func openPrivateRuntimeLog(path string) (*os.File, error) {
	if info, err := os.Lstat(path); err == nil && !info.Mode().IsRegular() {
		return nil, fmt.Errorf("代理日志目标不是普通文件")
	} else if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return nil, err
	}
	if err = f.Chmod(0600); err != nil {
		f.Close()
		return nil, err
	}
	return f, nil
}
