package backend

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	xproxy "golang.org/x/net/proxy"
)

type githubRelease struct {
	TagName string               `json:"tag_name"`
	Assets  []githubReleaseAsset `json:"assets"`
}

type githubReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
	// GitHub's digest is over the release archive, not the extracted executable.
	// This is an online integrity check, not a pinned or independently signed attestation.
	Digest string `json:"digest"`
}

func proxyCoreHTTPClient(timeout time.Duration, proxyConfig string) (*http.Client, string, error) {
	proxyConfig = strings.TrimSpace(proxyConfig)
	if proxyConfig == "" || strings.EqualFold(proxyConfig, "direct://") {
		return &http.Client{Timeout: timeout, Transport: proxyCoreDirectTransport()}, "直连", nil
	}
	u, err := url.Parse(proxyConfig)
	if err != nil {
		return nil, "", fmt.Errorf("代理地址解析失败: %w", err)
	}
	if isBadLocalHTTPSProxy(u) {
		return nil, "", fmt.Errorf("下载代理不能填 %s，127.0.0.1:443 通常不是本机代理端口；请改成真实代理端口，如 socks5://127.0.0.1:7890，或留空直连", u.Host)
	}
	scheme := strings.ToLower(u.Scheme)
	switch scheme {
	case "http", "https":
		return &http.Client{Timeout: timeout, Transport: &http.Transport{Proxy: http.ProxyURL(u)}}, "指定代理", nil
	case "socks5":
		var auth *xproxy.Auth
		if u.User != nil {
			password, _ := u.User.Password()
			auth = &xproxy.Auth{User: u.User.Username(), Password: password}
		}
		dialer, err := xproxy.SOCKS5("tcp", u.Host, auth, xproxy.Direct)
		if err != nil {
			return nil, "", fmt.Errorf("SOCKS5 dialer 创建失败: %w", err)
		}
		contextDialer, ok := dialer.(xproxy.ContextDialer)
		if !ok {
			return nil, "", fmt.Errorf("SOCKS5 dialer 不支持 ContextDialer")
		}
		return &http.Client{Timeout: timeout, Transport: &http.Transport{DialContext: contextDialer.DialContext}}, "指定代理", nil
	default:
		return nil, "", fmt.Errorf("仅支持 http://、https://、socks5:// 或 direct://")
	}
}

// The transport factory is also used for Chrome extension downloads. Restrict
// redirects only for official core releases, not for unrelated HTTPS clients.
func proxyCoreReleaseHTTPClient(timeout time.Duration, proxyConfig string) (*http.Client, string, error) {
	client, label, err := proxyCoreHTTPClient(timeout, proxyConfig)
	if err != nil {
		return nil, label, err
	}
	client.CheckRedirect = proxyCoreCheckRedirect
	return client, label, nil
}

// Keep release redirects on GitHub's HTTPS delivery infrastructure even when
// the user explicitly routes the request through a download proxy.
func proxyCoreCheckRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= 10 {
		return fmt.Errorf("下载重定向次数过多")
	}
	u := req.URL
	if u.Scheme != "https" || u.User != nil || (u.Port() != "" && u.Port() != "443") {
		return fmt.Errorf("拒绝不安全的下载重定向")
	}
	switch strings.ToLower(u.Hostname()) {
	case "github.com", "api.github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com":
		return nil
	default:
		return fmt.Errorf("拒绝跳转到非官方 GitHub 下载主机")
	}
}

func proxyCoreDirectTransport() *http.Transport {
	dialer := &net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}
	return &http.Transport{
		DialContext: func(ctx context.Context, network string, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err == nil && port == "443" && isLocalhostHost(host) {
				return nil, fmt.Errorf("直连下载被解析到 %s：这通常是本机 hosts/DNS 污染或仍在运行旧版本。请重启应用；如果仍出现，请检查 hosts/DNS，或在下载代理中填写真实代理端口", address)
			}
			return dialer.DialContext(ctx, network, address)
		},
	}
}

func isBadLocalHTTPSProxy(u *url.URL) bool {
	if u == nil {
		return false
	}
	return isLocalhostHost(u.Hostname()) && u.Port() == "443"
}

