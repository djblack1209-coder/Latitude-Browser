package browser

import "fmt"

func (m *Manager) BeginDataMaintenance() (func(), error) {
	m.Mutex.Lock()
	defer m.Mutex.Unlock()
	if err := m.CheckDataMaintenanceLocked(); err != nil {
		return nil, err
	}
	m.dataMaintenance = true
	return func() { m.Mutex.Lock(); m.dataMaintenance = false; m.Mutex.Unlock() }, nil
}

// CheckDataMaintenanceLocked requires Mutex. It must precede any mutation,
// allowing long archive I/O to release Mutex while keeping writes excluded.
func (m *Manager) CheckDataMaintenanceLocked() error {
	if m.dataMaintenance {
		return fmt.Errorf("正在维护浏览器数据，请稍后重试")
	}
	return nil
}

func (m *Manager) DataMaintenanceActive() bool {
	m.Mutex.Lock()
	defer m.Mutex.Unlock()
	return m.dataMaintenance
}
