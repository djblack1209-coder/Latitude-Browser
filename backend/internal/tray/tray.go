//go:build windows

package tray

import (
	"ant-chrome/backend/internal/locale"
	_ "embed"
	"runtime"

	"github.com/energye/systray"
)

//go:embed icon.ico
var iconData []byte

// Callbacks 托盘回调
type Callbacks struct {
	OnShow        func()
	OnQuitAppOnly func()
	OnQuit        func()
}

// Run 启动系统托盘（阻塞，需在独立 goroutine 中调用）。
// Windows 托盘依赖消息循环，必须固定在同一个 OS 线程上。
func Run(cb Callbacks) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	systray.Run(func() {
		systray.SetIcon(iconData)
		systray.SetTitle("Latitude Browser")
		systray.SetTooltip("Latitude Browser")

		mShow := systray.AddMenuItem(locale.Text("tray.show"), "")
		systray.AddSeparator()
		mQuitAppOnly := systray.AddMenuItem(locale.Text("tray.quitApp"), "")
		mQuit := systray.AddMenuItem(locale.Text("tray.quitAll"), "")

		locale.OnChange(func() {
			mShow.SetTitle(locale.Text("tray.show"))
			mQuitAppOnly.SetTitle(locale.Text("tray.quitApp"))
			mQuit.SetTitle(locale.Text("tray.quitAll"))
		})

		systray.SetOnClick(func(menu systray.IMenu) {
			if cb.OnShow != nil {
				cb.OnShow()
			}
		})

		systray.SetOnDClick(func(menu systray.IMenu) {
			if cb.OnShow != nil {
				cb.OnShow()
			}
		})

		systray.SetOnRClick(func(menu systray.IMenu) {
			if menu != nil {
				_ = menu.ShowMenu()
			}
		})

		mShow.Click(func() {
			if cb.OnShow != nil {
				cb.OnShow()
			}
		})

		mQuitAppOnly.Click(func() {
			systray.Quit()
			if cb.OnQuitAppOnly != nil {
				cb.OnQuitAppOnly()
			}
		})

		mQuit.Click(func() {
			systray.Quit()
			if cb.OnQuit != nil {
				cb.OnQuit()
			}
		})
	}, func() {
		// onExit: 托盘退出时什么都不做，由 OnQuit 回调处理
	})
}

// Quit 主动退出托盘循环
func Quit() {
	systray.Quit()
}
