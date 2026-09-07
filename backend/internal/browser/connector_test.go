package browser

import "testing"

func TestBuildLaunchArgsTerminatesStartupSwitches(t *testing.T) {
	args := BuildLaunchArgs([]string{"--proxy-server=socks5://127.0.0.1:19050"}, []string{"--proxy-pac-url=DIRECT", "https://example.com"})
	if len(args) != 4 || args[1] != "--" || args[2] != "--proxy-pac-url=DIRECT" || args[3] != "https://example.com" {
		t.Fatalf("args = %#v", args)
	}
}
