package backend

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	"ant-chrome/backend/internal/apppath"
	"ant-chrome/backend/internal/fsutil"
	"ant-chrome/backend/internal/logger"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type ProxyCoreDownloadRequest struct {
	Core        string `json:"core"`
	GOOS        string `json:"goos"`
	GOARCH      string `json:"goarch"`
	ProxyConfig string `json:"proxyConfig"`
	Version     string `json:"version"`
}

type ProxyCoreDownloadProgress struct {
	Core     string `json:"core"`
	GOOS     string `json:"goos"`
	GOARCH   string `json:"goarch"`
	Phase    string `json:"phase"`
	Progress int    `json:"progress"`
	Message  string `json:"message"`
}

// ProxyCoreState is the machine-readable readiness state for a connector core.
//
// The old Installed/Configured/Active booleans are kept for backwards
// compatibility with older Wails clients. New callers should prefer State:
//
//	ready     - required by the current connector and executable
//	installed - executable is available and configured, but not required now
//	downloaded - app-managed binary was found, but it is not configured/active
//	missing   - required or requested binary was not found
//	unavailable - the desktop bridge/configuration is not ready to answer
//
// State deliberately describes local readiness only. It is not a claim that a
// remote proxy can reach the internet.
type ProxyCoreState string

const (
	ProxyCoreStateReady       ProxyCoreState = "ready"
	ProxyCoreStateInstalled   ProxyCoreState = "installed"
	ProxyCoreStateDownloaded  ProxyCoreState = "downloaded"
	ProxyCoreStateMissing     ProxyCoreState = "missing"
	ProxyCoreStateUnavailable ProxyCoreState = "unavailable"
)

type ProxyCoreStatusResult struct {
	Core       string         `json:"core"`
	GOOS       string         `json:"goos"`
	GOARCH     string         `json:"goarch"`
	Installed  bool           `json:"installed"`
	Configured bool           `json:"configured"`
	Active     bool           `json:"active"`
	State      ProxyCoreState `json:"state"`
	BinaryPath string         `json:"binaryPath"`
	Source     string         `json:"source"`
	Message    string         `json:"message"`
}

// ProxyConnectorPreflightRequest selects the connector stack to inspect. An
// empty ConnectorType uses the persisted browser policy; empty platform fields
// use the current native target.
type ProxyConnectorPreflightRequest struct {
	ConnectorType string `json:"connectorType"`
	GOOS          string `json:"goos"`
	GOARCH        string `json:"goarch"`
}

type ProxyConnectorPreflightResult struct {
	ConnectorType string                  `json:"connectorType"`
	GOOS          string                  `json:"goos"`
	GOARCH        string                  `json:"goarch"`
	Ready         bool                    `json:"ready"`
	State         ProxyCoreState          `json:"state"`
	RequiredCores []string                `json:"requiredCores"`
	MissingCores  []string                `json:"missingCores"`
	Cores         []ProxyCoreStatusResult `json:"cores"`
	Message       string                  `json:"message"`
}

type ProxyCoreDownloadInfoResult struct {
	Core        string `json:"core"`
	GOOS        string `json:"goos"`
	GOARCH      string `json:"goarch"`
	Version     string `json:"version"`
	Repo        string `json:"repo"`
	ReleaseURL  string `json:"releaseUrl"`
	DownloadURL string `json:"downloadUrl"`
	AssetName   string `json:"assetName"`
	InstallDir  string `json:"installDir"`
	BinaryName  string `json:"binaryName"`
	Message     string `json:"message"`
}

type proxyCoreSpec struct {
	Core        string
	Repo        string
	DisplayName string
	BinaryBase  string
	ConfigKey   string
	Version     string
}

func (a *App) BrowserProxyCoreDownload(input ProxyCoreDownloadRequest) error {
	if a.ctx == nil {
		return fmt.Errorf("app context is nil")
	}
	spec, err := normalizeProxyCoreSpec(input.Core)
	if err != nil {
		return err
	}
	target, err := normalizeProxyCoreTarget(input.GOOS, input.GOARCH)
	if err != nil {
		return err
	}
	if err := a.ctx.Err(); err != nil {
		return err
	}
	// Acquire before returning to Wails so rapid repeated clicks cannot start
	// competing installs, even when they originate from different screens.
	releaseDownload, err := tryBeginProxyCoreDownload(proxyCoreInstallDir(a, spec, target))
	if err != nil {
		return err
	}
	releaseActivity, activityErr := a.dataActivity.begin()
	if activityErr != nil {
		releaseDownload()
		return activityErr
	}
	version := normalizeProxyCoreVersion(input.Version, spec.Version)
	go func() {
		defer releaseDownload()
		defer releaseActivity()
		a.downloadProxyCore(a.ctx, spec, target, input.ProxyConfig, version)
	}()
	return nil
}

