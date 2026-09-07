package proxy

import (
	"ant-chrome/backend/internal/config"
	"net/http"
	"strings"
	"time"
)

const defaultBridgeStartTimeoutMs = 15000
const defaultSpeedTargetTimeoutMs = 8000
const defaultIPHealthTargetTimeoutMs = 10000

func NormalizeCheckSettings(settings config.ProxyCheckConfig) config.ProxyCheckConfig {
	settings.BridgeStartTimeoutMs = normalizePositiveInt(settings.BridgeStartTimeoutMs, defaultBridgeStartTimeoutMs)
	settings.SpeedTargetID = strings.TrimSpace(settings.SpeedTargetID)
	settings.IPHealthTargetID = strings.TrimSpace(settings.IPHealthTargetID)
	settings.Targets = NormalizeCheckTargets(settings.Targets)
	if len(settings.Targets) == 0 {
		settings.Targets = NormalizeCheckTargets(config.DefaultConfig().ProxyCheck.Targets)
	}
	if settings.SpeedTargetID == "" {
		// Keep the setting empty when no target was explicitly selected. An empty
		// selection means "try every speed target in order", which gives the
		// runtime a safe fallback chain instead of pinning it to one host.
		settings.SpeedTargetID = ""
	}
	if settings.IPHealthTargetID == "" {
		settings.IPHealthTargetID = FirstCheckTargetID(settings.Targets, "ip_health", "")
	}
	return settings
}

func BuildSpeedTestConfig(settings config.ProxyCheckConfig) *SpeedTestConfig {
	cfg := cloneSpeedTestConfig(DefaultSpeedTestConfig)
	targets := NormalizeCheckTargets(settings.Targets)
	if len(targets) == 0 {
		targets = NormalizeCheckTargets(config.DefaultConfig().ProxyCheck.Targets)
	}

	speedTargets := make([]config.ProxyCheckTarget, 0, len(targets))
	for _, target := range targets {
		if strings.EqualFold(strings.TrimSpace(target.Type), "speed") {
			speedTargets = append(speedTargets, target)
		}
	}
	if len(speedTargets) > 0 {
		// A selected target is a preferred first attempt, not an exclusive
		// target. Append the remaining targets so transient DNS/region blocks do
		// not mark a healthy proxy as dead.
		selectedID := strings.TrimSpace(settings.SpeedTargetID)
		ordered := make([]config.ProxyCheckTarget, 0, len(speedTargets))
		if selectedID != "" {
			for _, target := range speedTargets {
				if strings.EqualFold(target.ID, selectedID) {
					ordered = append(ordered, target)
					break
				}
			}
		}
		for _, target := range speedTargets {
			alreadySelected := len(ordered) > 0 && strings.EqualFold(ordered[0].ID, target.ID)
			if !alreadySelected {
				ordered = append(ordered, target)
			}
		}
		speedTargets = ordered

		cfg.Targets = make([]SpeedTestTarget, 0, len(speedTargets))
		cfg.URLs = make([]string, 0, len(speedTargets))
		statusSet := map[int]struct{}{}
		for _, target := range speedTargets {
			testTarget := SpeedTestTarget{
				URL:            strings.TrimSpace(target.URL),
				Method:         normalizeSpeedTestMethod(target.Method),
				Timeout:        time.Duration(target.TimeoutMs) * time.Millisecond,
				ExpectedStatus: append([]int{}, target.ExpectedStatus...),
			}
			if testTarget.Timeout <= 0 {
				testTarget.Timeout = cfg.Timeout
			}
			if testTarget.URL == "" {
				continue
			}
			cfg.Targets = append(cfg.Targets, testTarget)
			cfg.URLs = append(cfg.URLs, testTarget.URL)
			for _, status := range testTarget.ExpectedStatus {
				if status > 0 {
					statusSet[status] = struct{}{}
				}
			}
		}
		if len(statusSet) > 0 {
			cfg.ExpectedStatus = make([]int, 0, len(statusSet))
			for status := range statusSet {
				cfg.ExpectedStatus = append(cfg.ExpectedStatus, status)
			}
			// Stable ordering keeps the config/debug output deterministic.
			for i := 1; i < len(cfg.ExpectedStatus); i++ {
				for j := i; j > 0 && cfg.ExpectedStatus[j] < cfg.ExpectedStatus[j-1]; j-- {
					cfg.ExpectedStatus[j], cfg.ExpectedStatus[j-1] = cfg.ExpectedStatus[j-1], cfg.ExpectedStatus[j]
				}
			}
		}
		if len(cfg.Targets) > 0 {
			cfg.Method = cfg.Targets[0].Method
			cfg.Timeout = maxSpeedTestTargetTimeout(cfg.Targets, cfg.Timeout)
		}
	}
	if settings.BridgeStartTimeoutMs > 0 {
		cfg.TCPTimeout = time.Duration(settings.BridgeStartTimeoutMs) * time.Millisecond
	}
	return &cfg
}

