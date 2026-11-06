package locale

import (
	"strings"
	"sync/atomic"
)

var selected atomic.Value
var menuRefresh atomic.Value

func OnChange(callback func()) { menuRefresh.Store(callback) }

func Set(language string) {
	selected.Store(language)
	if callback, ok := menuRefresh.Load().(func()); ok {
		callback()
	}
}
func Language() string {
	language, _ := selected.Load().(string)
	if language == "" || language == "system" {
		language = System()
	}
	if strings.HasPrefix(strings.ToLower(language), "zh") {
		return "zh-CN"
	}
	return "en-US"
}

// Native text is separate from diagnostic logs and raw upstream errors.
func Text(key string) string {
	value, ok := nativeMessages[key]
	if !ok {
		return key
	}
	if Language() == "zh-CN" {
		return value[0]
	}
	return value[1]
}

var nativeMessages = map[string][2]string{
	"tray.show":    {"显示窗口", "Show window"},
	"tray.quitApp": {"仅退出应用", "Quit app"},
	"tray.quitAll": {"退出应用与浏览器", "Quit app and browsers"},
}
