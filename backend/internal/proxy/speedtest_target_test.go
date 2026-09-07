package proxy

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDoSpeedTestRequestWithTargetFallsBackFromHeadToGet(t *testing.T) {
	var methods []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		methods = append(methods, r.Method)
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	latency, status, err := doSpeedTestRequestWithTarget(server.Client(), SpeedTestTarget{
		URL:     server.URL,
		Method:  http.MethodHead,
		Timeout: time.Second,
	})
	if err != nil {
		t.Fatalf("request returned error: %v", err)
	}
	if status != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", status)
	}
	if latency < 0 {
		t.Fatalf("latency = %d, want non-negative", latency)
	}
	if got, want := strings.Join(methods, ","), "HEAD,GET"; got != want {
		t.Fatalf("methods = %q, want %q", got, want)
	}
}

func TestDoSpeedTestRequestWithTargetHonorsPerTargetTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	_, _, err := doSpeedTestRequestWithTarget(server.Client(), SpeedTestTarget{
		URL:     server.URL,
		Method:  http.MethodGet,
		Timeout: 10 * time.Millisecond,
	})
	if err == nil || !strings.Contains(err.Error(), "测速超时") {
		t.Fatalf("error = %v, want timeout diagnostic", err)
	}
}

func TestSpeedTestStatusOKForTargetAllowsPerTargetExpectedStatus(t *testing.T) {
	if !speedTestStatusOKForTarget(http.StatusOK, []int{http.StatusOK}) {
		t.Fatal("expected 200 to be accepted")
	}
	if speedTestStatusOKForTarget(http.StatusNoContent, []int{http.StatusOK}) {
		t.Fatal("did not expect 204 to be accepted for [200]")
	}
	if !speedTestStatusOKForTarget(http.StatusNoContent, nil) {
		t.Fatal("expected any 2xx to be accepted when expected status is empty")
	}
}
