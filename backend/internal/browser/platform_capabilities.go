package browser

import (
	"fmt"
	"runtime"
)

// PlatformCapabilities comes from the running backend, never the browser UA.
type PlatformCapabilities struct {
	Platform              string `json:"platform"`
	MemoryHardLimit       bool   `json:"memoryHardLimit"`
	MemoryHardLimitReason string `json:"memoryHardLimitReason"`
}

func CurrentPlatformCapabilities() PlatformCapabilities { return platformCapabilities(runtime.GOOS) }

func platformCapabilities(platform string) PlatformCapabilities {
	result := PlatformCapabilities{Platform: platform, MemoryHardLimit: platform == "windows"}
	if !result.MemoryHardLimit {
		result.MemoryHardLimitReason = "当前系统不支持实例内存硬限制；0 表示不限制。"
	}
	return result
}

func validatePlatformMemoryLimit(platform string, value int) error {
	if value < 0 {
		return fmt.Errorf("实例内存限制不能为负数")
	}
	if value > 0 && !platformCapabilities(platform).MemoryHardLimit {
		return fmt.Errorf("当前系统不支持实例内存硬限制，请显式将最大内存设为 0 后保存")
	}
	return nil
}

func validateCurrentMemoryLimit(value int) error {
	return validatePlatformMemoryLimit(runtime.GOOS, value)
}
