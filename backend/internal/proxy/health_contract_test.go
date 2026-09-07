package proxy

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

func TestClassifyHealthErrorUsesStableStagesAndCodes(t *testing.T) {
	tests := []struct {
		name      string
		err       error
		fallback  HealthStage
		wantStage HealthStage
		wantCode  HealthCode
	}{
		{name: "empty config", err: errors.New("代理配置为空"), fallback: HealthStageResolveConfig, wantStage: HealthStageResolveConfig, wantCode: HealthCodeConfigEmpty},
		{name: "unsupported protocol", err: errors.New("不支持的代理协议: mieru"), fallback: HealthStageResolveKernel, wantStage: HealthStageResolveKernel, wantCode: HealthCodeUnsupportedProtocol},
		{name: "stack conflict", err: errors.New("当前连接栈 xray 不支持协议 mieru，请将 browser.default_connector_type 改为 mihomo"), fallback: HealthStageResolveKernel, wantStage: HealthStageResolveKernel, wantCode: HealthCodeConnectorConflict},
		{name: "kernel unavailable", err: errors.New("Mihomo 管理器未初始化"), fallback: HealthStagePrepareBridge, wantStage: HealthStageResolveKernel, wantCode: HealthCodeKernelUnavailable},
		{name: "bridge timeout", err: errors.New("代理准备超时（15000ms）"), fallback: HealthStagePrepareBridge, wantStage: HealthStagePrepareBridge, wantCode: HealthCodeBridgeStartTimeout},
		{name: "bridge startup timeout", err: errors.New("桥接启动超时"), fallback: HealthStagePrepareBridge, wantStage: HealthStagePrepareBridge, wantCode: HealthCodeBridgeStartTimeout},
		{name: "target invalid", err: errors.New("测速请求创建失败: parse \"example\": missing protocol scheme"), fallback: HealthStageRequest, wantStage: HealthStageRequest, wantCode: HealthCodeTargetInvalid},
		{name: "dns failed", err: errors.New("dial tcp: lookup proxy.example: no such host"), fallback: HealthStageRequest, wantStage: HealthStageRequest, wantCode: HealthCodeTargetDNSFailed},
		{name: "unreachable", err: errors.New("dial tcp 127.0.0.1:1: connect: connection refused"), fallback: HealthStageRequest, wantStage: HealthStageRequest, wantCode: HealthCodeTargetUnreachable},
		{name: "deadline", err: context.DeadlineExceeded, fallback: HealthStageRequest, wantStage: HealthStageRequest, wantCode: HealthCodeTargetTimeout},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stage, code := ClassifyHealthError(tt.err, tt.fallback)
			if stage != tt.wantStage || code != tt.wantCode {
				t.Fatalf("ClassifyHealthError(%q) = (%q, %q), want (%q, %q)", tt.err, stage, code, tt.wantStage, tt.wantCode)
			}
		})
	}
}

func TestClassifyHealthErrorRecognizesSpeedTestTimeout(t *testing.T) {
	stage, code := ClassifyHealthError(fmt.Errorf("测速超时（100ms）"), HealthStageRequest)
	if stage != HealthStageRequest || code != HealthCodeTargetTimeout {
		t.Fatalf("ClassifyHealthError(speed timeout) = (%q, %q), want (%q, %q)", stage, code, HealthStageRequest, HealthCodeTargetTimeout)
	}
}

func TestSpeedTestWithConnectorReturnsStructuredSetupFailure(t *testing.T) {
	result := SpeedTestWithConnector(
		"missing-proxy",
		nil,
		nil,
		nil,
		nil,
		"xray",
		&SpeedTestConfig{},
	)
	if result.Ok {
		t.Fatal("expected empty proxy configuration to fail")
	}
	if result.Stage != HealthStageResolveConfig || result.Code != HealthCodeConfigEmpty {
		t.Fatalf("result diagnostics = (%q, %q), want (%q, %q)", result.Stage, result.Code, HealthStageResolveConfig, HealthCodeConfigEmpty)
	}
}
