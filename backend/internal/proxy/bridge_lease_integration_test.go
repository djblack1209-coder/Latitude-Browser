package proxy

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"testing"
	"time"

	"ant-chrome/backend/internal/config"
)

type runtimeLeaseFixture struct {
	src     string
	x       *XrayManager
	s       *SingBoxManager
	m       *ClashManager
	acquire func() (string, string, error)
	release func(string)
	stop    func() error
	refs    func() int
	idle    func()
	recycle func()
	replace func()
	exited  func() <-chan struct{}
}

func runtimeFixture(t *testing.T, engine string) *runtimeLeaseFixture {
	t.Helper()
	cfg := &config.Config{}
	f := &runtimeLeaseFixture{}
	switch engine {
	case "mihomo":
		m, src, b := seededMihomoFixture(t)
		f.m = m
		f.src = src
		f.acquire = func() (string, string, error) { return m.AcquireNodeBridge(src, nil, "") }
		f.release = m.ReleaseNodeBridge
		f.stop = m.StopAll
		f.refs = func() int { m.mu.Lock(); defer m.mu.Unlock(); return b.RefCount }
		f.idle = func() { m.mu.Lock(); b.LastUsedAt = time.Now().Add(-2 * xrayBridgeIdleTTL); m.mu.Unlock() }
		f.recycle = m.recycleIdleMihomoBridges
		f.exited = func() <-chan struct{} { return b.ExitDone }
		f.replace = func() {
			cmd, port := bridgeFixtureProcess(t)
			next := &MihomoNodeBridge{NodeKey: b.NodeKey, Port: port, ControllerPort: port, Cmd: cmd, Pid: cmd.Process.Pid, Running: true, LastUsedAt: time.Now(), ExitDone: make(chan struct{})}
			m.mu.Lock()
			old := b
			b = next
			m.NodeBridges[b.NodeKey] = b
			m.mu.Unlock()
			m.watchMihomoNodeBridge(b)
			if err := stopOwnedBridgeProcess(old.Cmd, old.ExitDone); err != nil {
				t.Fatal(err)
			}
		}
	case "xray":
		m := NewXrayManager(cfg, t.TempDir())
		f.x = m
		src := "trojan://fixture@127.0.0.1:443"
		f.src = src
		key := computeNodeKey(src + "\x00")
		var b *XrayBridge
		add := func() *XrayBridge {
			cmd, port := bridgeFixtureProcess(t)
			next := &XrayBridge{NodeKey: key, Port: port, Cmd: cmd, Pid: cmd.Process.Pid, Running: true, LastUsedAt: time.Now()}
			next.startExitWatcher()
			m.lifecycle.track(cmd, next.ExitDone)
			m.mu.Lock()
			m.Bridges[key] = next
			m.mu.Unlock()
			go m.watchBridge(next, key)
			return next
		}
		b = add()
		f.acquire = func() (string, string, error) { return m.AcquireBridge(src, nil, "") }
		f.release = m.ReleaseBridge
		f.stop = m.StopAll
		f.refs = func() int { m.mu.Lock(); defer m.mu.Unlock(); return b.RefCount }
		f.idle = func() { m.mu.Lock(); b.LastUsedAt = time.Now().Add(-2 * xrayBridgeIdleTTL); m.mu.Unlock() }
		f.recycle = m.recycleIdleBridges
		f.exited = func() <-chan struct{} { return b.ExitDone }
		f.replace = func() {
			m.mu.Lock()
			old := b
			old.Stopping = true
			m.mu.Unlock()
			b = add()
			if err := m.stopBridgeProcess(old); err != nil {
				t.Fatal(err)
			}
		}
	case "sing-box":
		m := NewSingBoxManager(cfg, t.TempDir())
		f.s = m
		src := "hysteria2://fixture@127.0.0.1:443"
		f.src = src
		key := computeNodeKey(src)
		var b *SingBoxBridge
		add := func() *SingBoxBridge {
			cmd, port := bridgeFixtureProcess(t)
			next := &SingBoxBridge{NodeKey: key, Port: port, Cmd: cmd, Pid: cmd.Process.Pid, Running: true, LastUsedAt: time.Now()}
			next.startExitWatcher()
			m.lifecycle.track(cmd, next.ExitDone)
			m.mu.Lock()
			m.Bridges[key] = next
			m.mu.Unlock()
			go m.watchBridge(next, key)
			return next
		}
		b = add()
		f.acquire = func() (string, string, error) { return m.AcquireBridge(src, nil, "") }
		f.release = m.ReleaseBridge
		f.stop = m.StopAll
		f.refs = func() int { m.mu.Lock(); defer m.mu.Unlock(); return b.RefCount }
		f.idle = func() { m.mu.Lock(); b.LastUsedAt = time.Now().Add(-2 * singBoxBridgeIdleTTL); m.mu.Unlock() }
		f.recycle = m.recycleIdleBridges
		f.exited = func() <-chan struct{} { return b.ExitDone }
		f.replace = func() {
			m.mu.Lock()
			old := b
			old.Stopping = true
			m.mu.Unlock()
			b = add()
			if err := m.stopBridgeProcess(old); err != nil {
				t.Fatal(err)
			}
		}
	}
	t.Cleanup(func() {
		if err := f.stop(); err != nil {
			t.Error(err)
		}
	})
	return f
}

