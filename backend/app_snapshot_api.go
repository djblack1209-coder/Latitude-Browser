package backend

import (
	"ant-chrome/backend/internal/fsutil"
	"ant-chrome/backend/internal/snapshot"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

// getProfileForSnapshot 获取实例信息（加锁）
func (a *App) getProfileForSnapshot(profileId string) (*BrowserProfile, error) {
	a.browserMgr.Mutex.Lock()
	defer a.browserMgr.Mutex.Unlock()
	profile, exists := a.browserMgr.Profiles[profileId]
	if !exists {
		return nil, fmt.Errorf("实例不存在: %s", profileId)
	}
	return copyBrowserProfileSnapshot(profile), nil
}

// beginSnapshotMaintenance leaves the short Manager lock available for reads,
// while excluding profile mutations and all starts until the caller releases it.
func (a *App) beginSnapshotMaintenance(profileID string) (*BrowserProfile, func(), error) {
	a.maintenanceMu.Lock()
	endActivity, err := a.dataActivity.freeze()
	if err != nil {
		a.maintenanceMu.Unlock()
		return nil, nil, err
	}
	a.torLifecycleMu.Lock()
	endData, err := a.browserMgr.BeginDataMaintenance()
	if err != nil {
		a.torLifecycleMu.Unlock()
		endActivity()
		a.maintenanceMu.Unlock()
		return nil, nil, err
	}
	release := func() { endData(); a.torLifecycleMu.Unlock(); endActivity(); a.maintenanceMu.Unlock() }
	profile, err := a.getProfileForSnapshot(profileID)
	if err != nil {
		release()
		return nil, nil, err
	}
	if profile.Running {
		release()
		return nil, nil, fmt.Errorf("请先停止实例再操作快照")
	}
	if _, active := detectBrowserRuntimeByUserDataDir(a.browserMgr.ResolveUserDataDir(profile)); active {
		release()
		return nil, nil, fmt.Errorf("请先停止使用该数据目录的浏览器")
	}
	return profile, release, nil
}

// BrowserSnapshotCreate 创建快照
func (a *App) BrowserSnapshotCreate(profileId, name string) (SnapshotInfo, error) {
	profile, release, err := a.beginSnapshotMaintenance(profileId)
	if err != nil {
		return SnapshotInfo{}, err
	}
	defer release()

	userDataDir := a.browserMgr.ResolveUserDataDir(profile)
	if err := snapshot.RecoverRestore(userDataDir); err != nil {
		return SnapshotInfo{}, err
	}
	if _, err := os.Stat(userDataDir); os.IsNotExist(err) {
		return SnapshotInfo{}, fmt.Errorf("用户数据目录不存在，无法创建快照")
	}

	snapDir, err := a.snapshotDir(profileId)
	if err != nil {
		return SnapshotInfo{}, err
	}

	snapshotID := uuid.NewString()
	safeName := strings.ReplaceAll(name, string(os.PathSeparator), "_")
	zipPath := filepath.Join(snapDir, snapshotID+"_"+safeName+".zip")
	metaPath := filepath.Join(snapDir, snapshotID+"_"+safeName+".meta.json")

	if err := snapshot.ZipDir(userDataDir, zipPath); err != nil {
		return SnapshotInfo{}, fmt.Errorf("压缩失败: %w", err)
	}
	published := false
	defer func() {
		if !published {
			_ = os.Remove(zipPath)
			_ = os.Remove(metaPath)
		}
	}()

	fi, err := os.Stat(zipPath)
	if err != nil {
		return SnapshotInfo{}, err
	}
	sizeMB := float64(fi.Size()) / 1024 / 1024

	info := SnapshotInfo{
		SnapshotId: snapshotID,
		ProfileId:  profileId,
		Name:       name,
		SizeMB:     sizeMB,
		CreatedAt:  time.Now().Format(time.RFC3339),
		FilePath:   zipPath,
	}

	metaData, err := json.Marshal(info)
	if err != nil {
		return SnapshotInfo{}, err
	}
	if err := fsutil.AtomicWriteFile(metaPath, metaData, 0o600); err != nil {
		return SnapshotInfo{}, err
	}
	published = true

	info.FilePath = ""
	return info, nil
}

// BrowserSnapshotList 列出实例的所有快照
func (a *App) BrowserSnapshotList(profileId string) ([]SnapshotInfo, error) {
	snapDir, err := a.snapshotDir(profileId)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(snapDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []SnapshotInfo{}, nil
		}
		return nil, err
	}

	var list []SnapshotInfo
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".meta.json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(snapDir, entry.Name()))
		if err != nil {
			continue
		}
		var info SnapshotInfo
		if err := json.Unmarshal(data, &info); err != nil {
			continue
		}
		info.FilePath = ""
		list = append(list, info)
	}

	sort.Slice(list, func(i, j int) bool {
		return list[i].CreatedAt > list[j].CreatedAt
	})
	return list, nil
}

// BrowserSnapshotRestore 恢复快照
func (a *App) BrowserSnapshotRestore(profileId, snapshotId string) error {
	profile, release, err := a.beginSnapshotMaintenance(profileId)
	if err != nil {
		return err
	}
	defer release()

	snapDir, err := a.snapshotDir(profileId)
	if err != nil {
		return err
	}

	metaPath, zipPath, err := snapshot.FindFiles(snapDir, snapshotId)
	if err != nil {
		return err
	}
	_ = metaPath

	userDataDir := a.browserMgr.ResolveUserDataDir(profile)
	return snapshot.RestoreDirectory(zipPath, userDataDir)
}

// BrowserSnapshotDelete 删除快照
func (a *App) BrowserSnapshotDelete(profileId, snapshotId string) error {
	a.maintenanceMu.Lock()
	defer a.maintenanceMu.Unlock()
	snapDir, err := a.snapshotDir(profileId)
	if err != nil {
		return err
	}
	metaPath, zipPath, err := snapshot.FindFiles(snapDir, snapshotId)
	if err != nil {
		return err
	}
	if err := os.Remove(zipPath); err != nil {
		return err
	}
	if err := os.Remove(metaPath); err != nil {
		return err
	}
	return nil
}
