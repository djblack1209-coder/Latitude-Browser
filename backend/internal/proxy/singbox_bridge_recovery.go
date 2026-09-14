package proxy

import (
	"ant-chrome/backend/internal/logger"
	"errors"
	"fmt"
	"time"
)

var errSingBoxBridgeRestartNotNeeded = errors.New("sing-box 桥接已无须恢复")

func cloneStringInterfaceMap(items map[string]interface{}) map[string]interface{} {
	if len(items) == 0 {
		return nil
	}
	cloned := make(map[string]interface{}, len(items))
	for key, value := range items {
		cloned[key] = value
	}
	return cloned
}

func (m *SingBoxManager) restartBridgeOnSamePort(log *logger.Logger, key string, bridge *SingBoxBridge, refCount int) error {
	done, admissionErr := m.lifecycle.begin()
	if admissionErr != nil {
		return errSingBoxBridgeRestartNotNeeded
	}
	defer done()
	if bridge == nil {
		return fmt.Errorf("sing-box 桥接不存在")
	}
	unlockLaunch := m.lockLaunchForKey(key)
	defer unlockLaunch()
	m.mu.Lock()
	current := m.Bridges[key]
	if current != bridge || bridge.Stopping || bridge.RefCount <= 0 {
		m.mu.Unlock()
		return errSingBoxBridgeRestartNotNeeded
	}
	if len(bridge.Outbound) == 0 {
		m.mu.Unlock()
		return fmt.Errorf("sing-box 桥接缺少重启上下文")
	}
	bridge.Restarting = true
	m.mu.Unlock()

	binaryPath, err := m.resolveBinary()
	if err != nil {
		return err
	}
	log.Warn("sing-box 桥接进程退出，尝试同端口恢复",
		logger.F("key", key[:8]),
		logger.F("port", bridge.Port),
	)
	restarted, err := m.launchBridgeOnPort(log, key, binaryPath, cloneStringInterfaceMap(bridge.Outbound), bridge.Port, 1)
	if err != nil {
		return err
	}
	restarted.RestartCount = bridge.RestartCount + 1

	restarted.LastUsedAt = time.Now()
	m.mu.Lock()
	if current := m.Bridges[key]; current != bridge {
		m.mu.Unlock()
		restarted.Stopping = true
		m.stopBridgeProcess(restarted)
		return errSingBoxBridgeRestartNotNeeded
	}
	restarted.RefCount = bridge.RefCount
	m.leases.transfer(bridge, restarted)
	m.Bridges[key] = restarted
	m.mu.Unlock()
	log.Info("sing-box 桥接已同端口恢复",
		logger.F("key", key[:8]),
		logger.F("port", restarted.Port),
		logger.F("pid", restarted.Pid),
	)
	go m.watchBridge(restarted, key)
	return nil
}
