package browser

import (
	"ant-chrome/backend/internal/database"
	"path/filepath"
	"testing"
)

func TestSQLiteProxyDAOPersistsSpeedDiagnostics(t *testing.T) {
	db, err := database.NewDB(filepath.Join(t.TempDir(), "proxies.db"))
	if err != nil {
		t.Fatalf("NewDB returned error: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(); err != nil {
		t.Fatalf("Migrate returned error: %v", err)
	}

	dao := NewSQLiteProxyDAO(db.GetConn())
	proxy := Proxy{
		ProxyId:     "proxy-diagnostic",
		ProxyName:   "diagnostic",
		ProxyConfig: "http://127.0.0.1:1",
	}
	if err := dao.Upsert(proxy); err != nil {
		t.Fatalf("Upsert returned error: %v", err)
	}

	const testedAt = "2026-09-06T00:00:00Z"
	if err := dao.UpdateSpeedDiagnostic(proxy.ProxyId, false, 0, testedAt, "xray", "request", "target_unreachable", "https://connectivity.example", "connection refused"); err != nil {
		t.Fatalf("UpdateSpeedDiagnostic returned error: %v", err)
	}

	listed, err := dao.List()
	if err != nil {
		t.Fatalf("List returned error: %v", err)
	}
	if len(listed) != 1 {
		t.Fatalf("List length = %d, want 1", len(listed))
	}
	stored := listed[0]
	if stored.LastTestOk {
		t.Fatal("LastTestOk = true, want false")
	}
	if stored.LastLatencyMs != 0 || stored.LastTestedAt != testedAt {
		t.Fatalf("legacy speed fields = (%d, %q), want (0, %q)", stored.LastLatencyMs, stored.LastTestedAt, testedAt)
	}
	if stored.LastTestEngine != "xray" || stored.LastTestStage != "request" || stored.LastTestCode != "target_unreachable" {
		t.Fatalf("diagnostic fields = (%q, %q, %q), want (xray, request, target_unreachable)", stored.LastTestEngine, stored.LastTestStage, stored.LastTestCode)
	}
	if stored.LastTestTargetURL != "https://connectivity.example" || stored.LastTestError != "connection refused" {
		t.Fatalf("diagnostic context = (%q, %q), want (https://connectivity.example, connection refused)", stored.LastTestTargetURL, stored.LastTestError)
	}

	if err := dao.ClearSpeedDiagnostic(proxy.ProxyId); err != nil {
		t.Fatalf("ClearSpeedDiagnostic returned error: %v", err)
	}
	cleared, err := dao.List()
	if err != nil {
		t.Fatalf("List after clear returned error: %v", err)
	}
	if len(cleared) != 1 {
		t.Fatalf("List after clear length = %d, want 1", len(cleared))
	}
	if cleared[0].LastTestOk || cleared[0].LastLatencyMs != -1 || cleared[0].LastTestedAt != "" {
		t.Fatalf("legacy speed fields after clear = (ok=%v, latency=%d, testedAt=%q), want (false, -1, empty)", cleared[0].LastTestOk, cleared[0].LastLatencyMs, cleared[0].LastTestedAt)
	}
	if cleared[0].LastTestEngine != "" || cleared[0].LastTestStage != "" || cleared[0].LastTestCode != "" || cleared[0].LastTestTargetURL != "" || cleared[0].LastTestError != "" {
		t.Fatalf("diagnostic fields after clear were not empty: %+v", cleared[0])
	}
}
