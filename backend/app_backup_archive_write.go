package backend

import (
	"ant-chrome/backend/internal/backup"
	"ant-chrome/backend/internal/snapshot"
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

type backupArchiveOutput interface {
	io.Writer
	Name() string
	Sync() error
	Close() error
}
type backupArchiveOptions struct {
	walkExcludedPaths []string
	limits            snapshot.ArchiveLimits
	ctx               context.Context
	create            func(string) (backupArchiveOutput, error)
	rename            func(string, string) error
}
type backupContextWriter struct {
	ctx    context.Context
	writer io.Writer
}

func (w backupContextWriter) Write(data []byte) (int, error) {
	if err := w.ctx.Err(); err != nil {
		return 0, err
	}
	return w.writer.Write(data)
}

func backupWritePackageZip(zipPath string, scope backup.Scope, manifest backup.Manifest, emitProgress func(phase string, progress int, message string, meta *backupProgressMeta), excludedPaths ...string) (int, int, int, error) {
	return backupWritePackageZipWithOptions(zipPath, scope, manifest, emitProgress, backupArchiveOptions{}, excludedPaths...)
}

func backupWritePackageZipWithOptions(zipPath string, scope backup.Scope, manifest backup.Manifest, emitProgress func(phase string, progress int, message string, meta *backupProgressMeta), options backupArchiveOptions, excludedPaths ...string) (int, int, int, error) {
	if options.ctx == nil {
		options.ctx = context.Background()
	}
	if options.create == nil {
		options.create = func(dir string) (backupArchiveOutput, error) { return os.CreateTemp(dir, ".latitude-backup-*.zip") }
	}
	if options.rename == nil {
		options.rename = os.Rename
	}
	if err := options.ctx.Err(); err != nil {
		return 0, 0, 0, err
	}

	emit := func(phase string, progress int, message string, meta *backupProgressMeta) {
		if emitProgress != nil {
			emitProgress(phase, progress, message, meta)
		}
	}
	if err := os.MkdirAll(filepath.Dir(zipPath), 0755); err != nil {
		return 0, 0, 0, fmt.Errorf("创建导出目录失败: %w", err)
	}
	emit("writing", 18, "正在创建导出文件...", nil)

	f, err := options.create(filepath.Dir(zipPath))
	if err != nil {
		return 0, 0, 0, fmt.Errorf("创建导出文件失败: %w", err)
	}
	tmpPath := f.Name()
	defer os.Remove(tmpPath)
	excludedPaths = append(excludedPaths, zipPath, tmpPath)
	excludedPaths = backupExpandExcludedPaths(excludedPaths)
	walkExcludedPaths := backupExpandExcludedPaths(append(append([]string(nil), excludedPaths...), options.walkExcludedPaths...))
	if options.limits == (snapshot.ArchiveLimits{}) {
		options.limits = snapshot.DefaultArchiveLimits()
	}
	w, err := snapshot.NewArchiveWriter(backupContextWriter{options.ctx, f}, options.limits)
	if err != nil {
		_ = f.Close()
		return 0, 0, 0, err
	}

	includedEntries := 0
	skippedEntries := 0
	fileCount := 0

	writeErr := func() error {
		emit("writing", 20, "正在写入备份清单...", nil)
		manifestData, err := json.MarshalIndent(manifest, "", "  ")
		if err != nil {
			return err
		}
		mw, err := w.CreateHeader(&zip.FileHeader{Name: "manifest.json", Method: zip.Deflate, UncompressedSize64: uint64(len(manifestData))})
		if err != nil {
			return err
		}
		if _, err := mw.Write(manifestData); err != nil {
			return err
		}
		fileCount++

		totalEntries := len(scope.Entries)
		if totalEntries == 0 {
			emit("writing", 90, "没有可导出的目录条目", nil)
		}
		for i, entry := range scope.Entries {
			meta := &backupProgressMeta{
				ComponentID:   entry.ID,
				ComponentName: backupResolveEntryComponentName(entry),
				EntryIndex:    i + 1,
				EntryTotal:    totalEntries,
			}
			startProgress := 20 + int(float64(i)/float64(totalEntries)*70)
			emit("writing", startProgress, fmt.Sprintf("开始处理组件 %d/%d：%s", i+1, totalEntries, meta.ComponentName), meta)

			info, err := os.Stat(entry.SourcePath)
			if err != nil {
				if os.IsNotExist(err) && !entry.Required {
					skippedEntries++
					progress := 20 + int(float64(i+1)/float64(totalEntries)*70)
					emit("writing", progress, fmt.Sprintf("组件跳过：%s（源路径不存在）", meta.ComponentName), meta)
					continue
				}
				return fmt.Errorf("读取导出源失败(%s): %w", entry.ID, err)
			}
			entryAddedFiles := 0
			if info.IsDir() {
				n, err := backupZipAddDir(w, entry.SourcePath, entry.ArchivePath, walkExcludedPaths...)
				if err != nil {
					return fmt.Errorf("写入目录失败(%s): %w", entry.ID, err)
				}
				fileCount += n
				entryAddedFiles = n
			} else {
				if backupExcludedPath(entry.SourcePath, excludedPaths) {
					skippedEntries++
					progress := 20 + int(float64(i+1)/float64(totalEntries)*70)
					emit("writing", progress, fmt.Sprintf("组件跳过：%s（导出文件本身）", meta.ComponentName), meta)
					continue
				}
				if err := backupZipAddFile(w, entry.SourcePath, strings.TrimSuffix(entry.ArchivePath, "/")); err != nil {
					return fmt.Errorf("写入文件失败(%s): %w", entry.ID, err)
				}
				fileCount++
				entryAddedFiles = 1
			}
			includedEntries++
			progress := 20 + int(float64(i+1)/float64(totalEntries)*70)
			emit("writing", progress, fmt.Sprintf("组件完成：%s（新增 %d 个文件）", meta.ComponentName, entryAddedFiles), meta)
		}
		return nil
	}()

	closeErr := w.Close()
	syncErr := f.Sync()
	fileCloseErr := f.Close()
	if writeErr == nil && closeErr == nil && syncErr != nil {
		writeErr = syncErr
	}
	if writeErr != nil {
		emit("error", 100, writeErr.Error(), nil)
		_ = os.Remove(tmpPath)
		return 0, 0, 0, writeErr
	}
	if closeErr != nil {
		emit("error", 100, closeErr.Error(), nil)
		_ = os.Remove(tmpPath)
		return 0, 0, 0, closeErr
	}
	if fileCloseErr != nil {
		emit("error", 100, fileCloseErr.Error(), nil)
		_ = os.Remove(tmpPath)
		return 0, 0, 0, fileCloseErr
	}
	if err := options.ctx.Err(); err != nil {
		return 0, 0, 0, err
	}
	if err := options.rename(tmpPath, zipPath); err != nil {
		emit("error", 100, err.Error(), nil)
		_ = os.Remove(tmpPath)
		return 0, 0, 0, fmt.Errorf("写入导出文件失败: %w", err)
	}
	emit("done", 100, "导出完成", nil)
	return includedEntries, skippedEntries, fileCount, nil
}

func backupZipAddDir(w *snapshot.ArchiveWriter, srcDir, archiveBase string, excludedPaths ...string) (int, error) {
	base := strings.TrimSuffix(filepath.ToSlash(archiveBase), "/")
	if base == "" {
		return 0, fmt.Errorf("archive base 不能为空")
	}
	if _, err := w.Create(base + "/"); err != nil {
		return 0, err
	}
	fileCount := 0
	err := filepath.WalkDir(srcDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if backupExcludedPath(path, excludedPaths) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type()&os.ModeSymlink != 0 {
			return nil
		}
		rel, err := filepath.Rel(srcDir, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		rel = filepath.ToSlash(rel)
		targetName := base + "/" + rel
		if d.IsDir() {
			_, err := w.Create(strings.TrimSuffix(targetName, "/") + "/")
			return err
		}
		if err := backupZipAddFile(w, path, targetName); err != nil {
			return err
		}
		fileCount++
		return nil
	})
	return fileCount, err
}

func backupZipAddFile(w *snapshot.ArchiveWriter, srcFile, archivePath string) error {
	info, err := os.Stat(srcFile)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("不支持特殊文件: %s", srcFile)
	}
	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = filepath.ToSlash(archivePath)
	header.Method = zip.Deflate
	if header.Name == "" {
		return fmt.Errorf("archivePath 不能为空")
	}
	writer, err := w.CreateHeader(header)
	if err != nil {
		return err
	}
	in, err := os.Open(srcFile)
	if err != nil {
		return err
	}
	_, err = io.Copy(writer, in)
	closeErr := in.Close()
	if err != nil {
		return err
	}
	return closeErr
}

func backupExcludedPath(path string, excluded []string) bool {
	for _, root := range excluded {
		if backupPathWithin(path, root) {
			return true
		}
	}
	return false
}

func backupExpandExcludedPaths(excluded []string) []string {
	result := append([]string(nil), excluded...)
	// The same directory may be reached through /var and /private/var on macOS,
	// or through a configured symlink. Preserve both spellings when excluding
	// the live database, private snapshots, and the output archive itself.
	for _, excluded := range append([]string(nil), result...) {
		canonical, err := filepath.EvalSymlinks(excluded)
		if err != nil {
			if parent, parentErr := filepath.EvalSymlinks(filepath.Dir(excluded)); parentErr == nil {
				canonical = filepath.Join(parent, filepath.Base(excluded))
				err = nil
			}
		}
		if err == nil && !backupSamePath(canonical, excluded) {
			result = append(result, canonical)
		}
	}

	return result
}