func TestBridgeLeaseGenerationAndDuplicateRelease(t *testing.T) {
	for _, engine := range []string{"mihomo", "xray", "sing-box"} {
		t.Run(engine, func(t *testing.T) {
			f := runtimeFixture(t, engine)
			_, old, err := f.acquire()
			if err != nil {
				t.Fatal(err)
			}
			f.replace()
			_, one, err := f.acquire()
			if err != nil {
				t.Fatal(err)
			}
			_, two, err := f.acquire()
			if err != nil {
				t.Fatal(err)
			}
			if old == one || one == two {
				t.Fatal("acquisition identities are reused")
			}
			f.release(old)
			if f.refs() != 2 {
				t.Fatal("old process release decremented replacement")
			}
			f.release(one)
			f.release(one)
			if f.refs() != 1 {
				t.Fatal("duplicate release decremented another caller")
			}
			f.release(two)
			if f.refs() != 0 {
				t.Fatal("last release did not make bridge idle")
			}
		})
	}
}

func TestBridgeSlowHTTPBodySurvivesInstanceReleaseAndRecycle(t *testing.T) {
	for _, engine := range []string{"mihomo", "xray", "sing-box"} {
		t.Run(engine, func(t *testing.T) {
			f := runtimeFixture(t, engine)
			_, instance, err := f.acquire()
			if err != nil {
				t.Fatal(err)
			}
			connector := config.BrowserConnectorXray
			if engine == "mihomo" {
				connector = config.BrowserConnectorMihomo
			}
			client, err := BuildProxyHTTPClient(f.src, "", nil, f.x, f.s, f.m, connector, 5*time.Second)
			if err != nil {
				t.Fatal(err)
			}
			defer client.CloseIdleConnections()
			if f.refs() != 1 {
				t.Fatal("unused HTTP client unexpectedly owns a lease")
			}
			resp, err := client.Get("http://fixture.invalid/slow")
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			head := make([]byte, 4)
			if _, err = io.ReadFull(resp.Body, head); err != nil {
				t.Fatal(err)
			}
			if string(head) != "head" || f.refs() != 2 {
				t.Fatalf("response did not acquire shared bridge: head=%s refs=%d", head, f.refs())
			}
			f.release(instance)
			f.idle()
			f.recycle()
			if processExited(f.exited()) {
				t.Fatal("active body was killed by idle collection")
			}
			unblock, err := client.Get("http://fixture.invalid/unblock")
			if err != nil {
				t.Fatal(err)
			}
			io.Copy(io.Discard, unblock.Body)
			unblock.Body.Close()
			tail, err := io.ReadAll(resp.Body)
			if err != nil || string(tail) != "tail" {
				t.Fatalf("response interrupted: %q %v", tail, err)
			}
			resp.Body.Close()
			resp.Body.Close()
			if f.refs() != 0 {
				t.Fatal("body close leaked lease")
			}
			f.idle()
			f.recycle()
			if !processExited(f.exited()) {
				t.Fatal("idle owned process not reaped")
			}
		})
	}
}

