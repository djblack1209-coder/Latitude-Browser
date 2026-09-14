package snapshot

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func EnsureDir(appDataRoot, profileID string) (string, error) {
	if profileID == "" || profileID == "." || profileID == ".." || strings.ContainsAny(profileID, "/\\:\x00") {
		return "", fmt.Errorf("实例 ID 无效")
	}
	dir := filepath.Join(appDataRoot, "snapshots", profileID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

func FindFiles(snapDir, snapshotID string) (metaPath, zipPath string, err error) {
	if snapshotID == "" || snapshotID == "." || snapshotID == ".." || strings.ContainsAny(snapshotID, "/\\:\x00") {
		return "", "", fmt.Errorf("快照 ID 无效")
	}
	entries, err := os.ReadDir(snapDir)
	if err != nil {
		return "", "", err
	}
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), snapshotID+"_") && strings.HasSuffix(entry.Name(), ".meta.json") {
			metaPath = filepath.Join(snapDir, entry.Name())
			zipPath = strings.TrimSuffix(metaPath, ".meta.json") + ".zip"
			if _, err := os.Stat(zipPath); err != nil {
				return "", "", fmt.Errorf("快照文件不存在: %s", zipPath)
			}
			return metaPath, zipPath, nil
		}
	}
	return "", "", fmt.Errorf("快照不存在: %s", snapshotID)
}
