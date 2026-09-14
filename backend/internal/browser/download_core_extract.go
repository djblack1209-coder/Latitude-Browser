package browser

import (
	"archive/tar"
	"archive/zip"
	"compress/bzip2"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/ulikunitz/xz"
)

type archiveProgress struct {
	index int
	total int
}

func SupportedCoreArchivePattern() string {
	return "*.zip;*.tar;*.tar.gz;*.tgz;*.tar.xz;*.txz;*.tar.bz2;*.tbz2"
}

func SupportedCoreArchiveDescription() string {
	return "支持 ZIP、TAR、TAR.GZ、TAR.XZ、TAR.BZ2"
}

func coreArchiveTempPattern(rawURL string) string {
	lowerName := strings.ToLower(strings.TrimSpace(rawURL))
	if parsed, err := filepathFromURLPath(lowerName); err == nil && parsed != "" {
		lowerName = parsed
	}
	for _, suffix := range coreArchiveSuffixes() {
		if strings.HasSuffix(lowerName, suffix) {
			return "download_*" + suffix
		}
	}
	return "download_*"
}

func filepathFromURLPath(raw string) (string, error) {
	parts := strings.SplitN(raw, "?", 2)
	parts = strings.SplitN(parts[0], "#", 2)
	return filepath.Base(parts[0]), nil
}

func extractCoreArchiveAndStripRoot(archivePath, dest string, progressCb func(int, string)) error {
	return extractCoreArchiveAndStripRootContext(context.Background(), archivePath, dest, progressCb)
}

func extractCoreArchiveAndStripRootContext(ctx context.Context, archivePath, dest string, progressCb func(int, string)) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	lower := strings.ToLower(archivePath)
	if strings.HasSuffix(lower, ".zip") {
		return extractZipArchiveAndStripRootContext(ctx, archivePath, dest, progressCb)
	}
	if isTarArchivePath(lower) {
		return extractTarArchiveAndStripRootContext(ctx, archivePath, dest, progressCb)
	}
	if err := extractZipArchiveAndStripRootContext(ctx, archivePath, dest, progressCb); err == nil {
		return nil
	}
	return extractTarArchiveAndStripRootContext(ctx, archivePath, dest, progressCb)
}

func ExtractCoreArchiveAndStripRootForImport(archivePath, dest string, progressCb func(int, string)) error {
	return extractCoreArchiveAndStripRoot(archivePath, dest, progressCb)
}

func extractZipArchiveAndStripRoot(archivePath, dest string, progressCb func(int, string)) error {
	return extractZipArchiveAndStripRootContext(context.Background(), archivePath, dest, progressCb)
}

func extractZipArchiveAndStripRootContext(ctx context.Context, archivePath, dest string, progressCb func(int, string)) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer reader.Close()
	if len(reader.File) == 0 {
		return fmt.Errorf("空的压缩包")
	}
	target, err := openCoreArchiveRoot(dest)
	if err != nil {
		return err
	}
	defer target.root.Close()
	progress := archiveProgress{total: len(reader.File)}
	for _, file := range reader.File {
		progress.report(progressCb)
		if err := ctx.Err(); err != nil {
			return err
		}
		mode := file.Mode()
		if !mode.IsRegular() && !mode.IsDir() && mode&os.ModeSymlink == 0 {
			return fmt.Errorf("不支持的内核归档条目: %s", file.Name)
		}
		name, err := target.add(file.Name, mode, file.UncompressedSize64)
		if err != nil {
			return err
		}
		if name == "" {
			continue
		}
		if mode.IsDir() {
			if err := target.directory(name); err != nil {
				return err
			}
			continue
		}
		rc, err := file.Open()
		if err != nil {
			return err
		}
		var copyErr error
		if mode&os.ModeSymlink != 0 {
			var data []byte
			data, copyErr = io.ReadAll(io.LimitReader(coreContextReader{ctx, rc}, 4097))
			if copyErr == nil {
				copyErr = target.link(name, string(data))
			}
		} else {
			copyErr = target.file(ctx, name, rc, mode, file.UncompressedSize64)
		}
		closeErr := rc.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	if err := target.finish(ctx); err != nil {
		return err
	}
	progressCb(100, "解压完成！")
	return nil
}

