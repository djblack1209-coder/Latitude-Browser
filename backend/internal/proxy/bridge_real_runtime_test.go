package proxy

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"ant-chrome/backend/internal/config"
)

// Opt-in launch of pinned local executables. Configuration and process state
// are private fixtures; no real subscriptions, credentials or public servers.
func TestBridgeLocalRuntimeProcessesAndRecovery(t *testing.T) {
	binaries := os.Getenv("LATITUDE_TEST_PROXY_RUNTIMES")
	if binaries == "" {
		t.Skip("set LATITUDE_TEST_PROXY_RUNTIMES to the local runtime directory")
	}
	if !filepath.IsAbs(binaries) {
		t.Fatal("runtime directory must be absolute")
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "CONNECT" {
			c, rw, err := w.(http.Hijacker).Hijack()
			if err != nil {
				return
			}
			defer c.Close()
			c.SetDeadline(time.Now().Add(5 * time.Second))
			rw.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n")
			rw.Flush()
			next, err := http.ReadRequest(rw.Reader)
			if err != nil {
				return
			}
			next.Body.Close()
			resp := &http.Response{StatusCode: 200, ProtoMajor: 1, ProtoMinor: 1, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("local runtime witness")), ContentLength: 21}
			resp.Write(c)
			return
		}
		w.Write([]byte("local runtime witness"))
	}))
	defer upstream.Close()
	for _, engine := range []string{"mihomo", "xray", "sing-box"} {
		t.Run(engine, func(t *testing.T) {
			binary := filepath.Join(binaries, engine)
			if info, err := os.Stat(binary); err != nil || !info.Mode().IsRegular() {
				t.Fatalf("required runtime missing: %s %v", binary, err)
			}
			cfg := config.DefaultConfig()
			cfg.Browser.ClashBinaryPath = filepath.Join(binaries, "mihomo")
			cfg.Browser.XrayBinaryPath = filepath.Join(binaries, "xray")
			cfg.Browser.SingBoxBinaryPath = filepath.Join(binaries, "sing-box")
			cfg.Browser.UserDataRoot = "data"
			root := t.TempDir()
			var acquire func() (string, string, error)
			var release func(string)
			var stop func() error
			var kill func()
			var current func() (int, int, int, bool)
			var mihomo *ClashManager
			switch engine {
			case "mihomo":
				m := NewClashManager(cfg, root)
				mihomo = m
				key := computeNodeKey(upstream.URL + "\x00mihomo")
				acquire = func() (string, string, error) { return m.AcquireNodeBridge(upstream.URL, nil, "") }
				release = m.ReleaseNodeBridge
				stop = m.StopAll
				kill = func() {
					m.mu.Lock()
					b := m.NodeBridges[key]
					m.mu.Unlock()
					if b == nil {
						t.Fatal("missing running bridge")
					}
					b.Cmd.Process.Kill()
					<-b.ExitDone
				}
				current = func() (int, int, int, bool) {
					m.mu.Lock()
					defer m.mu.Unlock()
					b := m.NodeBridges[key]
					if b == nil {
						return 0, 0, 0, false
					}
					return b.Pid, b.Port, b.RefCount, b.Running && !processExited(b.ExitDone)
				}
			case "xray":
				m := NewXrayManager(cfg, root)
				src := "vless://00000000-0000-4000-8000-000000000001@127.0.0.1:9?encryption=none"
				key := computeNodeKey(src + "\x00")
				acquire = func() (string, string, error) { return m.AcquireBridge(src, nil, "") }
				release = m.ReleaseBridge
				stop = m.StopAll
				kill = func() {
					m.mu.Lock()
					b := m.Bridges[key]
					m.mu.Unlock()
					if b == nil {
						t.Fatal("missing running bridge")
					}
					b.Cmd.Process.Kill()
					<-b.ExitDone
				}
				current = func() (int, int, int, bool) {
					m.mu.Lock()
					defer m.mu.Unlock()
					b := m.Bridges[key]
					if b == nil {
						return 0, 0, 0, false
					}
					return b.Pid, b.Port, b.RefCount, b.Running && !processExited(b.ExitDone)
				}
			case "sing-box":
				m := NewSingBoxManager(cfg, root)
				src := "hysteria2://fixture@127.0.0.1:9?sni=localhost"
				key := computeNodeKey(src)
				acquire = func() (string, string, error) { return m.AcquireBridge(src, nil, "") }
				release = m.ReleaseBridge
				stop = m.StopAll
				kill = func() {
					m.mu.Lock()
					b := m.Bridges[key]
					m.mu.Unlock()
					if b == nil {
						t.Fatal("missing running bridge")
					}
					b.Cmd.Process.Kill()
					<-b.ExitDone
				}
				current = func() (int, int, int, bool) {
					m.mu.Lock()
					defer m.mu.Unlock()
					b := m.Bridges[key]
					if b == nil {
						return 0, 0, 0, false
					}
					return b.Pid, b.Port, b.RefCount, b.Running && !processExited(b.ExitDone)
				}
			}
			t.Cleanup(func() {
				if err := stop(); err != nil {
					t.Error(err)
				}
			})
			_, token, err := acquire()
			if err != nil {
				t.Fatal(err)
			}
			oldPID, oldPort, refs, running := current()
			if !running || refs != 1 {
				t.Fatalf("runtime not pinned: %d %v", refs, running)
			}
			kill()
			if engine == "mihomo" {
				_, newToken, err := acquire()
				if err != nil {
					t.Fatal(err)
				}
				release(token)
				token = newToken
			} else {
				deadline := time.Now().Add(8 * time.Second)
				for {
					pid, port, refs, ready := current()
					if ready && pid != oldPID {
						if port != oldPort || refs != 1 {
							t.Fatalf("same-port recovery lost lease: %d %d", port, refs)
						}
						break
					}
					if time.Now().After(deadline) {
						t.Fatal("pinned runtime did not recover")
					}
					time.Sleep(20 * time.Millisecond)
				}
			}
			if _, _, refs, ready := current(); !ready || refs != 1 {
				t.Fatalf("replacement reference mismatch: %d %v", refs, ready)
			}
			if mihomo != nil {
				client, err := BuildProxyHTTPClient(upstream.URL, "", nil, nil, nil, mihomo, config.BrowserConnectorMihomo, 5*time.Second)
				if err != nil {
					t.Fatal(err)
				}
				resp, err := client.Get("http://fixture.invalid/witness")
				if err != nil {
					t.Fatal(err)
				}
				body, err := io.ReadAll(resp.Body)
				resp.Body.Close()
				client.CloseIdleConnections()
				if err != nil || string(body) != "local runtime witness" {
					t.Fatalf("actual Mihomo witness: %q %v", body, err)
				}
			}
			release(token)
			if _, _, refs, _ := current(); refs != 0 {
				t.Fatalf("release after recovery left %d references", refs)
			}
			if err := stop(); err != nil {
				t.Fatal(err)
			}
			if _, _, _, running := current(); running {
				t.Fatal("runtime survived shutdown")
			}
			t.Log(fmt.Sprintf("%s actual local executable: acquire, owned kill/recovery, release, confirmed shutdown passed", engine))
		})
	}
}

