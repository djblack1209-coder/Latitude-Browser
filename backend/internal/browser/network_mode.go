package browser

import (
	"fmt"
	"strings"
)

const (
	// NetworkModeProxy preserves the existing direct/proxy selection flow. Direct
	// profiles continue to use the built-in direct:// proxy entry.
	NetworkModeProxy = "proxy"
	// NetworkModeTor is an explicit, mutually exclusive experimental transport.
	// It must never be resolved as a proxy kernel or chained with another stack.
	NetworkModeTor = "tor"
)

func NormalizeNetworkMode(value string) string {
	if strings.EqualFold(strings.TrimSpace(value), NetworkModeTor) {
		return NetworkModeTor
	}
	return NetworkModeProxy
}

func ValidateNetworkMode(value string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", NetworkModeProxy:
		return NetworkModeProxy, nil
	case NetworkModeTor:
		return NetworkModeTor, nil
	default:
		return "", fmt.Errorf("不支持的网络模式：%s", strings.TrimSpace(value))
	}
}

func IsTorNetworkMode(value string) bool {
	return NormalizeNetworkMode(value) == NetworkModeTor
}

// NormalizeProfileNetworkState canonicalizes a profile's transport state and
// removes proxy-only state from Tor profiles. Tor is mutually exclusive with
// proxy bindings, including legacy binding metadata carried over from YAML or
// older SQLite rows.
func NormalizeProfileNetworkState(profile *Profile) bool {
	if profile == nil {
		return false
	}

	changed := false
	networkMode := NormalizeNetworkMode(profile.NetworkMode)
	if profile.NetworkMode != networkMode {
		profile.NetworkMode = networkMode
		changed = true
	}
	if networkMode != NetworkModeTor {
		return changed
	}

	if strings.TrimSpace(profile.ProxyId) != "" {
		profile.ProxyId = ""
		changed = true
	}
	if strings.TrimSpace(profile.ProxyConfig) != "" {
		profile.ProxyConfig = ""
		changed = true
	}
	if strings.TrimSpace(profile.ProxyBindSourceID) != "" {
		profile.ProxyBindSourceID = ""
		changed = true
	}
	if strings.TrimSpace(profile.ProxyBindSourceURL) != "" {
		profile.ProxyBindSourceURL = ""
		changed = true
	}
	if strings.TrimSpace(profile.ProxyBindName) != "" {
		profile.ProxyBindName = ""
		changed = true
	}
	if strings.TrimSpace(profile.ProxyBindUpdatedAt) != "" {
		profile.ProxyBindUpdatedAt = ""
		changed = true
	}
	return changed
}

func validateTorProxyExclusivity(mode string, proxyID string, proxyConfig string) error {
	if !IsTorNetworkMode(mode) {
		return nil
	}
	if strings.TrimSpace(proxyID) != "" || strings.TrimSpace(proxyConfig) != "" {
		return fmt.Errorf("Tor 网络模式不能同时配置代理、代理链或直连代理项；请清空 proxyId 和 proxyConfig")
	}
	return nil
}
