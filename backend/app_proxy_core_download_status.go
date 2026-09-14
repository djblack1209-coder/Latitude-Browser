package backend

import (
	"errors"
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
	native := target.GOOS == goruntime.GOOS && target.GOARCH == goruntime.GOARCH
	type searchLocation struct {
		path      string
		source    string
		recursive bool
	}
	var locations []searchLocation
	addRoot := func(binDir string) {
		locations = append(locations,
			searchLocation{filepath.Join(binDir, platformDir, spec.Core), "downloaded", true},
			searchLocation{filepath.Join(binDir, platformDir), "runtime", true},
		)
		if native {
			// Packaged flat binaries are native-only. Never scan all platform
			// subdirectories and mistake a foreign download for a usable core.
			locations = append(locations, searchLocation{binDir, "runtime", false})
		}
	}
	addRoot(apppath.Resolve(appRoot, "bin"))
	if exePath, err := os.Executable(); err == nil {
		addRoot(filepath.Join(filepath.Dir(exePath), "bin"))
	}
	for _, location := range locations {
		// A valid exact candidate must not be hidden by an unrelated unreadable
		// child. Extraction still uses strict recursive validation; discovery
		// checks known locations before the compatibility filename search.
		candidate := filepath.Join(location.path, proxyCoreBinaryName(spec.BinaryBase, target.GOOS))
		if info, err := os.Lstat(candidate); err == nil && info.Mode().IsRegular() && proxyCoreBinaryUsable(candidate, target.GOOS) {
			return candidate, location.source, true
		}
		if path, err := findProxyCoreBinaryScoped(location.path, spec.BinaryBase, target.GOOS, location.recursive); err == nil && proxyCoreBinaryUsable(path, target.GOOS) {
			return path, location.source, true
		}
	}
	if native {
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

// Called under maintenanceMu by the installer. Keep both the old on-disk
// config and the live object unchanged if serialization/write/rename fails.
func (a *App) saveProxyCoreBinaryPath(spec proxyCoreSpec, binaryPath string) error {
	if a == nil || a.config == nil {
		return fmt.Errorf("config is nil")
	}
	clean := fsutil.NormalizePathInput(binaryPath)
	candidate := *a.config
	switch spec.ConfigKey {
	case "xray":
		candidate.Browser.XrayBinaryPath = clean
	case "clash":
		candidate.Browser.ClashBinaryPath = clean
	case "sing-box":
		candidate.Browser.SingBoxBinaryPath = clean
	default:
		return fmt.Errorf("未知配置键: %s", spec.ConfigKey)
	}
	configPath := a.resolveAppPath("config.yaml")
	old, err := os.Lstat(configPath)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	if err == nil && !old.Mode().IsRegular() {
		return fmt.Errorf("配置路径不是普通文件，原配置未改动")
	}
	if err := os.MkdirAll(filepath.Dir(configPath), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(configPath), ".proxy-core-config-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := candidate.Save(tmp.Name()); err != nil {
		return err
	}
	// Existing permissions are retained; a new config stays private (0600).
	if old != nil {
		if err := os.Chmod(tmp.Name(), old.Mode().Perm()); err != nil {
			return err
		}
	}
	written, err := os.OpenFile(tmp.Name(), os.O_RDWR, 0)
	if err != nil {
		return err
	}
	if err := errors.Join(written.Sync(), written.Close()); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), configPath); err != nil {
		return err
	}
	// Publish only the selected path. Installing a core must never change the
	// active connector or write a partially updated in-memory configuration.
	switch spec.ConfigKey {
	case "xray":
		a.config.Browser.XrayBinaryPath = clean
	case "clash":
		a.config.Browser.ClashBinaryPath = clean
	case "sing-box":
		a.config.Browser.SingBoxBinaryPath = clean
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
	return nil
}
