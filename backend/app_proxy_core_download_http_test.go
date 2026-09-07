package backend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSelectProxyCoreAssetPrefersMihomoCompatibleArchive(t *testing.T) {
	spec, err := normalizeProxyCoreSpec("mihomo")
	if err != nil {
		t.Fatal(err)
	}
	assets := []githubReleaseAsset{
		{Name: "mihomo-linux-amd64-v1.19.27.gz"},
		{Name: "mihomo-linux-amd64-compatible-v1.19.27.gz"},
		{Name: "mihomo-linux-amd64-compatible-v1.19.27.gz.sha256"},
		{Name: "mihomo-linux-arm64-compatible-v1.19.27.gz"},
	}
	got, err := selectProxyCoreAsset(spec, assets, "linux", "amd64")
	if err != nil {
		t.Fatalf("selectProxyCoreAsset returned error: %v", err)
	}
	if got.Name != "mihomo-linux-amd64-compatible-v1.19.27.gz" {
		t.Fatalf("asset = %q, want compatible amd64 gzip", got.Name)
	}
}

func TestFindInstalledProxyCoreBinaryAcceptsPackagedMihomo(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "bin", "mihomo")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("mihomo"), 0o755); err != nil {
		t.Fatal(err)
	}
	spec, err := normalizeProxyCoreSpec("mihomo")
	if err != nil {
		t.Fatal(err)
	}
	got, source, ok := findInstalledProxyCoreBinary(root, spec, proxyCoreTarget{GOOS: "darwin", GOARCH: "arm64"})
	if !ok {
		t.Fatal("packaged mihomo binary was not found")
	}
	if got != path || source != "runtime" {
		t.Fatalf("binary = %q, source = %q; want %q/runtime", got, source, path)
	}
}
