package snapshot

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"strings"
)

// ArchivePolicy is shared by import and export. It validates the complete
// portable namespace, including implicit parent directories, and finite sizes.
type ArchivePolicy struct {
	limits  ArchiveLimits
	seen    map[string]bool
	parents map[string]bool
	Total   uint64
}

func NewArchivePolicy(limits ArchiveLimits) (*ArchivePolicy, error) {
	if limits.MaxEntries <= 0 || limits.MaxFileBytes == 0 || limits.MaxTotalBytes == 0 || limits.MaxTotalBytes > 1<<62 {
		return nil, fmt.Errorf("归档限额配置无效")
	}
	return &ArchivePolicy{limits: limits, seen: make(map[string]bool), parents: make(map[string]bool)}, nil
}

func (p *ArchivePolicy) Add(header zip.FileHeader) (string, error) {
	name, err := archiveEntryName(&zip.File{FileHeader: header})
	if err != nil {
		return "", err
	}
	key := strings.ToLower(name)
	if _, exists := p.seen[key]; exists {
		return "", fmt.Errorf("归档路径重复: %s", header.Name)
	}
	if len(p.seen) >= p.limits.MaxEntries {
		return "", fmt.Errorf("归档条目超过上限 %d", p.limits.MaxEntries)
	}
	isDir := header.FileInfo().IsDir()
	if !isDir && p.parents[key] {
		return "", fmt.Errorf("归档文件与目录冲突: %s", header.Name)
	}
	for parent := path.Dir(key); parent != "."; parent = path.Dir(parent) {
		if parentIsDir, exists := p.seen[parent]; exists && !parentIsDir {
			return "", fmt.Errorf("归档文件与目录冲突: %s", header.Name)
		}
	}
	size := header.UncompressedSize64
	if (isDir && size != 0) || size > p.limits.MaxFileBytes || size > p.limits.MaxTotalBytes-p.Total {
		return "", fmt.Errorf("归档展开大小超过安全上限")
	}
	p.seen[key] = isDir
	for parent := path.Dir(key); parent != "."; parent = path.Dir(parent) {
		p.parents[parent] = true
	}
	p.Total += size
	return name, nil
}

// ArchiveWriter also checks actual writes against declared sizes, so a source
// that grows or shrinks while it is being read cannot produce an invalid package.
type ArchiveWriter struct {
	zip     *zip.Writer
	policy  *ArchivePolicy
	pending *archiveEntryWriter
	err     error
}
type archiveEntryWriter struct {
	owner     *ArchiveWriter
	out       io.Writer
	remaining uint64
}

func NewArchiveWriter(out io.Writer, limits ArchiveLimits) (*ArchiveWriter, error) {
	policy, err := NewArchivePolicy(limits)
	if err != nil {
		return nil, err
	}
	return &ArchiveWriter{zip: zip.NewWriter(out), policy: policy}, nil
}

func (w *ArchiveWriter) finishEntry() error {
	if w.err != nil {
		return w.err
	}
	if w.pending != nil && w.pending.remaining != 0 {
		w.err = fmt.Errorf("归档源文件长度发生变化")
	}
	return w.err
}

func (w *ArchiveWriter) CreateHeader(header *zip.FileHeader) (io.Writer, error) {
	if err := w.finishEntry(); err != nil {
		return nil, err
	}
	if _, err := w.policy.Add(*header); err != nil {
		w.err = err
		return nil, err
	}
	out, err := w.zip.CreateHeader(header)
	if err != nil {
		w.err = err
		return nil, err
	}
	w.pending = &archiveEntryWriter{owner: w, out: out, remaining: header.UncompressedSize64}
	return w.pending, nil
}

func (w *ArchiveWriter) Create(name string) (io.Writer, error) {
	if !strings.HasSuffix(name, "/") {
		return nil, fmt.Errorf("归档文件必须声明长度")
	}
	header := &zip.FileHeader{Name: name}
	header.SetMode(os.ModeDir | 0700)
	return w.CreateHeader(header)
}

func (w *ArchiveWriter) Close() error { return errors.Join(w.finishEntry(), w.zip.Close()) }

func (w *archiveEntryWriter) Write(data []byte) (int, error) {
	if w.owner.err != nil {
		return 0, w.owner.err
	}
	if uint64(len(data)) > w.remaining {
		w.owner.err = fmt.Errorf("归档源文件长度超过声明值")
		return 0, w.owner.err
	}
	n, err := w.out.Write(data)
	w.remaining -= uint64(n)
	if err == nil && n != len(data) {
		err = io.ErrShortWrite
	}
	if err != nil {
		w.owner.err = err
	}
	return n, err
}
