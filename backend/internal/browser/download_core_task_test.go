package browser

import (
	"ant-chrome/backend/internal/config"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

type failingCoreFinalizer struct {
	syncErr, closeErr error
	synced, closed    bool
}

func (f *failingCoreFinalizer) Sync() error  { f.synced = true; return f.syncErr }
func (f *failingCoreFinalizer) Close() error { f.closed = true; return f.closeErr }
func TestDownloadFinalizationRejectsSyncAndCloseFailures(t *testing.T) {
	failure := errors.New("injected storage failure")
	for _, stage := range []string{"transfer", "sync", "close", "success"} {
		t.Run(stage, func(t *testing.T) {
			f := &failingCoreFinalizer{}
			if stage == "sync" {
				f.syncErr = failure
			}
			if stage == "close" {
				f.closeErr = failure
			}
			err := finishCoreDownload(f, func() error {
				if stage == "transfer" {
					return failure
				}
				return nil
			})
			if (err == nil) != (stage == "success") {
				t.Fatalf("finalization result: %v", err)
			}
			if stage == "transfer" && f.synced {
				t.Fatal("continued after failed transfer")
			}
			if stage == "success" && (!f.synced || !f.closed) {
				t.Fatal("success before sync and close")
			}
		})
	}
}
func TestDownloadTaskFailurePreservesInstalledCore(t *testing.T) {
	root := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.Browser.Cores = []config.BrowserCore{{CoreId: "existing", CoreName: "saved", CorePath: "chrome/saved", IsDefault: true}}
	m := NewManager(cfg, root)
	before := append([]Core(nil), m.ListCores()...)
	target := filepath.Join(root, "chrome", "saved")
	if err := os.MkdirAll(target, 0700); err != nil {
		t.Fatal(err)
	}
	keep := filepath.Join(target, "existing-browser")
	os.WriteFile(keep, []byte("old working core"), 0700)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Range") == "bytes=0-0" {
			w.Header().Set("Content-Range", "bytes 0-0/800")
			w.Header().Set("ETag", `"same"`)
			w.WriteHeader(206)
			w.Write([]byte("x"))
			return
		}
		w.WriteHeader(500)
	}))
	defer srv.Close()
	failed := false
	m.downloadAndExtractCoreWithProgress(context.Background(), CoreInput{CoreId: "existing", CoreName: "saved", CorePath: "chrome/saved", IsDefault: true}, srv.URL, "direct://", true, func(phase string, _ int, _ string) {
		if phase == "error" {
			failed = true
		}
		if phase == "done" || phase == "extracting" {
			t.Errorf("failure advanced to %s", phase)
		}
	})
	if !failed {
		t.Fatal("task did not report error")
	}
	data, err := os.ReadFile(keep)
	if err != nil || string(data) != "old working core" {
		t.Fatalf("old core damaged: %s %v", data, err)
	}
	if !reflect.DeepEqual(before, m.ListCores()) {
		t.Fatal("failed download changed core configuration")
	}
	files, _ := os.ReadDir(filepath.Dir(target))
	for _, file := range files {
		if file.Name() != "saved" {
			t.Error(fmt.Sprintf("temporary artifact leaked: %s", file.Name()))
		}
	}
}