func (a *App) BrowserProxyCoreStatus(input ProxyCoreDownloadRequest) ProxyCoreStatusResult {
	spec, err := normalizeProxyCoreSpec(input.Core)
	if err != nil {
		return ProxyCoreStatusResult{Core: strings.TrimSpace(input.Core), Message: err.Error()}
	}
	target, err := normalizeProxyCoreTarget(input.GOOS, input.GOARCH)
	if err != nil {
		return ProxyCoreStatusResult{Core: spec.Core, Message: err.Error()}
	}
	return a.proxyCoreStatus(spec, target)
}

func (a *App) BrowserProxyCoreDownloadInfo(input ProxyCoreDownloadRequest) ProxyCoreDownloadInfoResult {
	spec, err := normalizeProxyCoreSpec(input.Core)
	if err != nil {
		return ProxyCoreDownloadInfoResult{Core: strings.TrimSpace(input.Core), Message: err.Error()}
	}
	target, err := normalizeProxyCoreTarget(input.GOOS, input.GOARCH)
	if err != nil {
		return ProxyCoreDownloadInfoResult{Core: spec.Core, Message: err.Error()}
	}
	version := normalizeProxyCoreVersion(input.Version, spec.Version)
	info := proxyCoreDownloadInfoBase(a, spec, target)
	info.Version = version
	info.ReleaseURL = proxyCoreReleaseURL(spec.Repo, version)
	client, _, err := proxyCoreReleaseHTTPClient(30*time.Second, input.ProxyConfig)
	if err != nil {
		info.Message = manualProxyCoreDownloadMessage(spec, target, "下载代理配置错误: "+err.Error())
		return info
	}
	defer client.CloseIdleConnections()
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	release, err := fetchGitHubRelease(ctx, client, spec.Repo, version)
	if err != nil {
		info.Message = manualProxyCoreDownloadMessage(spec, target, "自动查询 Release 失败: "+err.Error())
		return info
	}
	asset, err := selectProxyCoreAsset(spec, release.Assets, target.GOOS, target.GOARCH)
	if err != nil {
		info.Message = manualProxyCoreDownloadMessage(spec, target, err.Error())
		return info
	}
	info.Version = release.TagName
	info.ReleaseURL = proxyCoreReleaseURL(spec.Repo, release.TagName)
	if err := validateProxyCoreReleaseAsset(spec, release, asset); err != nil {
		info.Message = err.Error()
		return info
	}
	info.AssetName = asset.Name
	info.DownloadURL = asset.BrowserDownloadURL
	info.Message = "自动安装将核对官方 SHA-256；手动下载也需核验后再使用"
	return info
}

func (a *App) BrowserProxyCoreOpenLocal(input ProxyCoreDownloadRequest) error {
	spec, err := normalizeProxyCoreSpec(input.Core)
	if err != nil {
		return err
	}
	target, err := normalizeProxyCoreTarget(input.GOOS, input.GOARCH)
	if err != nil {
		return err
	}
	status := a.proxyCoreStatus(spec, target)
	path := strings.TrimSpace(status.BinaryPath)
	if path == "" {
		path = proxyCoreInstallDir(a, spec, target)
		if err := os.MkdirAll(path, 0o755); err != nil {
			return fmt.Errorf("创建本地目录失败: %w", err)
		}
	}
	if err := openPathInFileManager(path); err != nil {
		return fmt.Errorf("打开本地路径失败: %w", err)
	}
	return nil
}

type proxyCoreTarget struct {
	GOOS   string
	GOARCH string
}

func normalizeProxyCoreTarget(goos string, goarch string) (proxyCoreTarget, error) {
	goos = strings.ToLower(strings.TrimSpace(goos))
	goarch = strings.ToLower(strings.TrimSpace(goarch))
	if goos == "" {
		goos = goruntime.GOOS
	}
	if goarch == "" {
		goarch = goruntime.GOARCH
	}
	switch goos {
	case "win", "windows":
		goos = "windows"
	case "linux":
		goos = "linux"
	case "mac", "macos", "darwin":
		goos = "darwin"
	default:
		return proxyCoreTarget{}, fmt.Errorf("不支持的目标系统: %s", goos)
	}
	switch goarch {
	case "x64", "x86_64", "amd64":
		goarch = "amd64"
	case "aarch64", "arm64":
		goarch = "arm64"
	case "x86", "i386", "386":
		goarch = "386"
	default:
		return proxyCoreTarget{}, fmt.Errorf("不支持的目标架构: %s", goarch)
	}
	return proxyCoreTarget{GOOS: goos, GOARCH: goarch}, nil
}

