package proxy

import "time"

func (m *ClashManager) cleanupMihomoLoop(stop <-chan struct{}) {
	ticker := time.NewTicker(xrayBridgeCleanupInterval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			m.recycleIdleMihomoBridges()
		}
	}
}
func (m *ClashManager) recycleIdleMihomoBridges() {
	m.mu.Lock()
	var stale []*MihomoNodeBridge
	for key, b := range m.NodeBridges {
		if b == nil {
			delete(m.NodeBridges, key)
			continue
		}
		if b.RefCount == 0 && time.Since(b.LastUsedAt) >= xrayBridgeIdleTTL {
			b.Running = false
			delete(m.NodeBridges, key)
			stale = append(stale, b)
		}
	}
	m.mu.Unlock()
	for _, b := range stale {
		_ = stopOwnedBridgeProcess(b.Cmd, b.ExitDone)
	}
}
