package backend

import (
	"fmt"
	"sync"
)

// A nonblocking gate supports nested operations and asynchronous leases. A
// backup never waits while holding a lock needed by an already active writer.
type dataActivityGate struct {
	mu     sync.Mutex
	active int
	frozen bool
}

func (g *dataActivityGate) begin() (func(), error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.frozen {
		return nil, fmt.Errorf("正在维护数据，请稍后重试")
	}
	g.active++
	var once sync.Once
	return func() { once.Do(func() { g.mu.Lock(); g.active--; g.mu.Unlock() }) }, nil
}
func (g *dataActivityGate) freeze() (func(), error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.frozen || g.active != 0 {
		return nil, fmt.Errorf("有数据操作正在执行，请完成后再进行维护")
	}
	g.frozen = true
	return func() { g.mu.Lock(); g.frozen = false; g.mu.Unlock() }, nil
}

func blockedProxySpeeds(ids []string, err error) []ProxyTestResult {
	out := make([]ProxyTestResult, len(ids))
	for i, id := range ids {
		out[i] = ProxyTestResult{ProxyId: id, Error: err.Error()}
	}
	return out
}
func blockedProxyHealth(ids []string, err error) []ProxyIPHealthResult {
	out := make([]ProxyIPHealthResult, len(ids))
	for i, id := range ids {
		out[i] = ProxyIPHealthResult{ProxyId: id, Error: err.Error()}
	}
	return out
}