func normalizeProxyCoreSpec(core string) (proxyCoreSpec, error) {
	switch strings.ToLower(strings.TrimSpace(core)) {
	case "", "xray":
		return proxyCoreSpec{Core: "xray", Repo: "XTLS/Xray-core", DisplayName: "Xray", BinaryBase: "xray", ConfigKey: "xray", Version: "v26.3.27"}, nil
	case "mihomo", "clash", "clash-meta":
		return proxyCoreSpec{Core: "mihomo", Repo: "MetaCubeX/mihomo", DisplayName: "Mihomo", BinaryBase: "mihomo", ConfigKey: "clash", Version: "v1.19.27"}, nil
	case "sing-box", "singbox":
		return proxyCoreSpec{Core: "sing-box", Repo: "SagerNet/sing-box", DisplayName: "sing-box", BinaryBase: "sing-box", ConfigKey: "sing-box", Version: "v1.13.13"}, nil
	default:
		return proxyCoreSpec{}, fmt.Errorf("不支持的代理内核: %s", core)
	}
}

// Entries exist only for the duration of a download. The key includes the
// managed root and target, so unrelated installations do not block each other.
var activeProxyCoreDownloads sync.Map

func tryBeginProxyCoreDownload(installDir string) (func(), error) {
	key, err := filepath.Abs(installDir)
	if err != nil {
		return nil, err
	}
	key = filepath.Clean(key)
	if goruntime.GOOS == "windows" {
		key = strings.ToLower(key)
	}
	if _, loaded := activeProxyCoreDownloads.LoadOrStore(key, struct{}{}); loaded {
		return nil, fmt.Errorf("该目标内核正在下载或安装，请等待本次完成后重试")
	}
	var once sync.Once
	return func() { once.Do(func() { activeProxyCoreDownloads.Delete(key) }) }, nil
}

func (a *App) downloadProxyCore(ctx context.Context, spec proxyCoreSpec, target proxyCoreTarget, proxyConfig string, version string) {
	send := func(phase string, progress int, message string) {
		wailsruntime.EventsEmit(ctx, "proxy-core:download:progress", ProxyCoreDownloadProgress{Core: spec.Core, GOOS: target.GOOS, GOARCH: target.GOARCH, Phase: phase, Progress: progress, Message: message})
	}
	client, proxyLabel, err := proxyCoreReleaseHTTPClient(90*time.Second, proxyConfig)
	if err != nil {
		send("error", 0, "下载代理配置错误: "+err.Error())
		return
	}
	defer client.CloseIdleConnections()
	send("resolving", 0, fmt.Sprintf("正在查询官方 Release %s（%s）", version, proxyLabel))
	release, err := fetchGitHubRelease(ctx, client, spec.Repo, version)
	if err != nil {
		send("error", 0, "查询 Release 失败: "+err.Error())
		return
	}
	installedBinary, err := a.installProxyCoreRelease(ctx, client, spec, target, release, send)
	if err != nil {
		send("error", 0, err.Error())
		return
	}
	if target.GOOS == goruntime.GOOS && target.GOARCH == goruntime.GOARCH {
		// Installing a core does not select its connector stack, nor prove
		// that a remote proxy is reachable. Do not call this "enabled".
		send("done", 100, fmt.Sprintf("%s 已校验并安装: %s", spec.DisplayName, installedBinary))
	} else {
		send("done", 100, fmt.Sprintf("%s 已校验并下载（%s/%s），未在本机运行: %s", spec.DisplayName, target.GOOS, target.GOARCH, installedBinary))
	}
	logger.New("ProxyCore").Info("代理内核安装完成", logger.F("core", spec.Core), logger.F("target", target.GOOS+"-"+target.GOARCH), logger.F("version", release.TagName), logger.F("binary", installedBinary))
}

