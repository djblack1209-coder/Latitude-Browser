package launchcode

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// localhostMiddleware 只允许 127.0.0.1 访问
func (s *LaunchServer) localhostMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil || host != "127.0.0.1" {
			writeJSON(w, http.StatusForbidden, map[string]interface{}{
				"ok":    false,
				"error": "forbidden: only localhost is allowed",
			})
			return
		}
		if !s.allowedControlHost(r.Host) || !s.allowedControlOrigin(r.Header.Get("Origin")) {
			writeJSON(w, http.StatusForbidden, map[string]interface{}{"ok": false, "error": "forbidden: invalid local Host or Origin"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *LaunchServer) allowedControlHost(authority string) bool {
	u, err := url.Parse("http://" + authority)
	if err != nil || u.User != nil || u.Host != authority || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host != "localhost" && host != "127.0.0.1" && host != "::1" {
		return false
	}
	port := u.Port()
	actual := s.Port()
	if actual > 0 {
		if port == "" {
			return actual == 80
		}
		return port == fmt.Sprint(actual)
	}
	// Test handlers have no listener port. Production always sets the port
	// before serving, and therefore uses the exact comparison above.
	return true
}

func (s *LaunchServer) allowedControlOrigin(origin string) bool {
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || u.Scheme != "http" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return false
	}
	return s.allowedControlHost(u.Host)
}

// handleCDPProxy 将统一端口上的非 /api 请求转发到当前活动实例的 CDP 端口。
func (s *LaunchServer) handleCDPProxy(w http.ResponseWriter, r *http.Request) {
	debugPort, profileID, profileName := s.activeTarget()
	if debugPort <= 0 {
		writeJSON(w, http.StatusServiceUnavailable, map[string]interface{}{
			"ok":          false,
			"error":       "no active browser debug target",
			"profileId":   profileID,
			"profileName": profileName,
		})
		return
	}

	target, err := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", debugPort))
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid cdp target: %v", err), http.StatusInternalServerError)
		return
	}

	proxy := httputil.NewSingleHostReverseProxy(target)
	director := proxy.Director
	proxy.Director = func(req *http.Request) {
		director(req)
		req.Host = target.Host
		if isCDPDiscoveryPath(r.URL.Path) {
			req.Header.Del("Accept-Encoding")
		}
	}
	if isCDPDiscoveryPath(r.URL.Path) {
		proxy.ModifyResponse = func(resp *http.Response) error { return rewriteCDPDiscovery(resp, r.Host, target.Host) }
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, proxyErr error) {
		http.Error(w, fmt.Sprintf("cdp proxy error: %v", proxyErr), http.StatusBadGateway)
	}
	proxy.ServeHTTP(w, r)
}

// writeJSON 写入 JSON 响应
func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func normalizeStringSlice(items []string) []string {
	if len(items) == 0 {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		v := strings.TrimSpace(item)
		if v != "" {
			out = append(out, v)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalizeLaunchRequestParams(params LaunchRequestParams) LaunchRequestParams {
	params.LaunchArgs = normalizeStringSlice(params.LaunchArgs)
	params.StartURLs = normalizeStringSlice(params.StartURLs)
	params.ProxyId = strings.TrimSpace(params.ProxyId)
	params.ProxyConfig = strings.TrimSpace(params.ProxyConfig)
	return params
}

func remoteIP(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return remoteAddr
	}
	return host
}
