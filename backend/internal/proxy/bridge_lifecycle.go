package proxy

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"sync"
	"sync/atomic"
	"time"
)

var errBridgeManagerStopped = errors.New("代理运行时管理器已停止")

// Every process is owned from Start until Wait has completed, including failed
// starts/readiness checks and superseded bridges. Shutdown closes admission
// before waiting for launches, so a late registration cannot escape the sweep.
type bridgeLifecycle struct {
	mu          sync.Mutex
	shutdownMu  sync.Mutex
	stopped     bool
	active      sync.WaitGroup
	ctx         context.Context
	cancel      context.CancelFunc
	owned       map[*exec.Cmd]<-chan struct{}
	stopProcess func(*exec.Cmd, <-chan struct{}) error
	afterTrack  func()
}

func (l *bridgeLifecycle) isStopped() bool { l.mu.Lock(); defer l.mu.Unlock(); return l.stopped }

func (l *bridgeLifecycle) begin() (func(), error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.stopped {
		return nil, errBridgeManagerStopped
	}
	l.active.Add(1)
	return l.active.Done, nil
}

// Reopen only after a bounded maintenance operation has drained all processes.
// Application shutdown itself never reopens admission.
func (l *bridgeLifecycle) resume() (bool, error) {
	l.shutdownMu.Lock()
	defer l.shutdownMu.Unlock()
	l.mu.Lock()
	defer l.mu.Unlock()
	if !l.stopped {
		return false, nil
	}
	for cmd, done := range l.owned {
		if !processExited(done) {
			return false, fmt.Errorf("代理进程 %d 尚未确认停止，不能恢复启动", cmd.Process.Pid)
		}
	}
	l.owned = nil
	l.ctx = nil
	l.cancel = nil
	l.stopped = false
	return true, nil
}
func (l *bridgeLifecycle) context() context.Context {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.ctx == nil {
		l.ctx, l.cancel = context.WithCancel(context.Background())
		if l.stopped {
			l.cancel()
		}
	}
	return l.ctx
}
func (l *bridgeLifecycle) track(cmd *exec.Cmd, done <-chan struct{}) {
	if cmd == nil || done == nil {
		return
	}
	l.mu.Lock()
	if l.owned == nil {
		l.owned = make(map[*exec.Cmd]<-chan struct{})
	}
	l.owned[cmd] = done
	l.mu.Unlock()
	go func() { <-done; l.mu.Lock(); delete(l.owned, cmd); l.mu.Unlock() }()
	if l.afterTrack != nil {
		l.afterTrack()
	}
}
func (l *bridgeLifecycle) stop() error {
	l.shutdownMu.Lock()
	defer l.shutdownMu.Unlock()
	l.mu.Lock()
	l.stopped = true
	if l.cancel != nil {
		l.cancel()
	}
	l.mu.Unlock()
	l.active.Wait()
	l.mu.Lock()
	items := make(map[*exec.Cmd]<-chan struct{}, len(l.owned))
	for cmd, done := range l.owned {
		items[cmd] = done
	}
	l.mu.Unlock()
	var errs []error
	stop := l.stopProcess
	if stop == nil {
		stop = stopOwnedBridgeProcess
	}
	for cmd, done := range items {
		if err := stop(cmd, done); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}
func processExited(done <-chan struct{}) bool {
	if done == nil {
		return false
	}
	select {
	case <-done:
		return true
	default:
		return false
	}
}
func stopOwnedBridgeProcess(cmd *exec.Cmd, done <-chan struct{}) error {
	if cmd == nil || cmd.Process == nil {
		return nil
	}
	if processExited(done) {
		return nil
	}
	if err := cmd.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return fmt.Errorf("停止自有代理进程 %d: %w", cmd.Process.Pid, err)
	}
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	select {
	case <-done:
		return nil
	case <-timer.C:
		return fmt.Errorf("未能确认自有代理进程 %d 退出，保留进程归属", cmd.Process.Pid)
	}
}

func waitOwnedBridgeReady(ctx context.Context, exit <-chan struct{}, timeout time.Duration, probe func() error) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		if processExited(exit) {
			return fmt.Errorf("代理进程提前退出")
		}
		if err := probe(); err == nil {
			if processExited(exit) {
				return fmt.Errorf("代理进程提前退出")
			}
			return ctx.Err()
		}
		timer := time.NewTimer(100 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-exit:
			timer.Stop()
			return fmt.Errorf("代理进程提前退出")
		case <-timer.C:
		}
	}
}

// A release token denotes one acquisition. It is never a node key, and an old
// token cannot decrement a newly created bridge or another caller's reference.
var bridgeLeaseSequence atomic.Uint64

type bridgeLeaseBook[T comparable] struct{ items map[string]T }

func (b *bridgeLeaseBook[T]) issue(node string, bridge T) string {
	if b.items == nil {
		b.items = make(map[string]T)
	}
	token := fmt.Sprintf("%s@%d", node, bridgeLeaseSequence.Add(1))
	b.items[token] = bridge
	return token
}
func (b *bridgeLeaseBook[T]) take(token string) (T, bool) {
	v, ok := b.items[token]
	delete(b.items, token)
	return v, ok
}
func (b *bridgeLeaseBook[T]) transfer(old, current T) {
	for token, v := range b.items {
		if v == old {
			b.items[token] = current
		}
	}
}
