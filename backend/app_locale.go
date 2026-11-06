package backend

import (
	"ant-chrome/backend/internal/locale"
	"fmt"
)

// GetSystemLocale uses the OS preference rather than the webview's bundle locale.
func (a *App) GetSystemLocale() string { return locale.System() }

func (a *App) GetUILanguage() string {
	a.preferenceMu.Lock()
	defer a.preferenceMu.Unlock()
	if a.config == nil || a.config.App.Language == "" {
		return "system"
	}
	return a.config.App.Language
}

func (a *App) SetUILanguage(language string) error {
	if language != "system" && language != "en-US" && language != "zh-CN" {
		return fmt.Errorf("invalid UI language")
	}
	release, err := a.dataActivity.begin()
	if err != nil {
		return err
	}
	defer release()
	a.preferenceMu.Lock()
	defer a.preferenceMu.Unlock()
	if a.config == nil {
		return fmt.Errorf("application settings unavailable")
	}
	previous := a.config.App.Language
	a.config.App.Language = language
	if err := a.config.Save(a.resolveAppPath("config.yaml")); err != nil {
		a.config.App.Language = previous
		return err
	}
	locale.Set(language)
	return nil
}
