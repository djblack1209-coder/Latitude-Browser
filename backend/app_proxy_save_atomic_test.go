package backend

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/database"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
)

func TestSaveBrowserProxiesRollsBackDatabaseAndMemory(t *testing.T) {
	db, err := database.NewDB(filepath.Join(t.TempDir(), "proxies.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatal(err)
	}
	dao := browser.NewSQLiteProxyDAO(db.GetConn())
	old := BrowserProxy{ProxyId: "old", ProxyName: "old", ProxyConfig: "http://127.0.0.1:9"}
	if err := dao.Upsert(old); err != nil {
		t.Fatal(err)
	}
	if _, err := db.GetConn().Exec(`CREATE TRIGGER fail_proxy_insert BEFORE INSERT ON browser_proxies WHEN NEW.proxy_id = 'reject' BEGIN SELECT RAISE(FAIL, 'injected storage failure'); END;`); err != nil {
		t.Fatal(err)
	}
	cfg := config.DefaultConfig()
	cfg.Browser.Proxies = []BrowserProxy{old}
	mgr := browser.NewManager(cfg, t.TempDir())
	mgr.ProxyDAO = dao
	a := &App{config: cfg, browserMgr: mgr}
	before, err := dao.List()
	if err != nil {
		t.Fatal(err)
	}
	next := []BrowserProxy{
		{ProxyId: "first", ProxyName: "first", ProxyConfig: "http://127.0.0.1:10"},
		{ProxyId: "reject", ProxyName: "reject", ProxyConfig: "http://127.0.0.1:11"},
	}
	if err := a.SaveBrowserProxies(next); err == nil {
		t.Fatal("expected injected storage failure")
	}
	after, err := dao.List()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(after, before) {
		t.Errorf("failed save changed persisted proxies: got %v, want %v", after, before)
	}
	if !reflect.DeepEqual(cfg.Browser.Proxies, []BrowserProxy{old}) {
		t.Error("failed save changed in-memory proxies")
	}
	if _, err := db.GetConn().Exec(`DROP TRIGGER fail_proxy_insert`); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveBrowserProxies(next); err != nil {
		t.Fatal(err)
	}
	after, err = dao.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(after) != 3 {
		t.Fatalf("committed proxy count = %d, want direct plus 2", len(after))
	}
	for _, p := range after {
		if p.ProxyId == "old" {
			t.Fatal("successful replacement retained old proxy")
		}
	}
	if len(cfg.Browser.Proxies) != 3 {
		t.Fatal("committed catalog was not published in memory")
	}
}

func TestSaveBrowserProxiesTransactionFailuresAndConcurrentSaves(t *testing.T) {
	for _, failure := range []string{"delete", "commit", "begin", "concurrent"} {
		t.Run(failure, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "proxies.db")
			db, err := database.NewDB(path)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			if err := db.Migrate(); err != nil {
				t.Fatal(err)
			}
			dao := browser.NewSQLiteProxyDAO(db.GetConn())
			old := BrowserProxy{ProxyId: "old", ProxyName: "old", ProxyConfig: "direct://"}
			if err := dao.Upsert(old); err != nil {
				t.Fatal(err)
			}
			cfg := config.DefaultConfig()
			cfg.Browser.Proxies = []BrowserProxy{old}
			mgr := browser.NewManager(cfg, t.TempDir())
			mgr.ProxyDAO = dao
			a := &App{config: cfg, browserMgr: mgr}
			switch failure {
			case "delete":
				_, err = db.GetConn().Exec(`CREATE TRIGGER fail_delete BEFORE DELETE ON browser_proxies BEGIN SELECT RAISE(ABORT, 'delete failed'); END`)
			case "commit":
				_, err = db.GetConn().Exec(`CREATE TABLE guard (id TEXT REFERENCES browser_proxies(proxy_id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER fail_commit AFTER INSERT ON browser_proxies BEGIN INSERT INTO guard VALUES ('missing'); END`)
			case "begin":
				err = db.Close()
			}
			if err != nil {
				t.Fatal(err)
			}
			if failure == "concurrent" {
				start := make(chan struct{})
				stopReader, readerDone := make(chan struct{}), make(chan struct{})
				go func() {
					defer close(readerDone)
					for {
						select {
						case <-stopReader:
							return
						default:
							a.BrowserProxyList()
							a.getLatestProxies()
						}
					}
				}()
				var wg sync.WaitGroup
				for _, name := range []string{"one", "two", "three"} {
					wg.Add(1)
					go func(name string) {
						defer wg.Done()
						<-start
						if err := a.SaveBrowserProxies([]BrowserProxy{{ProxyId: name, ProxyName: name, ProxyConfig: "direct://", PreferredKernel: "auto", GroupName: name}}); err != nil {
							t.Error(err)
						}
					}(name)
				}
				close(start)
				wg.Wait()
				close(stopReader)
				<-readerDone
				rows, err := dao.List()
				if err != nil {
					t.Fatal(err)
				}
				if len(rows) != 2 || len(cfg.Browser.Proxies) != 2 {
					t.Fatalf("unexpected catalog sizes: %d %d", len(rows), len(cfg.Browser.Proxies))
				}
				for i, row := range rows {
					want := cfg.Browser.Proxies[i]
					if row.ProxyId != want.ProxyId || row.ProxyName != want.ProxyName || row.ProxyConfig != want.ProxyConfig || row.PreferredKernel != want.PreferredKernel || row.GroupName != want.GroupName || row.SortOrder != want.SortOrder {
						t.Fatalf("database and memory differ at %d", i)
					}
				}
				return
			}
			if err := a.SaveBrowserProxies(nil); err == nil {
				t.Fatal("expected transaction failure")
			}
			if !reflect.DeepEqual(cfg.Browser.Proxies, []BrowserProxy{old}) {
				t.Error("failure published memory")
			}
			check, err := database.NewDB(path)
			if err != nil {
				t.Fatal(err)
			}
			defer check.Close()
			rows, err := browser.NewSQLiteProxyDAO(check.GetConn()).List()
			if err != nil {
				t.Fatal(err)
			}
			if len(rows) != 1 || rows[0].ProxyId != "old" {
				t.Fatalf("failure changed persisted catalog: %v", rows)
			}
		})
	}
}

func TestSaveBrowserProxiesFileFailurePreservesMemory(t *testing.T) {
	root := t.TempDir()
	cfg := config.DefaultConfig()
	old := []BrowserProxy{{ProxyId: "old", ProxyName: "old", ProxyConfig: "direct://"}}
	cfg.Browser.Proxies = old
	// An existing directory is not a valid destination for a YAML file.
	a := &App{appRoot: root, config: cfg, browserMgr: browser.NewManager(cfg, root)}
	if err := os.MkdirAll(a.resolveAppPath("proxies.yaml"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := a.SaveBrowserProxies(nil); err == nil {
		t.Fatal("expected file replacement failure")
	}
	if !reflect.DeepEqual(cfg.Browser.Proxies, old) {
		t.Fatal("failed file save changed in-memory proxies")
	}
}
