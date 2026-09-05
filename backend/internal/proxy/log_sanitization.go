package proxy

import (
	"encoding/json"
	"net/url"
	"strings"
)

const redactedProxyConfig = "[redacted proxy config]"

// MaskProxyConfigForLog returns a proxy configuration that is safe to attach
// to log fields. URI credentials, encoded payloads, and credential-bearing
// JSON/YAML fields are never emitted in clear text.
func MaskProxyConfigForLog(src string) string {
	src = strings.TrimSpace(src)
	if src == "" {
		return ""
	}
	if strings.EqualFold(src, "direct://") {
		return src
	}

	parsed, err := url.Parse(src)
	if err == nil && parsed.Scheme != "" {
		// Some proxy schemes put the full credential payload in what net/url
		// sees as the host or opaque part (for example vmess and chain+socks5).
		if (parsed.Opaque != "" && parsed.Host == "") || isOpaqueProxyLogScheme(parsed.Scheme, parsed) {
			return parsed.Scheme + "://***"
		}
		if parsed.User != nil {
			// User-info can be a UUID, access key, or password depending on the
			// protocol. Hide the username as well as the password.
			parsed.User = url.User("***")
		}
		query := parsed.Query()
		for key := range query {
			if isSensitiveProxyLogKey(key) {
				query.Set(key, "***")
			}
		}
		parsed.RawQuery = query.Encode()
		return strings.ReplaceAll(parsed.String(), "%2A%2A%2A", "***")
	}

	// JSON proxy definitions can carry credentials in nested objects. Only
	// credential-bearing keys and explicitly proxy-valued strings are masked;
	// unrelated metadata remains useful in diagnostics.
	var jsonValue interface{}
	if json.Unmarshal([]byte(src), &jsonValue) == nil {
		switch value := jsonValue.(type) {
		case map[string]interface{}, []interface{}:
			masked, marshalErr := json.Marshal(sanitizeProxyLogJSONValue(value))
			if marshalErr == nil {
				return string(masked)
			}
		case string:
			return MaskProxyConfigForLog(value)
		}
	}

	// YAML, malformed URIs, and unknown formats are deliberately not parsed by
	// this helper. Partial line-based masking can miss nested or block-scalar
	// credentials, so fail closed instead of returning a potentially unsafe
	// approximation.
	return redactedProxyConfig
}

func isSensitiveProxyLogKey(key string) bool {
	key = strings.ToLower(strings.TrimSpace(key))
	key = strings.NewReplacer("-", "_", " ", "").Replace(key)
	return key == "user" || key == "username" || key == "uuid" ||
		strings.Contains(key, "password") || strings.Contains(key, "passwd") || strings.Contains(key, "private") || strings.Contains(key, "token") || strings.Contains(key, "auth") || strings.Contains(key, "secret") || strings.Contains(key, "credential") || strings.Contains(key, "api_key") || strings.Contains(key, "apikey") || strings.Contains(key, "access_key") || strings.Contains(key, "client_secret")
}

func isProxyLogValueKey(key string) bool {
	key = strings.ToLower(strings.TrimSpace(key))
	key = strings.NewReplacer("_", "", "-", "").Replace(key)
	switch key {
	case "proxy", "proxyconfig", "proxyurl":
		return true
	default:
		return false
	}
}

func sanitizeProxyLogJSONValue(value interface{}) interface{} {
	switch item := value.(type) {
	case map[string]interface{}:
		out := make(map[string]interface{}, len(item))
		for key, value := range item {
			if isSensitiveProxyLogKey(key) {
				out[key] = "***"
				continue
			}
			if isProxyLogValueKey(key) {
				if text, ok := value.(string); ok {
					out[key] = MaskProxyConfigForLog(text)
					continue
				}
			}
			out[key] = sanitizeProxyLogJSONValue(value)
		}
		return out
	case []interface{}:
		out := make([]interface{}, len(item))
		for index, value := range item {
			out[index] = sanitizeProxyLogJSONValue(value)
		}
		return out
	default:
		return value
	}
}

func isOpaqueProxyLogScheme(scheme string, parsed *url.URL) bool {
	switch strings.ToLower(strings.TrimSpace(scheme)) {
	case "vmess", "ssr", "chain+socks5":
		return true
	case "ss", "shadowsocks":
		// A host-only SS URI is commonly a base64-encoded user-info payload,
		// not a server hostname.
		return parsed.User == nil && parsed.Path == ""
	default:
		return false
	}
}
