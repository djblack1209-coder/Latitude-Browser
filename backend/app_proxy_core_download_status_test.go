package backend

import (
	"testing"

	"ant-chrome/backend/internal/config"
)

func TestProxyCoreIsActiveTreatsCombinedStackAsBothComponents(t *testing.T) {
	app := &App{config: config.DefaultConfig()}

	for _, connector := range []string{config.BrowserConnectorXray, "sing-box", "singbox"} {
		app.config.Browser.DefaultConnectorType = connector
		for _, core := range []string{"xray", "sing-box"} {
			if !proxyCoreIsActive(app, proxyCoreSpec{Core: core}) {
				t.Fatalf("connector %q should activate %s in the combined stack", connector, core)
			}
		}
		if proxyCoreIsActive(app, proxyCoreSpec{Core: "mihomo"}) {
			t.Fatalf("connector %q must not activate mihomo", connector)
		}
	}
}

func TestProxyCoreIsActiveKeepsMihomoStackIndependent(t *testing.T) {
	app := &App{config: config.DefaultConfig()}
	app.config.Browser.DefaultConnectorType = "clash"

	if !proxyCoreIsActive(app, proxyCoreSpec{Core: "mihomo"}) {
		t.Fatal("clash alias should activate mihomo")
	}
	for _, core := range []string{"xray", "sing-box"} {
		if proxyCoreIsActive(app, proxyCoreSpec{Core: core}) {
			t.Fatalf("mihomo stack must not activate %s", core)
		}
	}
}
