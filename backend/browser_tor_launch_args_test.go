package backend

import (
	"strings"
	"testing"

	"ant-chrome/backend/internal/browser"
)

func TestTorLaunchArgsOverrideDNSQUICWebRTCAndExtensions(t *testing.T) {
	args := buildBrowserLaunchArgsForNetworkMode(
		"profile-dir",
		9222,
		"socks5://127.0.0.1:19050",
		[]string{"/tmp/extension"},
		[]string{"--EnAbLe-QuIc", "--DNS-OVER-HTTPS-MODE=automatic", "--NO-PROXY-SERVER", "--REMOTE-ALLOW-ORIGINS=*"},
		[]string{"--force-webrtc-ip-handling-policy=default", "--load-extension=/tmp/bypass", "--enable-automation"},
		[]string{"--host-resolver-rules=MAP * 127.0.0.1", "--proxy-bypass-list=*", "--no-sandbox", "--disable-web-security"},
		[]string{"https://example.com"},
		false,
		browser.NetworkModeTor,
	)

	mustContain := []string{
		"--proxy-server=socks5://127.0.0.1:19050",
		"--remote-debugging-address=127.0.0.1",
		"--proxy-bypass-list=<-loopback>",
		"--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
		"--dns-over-https-mode=off",
		"--disable-quic",
		"--disable-non-proxied-udp",
		"--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
		"--disable-extensions",
	}
	for _, expected := range mustContain {
		if countArg(args, expected) != 1 {
			t.Fatalf("args should contain exactly one %q: %#v", expected, args)
		}
	}
	for _, forbidden := range []string{
		"--EnAbLe-QuIc",
		"--DNS-OVER-HTTPS-MODE=automatic",
		"--NO-PROXY-SERVER",
		"--REMOTE-ALLOW-ORIGINS=*",
		"--force-webrtc-ip-handling-policy=default",
		"--load-extension=/tmp/bypass",
		"--disable-extensions-except=/tmp/extension",
		"--proxy-bypass-list=*",
		"--enable-automation",
		"--no-sandbox",
		"--disable-web-security",
	} {
		if countArg(args, forbidden) != 0 {
			t.Fatalf("Tor args retained forbidden override %q: %#v", forbidden, args)
		}
	}
}

func TestSanitizeTorLaunchArgsConsumesSeparatedValues(t *testing.T) {
	sanitized, removed := sanitizeTorLaunchArgs([]string{
		"--HOST-RESOLVER-RULES", "MAP * 127.0.0.1",
		"--DNS-OVER-HTTPS-TEMPLATES", "https://resolver.invalid/dns-query",
		"--custom-safe-flag",
	})
	if len(sanitized) != 1 || sanitized[0] != "--custom-safe-flag" {
		t.Fatalf("sanitized = %#v", sanitized)
	}
	if len(removed) != 2 {
		t.Fatalf("removed = %#v", removed)
	}
}

func TestTorBrowserLaunchRequiresLiveManagedRuntime(t *testing.T) {
	app := &App{}
	err := app.ensureTorRuntimeReadyForBrowser(&browserStartPlan{
		profile:     &BrowserProfile{ProfileId: "tor-profile", NetworkMode: browser.NetworkModeTor},
		networkMode: browser.NetworkModeTor,
	})
	if err == nil || !strings.Contains(err.Error(), "终止启动") {
		t.Fatalf("expected fail-closed Tor readiness error, got %v", err)
	}
}

func TestTorRunningWindowFallbackRejected(t *testing.T) {
	app := &App{}
	err := app.openBrowserWindowForRunningProfile(&BrowserProfile{NetworkMode: browser.NetworkModeTor}, nil, []string{"about:blank"})
	if err == nil || !strings.Contains(err.Error(), "禁止") {
		t.Fatalf("expected Tor fallback rejection, got %v", err)
	}
}

func countArg(args []string, target string) int {
	count := 0
	for _, arg := range args {
		if arg == target {
			count++
		}
	}
	return count
}

func TestSanitizeTorLaunchArgsRemovesProxyOverrideSurfaces(t *testing.T) {
	sanitized, removed := sanitizeTorLaunchArgs([]string{
		"--proxy-pac-url", "DIRECT",
		"--proxy-auto-detect",
		"--proxy-resolver-rules=MAP * DIRECT",
		"--safe-flag",
	})
	if len(sanitized) != 1 || sanitized[0] != "--safe-flag" {
		t.Fatalf("sanitized = %#v", sanitized)
	}
	for _, prefix := range []string{"--proxy-pac-url", "--proxy-auto-detect", "--proxy-resolver-rules"} {
		if countArg(removed, prefix) != 1 {
			t.Fatalf("removed = %#v, missing %q", removed, prefix)
		}
	}
}
