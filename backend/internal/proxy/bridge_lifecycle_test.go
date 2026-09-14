package proxy

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"ant-chrome/backend/internal/config"
)

// This test binary supplies a real owned HTTP proxy process. All requests and
// controls remain on loopback; the slow response is released by a channel.
func TestBridgeProcessFixture(t *testing.T) {
	if os.Getenv("LATITUDE_BRIDGE_FIXTURE") != "1" {
		return
	}
	address := "127.0.0.1:0"
	if configPath := os.Getenv("LATITUDE_BRIDGE_FIXTURE_CONFIG"); configPath != "" {
		var cfg struct {
			Inbounds []struct {
				Port int `json:"port"`
			} `json:"inbounds"`
		}
		data, err := os.ReadFile(configPath)
		if err != nil || json.Unmarshal(data, &cfg) != nil || len(cfg.Inbounds) == 0 {
			os.Exit(3)
		}
		address = fmt.Sprintf("127.0.0.1:%d", cfg.Inbounds[0].Port)
	}
	ln, err := net.Listen("tcp", address)
	if err != nil {
		os.Exit(2)
	}
	fmt.Println(ln.Addr().String())
	unblock := make(chan struct{})
	var once sync.Once
	srv := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/unblock" {
			once.Do(func() { close(unblock) })
			return
		}
		if r.URL.Path == "/slow" {
			w.Write([]byte("head"))
			w.(http.Flusher).Flush()
			select {
			case <-unblock:
			case <-r.Context().Done():
				return
			}
			w.Write([]byte("tail"))
			return
		}
		w.Write([]byte("fixture"))
	})}
	_ = srv.Serve(bridgeFixtureListener{ln})
	os.Exit(0)
}

type bridgeFixtureConn struct {
	net.Conn
	reader io.Reader
}

func (c bridgeFixtureConn) Read(p []byte) (int, error) { return c.reader.Read(p) }

type bridgeFixtureListener struct{ net.Listener }

func (l bridgeFixtureListener) Accept() (net.Conn, error) {
	for {
		c, err := l.Listener.Accept()
		if err != nil {
			return nil, err
		}
		c.SetReadDeadline(time.Now().Add(2 * time.Second))
		first := make([]byte, 1)
		if _, err = io.ReadFull(c, first); err != nil {
			c.Close()
			continue
		}
		if first[0] != 5 {
			c.SetReadDeadline(time.Time{})
			return bridgeFixtureConn{c, io.MultiReader(strings.NewReader(string(first)), c)}, nil
		}
		n := make([]byte, 1)
		if _, err = io.ReadFull(c, n); err != nil {
			c.Close()
			continue
		}
		methods := make([]byte, int(n[0]))
		if _, err = io.ReadFull(c, methods); err != nil {
			c.Close()
			continue
		}
		c.Write([]byte{5, 0})
		hdr := make([]byte, 4)
		if _, err = io.ReadFull(c, hdr); err != nil {
			c.Close()
			continue
		}
		size := 0
		switch hdr[3] {
		case 1:
			size = 4
		case 4:
			size = 16
		case 3:
			if _, err = io.ReadFull(c, n); err == nil {
				size = int(n[0])
			}
		default:
			err = errors.New("invalid address")
		}
		if err != nil {
			c.Close()
			continue
		}
		if _, err = io.CopyN(io.Discard, c, int64(size+2)); err != nil {
			c.Close()
			continue
		}
		c.Write([]byte{5, 0, 0, 1, 127, 0, 0, 1, 0, 0})
		c.SetReadDeadline(time.Time{})
		return c, nil
	}
}

func bridgeFixtureProcess(t *testing.T) (*exec.Cmd, int) {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^TestBridgeProcessFixture$")
	cmd.Env = append(os.Environ(), "LATITUDE_BRIDGE_FIXTURE=1")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err = cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = cmd.Process.Kill() })
	scanner := bufio.NewScanner(stdout)
	if !scanner.Scan() {
		t.Fatal("fixture did not report listener")
	}
	_, s, err := net.SplitHostPort(scanner.Text())
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.Atoi(s)
	if err != nil {
		t.Fatal(err)
	}
	return cmd, port
}

