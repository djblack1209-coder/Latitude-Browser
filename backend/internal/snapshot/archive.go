package snapshot

import (
	"ant-chrome/backend/internal/fsutil"
	"archive/zip"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
)

type ArchiveLimits struct {
	MaxEntries    int
	MaxFileBytes  uint64
	MaxTotalBytes uint64
}

// DefaultArchiveLimits also applies to full backup import. Callers with a
// deliberate larger trusted import can select explicit finite limits.
func DefaultArchiveLimits() ArchiveLimits {
	return ArchiveLimits{MaxEntries: 100000, MaxFileBytes: 64 << 30, MaxTotalBytes: 100 << 30}
}

type archiveOutput interface {
	io.Writer
	Name() string
	Sync() error
	Close() error
}

func ZipDir(src, dest string) error {
	return zipDir(src, dest, func(dir string) (archiveOutput, error) { return os.CreateTemp(dir, ".latitude-archive-*") }, os.Rename)
}

func zipDir(src, dest string, create func(string) (archiveOutput, error), rename func(string, string) error) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("快照来源必须为目录")
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0700); err != nil {
		return err
	}
	f, err := create(filepath.Dir(dest))
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
	w, err := NewArchiveWriter(f, DefaultArchiveLimits())
	if err != nil {
		return err
	}
	err = filepath.WalkDir(src, func(filePath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if filePath == dest || filePath == f.Name() {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		rel, err := filepath.Rel(src, filePath)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if rel == "." {
			return nil
		}
		if entry.IsDir() {
			_, err := w.Create(rel + "/")
			return err
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = rel
		header.Method = zip.Deflate
		out, err := w.CreateHeader(header)
		if err != nil {
			return err
		}
		in, err := os.Open(filePath)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(out, in)
		closeErr := in.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
	zipCloseErr := w.Close()
	if err != nil {
		return err
	}
	if zipCloseErr != nil {
		return zipCloseErr
	}
	if err := f.Sync(); err != nil {
		return err
	}
	err = f.Close()
	closed = true
	if err != nil {
		return err
	}
	return rename(f.Name(), dest)
}

func UnzipTo(src, dest string) error { return UnzipToWithLimits(src, dest, DefaultArchiveLimits()) }

func UnzipToWithLimits(src, dest string, limits ArchiveLimits) error {
	return unzipTo(src, dest, limits, fsutil.FreeBytes)
}

func unzipTo(src, dest string, limits ArchiveLimits, freeBytes func(string) (uint64, error)) error {
	policy, err := NewArchivePolicy(limits)
	if err != nil {
		return err
	}
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()
	for _, file := range r.File {
		if _, err := policy.Add(file.FileHeader); err != nil {
			return err
		}
	}
	total := policy.Total
	if err := os.MkdirAll(dest, 0700); err != nil {
		return err
	}
	available, err := freeBytes(dest)
	if err != nil {
		return fmt.Errorf("检查解压空间失败: %w", err)
	}
	if total > available {
		return fmt.Errorf("解压空间不足：需要 %d 字节，可用 %d 字节", total, available)
	}
	root, err := os.OpenRoot(dest)
	if err != nil {
		return err
	}
	defer root.Close()
	var actual uint64
	for _, file := range r.File {
		name, _ := archiveEntryName(file)
		if file.FileInfo().IsDir() {
			if err := root.MkdirAll(filepath.FromSlash(name), 0700); err != nil {
				return err
			}
			continue
		}
		if err := root.MkdirAll(filepath.FromSlash(path.Dir(name)), 0700); err != nil {
			return err
		}
		in, err := file.Open()
		if err != nil {
			return err
		}
		mode := os.FileMode(0600) | (file.Mode().Perm() & 0100)
		out, err := root.OpenFile(filepath.FromSlash(name), os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
		if err != nil {
			_ = in.Close()
			return err
		}
		maxBytes := min(file.UncompressedSize64, limits.MaxTotalBytes-actual)
		n, copyErr := io.Copy(out, io.LimitReader(in, int64(maxBytes)+1))
		inCloseErr := in.Close()
		syncErr := out.Sync()
		closeErr := out.Close()
		if copyErr != nil {
			return copyErr
		}
		if uint64(n) != file.UncompressedSize64 || uint64(n) > maxBytes {
			return fmt.Errorf("归档实际展开大小与声明不符: %s", file.Name)
		}
		if inCloseErr != nil {
			return inCloseErr
		}
		if syncErr != nil {
			return syncErr
		}
		if closeErr != nil {
			return closeErr
		}
		actual += uint64(n)
	}
	return nil
}

func archiveEntryName(file *zip.File) (string, error) {
	name := strings.TrimSuffix(file.Name, "/")
	if name == "" || strings.ContainsAny(name, "\\:\x00") || strings.HasPrefix(name, "/") || path.Clean(name) != name || name == "." || name == ".." || strings.HasPrefix(name, "../") {
		return "", fmt.Errorf("非法归档路径: %s", file.Name)
	}
	mode := file.Mode()
	if mode&os.ModeType != 0 && !mode.IsDir() {
		return "", fmt.Errorf("不支持的归档条目: %s", file.Name)
	}
	return name, nil
}