// installProxyCoreRelease is the same pipeline used by the desktop downloader.
// It deliberately emits no success event: only the caller may do so after the
// archive, executable and configuration transaction all succeed.
func (a *App) installProxyCoreRelease(ctx context.Context, client *http.Client, spec proxyCoreSpec, target proxyCoreTarget, release githubRelease, send func(string, int, string)) (string, error) {
	if a == nil {
		return "", fmt.Errorf("应用未初始化")
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	asset, err := selectProxyCoreAsset(spec, release.Assets, target.GOOS, target.GOARCH)
	if err != nil {
		return "", err
	}
	if err := validateProxyCoreReleaseAsset(spec, release, asset); err != nil {
		return "", err
	}
	installDir := proxyCoreInstallDir(a, spec, target)
	if err := os.MkdirAll(filepath.Dir(installDir), 0o755); err != nil {
		return "", fmt.Errorf("创建暂存目录失败: %w", err)
	}
	// Stage next to (never inside) the installed core. Until promotion, neither
	// preflight nor the running connector should discover this candidate.
	stageDir, err := os.MkdirTemp(filepath.Dir(installDir), ".proxy-core-staging-")
	if err != nil {
		return "", fmt.Errorf("创建暂存目录失败: %w", err)
	}
	defer os.RemoveAll(stageDir)
	archive, err := os.CreateTemp(stageDir, "archive-*"+archiveExt(asset.Name))
	if err != nil {
		return "", fmt.Errorf("创建临时文件失败: %w", err)
	}
	send("downloading", 5, fmt.Sprintf("开始下载 %s %s", spec.DisplayName, release.TagName))
	downloadErr := downloadProxyCoreAsset(ctx, client, asset, archive, send)
	if err := errors.Join(downloadErr, archive.Close()); err != nil {
		return "", fmt.Errorf("下载校验失败: %w", err)
	}
	extractDir := filepath.Join(stageDir, "payload")
	if err := os.Mkdir(extractDir, 0o755); err != nil {
		return "", fmt.Errorf("创建解压目录失败: %w", err)
	}
	send("extracting", 80, "SHA-256 校验通过，正在解压")
	if err := extractProxyCoreArchive(archive.Name(), extractDir, spec.BinaryBase, target.GOOS); err != nil {
		return "", fmt.Errorf("解压失败: %w", err)
	}
	binaryPath, err := findProxyCoreBinary(extractDir, spec.BinaryBase, target.GOOS)
	if err != nil {
		return "", err
	}
	binaryPath, err = normalizeInstalledProxyCoreBinary(binaryPath, extractDir, spec.BinaryBase, target.GOOS)
	if err != nil {
		return "", fmt.Errorf("规范候选内核文件名失败: %w", err)
	}
	send("validating", 90, "正在检查候选内核")
	if err := validateProxyCoreBinary(ctx, binaryPath, spec, target, release.TagName); err != nil {
		return "", err
	}
	// Preserve the actual normalized filename, including on case-sensitive
	// filesystems where a legacy/packaged core may still be named "Xray".
	relativeBinary, err := filepath.Rel(extractDir, binaryPath)
	if err != nil {
		return "", fmt.Errorf("读取候选内核相对路径失败: %w", err)
	}
	installedBinary := filepath.Join(installDir, relativeBinary)

	// Downloads of different cores may overlap, but configuration commits and
	// backup/import operations must not overlap the final short promotion step.
	a.maintenanceMu.Lock()
	defer a.maintenanceMu.Unlock()
	if err := ctx.Err(); err != nil {
		return "", err
	}
	send("installing", 95, "正在安装已校验内核")
	err = replaceDirContents(extractDir, installDir, func() error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if target.GOOS == goruntime.GOOS && target.GOARCH == goruntime.GOARCH {
			if err := a.saveProxyCoreBinaryPath(spec, installedBinary); err != nil {
				return fmt.Errorf("保存内核配置失败: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("安装失败: %w", err)
	}
	return installedBinary, nil
}

// Version commands run only after archive verification, against the isolated
// candidate, with bounded time/output. A foreign-target download is not executed.
func validateProxyCoreBinary(ctx context.Context, path string, spec proxyCoreSpec, target proxyCoreTarget, tag string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return fmt.Errorf("读取候选内核失败: %w", err)
	}
	if !info.Mode().IsRegular() || info.Size() == 0 {
		return fmt.Errorf("候选内核不是有效的普通文件")
	}
	if target.GOOS != goruntime.GOOS || target.GOARCH != goruntime.GOARCH {
		return nil
	}
	if err := fsutil.EnsureExecutable(path); err != nil {
		return fmt.Errorf("设置候选内核可执行权限失败: %w", err)
	}
	args := []string{"version"}
	if spec.Core == "mihomo" {
		args = []string{"-v"}
	}
	checkCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(checkCtx, path, args...)
	cmd.Dir = filepath.Dir(path)
	cmd.WaitDelay = time.Second
	var output proxyCoreVersionOutput
	cmd.Stdout, cmd.Stderr = &output, &output
	runErr := cmd.Run()
	if err := checkCtx.Err(); err != nil {
		return fmt.Errorf("候选内核版本检查超时或取消: %w", err)
	}
	if runErr != nil {
		return fmt.Errorf("候选内核无法运行: %w", runErr)
	}
	if output.truncated {
		return fmt.Errorf("候选内核版本输出异常，已停止安装")
	}
	firstLine, _, _ := strings.Cut(strings.TrimSpace(output.String()), "\n")
	fields := strings.Fields(firstLine)
	actual := ""
	switch spec.Core {
	case "xray":
		if len(fields) >= 2 && fields[0] == "Xray" {
			actual = fields[1]
		}
	case "mihomo":
		if len(fields) >= 3 && fields[0] == "Mihomo" && fields[1] == "Meta" {
			actual = fields[2]
		}
	case "sing-box":
		if len(fields) >= 3 && fields[0] == "sing-box" && fields[1] == "version" {
			actual = fields[2]
		}
	}
	if actual == "" || strings.TrimPrefix(actual, "v") != strings.TrimPrefix(tag, "v") {
		return fmt.Errorf("候选内核身份或版本与 %s %s 不符，已停止安装", spec.DisplayName, tag)
	}
	return nil
}

type proxyCoreVersionOutput struct {
	buffer    bytes.Buffer
	truncated bool
}

func (w *proxyCoreVersionOutput) String() string { return w.buffer.String() }

func (w *proxyCoreVersionOutput) Write(data []byte) (int, error) {
	const limit = 16 * 1024
	length := len(data)
	if len(data) > limit-w.buffer.Len() {
		data = data[:limit-w.buffer.Len()]
		w.truncated = true
	}
	_, _ = w.buffer.Write(data)
	return length, nil
}

func proxyCoreDownloadInfoBase(a *App, spec proxyCoreSpec, target proxyCoreTarget) ProxyCoreDownloadInfoResult {
	return ProxyCoreDownloadInfoResult{
		Core:       spec.Core,
		GOOS:       target.GOOS,
		GOARCH:     target.GOARCH,
		Version:    spec.Version,
		Repo:       spec.Repo,
		ReleaseURL: proxyCoreReleaseURL(spec.Repo, spec.Version),
		InstallDir: proxyCoreInstallDir(a, spec, target),
		BinaryName: proxyCoreBinaryName(spec.BinaryBase, target.GOOS),
	}
}

func normalizeProxyCoreVersion(version string, fallback string) string {
	version = strings.TrimSpace(version)
	if version == "" || strings.EqualFold(version, "stable") {
		version = strings.TrimSpace(fallback)
	}
	if version == "" || strings.EqualFold(version, "latest") {
		return "latest"
	}
	if !strings.HasPrefix(strings.ToLower(version), "v") {
		version = "v" + version
	}
	return version
}

func proxyCoreReleaseURL(repo string, version string) string {
	if strings.EqualFold(strings.TrimSpace(version), "latest") {
		return "https://github.com/" + repo + "/releases/latest"
	}
	return "https://github.com/" + repo + "/releases/tag/" + strings.TrimSpace(version)
}

func proxyCoreInstallDir(a *App, spec proxyCoreSpec, target proxyCoreTarget) string {
	appRoot := ""
	if a != nil {
		appRoot = a.appRoot
	}
	return apppath.Resolve(appRoot, filepath.Join("bin", fmt.Sprintf("%s-%s", target.GOOS, target.GOARCH), spec.Core))
}

func manualProxyCoreDownloadMessage(spec proxyCoreSpec, target proxyCoreTarget, reason string) string {
	return fmt.Sprintf("%s。请打开 Release 页面，下载 %s/%s 的 %s，解压后把 %s 放到本地目录。需要代理时，请在下载代理里填写 http://、https:// 或 socks5:// 地址。", reason, target.GOOS, target.GOARCH, spec.DisplayName, proxyCoreBinaryName(spec.BinaryBase, target.GOOS))
}
