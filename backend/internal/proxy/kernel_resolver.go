package proxy

import (
	"fmt"
	"strings"

	"ant-chrome/backend/internal/config"
)

const (
	ProxyKernelAuto    = "auto"
	ProxyKernelNative  = "native"
	ProxyKernelXray    = "xray"
	ProxyKernelSingBox = "sing-box"
	ProxyKernelMihomo  = "mihomo"
)

type ProxyKernelResolution struct {
	Protocol         string   `json:"protocol"`
	PreferredKernel  string   `json:"preferredKernel"`
	Kernel           string   `json:"kernel"`
	SupportedKernels []string `json:"supportedKernels"`
	MissingCore      string   `json:"missingCore,omitempty"`
	Reason           string   `json:"reason"`
}

func NormalizePreferredKernel(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", ProxyKernelAuto:
		return ""
	case ProxyKernelXray:
		return ProxyKernelXray
	case ProxyKernelSingBox, "singbox", "sing_box":
		return ProxyKernelSingBox
	case ProxyKernelMihomo, "clash", "clash-meta":
		return ProxyKernelMihomo
	case ProxyKernelNative:
		return ProxyKernelNative
	default:
		return strings.ToLower(strings.TrimSpace(value))
	}
}

func ResolveProxyKernel(proxyConfig string, proxies []config.BrowserProxy, proxyId string, preferredKernel string) (ProxyKernelResolution, error) {
	src := strings.TrimSpace(resolveProxyConfig(proxyConfig, proxies, proxyId))
	if strings.TrimSpace(preferredKernel) == "" && strings.TrimSpace(proxyId) != "" {
		for _, item := range proxies {
			if strings.EqualFold(strings.TrimSpace(item.ProxyId), strings.TrimSpace(proxyId)) {
				preferredKernel = item.PreferredKernel
				break
			}
		}
	}
	preferred := NormalizePreferredKernel(preferredKernel)
	if preferred == "" {
		preferred = ProxyKernelAuto
	}
	resolution := ProxyKernelResolution{PreferredKernel: preferred}
	if src == "" || strings.EqualFold(src, "direct://") {
		resolution.Protocol = "direct"
		resolution.Kernel = ProxyKernelNative
		resolution.SupportedKernels = []string{ProxyKernelNative}
		resolution.Reason = "直连无需代理内核"
		return resolution, validatePreferredKernel(resolution, preferred)
	}

	protocol := DetectProxyProtocol(src)
	resolution.Protocol = protocol
	resolution.SupportedKernels = SupportedKernelsForProtocol(protocol, src, proxies, proxyId)
	if len(resolution.SupportedKernels) == 0 {
		return resolution, fmt.Errorf("不支持的代理协议: %s", protocol)
	}
	if preferred != ProxyKernelAuto {
		if !containsKernel(resolution.SupportedKernels, preferred) {
			return resolution, fmt.Errorf("协议 %s 不支持指定内核 %s", protocol, preferred)
		}
		resolution.Kernel = preferred
		resolution.Reason = "使用代理指定内核"
		return resolution, nil
	}
	resolution.Kernel = resolution.SupportedKernels[0]
	resolution.Reason = "按默认内核优先级自动选择"
	return resolution, nil
}

