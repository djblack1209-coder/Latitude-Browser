package backend

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
)

func TestReadBrowserTabsUsesLivePageTargets(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/json/list" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{"id":"live-42","type":"page","title":"Actual document","url":"https://example.org/real"},{"id":"worker","type":"service_worker","title":"Worker","url":"chrome-extension://worker"}]`))
	}))
	defer server.Close()
	endpoint, _ := url.Parse(server.URL)
	port, _ := strconv.Atoi(endpoint.Port())
	tabs, err := readBrowserTabs(server.Client(), port)
	if err != nil {
		t.Fatal(err)
	}
	if len(tabs) != 1 || tabs[0].TabId != "live-42" || tabs[0].Title != "Actual document" || tabs[0].Url != "https://example.org/real" {
		t.Fatalf("unexpected live targets: %#v", tabs)
	}
}

func TestReadBrowserTabsReturnsDiscoveryError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusServiceUnavailable) }))
	defer server.Close()
	endpoint, _ := url.Parse(server.URL)
	port, _ := strconv.Atoi(endpoint.Port())
	tabs, err := readBrowserTabs(server.Client(), port)
	if err == nil || !strings.Contains(err.Error(), "503") || tabs != nil {
		t.Fatalf("discovery failure must not produce sample tabs: tabs=%#v err=%v", tabs, err)
	}
}
