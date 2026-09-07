package launchcode

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/config"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNormalizeProfileInputPreservesOmittedNetworkMode(t *testing.T) {
	input := normalizeProfileInput(browser.ProfileInput{ProfileName: "profile"})
	if input.NetworkMode != "" {
		t.Fatalf("NetworkMode = %q, want empty so updates can preserve the existing mode", input.NetworkMode)
	}
}

func TestNormalizeProfileInputTrimsExplicitNetworkMode(t *testing.T) {
	input := normalizeProfileInput(browser.ProfileInput{NetworkMode: " tor "})
	if input.NetworkMode != "tor" {
		t.Fatalf("NetworkMode = %q, want trimmed explicit mode", input.NetworkMode)
	}
}

func TestProfilePutWithoutNetworkModePreservesTorProfile(t *testing.T) {
	manager := browser.NewManager(browserTestConfig(), t.TempDir())
	created, err := manager.Create(browser.ProfileInput{
		ProfileName: "tor profile",
		NetworkMode: browser.NetworkModeTor,
	})
	if err != nil {
		t.Fatalf("Create returned error: %v", err)
	}

	server := NewLaunchServer(nil, nil, manager, 0)
	req := httptest.NewRequest("PUT", "/api/profiles/"+created.ProfileId, strings.NewReader(`{"profile":{"profileName":"tor profile renamed","userDataDir":"`+created.UserDataDir+`"}}`))
	req.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	NewTestHandler(server).ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("PUT status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	updated := manager.Profiles[created.ProfileId]
	if updated == nil {
		t.Fatal("updated profile missing")
	}
	if updated.NetworkMode != browser.NetworkModeTor {
		t.Fatalf("NetworkMode = %q, want %q", updated.NetworkMode, browser.NetworkModeTor)
	}
}

func browserTestConfig() *config.Config {
	return config.DefaultConfig()
}
