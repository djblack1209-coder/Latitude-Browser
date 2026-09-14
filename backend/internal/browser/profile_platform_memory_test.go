package browser

import (
	"ant-chrome/backend/internal/config"
	"runtime"
	"testing"
)

func TestProfileMemoryUnsupportedSavePreservesExisting(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("non-Windows behavior; platform policy tested separately")
	}
	m := NewManager(config.DefaultConfig(), t.TempDir())
	if _, err := m.Create(ProfileInput{ProfileName: "unsupported", MemoryLimitMB: 512}); err == nil {
		t.Error("non-Windows create accepted unsupported memory hard limit")
	}
	existing, err := m.Create(ProfileInput{ProfileName: "existing", MemoryLimitMB: 0})
	if err != nil {
		t.Fatal(err)
	}
	oldName := existing.ProfileName
	if _, err = m.Update(existing.ProfileId, ProfileInput{ProfileName: "changed", MemoryLimitMB: 512}); err == nil {
		t.Error("non-Windows update accepted unsupported memory hard limit")
	}
	if existing.ProfileName != oldName || existing.MemoryLimitMB != 0 {
		t.Errorf("rejected update mutated existing: %#v", existing)
	}
	// Simulate a restored legacy Windows configuration; do not normalize it on read.
	existing.MemoryLimitMB = 512
	if _, err = m.Update(existing.ProfileId, ProfileInput{ProfileName: oldName, MemoryLimitMB: 0}); err != nil {
		t.Fatalf("explicit legacy clear: %v", err)
	}
	if existing.MemoryLimitMB != 0 {
		t.Error("explicit clear did not persist")
	}
}

func TestPlatformMemoryCapabilityPolicy(t *testing.T) {
	for _, platform := range []string{"windows", "darwin", "linux"} {
		t.Run(platform, func(t *testing.T) {
			if got := platformCapabilities(platform); got.Platform != platform || got.MemoryHardLimit != (platform == "windows") {
				t.Fatalf("unexpected capabilities: %+v", got)
			}
			if err := validatePlatformMemoryLimit(platform, 0); err != nil {
				t.Fatal(err)
			}
			if err := validatePlatformMemoryLimit(platform, -1); err == nil {
				t.Error("negative accepted")
			}
			if err := validatePlatformMemoryLimit(platform, 512); (err == nil) != (platform == "windows") {
				t.Fatalf("positive limit policy: %v", err)
			}
		})
	}
}
