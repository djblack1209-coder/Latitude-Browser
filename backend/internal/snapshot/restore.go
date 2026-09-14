package snapshot

import (
	"ant-chrome/backend/internal/fsutil"
	"ant-chrome/backend/internal/logger"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type restoreJournal struct {
	Stage       string `json:"stage"`
	HadOriginal bool   `json:"hadOriginal"`
}

func restoreJournalPath(target string) string {
	return filepath.Join(filepath.Dir(target), "."+filepath.Base(target)+".latitude-restore.json")
}

func syncRestoreParent(target string) error {
	// Windows directory handles do not provide portable fsync semantics.
	// The journal still covers process interruption there.
	if runtime.GOOS == "windows" {
		return nil
	}
	f, err := os.Open(filepath.Dir(target))
	if err != nil {
		return err
	}
	err = f.Sync()
	closeErr := f.Close()
	if err != nil {
		return err
	}
	return closeErr
}

func RestoreDirectory(archive, target string) error {
	return restoreDirectory(archive, target, os.Rename, UnzipTo)
}

func restoreDirectory(archive, target string, rename func(string, string) error, extract func(string, string) error) error {
	target, err := filepath.Abs(target)
	if err != nil {
		return err
	}
	if filepath.Dir(target) == target {
		return fmt.Errorf("不能恢复到文件系统根目录")
	}
	if err := recoverRestore(target, rename); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
		return err
	}
	info, statErr := os.Lstat(target)
	if statErr != nil && !os.IsNotExist(statErr) {
		return statErr
	}
	hadOriginal := statErr == nil
	if hadOriginal && !info.IsDir() {
		return fmt.Errorf("恢复目标必须为普通目录，不能为符号链接或文件")
	}
	stage, err := os.MkdirTemp(filepath.Dir(target), "."+filepath.Base(target)+".latitude-stage-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	if err := extract(archive, stage); err != nil {
		return err
	}
	journal := restoreJournal{Stage: filepath.Base(stage), HadOriginal: hadOriginal}
	data, err := json.Marshal(journal)
	if err != nil {
		return err
	}
	marker := restoreJournalPath(target)
	if err := fsutil.AtomicWriteFile(marker, data, 0600); err != nil {
		return err
	}
	if err := syncRestoreParent(target); err != nil {
		_ = os.Remove(marker)
		return err
	}
	backup := stage + ".previous"
	rollback := func(cause error) error {
		if err := recoverRestore(target, rename); err != nil {
			return errors.Join(cause, fmt.Errorf("恢复回滚失败，旧数据保留于 %s；再次恢复或启动时会重试: %w", backup, err))
		}
		return cause
	}
	if hadOriginal {
		if err := rename(target, backup); err != nil {
			return rollback(err)
		}
	}
	if err := rename(stage, target); err != nil {
		return rollback(err)
	}
	if err := syncRestoreParent(target); err != nil {
		return rollback(err)
	}
	// Removing the journal commits the replacement. Before this point recovery
	// restores the old directory; afterwards cleanup never reports a rollback.
	if err := os.Remove(marker); err != nil {
		return rollback(err)
	}
	_ = syncRestoreParent(target)
	if hadOriginal {
		if err := os.RemoveAll(backup); err != nil {
			logger.New("Snapshot").Warn("快照已恢复，旧副本清理失败", logger.F("backup_path", backup), logger.F("error", err))
		}
	}
	return nil
}

// RecoverRestore is called before using an instance directory. It only acts on
// this target's validated journal; it never scans or deletes arbitrary siblings.
func RecoverRestore(target string) error {
	target, err := filepath.Abs(target)
	if err != nil {
		return err
	}
	return recoverRestore(target, os.Rename)
}

func recoverRestore(target string, rename func(string, string) error) error {
	marker := restoreJournalPath(target)
	data, err := os.ReadFile(marker)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	var journal restoreJournal
	if err := json.Unmarshal(data, &journal); err != nil {
		return fmt.Errorf("恢复记录损坏，请保留原目录及旧副本: %w", err)
	}
	prefix := "." + filepath.Base(target) + ".latitude-stage-"
	if filepath.Base(journal.Stage) != journal.Stage || !strings.HasPrefix(journal.Stage, prefix) || len(journal.Stage) <= len(prefix) || strings.ContainsAny(journal.Stage, "/\\:") {
		return fmt.Errorf("恢复记录路径无效")
	}
	stage := filepath.Join(filepath.Dir(target), journal.Stage)
	backup := stage + ".previous"
	_, backupErr := os.Lstat(backup)
	_, targetErr := os.Lstat(target)
	_, stageErr := os.Lstat(stage)
	for _, err := range []error{backupErr, targetErr, stageErr} {
		if err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	if journal.HadOriginal && backupErr == nil {
		if targetErr == nil {
			if stageErr == nil {
				return fmt.Errorf("恢复目录状态不明确，旧副本保留于 %s", backup)
			}
			if err := rename(target, stage); err != nil {
				return err
			}
		}
		if err := rename(backup, target); err != nil {
			return err
		}
	} else if journal.HadOriginal && os.IsNotExist(targetErr) {
		return fmt.Errorf("恢复记录中的原目录与旧副本均不可用，保留暂存目录 %s", stage)
	}
	// With no original directory, a promoted, fully validated directory is safe
	// to keep. Otherwise stage is an uncommitted extraction and may be discarded.
	if err := syncRestoreParent(target); err != nil {
		return err
	}
	if err := os.Remove(marker); err != nil {
		return err
	}
	_ = syncRestoreParent(target)
	if err := os.RemoveAll(stage); err != nil {
		logger.New("Snapshot").Warn("恢复记录已处理，暂存目录清理失败", logger.F("error", err))
	}
	return nil
}
