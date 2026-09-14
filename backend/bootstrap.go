package backend

import (
	appconfig "ant-chrome/backend/internal/config"
	apptray "ant-chrome/backend/internal/tray"
)

type Config = appconfig.Config
type TrayCallbacks = apptray.Callbacks

// ProductDisplayName is the canonical user-facing application name.
const ProductDisplayName = appconfig.ProductDisplayName

// LoadConfig never replaces an invalid existing configuration with anonymous
// defaults. Missing files still receive the explicit first-run defaults.
func LoadConfig(path string) (*Config, error) {
	cfg, err := appconfig.Load(path)
	if err != nil {
		return nil, err
	}
	if err := appconfig.ValidateLaunchServerAuth(cfg.LaunchServer.Auth); err != nil {
		return nil, err
	}
	return cfg, nil
}

func DefaultConfig() *Config {
	return appconfig.DefaultConfig()
}

func RunTray(cb TrayCallbacks) {
	apptray.Run(cb)
}

func QuitTray() {
	apptray.Quit()
}
