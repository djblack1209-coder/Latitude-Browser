package backend

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"

	"ant-chrome/backend/internal/apppath"
	"ant-chrome/backend/internal/config"
	"ant-chrome/backend/internal/fsutil"
)

func (a *App) proxyCoreStatus(spec proxyCoreSpec, target proxyCoreTarget) (result ProxyCoreStatusResult) {
	result = ProxyCoreStatusResult{Core: spec.Core, GOOS: target.GOOS, GOARCH: target.GOARCH}
	defer func() { result.State = proxyCoreStateForStatus(result) }()
	if a == nil || a.config == nil {
		result.Message = "配置未初始化"
		return result
	}
	result.Active = proxyCoreIsActive(a, spec)
	configuredPath := strings.TrimSpace(proxyCoreConfiguredPath(a, spec))
	if configuredPath != "" && target.GOOS == goruntime.GOOS && target.GOARCH == goruntime.GOARCH {
		if path, ok := existingProxyCoreFile(configuredPath, a.appRoot); ok && proxyCoreBinaryUsable(path, target.GOOS) {
			result.Installed = true
			result.Configured = true
			result.BinaryPath = path
			result.Source = "config"
			result.Message = proxyCoreInstalledMessage(result.Active, true)
			return result
		}
	}
	if path, source, ok := findInstalledProxyCoreBinary(a.appRoot, spec, target); ok {
		result.Installed = true
		result.BinaryPath = path
		result.Source = source
		if target.GOOS == goruntime.GOOS && target.GOARCH == goruntime.GOARCH && configuredPath != "" {
			if configured, ok := existingProxyCoreFile(configuredPath, a.appRoot); ok && sameCleanPath(configured, path) {
				result.Configured = true
				result.Source = "config"
			}
		}
		result.Message = proxyCoreInstalledMessage(result.Active, result.Configured)
		return result
	}
	if result.Active {
		result.Message = "当前内核未找到"
		return result
	}
	result.Message = "未下载"
	return result
}

// BrowserProxyConnectorPreflight reports whether every local core required by
// a connector stack is present for the requested target. It intentionally does
// not start a proxy bridge or perform an external request; callers should run
// the real connectivity check only after this local gate is ready.
func (a *App) BrowserProxyConnectorPreflight(input ProxyConnectorPreflightRequest) ProxyConnectorPreflightResult {
	connector := strings.TrimSpace(input.ConnectorType)
	if connector == "" && a != nil && a.config != nil {
		connector = a.config.Browser.DefaultConnectorType
	}
	connector = config.NormalizeBrowserConnectorType(connector)

	target, err := normalizeProxyCoreTarget(input.GOOS, input.GOARCH)
	result := ProxyConnectorPreflightResult{
		ConnectorType: connector,
		RequiredCores: requiredProxyCoreNames(connector),
		Cores:         []ProxyCoreStatusResult{},
		MissingCores:  []string{},
	}
	if err != nil {
		result.State = ProxyCoreStateUnavailable
		result.Message = err.Error()
		return result
	}
	result.GOOS = target.GOOS
	result.GOARCH = target.GOARCH

	unavailable := false
	for _, core := range result.RequiredCores {
		spec, specErr := normalizeProxyCoreSpec(core)
		if specErr != nil {
			result.MissingCores = append(result.MissingCores, core)
			continue
		}
		status := a.proxyCoreStatus(spec, target)
		// The selected connector in this request is authoritative. This allows
		// settings screens to preflight a pending selection before saving it,
		// without mutating persisted configuration or pretending to run it.
		status.Active = true
		status.State = proxyCoreStateForRequirement(status, true)
		if status.State == ProxyCoreStateUnavailable {
			unavailable = true
		}
		result.Cores = append(result.Cores, status)
		if !status.Installed {
			result.MissingCores = append(result.MissingCores, core)
		}
	}
	if unavailable {
		result.State = ProxyCoreStateUnavailable
		result.Message = "无法读取本机内核状态"
		return result
	}
	result.Ready = len(result.MissingCores) == 0 && len(result.Cores) == len(result.RequiredCores)
	if result.Ready {
		result.State = ProxyCoreStateReady
		result.Message = "连接栈本地内核就绪"
	} else {
		result.State = ProxyCoreStateMissing
		if len(result.MissingCores) > 0 {
			result.Message = "缺少必需内核: " + strings.Join(result.MissingCores, ", ")
		} else {
			result.Message = "连接栈本地内核未就绪"
		}
	}
	return result
}

func requiredProxyCoreNames(connector string) []string {
	if config.NormalizeBrowserConnectorType(connector) == config.BrowserConnectorMihomo {
		return []string{"mihomo"}
	}
	return []string{"xray", "sing-box"}
}

func proxyCoreStateForStatus(status ProxyCoreStatusResult) ProxyCoreState {
	if status.Core == "" || (status.Message == "配置未初始化" && !status.Installed) {
		return ProxyCoreStateUnavailable
	}
	return proxyCoreStateForRequirement(status, status.Active)
}