func ResolveProxyKernelForConnector(proxyConfig string, proxies []config.BrowserProxy, proxyId string, connectorType string) (ProxyKernelResolution, error) {
	src := strings.TrimSpace(resolveProxyConfig(proxyConfig, proxies, proxyId))
	connectorType = config.NormalizeBrowserConnectorType(connectorType)
	protocol := DetectProxyProtocol(src)
	supported := SupportedKernelsForProtocol(protocol, src, proxies, proxyId)
	resolution := ProxyKernelResolution{
		Protocol:         protocol,
		PreferredKernel:  ProxyKernelAuto,
		SupportedKernels: filterKernelsForConnector(supported, connectorType, protocol),
	}
	if len(supported) == 0 {
		return resolution, fmt.Errorf("不支持的代理协议: %s", protocol)
	}

	preferred := preferredKernelFromProxy(proxies, proxyId)
	if preferred != "" {
		resolution.PreferredKernel = preferred
		if !kernelAllowedForConnector(preferred, connectorType, protocol) {
			return resolution, connectorPreferredKernelConflictError(preferred, connectorType)
		}
		resolved, err := ResolveProxyKernel(src, proxies, proxyId, preferred)
		resolved.SupportedKernels = resolution.SupportedKernels
		if err != nil {
			return resolved, err
		}
		resolved.Reason = connectorResolutionReason(connectorType, resolved.Kernel, true)
		return resolved, nil
	}

	for _, kernel := range supported {
		if !kernelAllowedForConnector(kernel, connectorType, protocol) {
			continue
		}
		resolved, err := ResolveProxyKernel(src, proxies, proxyId, kernel)
		resolved.PreferredKernel = ProxyKernelAuto
		resolved.SupportedKernels = resolution.SupportedKernels
		if err != nil {
			return resolved, err
		}
		resolved.Reason = connectorResolutionReason(connectorType, resolved.Kernel, false)
		return resolved, nil
	}

	return resolution, connectorProtocolConflictError(protocol, supported, connectorType)
}

func DetectProxyProtocol(proxyConfig string) string {
	src := strings.TrimSpace(proxyConfig)
	l := strings.ToLower(src)
	if src == "" || strings.EqualFold(src, "direct://") {
		return "direct"
	}
	if strings.HasPrefix(l, "http://") || strings.HasPrefix(l, "https://") {
		return "http"
	}
	if strings.HasPrefix(l, "socks5://") {
		return "socks5"
	}
	if IsChainSocks5Proxy(src) {
		return "chain+socks5"
	}
	if nodeType := clashNodeType(src); nodeType != "" {
		return nodeType
	}
	for _, prefix := range []string{"vmess://", "vless://", "trojan://", "ss://", "ssr://", "hysteria2://", "hysteria://", "tuic://", "anytls://"} {
		if strings.HasPrefix(l, prefix) {
			return strings.TrimSuffix(prefix, "://")
		}
	}
	return "unknown"
}

func SupportedKernelsForProtocol(protocol string, proxyConfig string, proxies []config.BrowserProxy, proxyId string) []string {
	switch strings.ToLower(strings.TrimSpace(protocol)) {
	case "direct":
		return []string{ProxyKernelNative}
	case "http", "https", "socks5":
		// 带账号密码鉴权的 socks5/http 代理：Chromium 的 --proxy-server 无法携带凭据，
		// 浏览器 native 会静默丢弃鉴权信息导致连接失败。这类代理必须通过连接栈桥接。
		// 无鉴权代理在 xray 组合栈可继续走 native；mihomo 栈则由 Mihomo 独立管理。
		if RequiresLocalProxyBridgeForBrowser(proxyConfig) {
			return []string{ProxyKernelXray, ProxyKernelMihomo}
		}
		return []string{ProxyKernelNative, ProxyKernelMihomo}
	case "vmess", "vless", "trojan", "chain+socks5":
		return []string{ProxyKernelXray, ProxyKernelMihomo}
	case "ss", "shadowsocks":
		if IsMihomoOnlyProtocol(proxyConfig) {
			return []string{ProxyKernelMihomo}
		}
		return []string{ProxyKernelXray, ProxyKernelMihomo}
	case "hysteria", "hysteria2", "tuic", "anytls":
		return []string{ProxyKernelSingBox, ProxyKernelMihomo}
	case "mieru", "wireguard":
		return []string{ProxyKernelMihomo}
	default:
		if RequiresLocalProxyBridgeForBrowser(proxyConfig) || RequiresBridge(proxyConfig, proxies, proxyId) {
			return []string{ProxyKernelXray, ProxyKernelMihomo}
		}
		if IsSingBoxProtocol(proxyConfig) {
			return []string{ProxyKernelSingBox, ProxyKernelMihomo}
		}
		if IsMihomoOnlyProtocol(proxyConfig) {
			return []string{ProxyKernelMihomo}
		}
		return nil
	}
}

