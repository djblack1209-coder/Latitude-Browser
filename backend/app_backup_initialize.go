package backend

import (
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/logger"
	"fmt"
	"os"
	"strings"
)

// backupInitializeLocked serializes the full reset lifecycle with browser/Tor
// starts and Tor runtime death handling. The lock is intentionally held from
// runtime stop through config/data mutation and the optional reload.
func (a *App) backupInitializeLocked(applyReload bool) (result map[string]interface{}, resultErr error) {
	a.torLifecycleMu.Lock()
	defer a.torLifecycleMu.Unlock()
	defer a.backupFinishProxyMaintenance(&result, &resultErr, a.speedScheduler != nil)
	return a.backupInitializeLockedNoLifecycle(applyReload)
}

// backupInitializeLockedNoLifecycle is the reset implementation for callers
// that already hold torLifecycleMu (for example, an import transaction).
func (a *App) backupInitializeLockedNoLifecycle(applyReload bool) (map[string]interface{}, error) {
	log := logger.New("Backup")
	if err := a.backupStopRuntimeForMaintenance(); err != nil {
		return nil, fmt.Errorf("初始化已取消：无法安全停止当前运行时: %w", err)
	}

	defaultCfg := config.DefaultConfig()
	a.torConfigMu.Lock()
	oldCfg := a.config
	if oldCfg == nil {
		oldCfg = config.DefaultConfig()
	}
	// The open connection remains attached to this database during reset/import.
	defaultCfg.Database = oldCfg.Database
	activeDBPath := a.backupResolveDBPath(oldCfg)
	keepFiles := map[string]struct{}{
		backupNormalizePath(activeDBPath):          {},
		backupNormalizePath(activeDBPath + "-wal"): {},
		backupNormalizePath(activeDBPath + "-shm"): {},
	}

	if err := defaultCfg.Save(a.resolveAppPath("config.yaml")); err != nil {
		a.torConfigMu.Unlock()
		return nil, fmt.Errorf("写入默认配置失败: %w", err)
	}
	a.proxyStateMu.Lock()
	a.config = defaultCfg
	a.proxyStateMu.Unlock()
	if a.torMgr != nil {
		a.torMgr.UpdateConfig(defaultCfg)
	}
	a.torConfigMu.Unlock()
	a.applyRuntimeConfig(defaultCfg.Runtime)
	_ = os.Remove(a.resolveAppPath("proxies.yaml"))

	if err := a.backupClearBusinessTables(); err != nil {
		return nil, err
	}

	cleared := make([]string, 0, 3)
	dataRoot := a.resolveAppPath("data")
	if err := backupRemoveContentsExcept(dataRoot, keepFiles); err == nil {
		cleared = append(cleared, dataRoot)
	}
	oldUserRoot := a.backupResolveUserDataRoot(oldCfg)
	newUserRoot := a.backupResolveUserDataRoot(defaultCfg)
	for _, p := range backupUniqueNonEmpty([]string{oldUserRoot, newUserRoot}) {
		if backupSamePath(p, dataRoot) {
			continue
		}
		if err := backupRemoveContentsExcept(p, keepFiles); err == nil {
			cleared = append(cleared, p)
		}
	}

	if applyReload {
		if err := a.backupReloadAfterMutation(); err != nil {
			return nil, err
		}
	}

	log.Info("系统初始化完成", logger.F("cleared_dirs", strings.Join(cleared, ";")))
	return map[string]interface{}{
		"cancelled":   false,
		"resetDone":   true,
		"clearedDirs": cleared,
		"message":     "系统已初始化到默认状态",
	}, nil
}