func cloneSpeedTestConfig(src SpeedTestConfig) SpeedTestConfig {
	dst := src
	dst.URLs = append([]string{}, src.URLs...)
	dst.ExpectedStatus = append([]int{}, src.ExpectedStatus...)
	dst.Targets = append([]SpeedTestTarget{}, src.Targets...)
	for i := range dst.Targets {
		dst.Targets[i].ExpectedStatus = append([]int{}, src.Targets[i].ExpectedStatus...)
	}
	return dst
}

func BuildIPHealthConfig(settings config.ProxyCheckConfig) *IPHealthConfig {
	cfg := &IPHealthConfig{Source: "ip_health"}
	target := FindCheckTarget(settings.Targets, settings.IPHealthTargetID, "ip_health")
	if strings.TrimSpace(target.URL) != "" {
		cfg.URL = strings.TrimSpace(target.URL)
	}
	if strings.TrimSpace(target.ID) != "" {
		cfg.Source = strings.TrimSpace(target.ID)
	}
	if strings.TrimSpace(target.Parser) != "" {
		cfg.Parser = strings.TrimSpace(target.Parser)
	}
	if target.TimeoutMs > 0 {
		cfg.Timeout = time.Duration(target.TimeoutMs) * time.Millisecond
	}
	return cfg
}

func FindCheckTarget(targets []config.ProxyCheckTarget, id string, targetType string) config.ProxyCheckTarget {
	normalizedID := strings.TrimSpace(id)
	normalizedType := strings.TrimSpace(targetType)
	for _, target := range targets {
		if normalizedID != "" && strings.EqualFold(strings.TrimSpace(target.ID), normalizedID) {
			return target
		}
	}
	for _, target := range targets {
		if normalizedType != "" && strings.EqualFold(strings.TrimSpace(target.Type), normalizedType) {
			return target
		}
	}
	return config.ProxyCheckTarget{}
}

func NormalizeCheckTargets(targets []config.ProxyCheckTarget) []config.ProxyCheckTarget {
	result := make([]config.ProxyCheckTarget, 0, len(targets))
	seen := map[string]struct{}{}
	for _, target := range targets {
		target.ID = strings.TrimSpace(target.ID)
		target.Name = strings.TrimSpace(target.Name)
		target.Type = strings.TrimSpace(target.Type)
		target.URL = strings.TrimSpace(target.URL)
		target.Parser = strings.TrimSpace(target.Parser)
		target.Method = normalizeSpeedTestMethod(target.Method)
		if target.ID == "" || target.URL == "" {
			continue
		}
		key := strings.ToLower(target.ID)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		if target.Name == "" {
			target.Name = target.ID
		}
		if target.Type == "" {
			target.Type = "speed"
		}
		if target.TimeoutMs <= 0 {
			if strings.EqualFold(target.Type, "ip_health") {
				target.TimeoutMs = defaultIPHealthTargetTimeoutMs
			} else {
				target.TimeoutMs = defaultSpeedTargetTimeoutMs
			}
		}
		result = append(result, target)
	}
	return result
}

func FirstCheckTargetID(targets []config.ProxyCheckTarget, targetType string, fallback string) string {
	for _, target := range targets {
		if strings.EqualFold(strings.TrimSpace(target.Type), targetType) {
			return strings.TrimSpace(target.ID)
		}
	}
	return fallback
}

func normalizeSpeedTestMethod(method string) string {
	switch strings.ToUpper(strings.TrimSpace(method)) {
	case http.MethodHead:
		return http.MethodHead
	case http.MethodOptions:
		return http.MethodOptions
	case http.MethodGet:
		fallthrough
	default:
		return http.MethodGet
	}
}

func maxSpeedTestTargetTimeout(targets []SpeedTestTarget, fallback time.Duration) time.Duration {
	maxTimeout := fallback
	for _, target := range targets {
		if target.Timeout > maxTimeout {
			maxTimeout = target.Timeout
		}
	}
	return maxTimeout
}

func normalizePositiveInt(value int, fallback int) int {
	if value > 0 {
		return value
	}
	return fallback
}
