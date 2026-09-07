package backend

import (
	"ant-chrome/backend/internal/logger"
	"strings"
)

type managedLaunchArgSpec struct {
	prefix     string
	takesValue bool
}

var managedLaunchArgSpecs = []managedLaunchArgSpec{
	{prefix: "--user-data-dir", takesValue: true},
	{prefix: "--remote-debugging-port", takesValue: true},
	{prefix: "--remote-debugging-address", takesValue: true},
	{prefix: "--remote-debugging-pipe", takesValue: false},
	{prefix: "--proxy-server", takesValue: true},
	{prefix: "--load-extension", takesValue: true},
	{prefix: "--disable-extensions-except", takesValue: true},
	{prefix: "--restore-last-session", takesValue: false},
}

func sanitizeManagedLaunchArgs(args []string) ([]string, []string) {
	if len(args) == 0 {
		return nil, nil
	}

	sanitized := make([]string, 0, len(args))
	removed := make([]string, 0, 4)

	for i := 0; i < len(args); i++ {
		arg := strings.TrimSpace(args[i])
		if arg == "" {
			continue
		}

		spec, matched := matchManagedLaunchArg(arg)
		if !matched {
			sanitized = append(sanitized, arg)
			continue
		}

		removed = appendUniqueString(removed, spec.prefix)
		if spec.takesValue && !strings.Contains(arg, "=") && i+1 < len(args) {
			next := strings.TrimSpace(args[i+1])
			if next != "" && !strings.HasPrefix(next, "-") {
				i++
			}
		}
	}

	return sanitized, removed
}

func matchManagedLaunchArg(arg string) (managedLaunchArgSpec, bool) {
	return matchLaunchArgSpec(arg, managedLaunchArgSpecs)
}

func logManagedLaunchArgOverrides(log *logger.Logger, profileId string, source string, managedArgs []string) {
	if log == nil || len(managedArgs) == 0 {
		return
	}
	log.Warn("忽略由系统接管的浏览器启动参数",
		logger.F("profile_id", profileId),
		logger.F("source", source),
		logger.F("managed_args", managedArgs),
	)
}

func appendUniqueString(items []string, value string) []string {
	for _, item := range items {
		if strings.EqualFold(item, value) {
			return items
		}
	}
	return append(items, value)
}

var torManagedLaunchArgSpecs = []managedLaunchArgSpec{
	{prefix: "--no-proxy-server", takesValue: false},
	{prefix: "--proxy-pac-url", takesValue: true},
	{prefix: "--proxy-auto-detect", takesValue: false},
	{prefix: "--proxy-resolver-rules", takesValue: true},
	{prefix: "--proxy-bypass-list", takesValue: true},
	{prefix: "--host-resolver-rules", takesValue: true},
	{prefix: "--enable-quic", takesValue: false},
	{prefix: "--disable-quic", takesValue: false},
	{prefix: "--disable-non-proxied-udp", takesValue: false},
	{prefix: "--force-webrtc-ip-handling-policy", takesValue: true},
	{prefix: "--webrtc-ip-handling-policy", takesValue: true},
	{prefix: "--dns-over-https-mode", takesValue: true},
	{prefix: "--dns-over-https-templates", takesValue: true},
	{prefix: "--disable-extensions", takesValue: false},
	{prefix: "--enable-extensions", takesValue: false},
	{prefix: "--remote-allow-origins", takesValue: true},
	{prefix: "--enable-automation", takesValue: false},
	{prefix: "--disable-web-security", takesValue: false},
	{prefix: "--no-sandbox", takesValue: false},
	{prefix: "--disable-setuid-sandbox", takesValue: false},
	{prefix: "--disable-seccomp-filter-sandbox", takesValue: false},
}

func sanitizeTorLaunchArgs(args []string) ([]string, []string) {
	if len(args) == 0 {
		return nil, nil
	}
	sanitized := make([]string, 0, len(args))
	removed := make([]string, 0, 4)
	for i := 0; i < len(args); i++ {
		arg := strings.TrimSpace(args[i])
		if arg == "" {
			continue
		}
		spec, matched := matchLaunchArgSpec(arg, torManagedLaunchArgSpecs)
		if !matched {
			sanitized = append(sanitized, arg)
			continue
		}
		removed = appendUniqueString(removed, spec.prefix)
		if spec.takesValue && !strings.Contains(arg, "=") && i+1 < len(args) {
			next := strings.TrimSpace(args[i+1])
			if next != "" && !strings.HasPrefix(next, "-") {
				i++
			}
		}
	}
	return sanitized, removed
}

func matchLaunchArgSpec(arg string, specs []managedLaunchArgSpec) (managedLaunchArgSpec, bool) {
	for _, spec := range specs {
		if strings.EqualFold(arg, spec.prefix) || strings.HasPrefix(strings.ToLower(arg), strings.ToLower(spec.prefix)+"=") {
			return spec, true
		}
	}
	return managedLaunchArgSpec{}, false
}

func torEnforcedBrowserLaunchArgs() []string {
	return []string{
		"--remote-debugging-address=127.0.0.1",
		"--proxy-bypass-list=<-loopback>",
		// Chromium applies resolver mappings to proxy IP literals too. Exempt
		// only the managed sidecar address; this is NOT a proxy bypass rule.
		"--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
		"--dns-over-https-mode=off",
		"--disable-quic",
		"--disable-non-proxied-udp",
		"--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
		"--disable-extensions",
	}
}
