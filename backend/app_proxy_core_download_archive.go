package backend

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"ant-chrome/backend/internal/logger"
)

func extractProxyCoreArchive(archivePath string, targetDir string, binaryBase string, targetOS string) error {
	lower := strings.ToLower(archivePath)
	if strings.HasSuffix(lower, ".zip") {
		return extractZipArchive(archivePath, targetDir)
	}
	if strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz") {
		return extractTarGzArchive(archivePath, targetDir)
	}
	if strings.HasSuffix(lower, ".gz") {
		return extractGzipBinary(archivePath, filepath.Join(targetDir, proxyCoreBinaryName(binaryBase, targetOS)))
	}
	return fmt.Errorf("不支持的压缩格式: %s", filepath.Base(archivePath))
}

func extractGzipBinary(archivePath string, targetPath string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()
	gz, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gz.Close()
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return err
	}
	out, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, gz)
	return errors.Join(err, out.Close())
}

func extractZipArchive(archivePath string, targetDir string) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer reader.Close()
	for _, file := range reader.File {
		if err := writeArchiveFile(targetDir, file.Name, file.FileInfo().Mode(), file.FileInfo().IsDir(), func() (io.ReadCloser, error) { return file.Open() }); err != nil {
			return err
		}
	}
	return nil
}

func extractTarGzArchive(archivePath string, targetDir string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()
	gz, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA && header.Typeflag != tar.TypeDir {
			return fmt.Errorf("压缩包包含不支持的文件类型: %s", header.Name)
		}
		mode := os.FileMode(header.Mode)
		isDir := header.FileInfo().IsDir()
		if header.Typeflag == tar.TypeDir {
			isDir = true
		}
		if err := writeArchiveFile(targetDir, header.Name, mode, isDir, func() (io.ReadCloser, error) { return io.NopCloser(tr), nil }); err != nil {
			return err
		}
	}
}

func writeArchiveFile(targetDir string, name string, mode os.FileMode, isDir bool, open func() (io.ReadCloser, error)) error {
	if !isDir && !mode.IsRegular() {
		return fmt.Errorf("压缩包包含非普通文件: %s", name)
	}
	cleanName := filepath.Clean(filepath.FromSlash(name))
	if cleanName == "." || cleanName == ".." || strings.HasPrefix(cleanName, ".."+string(os.PathSeparator)) || filepath.IsAbs(cleanName) {
		return fmt.Errorf("压缩包包含非法路径: %s", name)
	}
	dest := filepath.Join(targetDir, cleanName)
	if isDir {
		return os.MkdirAll(dest, 0o755)
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	src, err := open()
	if err != nil {
		return err
	}
	defer src.Close()
	out, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode.Perm()|0o644)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, src)
	return errors.Join(err, out.Close())
}

func findProxyCoreBinary(root string, binaryBase string, targetOS string) (string, error) {
	return findProxyCoreBinaryScoped(root, binaryBase, targetOS, true)
}

func findProxyCoreBinaryScoped(root string, binaryBase string, targetOS string, recursive bool) (string, error) {
	names := []string{proxyCoreBinaryName(binaryBase, targetOS), binaryBase}
	var matches []string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			// A staging root is searchable during extraction, but ancestor lookups
			// must never mistake an incomplete candidate or recovery backup for an install.
			name := strings.ToLower(entry.Name())
			if path != root && (!recursive || strings.HasPrefix(name, "extract-") || strings.HasPrefix(name, "proxy-core-") || strings.HasPrefix(name, ".proxy-core-")) {
				return filepath.SkipDir
			}
			return nil
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		base := strings.ToLower(filepath.Base(path))
		for _, name := range names {
			if proxyCoreBinaryNameMatches(base, strings.ToLower(name), binaryBase, targetOS) {
				matches = append(matches, path)
				break
			}
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if len(matches) == 0 {
		return "", fmt.Errorf("解压后未找到 %s 可执行文件", binaryBase)
	}
	sort.Strings(matches)
	return matches[0], nil
}

func proxyCoreBinaryNameMatches(base string, expected string, binaryBase string, targetOS string) bool {
	if base == expected {
		return true
	}
	baseNoExt := strings.TrimSuffix(base, ".exe")
	expectedNoExt := strings.TrimSuffix(expected, ".exe")
	if baseNoExt == expectedNoExt {
		return true
	}
	if binaryBase == "mihomo" && strings.HasPrefix(baseNoExt, "mihomo-") {
		return targetOS != "windows" || strings.HasSuffix(base, ".exe")
	}
	return false
}

func normalizeInstalledProxyCoreBinary(binaryPath string, installDir string, binaryBase string, targetOS string) (string, error) {
	standardPath := filepath.Join(installDir, proxyCoreBinaryName(binaryBase, targetOS))
	if sameCleanPath(binaryPath, standardPath) {
		return binaryPath, nil
	}
	if err := os.MkdirAll(filepath.Dir(standardPath), 0o755); err != nil {
		return "", err
	}
	if _, err := os.Stat(standardPath); err == nil {
		if err := os.Remove(standardPath); err != nil {
			return "", err
		}
	}
	if err := os.Rename(binaryPath, standardPath); err != nil {
		return "", err
	}
	return standardPath, nil
}

// replaceDirContents promotes a fully verified sibling staging directory. The
// old directory remains recoverable until configuration has committed. This is
// error rollback, not a claim of crash/power-loss atomicity across both paths.
func replaceDirContents(srcDir string, dstDir string, commit func() error) error {
	srcDir, dstDir = filepath.Clean(srcDir), filepath.Clean(dstDir)
	info, err := os.Lstat(srcDir)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("安装候选不是普通目录")
	}
	rel, err := filepath.Rel(dstDir, srcDir)
	if err != nil || rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator))) {
		return fmt.Errorf("安装候选必须位于原内核目录之外")
	}
	old, err := os.Lstat(dstDir)
	hadOld := err == nil
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if hadOld && (!old.IsDir() || old.Mode()&os.ModeSymlink != 0) {
		return fmt.Errorf("安装目标不是普通目录，原文件未改动")
	}
	if err := os.MkdirAll(filepath.Dir(dstDir), 0o755); err != nil {
		return err
	}
	backup := ""
	if hadOld {
		backup, err = os.MkdirTemp(filepath.Dir(dstDir), ".proxy-core-backup-")
		if err != nil {
			return err
		}
		if err := os.Remove(backup); err != nil {
			return err
		}
		if err := os.Rename(dstDir, backup); err != nil {
			return err
		}
	}
	restore := func(cause error) error {
		if backup != "" {
			if err := os.Rename(backup, dstDir); err != nil {
				return errors.Join(cause, fmt.Errorf("恢复原内核失败，备份保留在 %s: %w", backup, err))
			}
		}
		return cause
	}
	if err := os.Rename(srcDir, dstDir); err != nil {
		return restore(err)
	}
	if commit != nil {
		if err := commit(); err != nil {
			// Move the candidate back instead of deleting it before rollback; a
			// failed rollback must never erase the only remaining good directory.
			if moveErr := os.Rename(dstDir, srcDir); moveErr != nil {
				return errors.Join(err, fmt.Errorf("撤回候选内核失败，原内核备份保留在 %s: %w", backup, moveErr))
			}
			return restore(err)
		}
	}
	if backup != "" {
		if err := os.RemoveAll(backup); err != nil {
			logger.New("ProxyCore").Warn("新内核已安装，旧内核备份清理失败", logger.F("backup", backup), logger.F("error", err))
		}
	}
	return nil
}
