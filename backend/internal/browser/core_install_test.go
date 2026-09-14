package browser

import (
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/database"
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

func coreInstallFixtureServer(t *testing.T) *httptest.Server {
	t.Helper()
	var buffer bytes.Buffer
	w := zip.NewWriter(&buffer)
	name := "chrome"
	if runtime.GOOS == "windows" {
		name = "chrome.exe"
	}
	header := &zip.FileHeader{Name: "bundle/" + name, Method: zip.Deflate}
	header.SetMode(0755)
	entry, err := w.CreateHeader(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = entry.Write([]byte("synthetic test executable")); err != nil {
		t.Fatal(err)
	}
	if err = w.Close(); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write(buffer.Bytes()) }))
	t.Cleanup(server.Close)
	return server
}

func coreInstallFixtureManager(t *testing.T) (*Manager, string) {
	t.Helper()
	root := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.Browser.Cores = []config.BrowserCore{{CoreId: "old", CoreName: "Saved", CorePath: "chrome/saved"}, {CoreId: "default", CoreName: "Default", CorePath: "chrome/default", IsDefault: true}}
	m := NewManager(cfg, root)
	target := filepath.Join(root, "chrome", "saved")
	if err := os.MkdirAll(target, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "old-marker"), []byte("old working core"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := cfg.Save(filepath.Join(root, "config.yaml")); err != nil {
		t.Fatal(err)
	}
	return m, target
}

func TestCoreInstallCommitFailurePreservesDirectoryAndCatalog(t *testing.T) {
	for _, failure := range []string{"file-save", "upsert"} {
		t.Run(failure, func(t *testing.T) {
			m, target := coreInstallFixtureManager(t)
			if failure == "file-save" {
				if err := os.Chmod(filepath.Join(m.AppRoot, "config.yaml"), 0400); err != nil {
					t.Fatal(err)
				}
			} else {
				db, err := database.NewDB(filepath.Join(t.TempDir(), "cores.db"))
				if err != nil {
					t.Fatal(err)
				}
				defer db.Close()
				if err := db.Migrate(); err != nil {
					t.Fatal(err)
				}
				dao := NewSQLiteCoreDAO(db.GetConn())
				for _, core := range m.Config.Browser.Cores {
					if err := dao.Upsert(core); err != nil {
						t.Fatal(err)
					}
				}
				m.CoreDAO = dao
				if _, err := db.GetConn().Exec(`CREATE TRIGGER reject_core BEFORE INSERT ON browser_cores WHEN NEW.core_id='old' BEGIN SELECT RAISE(ABORT,'injected upsert failure'); END`); err != nil {
					t.Fatal(err)
				}
			}
			before := m.ListCores()
			memoryBefore := append([]Core(nil), m.Config.Browser.Cores...)
			configBefore, err := os.ReadFile(filepath.Join(m.AppRoot, "config.yaml"))
			if err != nil {
				t.Fatal(err)
			}
			server := coreInstallFixtureServer(t)
			failureMessage := ""
			m.downloadAndExtractCoreWithProgress(context.Background(), CoreInput{CoreId: "old", CoreName: "Replacement", CorePath: "chrome/saved", IsDefault: true}, server.URL+"/core.zip", "direct://", true, func(phase string, _ int, message string) {
				if phase == "done" {
					t.Error("failed commit emitted done")
				}
				if phase == "error" {
					failureMessage = message
				}
			})
			if !strings.Contains(failureMessage, "保存配置") {
				t.Fatalf("wrong failure stage: %s", failureMessage)
			}
			if data, err := os.ReadFile(filepath.Join(target, "old-marker")); err != nil || string(data) != "old working core" {
				t.Fatalf("old core lost: %q %v", data, err)
			}
			if !reflect.DeepEqual(before, m.ListCores()) || !reflect.DeepEqual(memoryBefore, m.Config.Browser.Cores) {
				t.Fatal("failed save changed persisted or in-memory catalog/default flags")
			}
			if after, _ := os.ReadFile(filepath.Join(m.AppRoot, "config.yaml")); !bytes.Equal(configBefore, after) {
				t.Fatal("failed save changed configuration file")
			}
		})
	}
}

func TestCoreInstallDirectoryFailuresAndCommitPoint(t *testing.T) {
	for _, failure := range []string{"publish", "save", "rollback", "cancel-before-save", "cancel-after-commit", "success"} {
		t.Run(failure, func(t *testing.T) {
			root := t.TempDir()
			target := filepath.Join(root, "target")
			stage := filepath.Join(root, "stage")
			for dir, content := range map[string]string{target: "old", stage: "new"} {
				if err := os.Mkdir(dir, 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(dir, "marker"), []byte(content), 0600); err != nil {
					t.Fatal(err)
				}
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			saved := false
			rename := func(from, to string) error {
				if failure == "publish" && from == stage {
					return errors.New("injected publish failure")
				}
				if failure == "rollback" && strings.Contains(from, ".previous-") {
					return errors.New("injected rollback failure")
				}
				err := os.Rename(from, to)
				if err == nil && failure == "cancel-before-save" && from == stage {
					cancel()
				}
				return err
			}
			err := installCoreDirectory(ctx, target, stage, true, func() error {
				saved = true
				if failure == "save" || failure == "rollback" {
					return errors.New("injected save failure")
				}
				if failure == "cancel-after-commit" {
					cancel()
				}
				return nil
			}, rename)
			success := failure == "success" || failure == "cancel-after-commit"
			if (err == nil) != success {
				t.Fatalf("commit result: %v", err)
			}
			if failure == "cancel-before-save" && saved {
				t.Fatal("cancelled install saved configuration")
			}
			if failure == "rollback" {
				previous, _ := filepath.Glob(filepath.Join(root, ".target.previous-*"))
				if len(previous) != 1 {
					t.Fatalf("last old copy missing: %v", previous)
				}
				if data, _ := os.ReadFile(filepath.Join(previous[0], "marker")); string(data) != "old" {
					t.Fatal("rollback destroyed old copy")
				}
				if !strings.Contains(err.Error(), previous[0]) {
					t.Fatal("rollback failure omitted recovery path")
				}
			} else {
				want := "old"
				if success {
					want = "new"
				}
				if data, _ := os.ReadFile(filepath.Join(target, "marker")); string(data) != want {
					t.Fatalf("target content %q want %q", data, want)
				}
			}
		})
	}
}

func TestCoreInstallTaskSuccessAndExtractionCancellation(t *testing.T) {
	for _, mode := range []string{"first", "replace", "cancel-extract"} {
		t.Run(mode, func(t *testing.T) {
			m, target := coreInstallFixtureManager(t)
			input := CoreInput{CoreId: "old", CoreName: "Replacement", CorePath: "chrome/saved", IsDefault: true}
			replace := true
			if mode == "first" {
				input = CoreInput{CoreName: "New Core", CorePath: "chrome/new"}
				target = filepath.Join(m.AppRoot, "chrome/new")
				replace = false
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			done, failed := false, false
			server := coreInstallFixtureServer(t)
			m.downloadAndExtractCoreWithProgress(ctx, input, server.URL+"/core.zip", "direct://", replace, func(phase string, _ int, _ string) {
				if phase == "extracting" && mode == "cancel-extract" {
					cancel()
				}
				done = done || phase == "done"
				failed = failed || phase == "error"
			})
			if mode == "cancel-extract" {
				if done || !failed {
					t.Fatal("cancelled extraction reported success")
				}
				if data, _ := os.ReadFile(filepath.Join(target, "old-marker")); string(data) != "old working core" {
					t.Fatal("cancellation changed old directory")
				}
				return
			}
			if !done || failed {
				t.Fatal("valid task did not finish")
			}
			if _, _, ok := FindCoreExecutable(target); !ok {
				t.Fatal("success did not install executable")
			}
			found := false
			for _, core := range m.ListCores() {
				if core.CorePath == input.CorePath && core.CoreName == input.CoreName {
					found = true
				}
			}
			if !found {
				t.Fatal("successful install did not save catalog")
			}
		})
	}
}

func TestCoreInstallRejectsConcurrentTask(t *testing.T) {
	m, _ := coreInstallFixtureManager(t)
	server := coreInstallFixtureServer(t)
	entered, resume, finished := make(chan struct{}), make(chan struct{}), make(chan struct{})
	input := CoreInput{CoreId: "old", CoreName: "Replacement", CorePath: "chrome/saved", IsDefault: true}
	go func() {
		defer close(finished)
		first := true
		m.downloadAndExtractCoreWithProgress(context.Background(), input, server.URL+"/core.zip", "direct://", true, func(_ string, _ int, _ string) {
			if first {
				first = false
				close(entered)
				<-resume
			}
		})
	}()
	<-entered
	rejected := false
	m.downloadAndExtractCoreWithProgress(context.Background(), input, server.URL+"/core.zip", "direct://", true, func(phase string, _ int, message string) {
		rejected = phase == "error" && strings.Contains(message, "安装正在进行")
	})
	close(resume)
	<-finished
	if !rejected {
		t.Fatal("concurrent install was not rejected")
	}
}