func seededMihomoFixture(t *testing.T) (*ClashManager, string, *MihomoNodeBridge) {
	t.Helper()
	cmd, port := bridgeFixtureProcess(t)
	src := "http://127.0.0.1:9999"
	key := computeNodeKey(src + "\x00mihomo")
	m := NewClashManager(&config.Config{}, t.TempDir())
	b := &MihomoNodeBridge{NodeKey: key, Port: port, ControllerPort: port, Cmd: cmd, Pid: cmd.Process.Pid, Running: true, LastUsedAt: time.Now(), ExitDone: make(chan struct{})}
	m.NodeBridges[key] = b
	m.watchMihomoNodeBridge(b)
	t.Cleanup(func() { m.StopAll() })
	return m, src, b
}

func TestMihomoAcquireUsesDistinctIdempotentLeases(t *testing.T) {
	m, src, b := seededMihomoFixture(t)
	_, first, err := m.AcquireNodeBridge(src, nil, "")
	if err != nil {
		t.Fatal(err)
	}
	_, second, err := m.AcquireNodeBridge(src, nil, "")
	if err != nil {
		t.Fatal(err)
	}
	if first == second {
		t.Errorf("distinct acquisitions share release identity %q", first)
	}
	m.ReleaseNodeBridge(first)
	m.ReleaseNodeBridge(first)
	m.mu.Lock()
	refs := b.RefCount
	running := b.Running
	m.mu.Unlock()
	if refs != 1 || !running {
		t.Errorf("duplicate release affected another lease: refs=%d running=%v", refs, running)
	}
	m.ReleaseNodeBridge(second)
}

func TestMihomoHTTPRequestRetainsLeaseUntilBodyClose(t *testing.T) {
	m, src, b := seededMihomoFixture(t)
	client, err := BuildProxyHTTPClient(src, "", nil, nil, nil, m, config.BrowserConnectorMihomo, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer client.CloseIdleConnections()
	resp, err := client.Get("http://fixture.invalid/slow")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data := make([]byte, 4)
	if _, err = io.ReadFull(resp.Body, data); err != nil {
		t.Fatal(err)
	}
	m.mu.Lock()
	refs := b.RefCount
	m.mu.Unlock()
	if refs != 1 {
		t.Errorf("active slow response is unpinned: refs=%d", refs)
	}
	resp.Body.Close()
	resp.Body.Close()
	m.mu.Lock()
	refs = b.RefCount
	m.mu.Unlock()
	if refs != 0 {
		t.Errorf("closed response leaked lease: %d", refs)
	}
}

func TestMihomoStopAllReapsOwnedProcess(t *testing.T) {
	m, _, b := seededMihomoFixture(t)
	m.StopAll()
	select {
	case <-b.ExitDone:
	default:
		t.Error("StopAll returned before owned process exit was observed")
	}
}

func TestRuntimeConfigFilesArePrivate(t *testing.T) {
	if os.PathSeparator == '\\' {
		t.Skip("POSIX permission assertion")
	}
	cfg := &config.Config{}
	root := t.TempDir()
	cfg.Browser.UserDataRoot = "data"
	cases := []struct {
		name  string
		build func() (string, error)
	}{
		{"mihomo", func() (string, error) {
			m := NewClashManager(cfg, root)
			defer m.StopAll()
			return m.buildMihomoNodeConfig("privacy", map[string]interface{}{"name": "fixture", "type": "http", "server": "127.0.0.1", "port": 1234}, 1235, 1236)
		}},
		{"xray", func() (string, error) {
			return (&XrayManager{Config: cfg, AppRoot: root}).buildRuntimeConfig("privacy", map[string]interface{}{"protocol": "freedom"}, 1235, "")
		}},
		{"sing-box", func() (string, error) {
			return (&SingBoxManager{Config: cfg, AppRoot: root}).buildConfig("privacy", map[string]interface{}{"type": "direct"}, 1235)
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p, err := tc.build()
			if err != nil {
				t.Fatal(err)
			}
			for _, entry := range []string{p, filepath.Dir(p)} {
				info, err := os.Stat(entry)
				if err != nil {
					t.Fatal(err)
				}
				if info.Mode().Perm()&0077 != 0 {
					t.Errorf("%s is accessible to other users: %o", strings.TrimPrefix(entry, root), info.Mode().Perm())
				}
			}
		})
	}
}
