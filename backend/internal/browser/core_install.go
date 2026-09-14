package browser

import (
	"ant-chrome/backend/internal/logger"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

func installCoreDirectory(ctx context.Context, target, stage string, replace bool, save func() error, rename func(string, string) error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	info, err := os.Lstat(target)
	hadOriginal := err == nil
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if hadOriginal && (!replace || !info.IsDir()) {
		return fmt.Errorf("内核目标已存在或不是普通目录")
	}
	backup := ""
	if hadOriginal {
		backup, err = os.MkdirTemp(filepath.Dir(target), "."+filepath.Base(target)+".previous-*")
		if err != nil {
			return err
		}
		if err := os.Remove(backup); err != nil {
			return err
		}
		if err := rename(target, backup); err != nil {
			return err
		}
	}
	published := false
	rollback := func(cause error) error {
		if published {
			if err := rename(target, stage); err != nil {
				return errors.Join(cause, fmt.Errorf("内核回滚失败；旧副本保留于 %s，新目录位于 %s: %w", backup, target, err))
			}
		}
		if hadOriginal {
			if err := rename(backup, target); err != nil {
				return errors.Join(cause, fmt.Errorf("内核回滚失败；旧副本保留于 %s: %w", backup, err))
			}
		}
		return cause
	}
	if err := ctx.Err(); err != nil {
		return rollback(err)
	}
	if err := rename(stage, target); err != nil {
		return rollback(err)
	}
	published = true
	if err := ctx.Err(); err != nil {
		return rollback(err)
	}
	if err := save(); err != nil {
		return rollback(fmt.Errorf("保存配置入库失败: %w", err))
	}
	// Successful persistence is the commit point. Cancellation or old-directory
	// cleanup failure after it must not falsely report that installation rolled back.
	if hadOriginal {
		if err := os.RemoveAll(backup); err != nil {
			logger.New("Browser").Warn("内核安装已提交，旧副本清理失败", logger.F("backup_path", backup), logger.F("error", err))
		}
	}
	return nil
}
