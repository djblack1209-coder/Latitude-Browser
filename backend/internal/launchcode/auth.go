package launchcode

import (
	"ant-chrome/backend/internal/config"
	"crypto/subtle"
	"net/http"
	"strings"
)

// DefaultAPIKeyHeader is a legacy wire-compatible header kept for existing clients.
// It is not a user-facing product identifier.
const DefaultAPIKeyHeader = "X-Ant-Api-Key"

// APIAuthConfig protects the control entry point, including CDP and WebSockets.
type APIAuthConfig struct {
	Enabled bool
	APIKey  string
	Header  string
}

func normalizeAPIAuthConfig(cfg APIAuthConfig) APIAuthConfig {
	cfg.APIKey = strings.TrimSpace(cfg.APIKey)
	cfg.Header = strings.TrimSpace(cfg.Header)
	if cfg.Header == "" {
		cfg.Header = DefaultAPIKeyHeader
	}
	return cfg
}

func (cfg APIAuthConfig) Requested() bool {
	return cfg.Enabled
}

func (cfg APIAuthConfig) Configured() bool {
	return cfg.APIKey != ""
}

func (cfg APIAuthConfig) Active() bool {
	return cfg.Requested() && cfg.Configured()
}

func (cfg APIAuthConfig) Validate() error {
	return config.ValidateLaunchServerAuth(config.LaunchServerAuthConfig{Enabled: cfg.Enabled, APIKey: cfg.APIKey, Header: cfg.Header})
}

func (s *LaunchServer) SetAPIAuthConfig(cfg APIAuthConfig) {
	s.authMu.Lock()
	s.apiAuth = normalizeAPIAuthConfig(cfg)
	s.authMu.Unlock()
}

func (s *LaunchServer) apiAuthConfig() APIAuthConfig {
	s.authMu.RLock()
	cfg := s.apiAuth
	s.authMu.RUnlock()
	return cfg
}

func (s *LaunchServer) APIAuthHeader() string {
	return s.apiAuthConfig().Header
}

func (s *LaunchServer) APIAuthRequested() bool {
	return s.apiAuthConfig().Requested()
}

func (s *LaunchServer) APIAuthConfigured() bool {
	return s.apiAuthConfig().Configured()
}

func (s *LaunchServer) APIAuthEnabled() bool {
	return s.apiAuthConfig().Active()
}

func (s *LaunchServer) apiAuthMiddleware(next http.Handler) http.Handler {
	control := next
	next = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.browserMgr != nil && s.browserMgr.DataMaintenanceActive() && r.URL.Path != "/api/health" {
			writeJSON(w, http.StatusServiceUnavailable, map[string]interface{}{"ok": false, "error": "browser data maintenance in progress"})
			return
		}
		control.ServeHTTP(w, r)
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cfg := s.apiAuthConfig()
		forward := func() {
			// Use the configuration that authenticated this request, even if a
			// concurrent reload changes the configured header before CDP forwarding.
			clean := r.Clone(r.Context())
			clean.Header.Del(cfg.Header)
			next.ServeHTTP(w, clean)
		}
		if !cfg.Requested() {
			forward()
			return
		}
		if err := cfg.Validate(); err != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]interface{}{"ok": false, "error": "control authentication is not configured"})
			return
		}

		providedKey := strings.TrimSpace(r.Header.Get(cfg.Header))
		if subtle.ConstantTimeCompare([]byte(providedKey), []byte(cfg.APIKey)) != 1 {
			writeJSON(w, http.StatusUnauthorized, map[string]interface{}{
				"ok":         false,
				"error":      "unauthorized: invalid api key",
				"authHeader": cfg.Header,
			})
			return
		}

		forward()
	})
}
