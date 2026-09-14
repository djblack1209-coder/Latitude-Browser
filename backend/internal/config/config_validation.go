package config

import (
	"fmt"
	"strings"
)

func ValidateLaunchServerAuth(auth LaunchServerAuthConfig) error {
	if !auth.Enabled {
		return nil
	}
	key := strings.TrimSpace(auth.APIKey)
	if key == "" {
		return fmt.Errorf("启用控制接口认证时必须配置非空 API 密钥")
	}
	if strings.ContainsAny(key, "\r\n\x00") {
		return fmt.Errorf("API 密钥包含非法字符")
	}
	header := strings.TrimSpace(auth.Header)
	if header == "" {
		return nil
	}
	for _, r := range header {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || strings.ContainsRune("!#$%&'*+-.^_`|~", r) {
			continue
		}
		return fmt.Errorf("API 认证请求头名称无效")
	}
	switch strings.ToLower(header) {
	case "host", "connection", "upgrade", "content-length", "transfer-encoding", "origin":
		return fmt.Errorf("API 认证不能使用保留的 HTTP 请求头")
	}
	return nil
}
