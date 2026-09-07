package browser

// BuildLaunchArgs 构建启动参数
func BuildLaunchArgs(args []string, startURLs []string) []string {
	if len(startURLs) == 0 {
		return args
	}
	// Chromium recognizes "--" as the end of switches. Keep every startup
	// target after it so an untrusted target beginning with "-" cannot turn
	// into a late command-line override (for example --proxy-pac-url=DIRECT).
	args = append(args, "--")
	args = append(args, startURLs...)
	return args
}