func TestBridgeStopAllReapsAndRejectsNewAcquisitions(t *testing.T) {
	for _, engine := range []string{"mihomo", "xray", "sing-box"} {
		t.Run(engine, func(t *testing.T) {
			f := runtimeFixture(t, engine)
			if _, _, err := f.acquire(); err != nil {
				t.Fatal(err)
			}
			if err := f.stop(); err != nil {
				t.Fatal(err)
			}
			if !processExited(f.exited()) {
				t.Fatal("shutdown returned without Wait")
			}
			if _, _, err := f.acquire(); !errors.Is(err, errBridgeManagerStopped) {
				t.Fatalf("stopped manager accepted launch: %v", err)
			}
			if err := f.stop(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestBridgeLifecycleStopWaitsForLateRegistration(t *testing.T) {
	var life bridgeLifecycle
	finish, err := life.begin()
	if err != nil {
		t.Fatal(err)
	}
	stopped := make(chan error, 1)
	go func() { stopped <- life.stop() }()
	<-life.context().Done()
	if _, err := life.begin(); !errors.Is(err, errBridgeManagerStopped) {
		t.Fatalf("new launch admission remains open: %v", err)
	}
	select {
	case <-stopped:
		t.Fatal("shutdown passed outstanding launch")
	default:
	}
	cmd, _ := bridgeFixtureProcess(t)
	done := make(chan struct{})
	go func() { cmd.Wait(); close(done) }()
	life.track(cmd, done)
	finish()
	if err := <-stopped; err != nil {
		t.Fatal(err)
	}
	if !processExited(done) {
		t.Fatal("late process escaped shutdown")
	}
}

type failingRoundTripper struct{}

func (failingRoundTripper) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, fmt.Errorf("fixture transport failure")
}
func TestBridgeHTTPFailureReleasesExactlyOnce(t *testing.T) {
	for _, buildFailure := range []bool{false, true} {
		t.Run(fmt.Sprint(buildFailure), func(t *testing.T) {
			count := 0
			tr := &bridgeHTTPTransport{acquire: func() (string, string, error) { count++; return "http://127.0.0.1:1", "lease", nil }, release: func(string) { count-- }, build: func(string) (*http.Client, error) {
				if buildFailure {
					return nil, fmt.Errorf("fixture setup failure")
				}
				return &http.Client{Transport: failingRoundTripper{}}, nil
			}}
			req, _ := http.NewRequest("GET", "http://fixture.invalid/", nil)
			if _, err := tr.RoundTrip(req); err == nil {
				t.Fatal("failure accepted")
			}
			if count != 0 {
				t.Fatalf("failed request leaked %d leases", count)
			}
		})
	}
}

func TestBridgeStopFailurePreservesOwnershipAndBlocksResume(t *testing.T) {
	var life bridgeLifecycle
	cmd, _ := bridgeFixtureProcess(t)
	done := make(chan struct{})
	go func() { cmd.Wait(); close(done) }()
	life.track(cmd, done)
	life.stopProcess = func(*exec.Cmd, <-chan struct{}) error { return fmt.Errorf("injected process stop failure") }
	if err := life.stop(); err == nil {
		t.Fatal("stop failure ignored")
	}
	life.mu.Lock()
	owned := life.owned[cmd]
	life.mu.Unlock()
	if owned != done {
		t.Fatal("unconfirmed process ownership discarded")
	}
	if _, err := life.resume(); err == nil {
		t.Fatal("resumed with an unconfirmed owned process")
	}
	life.stopProcess = nil
	if err := life.stop(); err != nil {
		t.Fatal(err)
	}
	if resumed, err := life.resume(); err != nil || !resumed {
		t.Fatalf("confirmed maintenance completion did not reopen: %v %v", resumed, err)
	}
	finish, err := life.begin()
	if err != nil {
		t.Fatal(err)
	}
	finish()
	if err = life.stop(); err != nil {
		t.Fatal(err)
	}
}

func TestBridgeManagerExplicitMaintenanceResume(t *testing.T) {
	for _, engine := range []string{"mihomo", "xray", "sing-box"} {
		t.Run(engine, func(t *testing.T) {
			f := runtimeFixture(t, engine)
			if err := f.stop(); err != nil {
				t.Fatal(err)
			}
			var resume func() error
			switch engine {
			case "mihomo":
				resume = func() error { return f.m.ResumeAfterMaintenance(nil) }
			case "xray":
				resume = func() error { return f.x.ResumeAfterMaintenance(nil) }
			case "sing-box":
				resume = func() error { return f.s.ResumeAfterMaintenance(nil) }
			}
			if err := resume(); err != nil {
				t.Fatal(err)
			}
			if err := resume(); err != nil {
				t.Fatal(err)
			}
			f.replace()
			_, token, err := f.acquire()
			if err != nil {
				t.Fatal(err)
			}
			f.release(token)
			f.idle()
			f.recycle()
			if !processExited(f.exited()) {
				t.Fatal("resumed manager failed idle collection")
			}
		})
	}
}

func TestBridgePreconstructedClientUsesCurrentGeneration(t *testing.T) {
	for _, engine := range []string{"mihomo", "xray", "sing-box"} {
		t.Run(engine, func(t *testing.T) {
			f := runtimeFixture(t, engine)
			connector := config.BrowserConnectorXray
			if engine == "mihomo" {
				connector = config.BrowserConnectorMihomo
			}
			client, err := BuildProxyHTTPClient(f.src, "", nil, f.x, f.s, f.m, connector, 3*time.Second)
			if err != nil {
				t.Fatal(err)
			}
			defer client.CloseIdleConnections()
			f.idle()
			f.recycle()
			if !processExited(f.exited()) {
				t.Fatal("idle generation did not stop")
			}
			f.replace()
			resp, err := client.Get("http://fixture.invalid/witness")
			if err != nil {
				t.Fatal(err)
			}
			data, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			if err != nil || string(data) != "fixture" {
				t.Fatalf("preconstructed client used old endpoint: %q %v", data, err)
			}
			if f.refs() != 0 {
				t.Fatal("request leaked replacement lease")
			}
		})
	}
}

func TestMihomoWarmupCollectedByBackgroundLoop(t *testing.T) {
	m, src, b := seededMihomoFixture(t)
	if _, err := m.EnsureNodeBridge(src, nil, ""); err != nil {
		t.Fatal(err)
	}
	m.mu.Lock()
	if b.RefCount != 0 {
		t.Error("warmup is pinned")
	}
	b.LastUsedAt = time.Now().Add(-2 * xrayBridgeIdleTTL)
	m.mu.Unlock()
	select {
	case <-b.ExitDone:
	case <-time.After(xrayBridgeCleanupInterval + 5*time.Second):
		t.Fatal("background collector did not reap expired warmup")
	}
}
