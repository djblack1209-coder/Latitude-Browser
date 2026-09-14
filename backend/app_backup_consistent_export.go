package backend

import (
	"ant-chrome/backend/internal/apppath"
	"ant-chrome/backend/internal/backup"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func (a *App) backupExportToPath(savePath string) (map[string]interface{}, error) {
	return a.backupExportToPathWithProgress(savePath, a.backupEmitExportProgressMeta)
}

func (a *App) backupExportToPathWithProgress(savePath string, emit func(string, int, string, *backupProgressMeta)) (map[string]interface{}, error) {
	a.maintenanceMu.Lock()
	defer a.maintenanceMu.Unlock()
	releaseActivity, err := a.dataActivity.freeze()
	if err != nil {
		return nil, err
	}
	defer releaseActivity()
	if a.automationMgr != nil && a.automationMgr.CurrentState().Installing {
		return nil, fmt.Errorf("自动化运行时正在安装，请完成后再导出")
	}
	a.torLifecycleMu.Lock()
	defer a.torLifecycleMu.Unlock()
	if a.browserMgr == nil || a.db == nil {
		return nil, fmt.Errorf("数据库或浏览器管理器未初始化")
	}
	releaseData, err := a.browserMgr.BeginDataMaintenance()
	if err != nil {
		return nil, err
	}
	defer releaseData()
	a.browserMgr.Mutex.Lock()
	profiles := make([]*BrowserProfile, 0, len(a.browserMgr.Profiles))
	for _, p := range a.browserMgr.Profiles {
		profiles = append(profiles, copyBrowserProfileSnapshot(p))
	}
	a.browserMgr.Mutex.Unlock()
	for _, p := range profiles {
		if p.Running {
			return nil, fmt.Errorf("请先停止所有实例再导出完整备份")
		}
		if _, active := detectBrowserRuntimeByUserDataDir(a.browserMgr.ResolveUserDataDir(p)); active {
			return nil, fmt.Errorf("仍有浏览器使用实例数据，请先关闭浏览器")
		}
	}
	liveDB, err := a.db.FilePath()
	if err != nil {
		return nil, err
	}
	configuredDB := a.backupResolveDBPath(a.config)
	canonical := func(path string) string {
		if resolved, err := filepath.EvalSymlinks(path); err == nil {
			return resolved
		}
		return path
	}
	if liveDB == "" || !backupSamePath(canonical(liveDB), canonical(configuredDB)) {
		return nil, fmt.Errorf("数据库配置与当前连接不一致，请重新启动应用后导出")
	}
	staging, err := os.MkdirTemp("", "latitude-backup-snapshot-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(staging)
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	snapshotPath := filepath.Join(staging, "app.db")
	releaseDB, err := a.db.Snapshot(ctx, snapshotPath)
	if err != nil {
		return nil, err
	}
	defer releaseDB()
	scopeConfig, err := a.backupEffectiveConfig(snapshotPath)
	if err != nil {
		return nil, err
	}
	if len(a.backupCollectExternalCorePaths(scopeConfig)) > 0 {
		return nil, fmt.Errorf("完整备份暂不支持外置浏览器内核，请先将内核迁入应用管理的 chrome 目录；未生成或覆盖备份文件")
	}
	scope, err := backup.BuildScope(backup.BuildOptions{AppRoot: apppath.StateRoot(a.appRoot), Config: scopeConfig})
	if err != nil {
		return nil, err
	}
	configSnapshot := filepath.Join(staging, "config.yaml")
	if err := scopeConfig.Save(configSnapshot); err != nil {
		return nil, err
	}
	excluded := []string{liveDB, liveDB + "-wal", liveDB + "-shm", configuredDB, configuredDB + "-wal", configuredDB + "-shm"}
	for _, name := range []string{"_xray", "_singbox", "_mihomo"} {
		excluded = append(excluded, filepath.Join(a.backupResolveUserDataRoot(a.config), name))
	}
	entries := scope.Entries[:0]
	for _, entry := range scope.Entries {
		if entry.ID == "system_config_main" {
			entry.SourcePath = configSnapshot
		}
		if entry.Category == backup.CategoryLogs {
			excluded = append(excluded, entry.SourcePath)
			continue
		}
		if backupSamePath(entry.SourcePath, liveDB) || backupSamePath(entry.SourcePath, liveDB+"-wal") || backupSamePath(entry.SourcePath, liveDB+"-shm") {
			continue
		}
		entries = append(entries, entry)
	}
	scope.Entries = append(entries, backup.ScopeEntry{ID: "database_sqlite_main", Category: backup.CategoryAppData, EntryType: backup.EntryTypeFile, Required: true, SourcePath: snapshotPath, ArchivePath: "payload/app/database/app.db", Description: "一致性 SQLite 快照；不含 WAL/SHM。完整备份需关闭实例，运行日志不纳入一致性范围。"})
	mappings, err := a.backupAddProfileData(&scope, snapshotPath, excluded...)
	if err != nil {
		return nil, err
	}
	manifest := backup.BuildManifest(scope, a.appName(), a.appVersion(), time.Now())
	manifest.ProfileData = mappings
	included, skipped, files, err := backupWritePackageZipWithOptions(savePath, scope, manifest, emit, backupArchiveOptions{ctx: ctx, walkExcludedPaths: []string{staging}}, excluded...)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{"cancelled": false, "zipPath": savePath, "includedEntries": included, "skippedEntries": skipped, "fileCount": files, "message": "导出完成"}, nil
}
