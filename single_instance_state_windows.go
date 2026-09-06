//go:build windows

package main

import (
	"os"
	"path/filepath"
	"strings"
)

func singleInstanceStateRoot(appRoot string) string {
	if dir := strings.TrimSpace(os.Getenv("LOCALAPPDATA")); dir != "" {
		return filepath.Join(dir, "Latitude Browser")
	}
	if dir, err := os.UserConfigDir(); err == nil && strings.TrimSpace(dir) != "" {
		return filepath.Join(dir, "Latitude Browser")
	}
	return filepath.Join(appRoot, "data")
}
