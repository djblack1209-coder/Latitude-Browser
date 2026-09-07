package backend

import (
	"encoding/json"
	"net"
	"net/http"
	"testing"

	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"

	"github.com/gorilla/websocket"
)

func TestBrowserInstanceStopReapsOwnedProcessAfterCDPCloses(t *testing.T) {
	cmd := startTorBrowserTestProcess(t)
	port := newClosingCDPTestEndpoint(t)
	app := &App{browserMgr: browser.NewManager(config.DefaultConfig(), t.TempDir())}
	profile := &BrowserProfile{ProfileId: "owned-process", Running: true, DebugReady: true, DebugPort: port, Pid: cmd.Process.Pid}
	app.browserMgr.Profiles[profile.ProfileId] = profile
	app.browserMgr.BrowserProcesses[profile.ProfileId] = cmd

	if _, err := app.BrowserInstanceStop(profile.ProfileId); err != nil {
		t.Fatalf("CDP closed its listener but the owned process was not reaped: %v", err)
	}
	if isProcessAlive(cmd.Process.Pid) || profile.Running {
		t.Fatal("owned process or running state survived a successful stop")
	}
}

func TestBrowserInstanceStopDoesNotKillUntrackedPIDAfterCDPCloses(t *testing.T) {
	cmd := startTorBrowserTestProcess(t)
	port := newClosingCDPTestEndpoint(t)
	app := &App{browserMgr: browser.NewManager(config.DefaultConfig(), t.TempDir())}
	profile := &BrowserProfile{ProfileId: "untracked-process", Running: true, DebugReady: true, DebugPort: port, Pid: cmd.Process.Pid}
	app.browserMgr.Profiles[profile.ProfileId] = profile

	if _, err := app.BrowserInstanceStop(profile.ProfileId); err == nil {
		t.Fatal("stop must not claim termination from a closed CDP port alone")
	}
	if !isProcessAlive(cmd.Process.Pid) || !profile.Running {
		t.Fatal("untracked PID was killed or falsely marked stopped")
	}
}

// Model Chrome shutting down its CDP listener before its process exits. The
// helper process deliberately stays alive so the owned-process fallback is
// exercised independently of browser/OS timing.
func newClosingCDPTestEndpoint(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := listener.Addr().String()
	port := listener.Addr().(*net.TCPAddr).Port
	upgrader := websocket.Upgrader{}
	mux := http.NewServeMux()
	mux.HandleFunc("/json/version", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{"webSocketDebuggerUrl": "ws://" + address + "/browser"})
	})
	mux.HandleFunc("/browser", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		var message struct {
			ID     int    `json:"id"`
			Method string `json:"method"`
		}
		if conn.ReadJSON(&message) != nil || message.Method != "Browser.close" {
			return
		}
		_ = listener.Close()
		_ = conn.WriteJSON(map[string]any{"id": message.ID, "result": map[string]any{}})
	})
	server := &http.Server{Handler: mux}
	done := make(chan struct{})
	go func() {
		_ = server.Serve(listener)
		close(done)
	}()
	t.Cleanup(func() {
		_ = server.Close()
		_ = listener.Close()
		<-done
	})
	return port
}
