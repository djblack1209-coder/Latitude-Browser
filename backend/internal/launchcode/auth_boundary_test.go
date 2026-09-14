package launchcode

import (
	"ant-chrome/backend/internal/browser"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gorilla/websocket"
)

func TestControlAuthCoversHTTPAndWebsocket(t *testing.T) {
	s := NewLaunchServer(nil, nil, nil, 0)
	s.SetAPIAuthConfig(APIAuthConfig{Enabled: true, APIKey: "fixture-key"})
	for _, path := range []string{"/api/health", "/json/version", "/json/list", "/devtools/browser/fixture"} {
		for _, key := range []string{"", "wrong", "fixture-key"} {
			t.Run(path+"/"+key, func(t *testing.T) {
				called := false
				h := s.apiAuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true; w.WriteHeader(204) }))
				r := httptest.NewRequest("GET", "http://localhost"+path, nil)
				r.Header.Set(DefaultAPIKeyHeader, key)
				if path == "/devtools/browser/fixture" {
					r.Header.Set("Upgrade", "websocket")
					r.Header.Set("Connection", "Upgrade")
				}
				w := httptest.NewRecorder()
				h.ServeHTTP(w, r)
				if key == "fixture-key" {
					if !called || w.Code != 204 {
						t.Fatalf("valid key rejected: %d", w.Code)
					}
				} else if called || w.Code != 401 {
					t.Fatalf("unauthorized request reached handler: %d", w.Code)
				}
			})
		}
	}
}

func TestControlRealWebsocketAndDiscovery(t *testing.T) {
	var upstreamCalls atomic.Int32
	var leakedKey atomic.Bool
	upgrader := websocket.Upgrader{}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls.Add(1)
		if r.Header.Get(DefaultAPIKeyHeader) != "" {
			leakedKey.Store(true)
		}
		if r.URL.Path == "/json/version" {
			_ = json.NewEncoder(w).Encode(map[string]string{"webSocketDebuggerUrl": "ws://" + r.Host + "/devtools/browser/fixture"})
			return
		}
		ws, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer ws.Close()
		kind, body, err := ws.ReadMessage()
		if err == nil {
			_ = ws.WriteMessage(kind, body)
		}
	}))
	defer upstream.Close()
	u, _ := url.Parse(upstream.URL)
	port, _ := strconv.Atoi(u.Port())
	s := NewLaunchServer(nil, nil, nil, 0)
	s.SetAPIAuthConfig(APIAuthConfig{Enabled: true, APIKey: "fixture-key"})
	s.SetActiveProfile(&browser.Profile{ProfileId: "test", DebugPort: port, DebugReady: true})
	if err := s.Start(); err != nil {
		t.Fatal(err)
	}
	defer s.Stop()
	entry := s.CDPURL()
	for _, key := range []string{"", "wrong"} {
		header := http.Header{DefaultAPIKeyHeader: []string{key}}
		ws, resp, err := websocket.DefaultDialer.Dial(strings.Replace(entry, "http://", "ws://", 1)+"/devtools/browser/fixture", header)
		if ws != nil {
			_ = ws.Close()
		}
		if resp != nil {
			_ = resp.Body.Close()
		}
		if err == nil || resp == nil || resp.StatusCode != 401 {
			t.Fatalf("unauthorized websocket result: %v %v", resp, err)
		}
	}
	if upstreamCalls.Load() != 0 {
		t.Fatal("unauthorized requests reached upstream")
	}
	req, _ := http.NewRequest("GET", entry+"/json/version", nil)
	req.Header.Set(DefaultAPIKeyHeader, "fixture-key")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if err != nil || resp.StatusCode != 200 {
		t.Fatalf("discovery failed: %d %v", resp.StatusCode, err)
	}
	var discovery map[string]string
	if err := json.Unmarshal(data, &discovery); err != nil {
		t.Fatal(err)
	}
	want := strings.Replace(entry, "http://", "ws://", 1) + "/devtools/browser/fixture"
	if discovery["webSocketDebuggerUrl"] != want {
		t.Fatalf("discovery bypasses authenticated entry: %s", data)
	}
	ws, _, err := websocket.DefaultDialer.Dial(want, http.Header{DefaultAPIKeyHeader: []string{"fixture-key"}})
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()
	if err := ws.WriteMessage(websocket.TextMessage, []byte("ping")); err != nil {
		t.Fatal(err)
	}
	_, body, err := ws.ReadMessage()
	if err != nil || string(body) != "ping" {
		t.Fatalf("websocket echo: %q %v", body, err)
	}
	if leakedKey.Load() {
		t.Fatal("control credential forwarded to Chrome")
	}
}

func TestControlAuthEmptyKeyFailsClosed(t *testing.T) {
	s := NewLaunchServer(nil, nil, nil, 0)
	s.SetAPIAuthConfig(APIAuthConfig{Enabled: true, APIKey: "  "})
	w := httptest.NewRecorder()
	s.apiAuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Error("empty enabled key reached handler") })).ServeHTTP(w, httptest.NewRequest("GET", "http://localhost/api/health", nil))
	if w.Code < 400 {
		t.Fatalf("empty key status = %d", w.Code)
	}
	if err := s.Start(); err == nil {
		_ = s.Stop()
		t.Fatal("server started with enabled empty key")
	}
}

func TestControlBoundaryRejectsForeignHostAndOrigin(t *testing.T) {
	s := NewLaunchServer(nil, nil, nil, 0)
	for _, test := range []struct {
		host, origin string
		want         int
	}{
		{"localhost", "", 200}, {"127.0.0.1:1234", "", 200},
		{"untrusted.example", "", 403}, {"localhost", "https://untrusted.example", 403}, {"localhost", "null", 403},
	} {
		r := httptest.NewRequest("GET", "http://"+test.host+"/api/health", nil)
		r.RemoteAddr = "127.0.0.1:12345"
		r.Header.Set("Origin", test.origin)
		w := httptest.NewRecorder()
		s.buildHandler(true).ServeHTTP(w, r)
		if w.Code != test.want {
			t.Errorf("Host=%s Origin=%s status=%d want=%d", test.host, test.origin, w.Code, test.want)
		}
	}
}
