//go:build (!darwin && !windows) || (darwin && !cgo)

package locale

import "os"

func System() string {
	for _, key := range []string{"LC_ALL", "LC_MESSAGES", "LANG"} {
		if value := os.Getenv(key); value != "" {
			return value
		}
	}
	return "en-US"
}
