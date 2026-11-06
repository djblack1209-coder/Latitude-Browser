//go:build windows

package locale

import "golang.org/x/sys/windows"

func System() string {
	language, _, _ := windows.NewLazySystemDLL("kernel32.dll").NewProc("GetUserDefaultUILanguage").Call()
	if language&0x3ff == 4 {
		return "zh-CN"
	}
	return "en-US"
}
