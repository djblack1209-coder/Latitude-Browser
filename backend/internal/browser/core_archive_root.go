package browser

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"

	"ant-chrome/backend/internal/snapshot"
)

// Files are written through an os.Root before any archive links are created.
// Links occupy file names in the shared namespace policy, so no other entry
// may write through one, regardless of archive ordering.
type coreArchiveRoot struct {
	root   *os.Root
	policy *snapshot.ArchivePolicy
	links  map[string]string
	top    map[string]struct{}
}

func openCoreArchiveRoot(dest string) (*coreArchiveRoot, error) {
	if err := os.MkdirAll(dest, 0700); err != nil {
		return nil, err
	}
	info, err := os.Lstat(dest)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("内核暂存根必须为普通目录")
	}
	root, err := os.OpenRoot(dest)
	if err != nil {
		return nil, err
	}
	policy, err := snapshot.NewArchivePolicy(snapshot.DefaultArchiveLimits())
	if err != nil {
		root.Close()
		return nil, err
	}
	return &coreArchiveRoot{root: root, policy: policy, links: map[string]string{}, top: map[string]struct{}{}}, nil
}
func (a *coreArchiveRoot) add(raw string, mode os.FileMode, size uint64) (string, error) {
	if strings.Contains(raw, "\\") || strings.HasPrefix(raw, "/") {
		return "", fmt.Errorf("非法内核归档路径: %s", raw)
	}
	for _, part := range strings.Split(raw, "/") {
		if part == ".." {
			return "", fmt.Errorf("非法内核归档路径: %s", raw)
		}
	}
	name := path.Clean(raw)
	if name == "." {
		if mode.IsDir() {
			return "", nil
		}
		return "", fmt.Errorf("非法空文件路径")
	}
	header := zip.FileHeader{Name: name, UncompressedSize64: size}
	if mode.IsDir() {
		header.Name += "/"
		header.SetMode(os.ModeDir | 0700)
	} else {
		header.SetMode(0600)
	}
	name, err := a.policy.Add(header)
	if err != nil {
		return "", err
	}
	a.top[strings.SplitN(name, "/", 2)[0]] = struct{}{}
	// Reject pre-existing link components too. os.Root provides confinement if
	// a path changes between these checks and the actual I/O.
	for component := name; component != "."; component = path.Dir(component) {
		info, err := a.root.Lstat(component)
		if err == nil && info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("归档条目经过符号链接: %s", name)
		}
		if err != nil && !os.IsNotExist(err) {
			return "", err
		}
	}
	return name, nil
}
func (a *coreArchiveRoot) directory(name string) error { return a.root.MkdirAll(name, 0755) }
func (a *coreArchiveRoot) file(ctx context.Context, name string, in io.Reader, mode os.FileMode, size uint64) error {
	if err := a.root.MkdirAll(path.Dir(name), 0755); err != nil {
		return err
	}
	f, err := a.root.OpenFile(name, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode.Perm()|0600)
	if err != nil {
		return err
	}
	n, copyErr := io.Copy(f, io.LimitReader(coreContextReader{ctx, in}, int64(size)+1))
	closeErr := f.Close()
	if copyErr != nil {
		return copyErr
	}
	if uint64(n) != size {
		return fmt.Errorf("内核归档条目长度不匹配: %s", name)
	}
	return closeErr
}
func (a *coreArchiveRoot) link(name, target string) error {
	if target == "" || len(target) > 4096 || path.IsAbs(target) || filepath.IsAbs(target) || strings.ContainsAny(target, "\\:\x00") {
		return fmt.Errorf("非法内核归档链接: %s", name)
	}
	resolved := path.Clean(path.Join(path.Dir(name), target))
	if resolved == ".." || strings.HasPrefix(resolved, "../") {
		return fmt.Errorf("内核归档链接越界: %s", name)
	}
	a.links[name] = target
	return nil
}
func (a *coreArchiveRoot) finish(ctx context.Context) error {
	rootName := ""
	if len(a.top) == 1 {
		for name := range a.top {
			if info, err := a.root.Lstat(name); err == nil && info.IsDir() {
				rootName = name
			}
		}
	}
	for name, target := range a.links {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := a.root.MkdirAll(path.Dir(name), 0755); err != nil {
			return err
		}
		if err := a.root.Symlink(target, name); err != nil {
			return err
		}
	}
	validation := a.root
	if rootName != "" {
		var err error
		validation, err = a.root.OpenRoot(rootName)
		if err != nil {
			return err
		}
		defer validation.Close()
	}
	for name := range a.links {
		relative := name
		if rootName != "" {
			relative = strings.TrimPrefix(name, rootName+"/")
		}
		// Resolves whole chains within the eventual installed root. Absolute,
		// escaping, looping and dangling chains all fail before installation.
		if _, err := validation.Stat(relative); err != nil {
			return fmt.Errorf("内核归档链接未指向包内有效目标 %s: %w", name, err)
		}
	}
	if validation != a.root {
		if err := validation.Close(); err != nil {
			return err
		}
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if rootName == "" {
		return nil
	}
	dir, err := a.root.Open(rootName)
	if err != nil {
		return err
	}
	entries, err := dir.ReadDir(-1)
	closeErr := dir.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return err
		}
		if _, err := a.root.Lstat(entry.Name()); err == nil {
			return fmt.Errorf("剥离顶层目录的目标已存在")
		} else if !os.IsNotExist(err) {
			return err
		}
		if err := a.root.Rename(path.Join(rootName, entry.Name()), entry.Name()); err != nil {
			return err
		}
	}
	return a.root.Remove(rootName)
}