func validatePreferredKernel(resolution ProxyKernelResolution, preferred string) error {
	if preferred == "" || preferred == ProxyKernelAuto {
		return nil
	}
	if !containsKernel(resolution.SupportedKernels, preferred) {
		return fmt.Errorf("协议 %s 不支持指定内核 %s", resolution.Protocol, preferred)
	}
	return nil
}

func containsKernel(kernels []string, kernel string) bool {
	kernel = NormalizePreferredKernel(kernel)
	for _, item := range kernels {
		if item == kernel {
			return true
		}
	}
	return false
}

func preferredKernelFromProxy(proxies []config.BrowserProxy, proxyId string) string {
	proxyId = strings.TrimSpace(proxyId)
	if proxyId == "" {
		return ""
	}
	for _, item := range proxies {
		if strings.EqualFold(strings.TrimSpace(item.ProxyId), proxyId) {
			return NormalizePreferredKernel(item.PreferredKernel)
		}
	}
	return ""
}

func filterKernelsForConnector(kernels []string, connectorType string, protocol string) []string {
	filtered := make([]string, 0, len(kernels))
	for _, kernel := range kernels {
		if kernelAllowedForConnector(kernel, connectorType, protocol) {
			filtered = append(filtered, kernel)
		}
	}
	return filtered
}

func kernelAllowedForConnector(kernel string, connectorType string, protocol string) bool {
	kernel = NormalizePreferredKernel(kernel)
	connectorType = config.NormalizeBrowserConnectorType(connectorType)
	if connectorType == config.BrowserConnectorMihomo {
		return kernel == ProxyKernelMihomo || (kernel == ProxyKernelNative && protocol == "direct")
	}
	return kernel == ProxyKernelXray || kernel == ProxyKernelSingBox || kernel == ProxyKernelNative
}

func connectorPreferredKernelConflictError(preferredKernel string, connectorType string) error {
	if connectorType == config.BrowserConnectorMihomo {
		return fmt.Errorf("代理 preferredKernel=%s 不属于当前 browser.default_connector_type=mihomo 独立栈；请将 preferredKernel 改为 auto 或 mihomo，或切换全局连接栈后重新测速、检查出口 IP 和泄漏诊断", preferredKernel)
	}
	return fmt.Errorf("代理 preferredKernel=%s 不属于当前 browser.default_connector_type=xray（Xray + sing-box）组合栈；请将 preferredKernel 改为 auto、xray 或 sing-box，或切换全局连接栈后重新测速、检查出口 IP 和泄漏诊断", preferredKernel)
}

func connectorProtocolConflictError(protocol string, supported []string, connectorType string) error {
	if connectorType == config.BrowserConnectorMihomo {
		return fmt.Errorf("协议 %s 不可由当前 browser.default_connector_type=mihomo 连接栈处理（可用内核: %s）；请切换为 xray 组合栈后重新测速、检查出口 IP 和泄漏诊断", protocol, strings.Join(supported, ", "))
	}
	return fmt.Errorf("协议 %s 不可由当前 browser.default_connector_type=xray（Xray + sing-box）连接栈处理（可用内核: %s）；请切换 browser.default_connector_type=mihomo 后重新测速、检查出口 IP 和泄漏诊断", protocol, strings.Join(supported, ", "))
}

func connectorResolutionReason(connectorType string, kernel string, explicit bool) string {
	if explicit {
		if connectorType == config.BrowserConnectorMihomo {
			return "使用代理指定内核（符合 Mihomo 独立栈）"
		}
		return "使用代理指定内核（符合 Xray + sing-box 组合栈）"
	}
	if connectorType == config.BrowserConnectorMihomo {
		return "按 Mihomo 独立栈选择内核"
	}
	if kernel == ProxyKernelSingBox {
		return "按 Xray + sing-box 组合栈选择 sing-box 内核"
	}
	return "按 Xray + sing-box 组合栈选择内核"
}
