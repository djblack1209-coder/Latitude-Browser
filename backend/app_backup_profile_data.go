package backend

import (
	"ant-chrome/backend/internal/backup"
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"crypto/sha256"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

// Use the consistent database copy, including soft-deleted profiles, rather
// than assuming the running manager's active-profile map is the whole catalog.
func (a *App) backupAddProfileData(scope *backup.Scope, snapshotPath string, excluded ...string) ([]backup.ProfileDataMapping, error) {
	db, err := sql.Open("sqlite", snapshotPath)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT profile_id,user_data_dir FROM browser_profiles ORDER BY profile_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type profileDirectory struct{ id, original, resolved string }
	var profiles []profileDirectory
	for rows.Next() {
		var p profileDirectory
		if err := rows.Scan(&p.id, &p.original); err != nil {
			return nil, err
		}
		p.resolved = a.browserMgr.ResolveUserDataDir(&BrowserProfile{ProfileId: p.id, UserDataDir: p.original})
		if backupExcludedPath(p.resolved, excluded) {
			return nil, fmt.Errorf("实例 %s 的目录属于备份排除范围，无法导出完整备份", p.id)
		}
		resolved, err := filepath.EvalSymlinks(p.resolved)
		if err != nil {
			return nil, fmt.Errorf("实例 %s 的必要数据目录不可读取: %w", p.id, err)
		}
		info, err := os.Stat(resolved)
		if err != nil || !info.IsDir() {
			return nil, fmt.Errorf("实例 %s 的数据路径不是可读取目录", p.id)
		}
		p.resolved = resolved
		if _, active := detectBrowserRuntimeByUserDataDir(resolved); active {
			return nil, fmt.Errorf("实例 %s 的数据目录仍被浏览器使用，请先关闭浏览器", p.id)
		}
		if backupExcludedPath(resolved, excluded) {
			return nil, fmt.Errorf("实例 %s 的目录属于备份排除范围，无法导出完整备份", p.id)
		}
		profiles = append(profiles, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Parents precede nested profiles, allowing one archive tree to serve all
	// profiles that intentionally share or overlap a data directory.
	sort.Slice(profiles, func(i, j int) bool { return len(profiles[i].resolved) < len(profiles[j].resolved) })
	var mappings []backup.ProfileDataMapping
	for _, p := range profiles {
		archivePath := ""
		for _, entry := range scope.Entries {
			if entry.EntryType != backup.EntryTypeDir || entry.Category == backup.CategoryLogs {
				continue
			}
			root, err := filepath.EvalSymlinks(entry.SourcePath)
			if err != nil || !backupPathWithin(p.resolved, root) {
				continue
			}
			// A symlink inside a collected tree would be skipped by its walker.
			rel, err := filepath.Rel(root, p.resolved)
			if err != nil {
				return nil, err
			}
			physical := filepath.Join(entry.SourcePath, rel)
			if err := backupCheckPlainDirectoryPath(entry.SourcePath, physical); err != nil {
				continue
			}
			archivePath = path.Join(strings.TrimSuffix(entry.ArchivePath, "/"), filepath.ToSlash(rel))
			break
		}
		covered := archivePath != ""
		if !covered {
			key := fmt.Sprintf("%x", sha256.Sum256([]byte(p.resolved)))[:24]
			archivePath = "payload/browser/profiles/" + key
			scope.Entries = append(scope.Entries, backup.ScopeEntry{ID: "profile_data_" + key, Category: backup.CategoryBrowserData, EntryType: backup.EntryTypeDir, Required: true, SourcePath: p.resolved, ArchivePath: archivePath + "/", Description: "外置实例数据；恢复到本机受控目录"})
		}
		if !covered || filepath.IsAbs(p.original) || !backupPortableRelativePath(p.original) || strings.HasPrefix(archivePath, "payload/browser/profiles/") {
			if _, err := a.backupProfileDataDestination(archivePath); err != nil {
				return nil, fmt.Errorf("实例 %s 的目录布局暂不支持完整备份: %w", p.id, err)
			}
			mappings = append(mappings, backup.ProfileDataMapping{ProfileID: p.id, ArchivePath: archivePath})
		}
	}
	return mappings, nil
}

func (a *App) backupEffectiveConfig(snapshotPath string) (*config.Config, error) {
	db, err := sql.Open("sqlite", snapshotPath)
	if err != nil {
		return nil, err
	}
	defer db.Close()
	cores, err := browser.NewSQLiteCoreDAO(db).List()
	if err != nil {
		return nil, err
	}
	copy := *a.config
	copy.Browser.Cores = cores
	return &copy, nil
}

func backupPortableRelativePath(value string) bool {
	return value != "" && !filepath.IsAbs(value) && !strings.ContainsAny(value, "\\:\x00") && path.Clean(value) == value && value != "." && value != ".." && !strings.HasPrefix(value, "../")
}

func backupCheckPlainDirectoryPath(root, target string) error {
	rel, err := filepath.Rel(root, target)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return fmt.Errorf("数据目录越界")
	}
	current := root
	for _, part := range append([]string{""}, strings.Split(rel, string(filepath.Separator))...) {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil {
			return err
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("数据目录包含符号链接或非目录")
		}
	}
	return nil
}

func (a *App) backupProfileDataDestination(archivePath string) (string, error) {
	if !backupPortableRelativePath(archivePath) {
		return "", fmt.Errorf("实例数据映射路径无效")
	}
	for _, prefix := range []string{"payload/browser/profiles/", "payload/app/data/", "payload/browser/user-data/", "payload/browser/cores/"} {
		if strings.HasPrefix(archivePath, prefix) {
			rel := strings.TrimPrefix(archivePath, prefix)
			if !backupPortableRelativePath(rel) {
				return "", fmt.Errorf("实例数据映射缺少相对目录")
			}
			key := fmt.Sprintf("%x", sha256.Sum256([]byte(prefix)))[:16]
			return a.resolveAppPath(filepath.Join("data", "restored-profiles", key, filepath.FromSlash(rel))), nil
		}
	}
	return "", fmt.Errorf("实例数据映射不在允许的归档范围")
}

// Preflight changes only the private extracted database. A manifest cannot
// authorize restoration to an absolute path from another computer.
func (a *App) backupPrepareProfileData(extractRoot string, manifest backup.Manifest) error {
	if len(manifest.ProfileData) == 0 {
		return nil
	}
	dbPath := backupFindDatabaseFile(filepath.Join(extractRoot, "payload"))
	if dbPath == "" {
		return fmt.Errorf("实例数据映射缺少数据库")
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}
	defer db.Close()
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	seen := map[string]bool{}
	for _, mapping := range manifest.ProfileData {
		if mapping.ProfileID == "" || seen[mapping.ProfileID] {
			return fmt.Errorf("实例数据映射 ID 无效或重复")
		}
		seen[mapping.ProfileID] = true
		dst, err := a.backupProfileDataDestination(mapping.ArchivePath)
		if err != nil {
			return err
		}
		src := filepath.Join(extractRoot, filepath.FromSlash(mapping.ArchivePath))
		if info, err := os.Stat(src); err != nil || !info.IsDir() {
			return fmt.Errorf("实例 %s 缺少必要数据目录", mapping.ProfileID)
		}
		result, err := tx.Exec(`UPDATE browser_profiles SET user_data_dir=? WHERE profile_id=?`, dst, mapping.ProfileID)
		if err != nil {
			return err
		}
		count, err := result.RowsAffected()
		if err != nil || count != 1 {
			return fmt.Errorf("实例数据映射没有匹配的唯一记录")
		}
	}
	return tx.Commit()
}

func (a *App) backupImportProfileData(extractRoot string, manifest backup.Manifest, resetFirst bool, stats *backupMergeStats) error {
	seen := map[string]bool{}
	for _, mapping := range manifest.ProfileData {
		dst, err := a.backupProfileDataDestination(mapping.ArchivePath)
		if err != nil {
			return err
		}
		if seen[dst] {
			continue
		}
		// Merge imports preserve an existing conflicting profile record.
		var actual string
		if err := a.db.GetConn().QueryRow(`SELECT user_data_dir FROM browser_profiles WHERE profile_id=?`, mapping.ProfileID).Scan(&actual); err != nil {
			if !resetFirst && errors.Is(err, sql.ErrNoRows) {
				// A different existing ID can own this directory. The database
				// merge already counted this record as skipped.
				continue
			}
			return err
		}
		if !backupSamePath(actual, dst) {
			continue
		}
		rootPath := a.resolveAppPath("data")
		info, err := os.Lstat(rootPath)
		if err != nil || !info.IsDir() {
			return fmt.Errorf("恢复数据根目录必须为普通目录")
		}
		root, err := os.OpenRoot(rootPath)
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(rootPath, dst)
		if err == nil {
			err = root.MkdirAll(rel, 0700)
		}
		closeErr := root.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
		if err := backupCheckPlainDirectoryPath(rootPath, dst); err != nil {
			return err
		}
		if err := backupSyncDir(filepath.Join(extractRoot, filepath.FromSlash(mapping.ArchivePath)), dst, resetFirst, stats, nil); err != nil {
			return err
		}
		seen[dst] = true
	}
	return nil
}
