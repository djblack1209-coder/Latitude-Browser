package proxy

import (
	"context"
	"errors"
	"net"
	"strings"
)

// HealthStage identifies the last stage reached by a proxy health operation.
// It is intentionally stable because the value is persisted and exposed to the UI.
type HealthStage string

const (
	HealthStageResolveConfig  HealthStage = "resolve_config"
	HealthStageResolveKernel  HealthStage = "resolve_kernel"
	HealthStagePrepareBridge  HealthStage = "prepare_bridge"
	HealthStageRequest        HealthStage = "request"
	HealthStageValidateResult HealthStage = "validate_result"
	HealthStageComplete       HealthStage = "complete"
)

// HealthCode is a machine-readable reason for a health operation result.
// Keep these values additive and backwards-compatible: clients may persist them.
type HealthCode string

const (
	HealthCodeOK                  HealthCode = "ok"
	HealthCodeDirect              HealthCode = "direct"
	HealthCodeConfigEmpty         HealthCode = "config_empty"
	HealthCodeProxyNotFound       HealthCode = "proxy_not_found"
	HealthCodeUnsupportedProtocol HealthCode = "unsupported_protocol"
	HealthCodeConnectorConflict   HealthCode = "connector_conflict"
	HealthCodeKernelUnavailable   HealthCode = "kernel_unavailable"
	HealthCodeBridgeStartFailed   HealthCode = "bridge_start_failed"
	HealthCodeBridgeStartTimeout  HealthCode = "bridge_start_timeout"
	HealthCodeTargetEmpty         HealthCode = "target_empty"
	HealthCodeTargetInvalid       HealthCode = "target_invalid"
	HealthCodeTargetDNSFailed     HealthCode = "target_dns_failed"
	HealthCodeTargetUnreachable   HealthCode = "target_unreachable"
	HealthCodeTargetTimeout       HealthCode = "target_timeout"
	HealthCodeRequestFailed       HealthCode = "request_failed"
	HealthCodeUnexpectedStatus    HealthCode = "unexpected_status"
	HealthCodeResponseReadFailed  HealthCode = "response_read_failed"
	HealthCodeResponseParseFailed HealthCode = "response_parse_failed"
	HealthCodeUnknown             HealthCode = "unknown"
)

// ClassifyHealthError maps an error into a stable stage/code pair. It is shared by
// speed tests, browser probes and IP health checks so the UI gets consistent
// diagnostics instead of one generic "failed" state.
func ClassifyHealthError(err error, fallbackStage HealthStage) (HealthStage, HealthCode) {
	if fallbackStage == "" {
		fallbackStage = HealthStageRequest
	}
	if err == nil {
		return HealthStageComplete, HealthCodeOK
	}

	message := strings.ToLower(strings.TrimSpace(err.Error()))
	switch {
	case message == "代理配置为空", strings.Contains(message, "未找到代理配置"):
		return HealthStageResolveConfig, HealthCodeConfigEmpty
	case strings.Contains(message, "代理池节点已不存在"), strings.Contains(message, "proxy not found"):
		return HealthStageResolveConfig, HealthCodeProxyNotFound
	case strings.Contains(message, "不支持的代理协议"), strings.Contains(message, "无法为协议"):
		return HealthStageResolveKernel, HealthCodeUnsupportedProtocol
	case strings.Contains(message, "当前连接栈"), strings.Contains(message, "不支持指定内核"), strings.Contains(message, "connector"):
		return HealthStageResolveKernel, HealthCodeConnectorConflict
	case strings.Contains(message, "管理器未初始化"), strings.Contains(message, "管理器不可用"), strings.Contains(message, "内核未找到"), strings.Contains(message, "未找到内核"):
		return HealthStageResolveKernel, HealthCodeKernelUnavailable
	case strings.Contains(message, "准备超时") || strings.Contains(message, "桥接启动超时") || strings.Contains(message, "bridge") && strings.Contains(message, "timeout"):
		return HealthStagePrepareBridge, HealthCodeBridgeStartTimeout
	case strings.Contains(message, "桥接启动") || strings.Contains(message, "bridge start"):
		return HealthStagePrepareBridge, HealthCodeBridgeStartFailed
	case strings.Contains(message, "目标 url 为空"), strings.Contains(message, "target url is empty"):
		return HealthStageResolveConfig, HealthCodeTargetEmpty
	case strings.Contains(message, "url 解析失败"), strings.Contains(message, "请求创建失败"), strings.Contains(message, "missing protocol scheme"), strings.Contains(message, "unsupported protocol scheme"):
		return HealthStageRequest, HealthCodeTargetInvalid
	case errors.Is(err, context.DeadlineExceeded), strings.Contains(message, "context deadline exceeded"), strings.Contains(message, "client.timeout exceeded"), strings.Contains(message, "测速超时"), strings.Contains(message, "请求超时"), strings.Contains(message, "i/o timeout"), strings.Contains(message, "deadline exceeded"), strings.HasSuffix(message, " timeout"):
		return HealthStageRequest, HealthCodeTargetTimeout
	case strings.Contains(message, "no such host"), strings.Contains(message, "temporary failure in name resolution"), strings.Contains(message, "name or service not known"):
		return HealthStageRequest, HealthCodeTargetDNSFailed
	case strings.Contains(message, "connection refused"), strings.Contains(message, "connection reset"), strings.Contains(message, "network is unreachable"), strings.Contains(message, "no route to host"):
		return HealthStageRequest, HealthCodeTargetUnreachable
	case strings.Contains(message, "读取") && strings.Contains(message, "响应"):
		return HealthStageRequest, HealthCodeResponseReadFailed
	}
	var networkErr net.Error
	if errors.As(err, &networkErr) {
		return HealthStageRequest, HealthCodeRequestFailed
	}
	return fallbackStage, HealthCodeUnknown
}