func isLocalhostHost(host string) bool {
	host = strings.Trim(strings.ToLower(strings.TrimSpace(host)), "[]")
	return host == "127.0.0.1" || host == "localhost" || host == "::1"
}

func fetchGitHubRelease(ctx context.Context, client *http.Client, repo string, version string) (githubRelease, error) {
	apiURL := "https://api.github.com/repos/" + repo + "/releases/latest"
	if !strings.EqualFold(strings.TrimSpace(version), "latest") {
		apiURL = "https://api.github.com/repos/" + repo + "/releases/tags/" + url.PathEscape(strings.TrimSpace(version))
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return githubRelease{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "latitude-browser-proxy-core-downloader")
	resp, err := client.Do(req)
	if err != nil {
		return githubRelease{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return githubRelease{}, fmt.Errorf("GitHub API HTTP %d", resp.StatusCode)
	}
	var release githubRelease
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&release); err != nil {
		return githubRelease{}, err
	}
	if release.TagName == "" || (!strings.EqualFold(strings.TrimSpace(version), "latest") && release.TagName != strings.TrimSpace(version)) {
		return githubRelease{}, fmt.Errorf("官方 Release 版本与请求不一致")
	}
	if len(release.Assets) == 0 {
		return githubRelease{}, fmt.Errorf("Release 没有可下载资产")
	}
	return release, nil
}

func selectProxyCoreAsset(spec proxyCoreSpec, assets []githubReleaseAsset, goos string, goarch string) (githubReleaseAsset, error) {
	osTokens := map[string][]string{
		"windows": {"windows", "win"},
		"linux":   {"linux"},
		"darwin":  {"darwin", "macos"},
	}
	archTokens := map[string][]string{
		"amd64": {"amd64", "x86_64", "64"},
		"arm64": {"arm64", "aarch64"},
		"386":   {"386", "i386", "x86"},
	}
	extTokens := []string{".zip", ".tar.gz", ".tgz"}
	if spec.Core == "mihomo" {
		extTokens = append(extTokens, ".gz")
	}
	if goos == "windows" {
		extTokens = []string{".zip"}
	}
	badTokens := []string{"sha", "checksum", "dgst", ".sig", ".asc", "source", "geoip", "geosite"}
	candidates := make([]githubReleaseAsset, 0)
	for _, asset := range assets {
		name := strings.ToLower(asset.Name)
		if !hasAnySuffix(name, extTokens) || containsAny(name, badTokens) {
			continue
		}
		if !containsAny(name, osTokens[goos]) || !matchesProxyAssetArch(name, goarch, archTokens[goarch]) {
			continue
		}
		if spec.Core == "mihomo" && !strings.Contains(name, "compatible") {
			continue
		}
		candidates = append(candidates, asset)
	}
	if len(candidates) == 0 && spec.Core == "mihomo" {
		for _, asset := range assets {
			name := strings.ToLower(asset.Name)
			if hasAnySuffix(name, extTokens) && !containsAny(name, badTokens) && containsAny(name, osTokens[goos]) && matchesProxyAssetArch(name, goarch, archTokens[goarch]) {
				candidates = append(candidates, asset)
			}
		}
	}
	if len(candidates) == 0 {
		return githubReleaseAsset{}, fmt.Errorf("官方 Release 未找到适配 %s/%s 的 %s 资产", goos, goarch, spec.DisplayName)
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		ai := assetScore(spec, candidates[i].Name)
		aj := assetScore(spec, candidates[j].Name)
		if ai != aj {
			return ai > aj
		}
		return candidates[i].Name < candidates[j].Name
	})
	return candidates[0], nil
}

func proxyCoreBinaryName(binaryBase string, targetOS string) string {
	if targetOS == "windows" {
		return binaryBase + ".exe"
	}
	return binaryBase
}

func matchesProxyAssetArch(name string, goarch string, tokens []string) bool {
	if goarch == "amd64" && strings.Contains(name, "arm64") {
		return false
	}
	if goarch == "386" && (strings.Contains(name, "amd64") || strings.Contains(name, "arm64")) {
		return false
	}
	return containsAny(name, tokens)
}