func proxyCoreStateForRequirement(status ProxyCoreStatusResult, required bool) ProxyCoreState {
	if !status.Installed {
		if status.Message == "配置未初始化" {
			return ProxyCoreStateUnavailable
		}
		return ProxyCoreStateMissing
	}
	if required {
		return ProxyCoreStateReady
	}
	if strings.EqualFold(strings.TrimSpace(status.Source), "downloaded") && !status.Configured {
		return ProxyCoreStateDownloaded
	}
	return ProxyCoreStateInstalled
}

func proxyCoreIsActive(a *App, spec proxyCoreSpec) bool {
	if a == nil || a.config == nil {
		return false
	}

	// The xray connector is a combined Xray + sing-box stack. The persisted
	// connector value is normalized to "xray", so both components are active
	// requirements when that stack is selected. Mihomo is intentionally kept
	// isolated and never treated as a fallback for the combined stack.
	current := config.NormalizeBrowserConnectorType(a.config.Browser.DefaultConnectorType)
	switch spec.Core {
	case "xray", "sing-box":
		return current == config.BrowserConnectorXray
	case "mihomo":
		return current == config.BrowserConnectorMihomo
	default:
		return false
	}
}

func proxyCoreInstalledMessage(active bool, configured bool) string {
	if active {
		return "已启用"
	}
	if configured {
		return "已配置"
	}
	return "已下载"
}

func findInstalledProxyCoreBinary(appRoot string, spec proxyCoreSpec, target proxyCoreTarget) (string, string, bool) {
	platformDir := fmt.Sprintf("%s-%s", target.GOOS, target.GOARCH)
	searchDirs := []struct {
		path   string
		source string
	}{
		{apppath.Resolve(appRoot, filepath.Join("bin", platformDir, spec.Core)), "downloaded"},
		{apppath.Resolve(appRoot, filepath.Join("bin", platformDir)), "runtime"},
		{apppath.Resolve(appRoot, "bin"), "runtime"},
	}
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		searchDirs = append(searchDirs,
			struct {
				path   string
				source string
			}{filepath.Join(exeDir, "bin", platformDir, spec.Core), "downloaded"},
			struct {
				path   string
				source string
			}{filepath.Join(exeDir, "bin", platformDir), "runtime"},
			struct {
				path   string
				source string
			}{filepath.Join(exeDir, "bin"), "runtime"},
		)
	}
	for _, dir := range searchDirs {
		if strings.TrimSpace(dir.path) == "" {
			continue
		}
		if path, err := findProxyCoreBinary(dir.path, spec.BinaryBase, target.GOOS); err == nil && proxyCoreBinaryUsable(path, target.GOOS) {
			return path, dir.source, true
		}
	}
	if target.GOOS == goruntime.GOOS && target.GOARCH == goruntime.GOARCH {
		if path, err := exec.LookPath(proxyCoreBinaryName(spec.BinaryBase, target.GOOS)); err == nil {
			return path, "path", true
		}
	}
	return "", "", false
}

func proxyCoreBinaryUsable(path string, targetOS string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	// Windows does not expose a meaningful executable bit. On Unix targets,
	// a downloaded core without any execute bit can never start and must not be
	// reported as ready.
	if targetOS != "windows" && info.Mode().Perm()&0o111 == 0 {
		return false
	}
	return true
}

func proxyCoreConfiguredPath(a *App, spec proxyCoreSpec) string {
	if a == nil || a.config == nil {
		return ""
	}
	switch spec.ConfigKey {
	case "xray":
		return a.config.Browser.XrayBinaryPath
	case "clash":
		return a.config.Browser.ClashBinaryPath
	case "sing-box":
		return a.config.Browser.SingBoxBinaryPath
	default:
		return ""
	}
}

func existingProxyCoreFile(path string, appRoot string) (string, bool) {
	path = fsutil.NormalizePathInput(path)
	if path == "" {
		return "", false
	}
	if !filepath.IsAbs(path) && strings.TrimSpace(appRoot) != "" {
		path = apppath.Resolve(appRoot, path)
	}
	if info, err := os.Stat(path); err == nil && !info.IsDir() {
		return path, true
	}
	return "", false
}

func sameCleanPath(a string, b string) bool {
	return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}

func (a *App) saveProxyCoreBinaryPath(spec proxyCoreSpec, binaryPath string) error {
	if a.config == nil {
		return fmt.Errorf("config is nil")
	}
	clean := fsutil.NormalizePathInput(binaryPath)
	switch spec.ConfigKey {
	case "xray":
		a.config.Browser.XrayBinaryPath = clean
	case "clash":
		a.config.Browser.ClashBinaryPath = clean
	case "sing-box":
		a.config.Browser.SingBoxBinaryPath = clean
	default:
		return fmt.Errorf("未知配置键: %s", spec.ConfigKey)
	}
	if a.xrayMgr != nil {
		a.xrayMgr.Config = a.config
	}
	if a.clashMgr != nil {
		a.clashMgr.Config = a.config
	}
	if a.singboxMgr != nil {
		a.singboxMgr.Config = a.config
	}
	return a.config.Save(a.resolveAppPath("config.yaml"))
}
