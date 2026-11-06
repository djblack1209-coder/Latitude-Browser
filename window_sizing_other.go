//go:build !windows

package main

/*
#cgo darwin LDFLAGS: -framework UniformTypeIdentifiers
*/
import "C"

func getDesktopWorkArea() (desktopWorkArea, bool) {
	return desktopWorkArea{}, false
}
