package launchcode

import (
	"ant-chrome/backend/internal/browser"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
)

func TestControlAuthReloadDoesNotForwardPreviousCredential(t *testing.T) {
	observed := make(chan http.Header, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observed <- r.Header.Clone()
		w.WriteHeader(http.StatusNoContent)
	}))
	defer upstream.Close()
	u, _ := url.Parse(upstream.URL)
	port, _ := strconv.Atoi(u.Port())
	s := NewLaunchServer(nil, nil, nil, 0)
	s.SetActiveProfile(&browser.Profile{ProfileId: "fixture", DebugPort: port, DebugReady: true})
	s.SetAPIAuthConfig(APIAuthConfig{Enabled: true, APIKey: "old-test-key", Header: "X-Old-Control"})
	authenticated, resume := make(chan struct{}), make(chan struct{})
	entry := httptest.NewServer(s.apiAuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(authenticated)
		<-resume
		s.handleCDPProxy(w, r)
	})))
	defer entry.Close()
	result := make(chan error, 1)
	go func() {
		req, _ := http.NewRequest(http.MethodGet, entry.URL+"/fixture", nil)
		req.Header.Set("X-Old-Control", "old-test-key")
		resp, err := http.DefaultClient.Do(req)
		if err == nil {
			_, err = io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
		}
		result <- err
	}()
	<-authenticated
	s.SetAPIAuthConfig(APIAuthConfig{Enabled: true, APIKey: "new-test-key", Header: "X-New-Control"})
	close(resume)
	if err := <-result; err != nil {
		t.Fatal(err)
	}
	if headers := <-observed; headers.Get("X-Old-Control") != "" {
		t.Fatal("previous control credential reached CDP upstream after auth reload")
	}
}
