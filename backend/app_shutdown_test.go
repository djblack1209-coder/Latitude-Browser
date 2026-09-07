package backend

import (
	"context"
	"testing"
	"time"

	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
)

func TestDesktopNativeCloseRequiresConfirmation(t *testing.T) {
	for _, platform := range []string{"windows", "darwin", "linux", " Windows "} {
		if !platformSupportsCloseConfirmationForOS(platform) {
			t.Errorf("%s native close bypasses pre-shutdown confirmation", platform)
		}
	}
	if platformSupportsCloseConfirmationForOS("unsupported") {
		t.Fatal("unsupported platform unexpectedly entered the desktop close flow")
	}
}

func TestQuitRequestDoesNotAuthorizeCloseBeforeCleanup(t *testing.T) {
	app := &App{}
	app.requestQuit(quitModeFull)
	if app.forceQuit {
		t.Fatal("quit request allowed native close before cleanup completed")
	}
	// This path must not emit another event that resets the frontend's busy
	// state. A context without a Wails emitter also catches accidental emission.
	if !ShouldBlockClose(app, context.Background()) {
		t.Fatal("second native close bypassed cleanup while quit was in flight")
	}
	app.completeQuitRequest()
	if ShouldBlockClose(app, context.Background()) {
		t.Fatal("confirmed cleanup must allow the final native close")
	}
}

func TestFailedQuitReturnsErrorAndRestoresStartGate(t *testing.T) {
	for _, tc := range []struct {
		name string
		quit func(*App) error
	}{
		{name: "full", quit: (*App).ForceQuit},
		{name: "app-only-with-tor", quit: (*App).QuitAppOnly},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app := &App{browserMgr: browser.NewManager(config.DefaultConfig(), t.TempDir())}
			profile := &BrowserProfile{ProfileId: "unconfirmed", NetworkMode: browser.NetworkModeTor, Running: true}
			app.browserMgr.Profiles[profile.ProfileId] = profile
			if err := tc.quit(app); err == nil {
				t.Fatal("failed cleanup must reject the Wails promise instead of leaving the modal busy forever")
			}
			if app.quitRequested || app.forceQuit {
				t.Fatal("failed quit retained a start/close gate that prevents retry")
			}
			if !profile.Running {
				t.Fatal("failed quit cleared unconfirmed browser ownership")
			}
		})
	}
}

func TestQuitAppOnlyKeepsOrdinaryBrowser(t *testing.T) {
	app := &App{browserMgr: browser.NewManager(config.DefaultConfig(), t.TempDir())}
	profile := &BrowserProfile{ProfileId: "ordinary", NetworkMode: browser.NetworkModeProxy, Running: true}
	app.browserMgr.Profiles[profile.ProfileId] = profile
	if err := app.QuitAppOnly(); err != nil {
		t.Fatal(err)
	}
	if !profile.Running || app.quitMode != quitModeAppOnly || !app.forceQuit || !app.quitRequested {
		t.Fatal("ordinary app-only quit did not preserve the browser or final quit state")
	}
}

func TestNativeCloseGateDoesNotWaitForTorBootstrap(t *testing.T) {
	app := &App{}
	app.requestQuit(quitModeFull)
	app.torLifecycleMu.Lock()
	done := make(chan bool, 1)
	go func() { done <- ShouldBlockClose(app, context.Background()) }()
	select {
	case blocked := <-done:
		app.torLifecycleMu.Unlock()
		if !blocked {
			t.Fatal("native close was allowed before cleanup")
		}
	case <-time.After(100 * time.Millisecond):
		app.torLifecycleMu.Unlock()
		<-done
		t.Fatal("native close callback waited on a potentially 75-second Tor bootstrap")
	}
}

func TestQuitRequestClosesStartGateBeforeBootstrapCompletes(t *testing.T) {
	app := &App{}
	app.torLifecycleMu.Lock()
	done := make(chan struct{})
	go func() {
		app.requestQuit(quitModeFull)
		close(done)
	}()
	select {
	case <-done:
		app.torLifecycleMu.Unlock()
	case <-time.After(100 * time.Millisecond):
		app.torLifecycleMu.Unlock()
		<-done
		t.Fatal("quit request was queued behind Tor bootstrap instead of closing the start gate immediately")
	}
	if _, err := app.BrowserInstanceStart("must-not-start"); err == nil {
		t.Fatal("browser start was accepted after quit began")
	}
}

func TestOverlappingQuitCannotResetCleanupAuthorization(t *testing.T) {
	app := &App{}
	if !app.requestQuit(quitModeFull) {
		t.Fatal("first quit request was rejected")
	}
	for _, quit := range []func() error{app.ForceQuit, app.QuitAppOnly} {
		if err := quit(); err == nil {
			t.Fatal("second quit entered a concurrent cleanup flow")
		}
	}
	if !app.isQuitRequested() || app.forceQuit || app.quitMode != quitModeFull {
		t.Fatal("overlapping quit changed the first operation's authorization")
	}
}
