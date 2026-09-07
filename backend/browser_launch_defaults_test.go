package backend

import (
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"testing"

	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
)

func TestPrepareBrowserLaunchContextAppliesDefaultsBeforeSanitizing(t *testing.T) {
	for _, mode := range []string{browser.NetworkModeProxy, browser.NetworkModeTor} {
		t.Run(mode, func(t *testing.T) {
			app, profile := newLaunchDefaultsTestApp(t, mode)
			app.config.Browser.DefaultLaunchArgs = []string{
				"--no-first-run",
				"--disable-background-networking",
				"--proxy-server=http://untrusted.invalid:9000",
				"--host-resolver-rules=MAP * DIRECT",
			}

			args, _, _, _, _, err := app.prepareBrowserLaunchContext(browserStartInput{ProfileID: profile.ProfileId}, profile, nil)
			if err != nil {
				t.Fatalf("prepare first launch: %v", err)
			}
			for _, flag := range []string{"--no-first-run", "--disable-background-networking"} {
				if !slices.Contains(args, flag) {
					t.Fatalf("fresh profile omitted default %q on its first launch: %#v", flag, args)
				}
			}
			if slices.Contains(args, "--proxy-server=http://untrusted.invalid:9000") {
				t.Fatalf("default proxy override bypassed sanitization: %#v", args)
			}
			if mode == browser.NetworkModeTor && slices.Contains(args, "--host-resolver-rules=MAP * DIRECT") {
				t.Fatalf("default DNS override bypassed Tor sanitization: %#v", args)
			}

			secondArgs, _, _, _, _, err := app.prepareBrowserLaunchContext(browserStartInput{ProfileID: profile.ProfileId}, profile, nil)
			if err != nil {
				t.Fatalf("prepare second launch: %v", err)
			}
			if !slices.Equal(args, secondArgs) {
				t.Fatalf("first and second launch differ: first=%#v second=%#v", args, secondArgs)
			}
		})
	}
}

func TestPrepareBrowserLaunchContextKeepsExplicitProfileArgs(t *testing.T) {
	app, profile := newLaunchDefaultsTestApp(t, browser.NetworkModeTor)
	app.config.Browser.DefaultLaunchArgs = []string{"--default-only"}
	profile.LaunchArgs = []string{"--explicit-only", "--proxy-server=http://untrusted.invalid:9000"}
	args, _, _, _, _, err := app.prepareBrowserLaunchContext(browserStartInput{ProfileID: profile.ProfileId}, profile, nil)
	if err != nil {
		t.Fatalf("prepare explicit launch: %v", err)
	}
	if !slices.Equal(args, []string{"--explicit-only"}) {
		t.Fatalf("explicit launch args were replaced or left unsanitized: %#v", args)
	}
}

func newLaunchDefaultsTestApp(t *testing.T, mode string) (*App, *BrowserProfile) {
	t.Helper()
	root := t.TempDir()
	coreDir := filepath.Join(root, "test-core")
	if err := os.MkdirAll(coreDir, 0o700); err != nil {
		t.Fatal(err)
	}
	binaryName := "chrome"
	if runtime.GOOS == "windows" {
		binaryName += ".exe"
	}
	// Context preparation inspects the path/manifest; it must not launch it.
	if err := os.WriteFile(filepath.Join(coreDir, binaryName), []byte("not an executable"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(coreDir, "manifest.json"), []byte(`{"version":"144.0.0.0"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg := config.DefaultConfig()
	cfg.Browser.Cores = []config.BrowserCore{{CoreId: "test-core", CoreName: "Test core", CorePath: coreDir, IsDefault: true}}
	app := &App{appRoot: root, config: cfg, browserMgr: browser.NewManager(cfg, root)}
	profile := &BrowserProfile{ProfileId: "fresh-profile", CoreId: "test-core", NetworkMode: mode, UserDataDir: filepath.Join(root, "profile")}
	app.browserMgr.Profiles[profile.ProfileId] = profile
	return app, profile
}
