package backend

import (
	"ant-chrome/backend/internal/config"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func (a *App) backupImportFileTrees(payloadRoot string, incomingCfg *config.Config, resetFirst bool, stats *backupMergeStats, onIssue func(componentID, componentName string, err error)) {
	report := func(componentID, componentName string, err error) {
		if onIssue != nil && err != nil {
			onIssue(componentID, componentName, err)
		}
	}

	if err := backupRejectExternalCorePayload(payloadRoot); err != nil {
		report("browser_core_external", "外置浏览器内核", err)
		return
	}

	appDataSrc := filepath.Join(payloadRoot, "app", "data")
	appDataDst := a.resolveAppPath("data")
	dbPath := a.backupResolveDBPath(a.config)
	keepDB := map[string]struct{}{
		backupNormalizePath(dbPath):          {},
		backupNormalizePath(dbPath + "-wal"): {},
		backupNormalizePath(dbPath + "-shm"): {},
	}

	if backupPathExists(appDataSrc) {
		if resetFirst {
			if err := backupRemoveContentsExcept(appDataDst, keepDB); err != nil {
				report("app_data_root", "应用数据目录（含数据库、快照及默认浏览器数据）", err)
			} else if err := backupSyncDir(appDataSrc, appDataDst, true, stats, backupShouldSkipAppDBFile); err != nil {
				report("app_data_root", "应用数据目录（含数据库、快照及默认浏览器数据）", err)
			}
		} else {
			if err := backupSyncDir(appDataSrc, appDataDst, false, stats, backupShouldSkipAppDBFile); err != nil {
				report("app_data_root", "应用数据目录（含数据库、快照及默认浏览器数据）", err)
			}
		}
	}

	userDataSrc := filepath.Join(payloadRoot, "browser", "user-data")
	userDataDst := a.backupResolveUserDataRoot(a.config)
	if backupPathExists(userDataSrc) {
		if resetFirst {
			_ = os.RemoveAll(userDataDst)
			if err := os.MkdirAll(userDataDst, 0755); err != nil {
				report("browser_user_data_root", "浏览器用户数据根目录（若与 data 重合则自动去重）", err)
			} else if err := backupSyncDir(userDataSrc, userDataDst, true, stats, nil); err != nil {
				report("browser_user_data_root", "浏览器用户数据根目录（若与 data 重合则自动去重）", err)
			}
		} else {
			if err := backupSyncDir(userDataSrc, userDataDst, false, stats, nil); err != nil {
				report("browser_user_data_root", "浏览器用户数据根目录（若与 data 重合则自动去重）", err)
			}
		}
	}

	chromeSrc := filepath.Join(payloadRoot, "browser", "cores", "chrome")
	chromeDst := a.resolveAppPath("chrome")
	if backupPathExists(chromeSrc) {
		if resetFirst {
			_ = os.RemoveAll(chromeDst)
			if err := os.MkdirAll(chromeDst, 0755); err != nil {
				report("browser_core_root", "默认内核目录", err)
			} else if err := backupSyncDir(chromeSrc, chromeDst, true, stats, nil); err != nil {
				report("browser_core_root", "默认内核目录", err)
			}
		} else {
			if err := backupSyncDir(chromeSrc, chromeDst, false, stats, nil); err != nil {
				report("browser_core_root", "默认内核目录", err)
			}
		}
	}

}

func (a *App) backupCollectExternalCorePaths(cfg *config.Config) []string {
	if cfg == nil {
		return nil
	}
	defaultChromeRoot := a.resolveAppPath("chrome")
	seen := map[string]struct{}{}
	result := make([]string, 0)
	for _, core := range cfg.Browser.Cores {
		p := strings.TrimSpace(core.CorePath)
		if p == "" {
			continue
		}
		abs := a.resolveAppPath(p)
		if backupPathWithin(abs, defaultChromeRoot) {
			continue
		}
		norm := backupNormalizePath(abs)
		if _, ok := seen[norm]; ok {
			continue
		}
		seen[norm] = struct{}{}
		result = append(result, abs)
	}
	sort.Strings(result)
	return result
}

// Legacy packages encode external cores by sorted position and retain source
// absolute paths. Reject before mutation until an explicit portable mapping is
// implemented; package contents cannot authorize writes outside managed data.
func backupRejectExternalCorePayload(payloadRoot string) error {
	_, err := os.Lstat(filepath.Join(payloadRoot, "browser", "cores", "external"))
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("无法检查外置内核归档: %w", err)
	}
	return fmt.Errorf("此备份包含旧格式外置浏览器内核，无法安全映射恢复路径；当前数据未修改，请使用不含外置内核的备份")
}