func assetScore(spec proxyCoreSpec, name string) int {
	lower := strings.ToLower(name)
	score := 0
	if strings.HasSuffix(lower, ".zip") {
		score += 3
	}
	if strings.Contains(lower, "compatible") {
		score += 5
	}
	if strings.Contains(lower, spec.BinaryBase) || strings.Contains(lower, spec.Core) {
		score += 2
	}
	if !strings.Contains(lower, "glibc") && !strings.Contains(lower, "musl") && !strings.Contains(lower, "softfloat") && !strings.Contains(lower, "legacy") {
		score += 2
	}
	return score
}

func proxyCoreAssetSHA256(asset githubReleaseAsset) (string, error) {
	parts := strings.SplitN(strings.TrimSpace(asset.Digest), ":", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "sha256") {
		return "", fmt.Errorf("官方资产缺少有效 SHA-256，已停止自动安装；请重试或手动核验官方文件")
	}
	digest, err := hex.DecodeString(parts[1])
	if err != nil || len(digest) != sha256.Size {
		return "", fmt.Errorf("官方资产 SHA-256 格式无效，已停止自动安装")
	}
	return strings.ToLower(parts[1]), nil
}

func validateProxyCoreReleaseAsset(spec proxyCoreSpec, release githubRelease, asset githubReleaseAsset) error {
	if _, err := proxyCoreAssetSHA256(asset); err != nil {
		return err
	}
	if asset.Size <= 0 {
		return fmt.Errorf("官方资产大小无效，已停止自动安装")
	}
	u, err := url.Parse(asset.BrowserDownloadURL)
	expectedPath := "/" + spec.Repo + "/releases/download/" + release.TagName + "/" + asset.Name
	if err != nil || release.TagName == "" || release.TagName == "." || release.TagName == ".." || strings.ContainsAny(release.TagName, "/\\") ||
		asset.Name == "" || asset.Name == "." || asset.Name == ".." || strings.ContainsAny(asset.Name, "/\\") ||
		u.Scheme != "https" || !strings.EqualFold(u.Host, "github.com") || u.User != nil ||
		u.RawQuery != "" || u.Fragment != "" || u.Path != expectedPath {
		return fmt.Errorf("资产下载地址不属于所选官方 Release，已停止自动安装")
	}
	return nil
}

func downloadProxyCoreAsset(ctx context.Context, client *http.Client, asset githubReleaseAsset, file *os.File, send func(string, int, string)) error {
	expected, err := proxyCoreAssetSHA256(asset)
	if err != nil {
		return err
	}
	if asset.Size <= 0 {
		return fmt.Errorf("官方资产大小无效，已停止自动安装")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, asset.BrowserDownloadURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "latitude-browser-proxy-core-downloader")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	if resp.ContentLength >= 0 && resp.ContentLength != asset.Size {
		return fmt.Errorf("下载长度与官方资产不符（响应 %d，预期 %d 字节）", resp.ContentLength, asset.Size)
	}
	hash := sha256.New()
	writer := io.MultiWriter(file, hash)
	buf := make([]byte, 1024*1024)
	var downloaded int64
	lastTick := time.Now()
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			downloaded += int64(n)
			if downloaded > asset.Size {
				return fmt.Errorf("下载长度超过官方资产大小（预期 %d 字节）", asset.Size)
			}
			if _, err := writer.Write(buf[:n]); err != nil {
				return err
			}
			if time.Since(lastTick) > 500*time.Millisecond {
				progress := 5 + int(float64(downloaded)/float64(asset.Size)*70)
				send("downloading", progress, fmt.Sprintf("下载中 %.1f MB / %.1f MB", float64(downloaded)/1024/1024, float64(asset.Size)/1024/1024))
				lastTick = time.Now()
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return readErr
		}
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if downloaded != asset.Size {
		return fmt.Errorf("下载长度与官方资产不符（实际 %d，预期 %d 字节）", downloaded, asset.Size)
	}
	send("verifying", 76, "正在核对官方 SHA-256")
	if hex.EncodeToString(hash.Sum(nil)) != expected {
		return fmt.Errorf("SHA-256 校验失败，已停止安装；原内核未改动，请重试")
	}
	return file.Sync()
}
