package proxy

import (
	"ant-chrome/backend/internal/config"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestXrayRecoveryConcurrentLeaseRelease(t *testing.T) {
	runtimes := []string{"fixture"}
	if real := os.Getenv("LATITUDE_TEST_PROXY_RUNTIMES"); real != "" {
		runtimes = append(runtimes, filepath.Join(real, "xray"))
	}
	for _, runtime := range runtimes {
		t.Run(filepath.Base(runtime), func(t *testing.T) {
			root := t.TempDir()
			binary := runtime
			if runtime == "fixture" {
				binary = filepath.Join(root, "runtime-fixture")
				quotedExecutable := "'" + strings.ReplaceAll(os.Args[0], "'", "'\"'\"'") + "'"
				script := "#!/bin/sh\nif [ \"$2\" = \"-test\" ]; then exit 0; fi\nexport LATITUDE_BRIDGE_FIXTURE=1\nexport LATITUDE_BRIDGE_FIXTURE_CONFIG=\"$3\"\nexec " + quotedExecutable + " -test.run=^TestBridgeProcessFixture$\n"
				if err := os.WriteFile(binary, []byte(script), 0700); err != nil {
					t.Fatal(err)
				}
			}
			cfg := config.DefaultConfig()
			cfg.Browser.XrayBinaryPath = binary
			m := NewXrayManager(cfg, root)
			var armed atomic.Bool
			published := make(chan *XrayBridge, 1)
			start := make(chan struct{})
			m.afterBridgePublish = func(b *XrayBridge) {
				if armed.Load() {
					published <- b
					<-start
				}
			}
			t.Cleanup(func() {
				if err := m.StopAll(); err != nil {
					t.Error(err)
				}
			})
			var startOnce sync.Once
			openStart := func() { startOnce.Do(func() { close(start) }) }
			t.Cleanup(openStart)
			src := "vless://00000000-0000-4000-8000-000000000001@127.0.0.1:9?encryption=none"
			key := computeNodeKey(src + "\x00")
			_, one, err := m.AcquireBridge(src, nil, "")
			if err != nil {
				t.Fatal(err)
			}
			_, keep, err := m.AcquireBridge(src, nil, "")
			if err != nil {
				t.Fatal(err)
			}
			m.mu.Lock()
			old := m.Bridges[key]
			oldPort := old.Port
			m.mu.Unlock()
			armed.Store(true)
			if err := old.Cmd.Process.Kill(); err != nil {
				t.Fatal(err)
			}
			var replacement *XrayBridge
			select {
			case replacement = <-published:
			case <-time.After(10 * time.Second):
				t.Fatal("recovery did not publish")
			}
			released := make(chan struct{})
			go func() { <-start; m.ReleaseBridge(one); m.ReleaseBridge(one); m.recycleIdleBridges(); close(released) }()
			// Release and post-publication recovery resume from the same barrier. Neither
			// is ordered after the other; production synchronization must protect them.
			openStart()
			<-released
			unlock := m.lockLaunchForKey(key)
			unlock() // Wait until the recovery function has returned.
			m.mu.Lock()
			refs := replacement.RefCount
			current := m.Bridges[key]
			port := replacement.Port
			replacement.LastUsedAt = time.Now().Add(-2 * xrayBridgeIdleTTL)
			m.mu.Unlock()
			if refs != 1 || current != replacement || port != oldPort {
				t.Fatalf("recovery lost lease/port: refs=%d port=%d want=%d", refs, port, oldPort)
			}
			m.recycleIdleBridges()
			if processExited(replacement.ExitDone) {
				t.Fatal("active lease was collected")
			}
			m.ReleaseBridge(keep)
			m.mu.Lock()
			refs = replacement.RefCount
			replacement.LastUsedAt = time.Now().Add(-2 * xrayBridgeIdleTTL)
			m.mu.Unlock()
			if refs != 0 {
				t.Fatalf("final release left %d refs", refs)
			}
			m.recycleIdleBridges()
			if !processExited(old.ExitDone) || !processExited(replacement.ExitDone) {
				t.Fatal("owned generation was not reaped")
			}
		})
	}
}