func extractTarArchiveAndStripRoot(archivePath, dest string, progressCb func(int, string)) error {
	return extractTarArchiveAndStripRootContext(context.Background(), archivePath, dest, progressCb)
}

func extractTarArchiveAndStripRootContext(ctx context.Context, archivePath, dest string, progressCb func(int, string)) error {
	target, err := openCoreArchiveRoot(dest)
	if err != nil {
		return err
	}
	defer target.root.Close()
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()
	stream, closeStream, err := tarStreamReader(archivePath, file)
	if err != nil {
		return err
	}
	defer closeStream()
	reader := tar.NewReader(coreContextReader{ctx, stream})
	count := 0
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		count++
		if count == 1 || count%50 == 0 {
			progressCb(0, fmt.Sprintf("正在解压文件 %d...", count))
		}
		if header.Size < 0 {
			return fmt.Errorf("非法内核归档长度")
		}
		name, err := target.add(header.Name, header.FileInfo().Mode(), uint64(header.Size))
		if err != nil {
			return err
		}
		if name == "" {
			continue
		}
		switch header.Typeflag {
		case tar.TypeDir:
			err = target.directory(name)
		case tar.TypeSymlink:
			err = target.link(name, header.Linkname)
		case tar.TypeReg, tar.TypeRegA:
			err = target.file(ctx, name, reader, header.FileInfo().Mode(), uint64(header.Size))
		default:
			err = fmt.Errorf("不支持的内核归档条目: %s", header.Name)
		}
		if err != nil {
			return err
		}
	}
	if count == 0 {
		return fmt.Errorf("空的压缩包")
	}
	if err := target.finish(ctx); err != nil {
		return err
	}
	progressCb(100, "解压完成！")
	return nil
}

func tarStreamReader(archivePath string, file *os.File) (io.Reader, func(), error) {
	lower := strings.ToLower(archivePath)
	switch {
	case strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz"):
		reader, err := gzip.NewReader(file)
		if err != nil {
			return nil, func() {}, err
		}
		return reader, func() { _ = reader.Close() }, nil
	case strings.HasSuffix(lower, ".tar.xz") || strings.HasSuffix(lower, ".txz"):
		reader, err := xz.NewReader(file)
		return reader, func() {}, err
	case strings.HasSuffix(lower, ".tar.bz2") || strings.HasSuffix(lower, ".tbz2"):
		return bzip2.NewReader(file), func() {}, nil
	case strings.HasSuffix(lower, ".tar"):
		return file, func() {}, nil
	default:
		return file, func() {}, nil
	}
}

func isTarArchivePath(path string) bool {
	for _, suffix := range coreArchiveSuffixes() {
		if suffix == ".zip" {
			continue
		}
		if strings.HasSuffix(path, suffix) {
			return true
		}
	}
	return false
}

func coreArchiveSuffixes() []string {
	return []string{".tar.gz", ".tar.xz", ".tar.bz2", ".tgz", ".txz", ".tbz2", ".zip", ".tar"}
}

func (p *archiveProgress) report(progressCb func(int, string)) {
	p.index++
	if p.total <= 0 {
		progressCb(0, "正在解压...")
		return
	}
	percent := int((float64(p.index-1) / float64(p.total)) * 100)
	if p.index == 1 || p.index%50 == 0 {
		progressCb(percent, fmt.Sprintf("正在解压文件 %d / %d...", p.index, p.total))
	}
}

// Context readers keep cancellation effective while copying a large archive entry.
type coreContextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r coreContextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}

type coreContextReadCloser struct {
	ctx    context.Context
	reader io.ReadCloser
}

func (r coreContextReadCloser) Read(p []byte) (int, error) {
	return (coreContextReader{r.ctx, r.reader}).Read(p)
}
func (r coreContextReadCloser) Close() error { return r.reader.Close() }