func TestBridgeLocalRuntimeStopDuringActualStartup(t *testing.T) {
	binaries := os.Getenv("LATITUDE_TEST_PROXY_RUNTIMES")
	if binaries == "" {
		t.Skip("requires explicitly selected local runtime directory")
	}
	for _, engine := range []string{"mihomo", "xray", "sing-box"} {
		t.Run(engine, func(t *testing.T) {
			cfg := config.DefaultConfig()
			cfg.Browser.UserDataRoot = "data"
			cfg.Browser.ClashBinaryPath = filepath.Join(binaries, "mihomo")
			cfg.Browser.XrayBinaryPath = filepath.Join(binaries, "xray")
			cfg.Browser.SingBoxBinaryPath = filepath.Join(binaries, "sing-box")
			var life *bridgeLifecycle
			var acquire func() (string, string, error)
			var stop func() error
			switch engine {
			case "mihomo":
				m := NewClashManager(cfg, t.TempDir())
				life = &m.lifecycle
				acquire = func() (string, string, error) { return m.AcquireNodeBridge("http://127.0.0.1:9", nil, "") }
				stop = m.StopAll
			case "xray":
				m := NewXrayManager(cfg, t.TempDir())
				life = &m.lifecycle
				acquire = func() (string, string, error) {
					return m.AcquireBridge("vless://00000000-0000-4000-8000-000000000001@127.0.0.1:9?encryption=none", nil, "")
				}
				stop = m.StopAll
			case "sing-box":
				m := NewSingBoxManager(cfg, t.TempDir())
				life = &m.lifecycle
				acquire = func() (string, string, error) {
					return m.AcquireBridge("hysteria2://fixture@127.0.0.1:9?sni=localhost", nil, "")
				}
				stop = m.StopAll
			}
			entered := make(chan struct{})
			release := make(chan struct{})
			var once sync.Once
			life.afterTrack = func() { once.Do(func() { close(entered); <-release }) }
			var unblockOnce sync.Once
			unblock := func() { unblockOnce.Do(func() { close(release) }) }
			t.Cleanup(func() {
				unblock()
				if err := stop(); err != nil {
					t.Error(err)
				}
			})
			acquired := make(chan error, 1)
			go func() { _, _, err := acquire(); acquired <- err }()
			select {
			case <-entered:
			case err := <-acquired:
				t.Fatalf("launch never reached process tracking: %v", err)
			case <-time.After(15 * time.Second):
				t.Fatal("process startup deadline")
			}
			stopped := make(chan error, 1)
			go func() { stopped <- stop() }()
			<-life.context().Done()
			select {
			case <-stopped:
				t.Fatal("StopAll returned with active startup")
			default:
			}
			unblock()
			if err := <-acquired; err == nil {
				t.Fatal("cancelled startup returned a usable lease")
			}
			if err := <-stopped; err != nil {
				t.Fatal(err)
			}
			life.mu.Lock()
			for _, done := range life.owned {
				if !processExited(done) {
					t.Error("unconfirmed process survived concurrent stop")
				}
			}
			life.mu.Unlock()
			if _, _, err := acquire(); err == nil {
				t.Fatal("stopped manager restarted")
			}
		})
	}
}
