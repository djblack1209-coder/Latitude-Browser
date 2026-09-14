package backend

import (
	"ant-chrome/backend/internal/proxy"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func addMaintenanceProxyManagers(t *testing.T, a *App) {
	t.Helper()
	a.xrayMgr = proxy.NewXrayManager(a.config, a.appRoot)
	a.singboxMgr = proxy.NewSingBoxManager(a.config, a.appRoot)
	a.clashMgr = proxy.NewClashManager(a.config, a.appRoot)
	t.Cleanup(func() { a.xrayMgr.StopAll(); a.singboxMgr.StopAll(); a.clashMgr.StopAll() })
}
func assertProxyManagersAdmitAfterMaintenance(t *testing.T, a *App) {
	t.Helper()
	for _, acquire := range []func(string, []BrowserProxy, string) (string, string, error){a.xrayMgr.AcquireBridge, a.singboxMgr.AcquireBridge, a.clashMgr.AcquireNodeBridge} {
		_, _, err := acquire("invalid-fixture://", nil, "")
		if err != nil && strings.Contains(err.Error(), "管理器已停止") {
			t.Fatalf("maintenance left a stopped proxy manager: %v", err)
		}
	}
}

func TestProxyRuntimeMaintenanceResumesAfterResetFailures(t *testing.T) {
	for _, failure := range []string{"save-config", "clear-tables", "success"} {
		t.Run(failure, func(t *testing.T) {
			a := newBackupTestApp(t)
			enableBackupImportDAOs(t, a)
			addMaintenanceProxyManagers(t, a)
			a.startupInitSpeedScheduler()
			beforeScheduler := a.speedScheduler
			switch failure {
			case "save-config":
				if err := os.Chmod(filepath.Join(a.appRoot, "config.yaml"), 0400); err != nil {
					t.Fatal(err)
				}
			case "clear-tables":
				if _, err := a.db.GetConn().Exec(`INSERT INTO browser_groups(group_id,group_name) VALUES('keep','Keep'); CREATE TRIGGER block_group_delete BEFORE DELETE ON browser_groups BEGIN SELECT RAISE(ABORT,'injected deletion failure'); END`); err != nil {
					t.Fatal(err)
				}
			}
			_, err := a.backupInitializeLocked(true)
			if failure == "success" && err != nil {
				t.Fatal(err)
			}
			if failure != "success" && err == nil {
				t.Fatal("injected reset failure accepted")
			}
			assertProxyManagersAdmitAfterMaintenance(t, a)
			if a.speedScheduler == nil || a.speedScheduler == beforeScheduler {
				t.Fatal("maintenance did not restore prior background scheduler")
			}
		})
	}
}

func TestProxyRuntimeMaintenanceKeepsNestedResetStopped(t *testing.T) {
	a := newBackupTestApp(t)
	enableBackupImportDAOs(t, a)
	addMaintenanceProxyManagers(t, a)
	if _, err := a.backupInitializeLockedNoLifecycle(false); err != nil {
		t.Fatal(err)
	}
	if _, _, err := a.clashMgr.AcquireNodeBridge("direct://", nil, ""); err == nil {
		t.Fatal("nested reset reopened admission before outer import finished")
	}
	if err := a.backupResumeProxyRuntimes(); err != nil {
		t.Fatal(err)
	}
	assertProxyManagersAdmitAfterMaintenance(t, a)
}
