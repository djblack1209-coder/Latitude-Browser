package backend

import (
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	goruntime "runtime"
	"strings"
	"testing"
	"time"

	"ant-chrome/backend/internal/config"

	"gopkg.in/yaml.v3"
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
	target := proxyCoreTarget{GOOS: goruntime.GOOS, GOARCH: goruntime.GOARCH}
	path := filepath.Join(root, "bin", proxyCoreBinaryName("mihomo", target.GOOS))
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
	got, source, ok := findInstalledProxyCoreBinary(root, spec, target)
	if !ok {
		t.Fatal("packaged mihomo binary was not found")
	}
	if got != path || source != "runtime" {
		t.Fatalf("binary = %q, source = %q; want %q/runtime", got, source, path)
	}
}

type proxyCoreTestRoundTripper func(*http.Request) (*http.Response, error)

func (roundTrip proxyCoreTestRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return roundTrip(req)
}

func TestProxyCoreDownloadRejectsReleaseSizeMismatch(t *testing.T) {
	const body = "fixture archive bytes"
	for _, tc := range []struct {
		name          string
		releaseSize   int64
		contentLength int64
	}{
		{name: "body_shorter_than_release", releaseSize: int64(len(body) + 1), contentLength: int64(len(body))},
		{name: "body_longer_than_release", releaseSize: int64(len(body) - 1), contentLength: int64(len(body))},
		{name: "unknown_length_short_body", releaseSize: int64(len(body) + 1), contentLength: -1},
		{name: "unknown_length_long_body", releaseSize: int64(len(body) - 1), contentLength: -1},
		{name: "matching_header_short_body", releaseSize: int64(len(body) + 1), contentLength: int64(len(body) + 1)},
		{name: "matching_header_long_body", releaseSize: int64(len(body) - 1), contentLength: int64(len(body) - 1)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := &http.Client{Transport: proxyCoreTestRoundTripper(func(req *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode:    http.StatusOK,
					Body:          io.NopCloser(strings.NewReader(body)),
					ContentLength: tc.contentLength,
					Request:       req,
				}, nil
			})}
			file, err := os.CreateTemp(t.TempDir(), "download-*")
			if err != nil {
				t.Fatal(err)
			}
			defer file.Close()

			asset := proxyCoreTestAsset([]byte(body))
			asset.Size = tc.releaseSize
			err = downloadProxyCoreAsset(context.Background(), client, asset, file, func(string, int, string) {})
			if err == nil {
				t.Fatalf("accepted %d downloaded bytes despite Release size %d", len(body), tc.releaseSize)
			}
		})
	}
}

func TestProxyCoreInstallFailurePreservesExistingBinary(t *testing.T) {
	root := t.TempDir()
	dst := filepath.Join(root, "installed")
	if err := os.MkdirAll(dst, 0o755); err != nil {
		t.Fatal(err)
	}
	oldPath := filepath.Join(dst, "mihomo")
	const oldContents = "previous verified core"
	if err := os.WriteFile(oldPath, []byte(oldContents), 0o755); err != nil {
		t.Fatal(err)
	}

	if err := replaceDirContents(filepath.Join(root, "missing-staging"), dst, nil); err == nil {
		t.Fatal("expected installation to fail when staged source is missing")
	}
	contents, err := os.ReadFile(oldPath)
	if err != nil {
		t.Fatalf("failed installation removed the previous core: %v", err)
	}
	if string(contents) != oldContents {
		t.Fatalf("failed installation changed previous core contents: got %q, want %q", contents, oldContents)
	}
}

func TestProxyCoreSaveFailurePreservesConfig(t *testing.T) {
	root := t.TempDir()
	app := &App{appRoot: root, config: config.DefaultConfig()}
	previousPath := filepath.Join(root, "previous", "mihomo")
	app.config.Browser.ClashBinaryPath = previousPath
	app.config.Browser.DefaultConnectorType = config.BrowserConnectorMihomo
	configDir := app.resolveAppPath("config.yaml")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		t.Fatal(err)
	}
	sentinel := filepath.Join(configDir, "preserve-on-save-failure")
	if err := os.WriteFile(sentinel, []byte("unchanged"), 0o600); err != nil {
		t.Fatal(err)
	}
	spec, err := normalizeProxyCoreSpec("mihomo")
	if err != nil {
		t.Fatal(err)
	}

	if err := app.saveProxyCoreBinaryPath(spec, filepath.Join(root, "candidate", "mihomo")); err == nil {
		t.Fatal("expected save to fail because config.yaml is a directory")
	}
	if got := app.config.Browser.ClashBinaryPath; got != previousPath {
		t.Fatalf("failed save changed in-memory core path: got %q, want %q", got, previousPath)
	}
	if got := app.config.Browser.DefaultConnectorType; got != config.BrowserConnectorMihomo {
		t.Fatalf("failed save changed connector stack: got %q", got)
	}
	if got, err := os.ReadFile(sentinel); err != nil || string(got) != "unchanged" {
		t.Fatalf("failed save changed existing disk state: got %q, err=%v", got, err)
	}
}

func TestProxyCoreInstalledLookupSkipsTransientDirectories(t *testing.T) {
	t.Setenv("PATH", "")
	target := proxyCoreTarget{GOOS: goruntime.GOOS, GOARCH: goruntime.GOARCH}
	platform := target.GOOS + "-" + target.GOARCH
	spec, err := normalizeProxyCoreSpec("mihomo")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name        string
		relativeDir string
	}{
		{name: "extract_in_install_dir", relativeDir: filepath.Join("bin", platform, "mihomo", "extract-fixture")},
		{name: "staging_in_install_dir", relativeDir: filepath.Join("bin", platform, "mihomo", ".proxy-core-staging-fixture")},
		{name: "backup_in_install_dir", relativeDir: filepath.Join("bin", platform, "mihomo", ".proxy-core-backup-fixture")},
		{name: "staging_in_platform_dir", relativeDir: filepath.Join("bin", platform, ".proxy-core-staging-fixture")},
		{name: "backup_in_bin_dir", relativeDir: filepath.Join("bin", ".proxy-core-backup-fixture")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			transientPath := filepath.Join(root, tc.relativeDir, proxyCoreBinaryName(spec.BinaryBase, target.GOOS))
			if err := os.MkdirAll(filepath.Dir(transientPath), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(transientPath, []byte("not an installed core"), 0o755); err != nil {
				t.Fatal(err)
			}

			if got, source, ok := findInstalledProxyCoreBinary(root, spec, target); ok {
				t.Fatalf("transient core must not count as installed: path=%q source=%q", got, source)
			}
			app := &App{appRoot: root, config: config.DefaultConfig()}
			app.config.Browser.DefaultConnectorType = config.BrowserConnectorMihomo
			app.config.Browser.ClashBinaryPath = ""
			status := app.proxyCoreStatus(spec, target)
			if status.Installed || status.State != ProxyCoreStateMissing {
				t.Fatalf("transient core must not make preflight ready: %+v", status)
			}
			if strings.HasPrefix(filepath.Base(filepath.Dir(transientPath)), "extract-") {
				got, err := findProxyCoreBinary(filepath.Dir(transientPath), spec.BinaryBase, target.GOOS)
				if err != nil || got != transientPath {
					t.Fatalf("explicit extraction-root lookup must still work: got %q, err=%v", got, err)
				}
			}
		})
	}
}

func proxyCoreTestAsset(contents []byte) githubReleaseAsset {
	return githubReleaseAsset{
		Name:               "mihomo-darwin-arm64-v1.19.27.gz",
		BrowserDownloadURL: "https://github.com/MetaCubeX/mihomo/releases/download/v1.19.27/mihomo-darwin-arm64-v1.19.27.gz",
		Size:               int64(len(contents)),
		Digest:             fmt.Sprintf("sha256:%x", sha256.Sum256(contents)),
	}
}

func proxyCoreTestClient(body io.ReadCloser, contentLength int64, status int) *http.Client {
	return &http.Client{Transport: proxyCoreTestRoundTripper(func(req *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: status, Body: body, ContentLength: contentLength, Request: req}, nil
	})}
}

func proxyCoreTestDownloadFile(t *testing.T) *os.File {
	t.Helper()
	file, err := os.CreateTemp(t.TempDir(), "download-*")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = file.Close() })
	return file
}

func TestProxyCoreAssetSHA256RejectsUnverifiableDigests(t *testing.T) {
	valid := proxyCoreTestAsset([]byte("verified fixture"))
	for _, tc := range []struct{ name, digest string }{
		{name: "missing", digest: ""},
		{name: "blank", digest: "   "},
		{name: "no_algorithm", digest: strings.TrimPrefix(valid.Digest, "sha256:")},
		{name: "unsupported_algorithm", digest: strings.Replace(valid.Digest, "sha256:", "sha512:", 1)},
		{name: "empty_hash", digest: "sha256:"},
		{name: "short_hash", digest: "sha256:abcd"},
		{name: "long_hash", digest: valid.Digest + "00"},
		{name: "non_hex", digest: "sha256:" + strings.Repeat("g", 64)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			asset := valid
			asset.Digest = tc.digest
			if _, err := proxyCoreAssetSHA256(asset); err == nil {
				t.Fatalf("accepted unverifiable asset digest %q", tc.digest)
			}
		})
	}
	got, err := proxyCoreAssetSHA256(valid)
	if want := strings.TrimPrefix(valid.Digest, "sha256:"); err != nil || got != want {
		t.Fatalf("valid SHA256 = %q, err=%v; want %q", got, err, want)
	}
}

func TestProxyCoreDownloadVerifiesDigestAndExactContents(t *testing.T) {
	const original = "verified fixture payload"
	for _, tc := range []struct {
		name    string
		body    string
		wantErr bool
	}{
		{name: "valid", body: original},
		{name: "same_length_tampering", body: "X" + original[1:], wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			asset := proxyCoreTestAsset([]byte(original))
			file := proxyCoreTestDownloadFile(t)
			client := proxyCoreTestClient(io.NopCloser(strings.NewReader(tc.body)), int64(len(tc.body)), http.StatusOK)
			err := downloadProxyCoreAsset(context.Background(), client, asset, file, func(string, int, string) {})
			if tc.wantErr {
				if err == nil {
					t.Fatal("accepted same-length bytes that do not match the release digest")
				}
				return
			}
			if err != nil {
				t.Fatalf("verified download failed: %v", err)
			}
			got, err := os.ReadFile(file.Name())
			if err != nil || string(got) != original {
				t.Fatalf("downloaded contents = %q, err=%v", got, err)
			}
		})
	}
}

func TestProxyCoreDownloadRejectsInvalidMetadataBeforeRequest(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*githubReleaseAsset)
	}{
		{name: "missing_digest", mutate: func(a *githubReleaseAsset) { a.Digest = "" }},
		{name: "invalid_digest", mutate: func(a *githubReleaseAsset) { a.Digest = "sha256:not-hex" }},
		{name: "unsupported_digest", mutate: func(a *githubReleaseAsset) { a.Digest = "sha1:" + strings.Repeat("a", 40) }},
		{name: "zero_release_size", mutate: func(a *githubReleaseAsset) { a.Size = 0 }},
		{name: "negative_release_size", mutate: func(a *githubReleaseAsset) { a.Size = -1 }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			asset := proxyCoreTestAsset([]byte("fixture"))
			tc.mutate(&asset)
			requests := 0
			client := &http.Client{Transport: proxyCoreTestRoundTripper(func(*http.Request) (*http.Response, error) {
				requests++
				return nil, errors.New("invalid metadata must be rejected before requesting bytes")
			})}
			err := downloadProxyCoreAsset(context.Background(), client, asset, proxyCoreTestDownloadFile(t), func(string, int, string) {})
			if err == nil || requests != 0 {
				t.Fatalf("invalid metadata was not rejected before download: err=%v requests=%d", err, requests)
			}
		})
	}
}

type proxyCoreTestReadFunc func([]byte) (int, error)

func (read proxyCoreTestReadFunc) Read(p []byte) (int, error) { return read(p) }

func TestProxyCoreDownloadPropagatesTransportReadWriteAndContextErrors(t *testing.T) {
	asset := proxyCoreTestAsset([]byte("fixture"))
	for _, tc := range []struct {
		name    string
		prepare func(context.CancelFunc) (*http.Client, bool)
	}{
		{name: "http_error", prepare: func(context.CancelFunc) (*http.Client, bool) {
			return proxyCoreTestClient(io.NopCloser(strings.NewReader("fixture")), asset.Size, http.StatusBadGateway), false
		}},
		{name: "transport_error", prepare: func(context.CancelFunc) (*http.Client, bool) {
			return &http.Client{Transport: proxyCoreTestRoundTripper(func(*http.Request) (*http.Response, error) {
				return nil, errors.New("fixture transport failure")
			})}, false
		}},
		{name: "read_error", prepare: func(context.CancelFunc) (*http.Client, bool) {
			return proxyCoreTestClient(io.NopCloser(proxyCoreTestReadFunc(func([]byte) (int, error) {
				return 0, io.ErrUnexpectedEOF
			})), asset.Size, http.StatusOK), false
		}},
		{name: "write_error", prepare: func(context.CancelFunc) (*http.Client, bool) {
			return proxyCoreTestClient(io.NopCloser(strings.NewReader("fixture")), asset.Size, http.StatusOK), true
		}},
		{name: "canceled_before_request", prepare: func(cancel context.CancelFunc) (*http.Client, bool) {
			cancel()
			return proxyCoreTestClient(io.NopCloser(strings.NewReader("fixture")), asset.Size, http.StatusOK), false
		}},
		{name: "canceled_while_reading", prepare: func(cancel context.CancelFunc) (*http.Client, bool) {
			read := false
			return proxyCoreTestClient(io.NopCloser(proxyCoreTestReadFunc(func(p []byte) (int, error) {
				if read {
					return 0, io.EOF
				}
				read = true
				cancel()
				return copy(p, "fixture"), nil
			})), asset.Size, http.StatusOK), false
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			client, closeFile := tc.prepare(cancel)
			file := proxyCoreTestDownloadFile(t)
			if closeFile {
				if err := file.Close(); err != nil {
					t.Fatal(err)
				}
			}
			if err := downloadProxyCoreAsset(ctx, client, asset, file, func(string, int, string) {}); err == nil {
				t.Fatal("download unexpectedly succeeded despite fixture failure")
			}
		})
	}
}

func TestProxyCoreReleaseAssetMustBelongToSelectedOfficialRelease(t *testing.T) {
	spec, err := normalizeProxyCoreSpec("mihomo")
	if err != nil {
		t.Fatal(err)
	}
	asset := proxyCoreTestAsset([]byte("fixture"))
	release := githubRelease{TagName: spec.Version, Assets: []githubReleaseAsset{asset}}
	if err := validateProxyCoreReleaseAsset(spec, release, asset); err != nil {
		t.Fatalf("rejected exact official release asset: %v", err)
	}
	for _, tc := range []struct{ name, url string }{
		{name: "plain_http", url: strings.Replace(asset.BrowserDownloadURL, "https:", "http:", 1)},
		{name: "lookalike_host", url: strings.Replace(asset.BrowserDownloadURL, "github.com/", "github.com.attacker.invalid/", 1)},
		{name: "different_repository", url: strings.Replace(asset.BrowserDownloadURL, "MetaCubeX/mihomo", "attacker/mihomo", 1)},
		{name: "different_release", url: strings.Replace(asset.BrowserDownloadURL, "/v1.19.27/", "/v1.19.26/", 1)},
		{name: "different_filename", url: asset.BrowserDownloadURL + ".other"},
		{name: "userinfo", url: strings.Replace(asset.BrowserDownloadURL, "https://", "https://user:password@", 1)},
		{name: "nondefault_port", url: strings.Replace(asset.BrowserDownloadURL, "github.com/", "github.com:8443/", 1)},
		{name: "query", url: asset.BrowserDownloadURL + "?source=other"},
		{name: "fragment", url: asset.BrowserDownloadURL + "#other"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			forged := asset
			forged.BrowserDownloadURL = tc.url
			if err := validateProxyCoreReleaseAsset(spec, release, forged); err == nil {
				t.Fatalf("accepted source not bound to selected official asset: %q", tc.url)
			}
		})
	}
}

func TestProxyCoreInstallCommitFailureRollsBackExistingOrFirstInstall(t *testing.T) {
	for _, existing := range []bool{true, false} {
		t.Run(fmt.Sprintf("existing_%t", existing), func(t *testing.T) {
			root := t.TempDir()
			src, dst := filepath.Join(root, "candidate"), filepath.Join(root, "installed")
			if err := os.MkdirAll(src, 0o755); err != nil {
				t.Fatal(err)
			}
			if existing {
				if err := os.MkdirAll(dst, 0o755); err != nil {
					t.Fatal(err)
				}
			}
			for name, contents := range map[string]string{"mihomo": "new core", "new-only.dat": "candidate data"} {
				if err := os.WriteFile(filepath.Join(src, name), []byte(contents), 0o755); err != nil {
					t.Fatal(err)
				}
			}
			if existing {
				for name, contents := range map[string]string{"mihomo": "old core", "old-only.dat": "old data"} {
					if err := os.WriteFile(filepath.Join(dst, name), []byte(contents), 0o755); err != nil {
						t.Fatal(err)
					}
				}
			}
			commits := 0
			err := replaceDirContents(src, dst, func() error {
				commits++
				if got, err := os.ReadFile(filepath.Join(dst, "mihomo")); err != nil || string(got) != "new core" {
					t.Errorf("commit must observe complete candidate: got %q, err=%v", got, err)
				}
				return errors.New("fixture commit failure")
			})
			if err == nil || commits != 1 {
				t.Fatalf("expected exactly one failed commit: err=%v commits=%d", err, commits)
			}
			if existing {
				for name, want := range map[string]string{"mihomo": "old core", "old-only.dat": "old data"} {
					if got, err := os.ReadFile(filepath.Join(dst, name)); err != nil || string(got) != want {
						t.Fatalf("rollback did not restore %s: got %q, err=%v", name, got, err)
					}
				}
			} else if _, err := os.Stat(dst); !os.IsNotExist(err) {
				t.Fatalf("failed first install left a published directory: %v", err)
			}
			if _, err := os.Stat(filepath.Join(dst, "new-only.dat")); !os.IsNotExist(err) {
				t.Fatalf("rollback left candidate-only data: %v", err)
			}
		})
	}
}

func proxyCoreTestShell(t *testing.T, script string) string {
	t.Helper()
	if goruntime.GOOS == "windows" {
		t.Skip("fixture uses a locally authored POSIX shell script, not a downloaded executable")
	}
	path := filepath.Join(t.TempDir(), "mihomo")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+script), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestProxyCoreNativeVersionValidation(t *testing.T) {
	target := proxyCoreTarget{GOOS: goruntime.GOOS, GOARCH: goruntime.GOARCH}
	for _, tc := range []struct {
		name, core, output string
		exitCode           int
		wantErr            bool
	}{
		{name: "mihomo_valid", core: "mihomo", output: "Mihomo Meta v1.19.27 " + target.GOOS + " " + target.GOARCH},
		{name: "xray_valid", core: "xray", output: "Xray 26.3.27 (Xray, Penetrates Everything.)"},
		{name: "sing_box_valid", core: "sing-box", output: "sing-box version 1.13.13"},
		{name: "version_mismatch", core: "mihomo", output: "Mihomo Meta v1.19.26", wantErr: true},
		{name: "version_prefix_not_equal", core: "mihomo", output: "Mihomo Meta v1.19.270", wantErr: true},
		{name: "empty_output", core: "mihomo", wantErr: true},
		{name: "nonzero_exit", core: "mihomo", output: "Mihomo Meta v1.19.27", exitCode: 1, wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			spec, err := normalizeProxyCoreSpec(tc.core)
			if err != nil {
				t.Fatal(err)
			}
			path := proxyCoreTestShell(t, fmt.Sprintf("printf '%%s\\n' '%s'\nexit %d\n", tc.output, tc.exitCode))
			err = validateProxyCoreBinary(context.Background(), path, spec, target, spec.Version)
			if (err != nil) != tc.wantErr {
				t.Fatalf("version validation err=%v, wantErr=%v", err, tc.wantErr)
			}
		})
	}
}

func TestProxyCoreVersionValidationHonorsCancellation(t *testing.T) {
	spec, err := normalizeProxyCoreSpec("mihomo")
	if err != nil {
		t.Fatal(err)
	}
	path := proxyCoreTestShell(t, "exec /bin/sleep 30\n")
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	started := time.Now()
	err = validateProxyCoreBinary(ctx, path, spec, proxyCoreTarget{GOOS: goruntime.GOOS, GOARCH: goruntime.GOARCH}, spec.Version)
	if err == nil {
		t.Fatal("version probe succeeded after its context expired")
	}
	if elapsed := time.Since(started); elapsed > 3*time.Second {
		t.Fatalf("version probe did not promptly honor cancellation: %s", elapsed)
	}
}

func TestProxyCoreForeignTargetVersionValidationNeverExecutes(t *testing.T) {
	spec, err := normalizeProxyCoreSpec("mihomo")
	if err != nil {
		t.Fatal(err)
	}
	otherOS, otherArch := "linux", "amd64"
	if goruntime.GOOS == otherOS {
		otherOS = "darwin"
	}
	if goruntime.GOARCH == otherArch {
		otherArch = "arm64"
	}
	for _, target := range []proxyCoreTarget{
		{GOOS: otherOS, GOARCH: goruntime.GOARCH},
		{GOOS: goruntime.GOOS, GOARCH: otherArch},
	} {
		t.Run(target.GOOS+"-"+target.GOARCH, func(t *testing.T) {
			marker := filepath.Join(t.TempDir(), "must-not-execute")
			path := proxyCoreTestShell(t, fmt.Sprintf("printf ran > '%s'\nexit 1\n", marker))
			if err := validateProxyCoreBinary(context.Background(), path, spec, target, spec.Version); err != nil {
				t.Fatalf("foreign target must be validated without a native process probe: %v", err)
			}
			if _, err := os.Stat(marker); !os.IsNotExist(err) {
				t.Fatalf("foreign-target candidate was executed: %v", err)
			}
		})
	}
}

func TestProxyCoreDownloadLockRejectsDuplicateAndReleases(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "mihomo")
	release, err := tryBeginProxyCoreDownload(dir)
	if err != nil {
		t.Fatal(err)
	}
	if duplicateRelease, err := tryBeginProxyCoreDownload(dir); err == nil {
		if duplicateRelease != nil {
			duplicateRelease()
		}
		release()
		t.Fatal("accepted two simultaneous downloads for one install directory")
	}
	otherRelease, err := tryBeginProxyCoreDownload(filepath.Join(root, "xray"))
	if err != nil {
		release()
		t.Fatalf("lock unexpectedly blocked a different target: %v", err)
	}
	otherRelease()
	release()
	retryRelease, err := tryBeginProxyCoreDownload(dir)
	if err != nil {
		t.Fatalf("finished download did not release its target: %v", err)
	}
	retryRelease()
}

func proxyCoreTestGzipRelease(t *testing.T, spec proxyCoreSpec, target proxyCoreTarget, script string) (githubRelease, []byte) {
	t.Helper()
	var archive bytes.Buffer
	writer := gzip.NewWriter(&archive)
	if _, err := writer.Write([]byte(script)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	body := archive.Bytes()
	asset := proxyCoreTestAsset(body)
	asset.Name = fmt.Sprintf("mihomo-%s-%s-%s.gz", target.GOOS, target.GOARCH, spec.Version)
	asset.BrowserDownloadURL = fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", spec.Repo, spec.Version, asset.Name)
	return githubRelease{TagName: spec.Version, Assets: []githubReleaseAsset{asset}}, body
}

func TestProxyCoreReleaseInstallVerifiesBeforePublishAndPreservesFailures(t *testing.T) {
	if goruntime.GOOS == "windows" {
		t.Skip("native fixture installation uses a locally authored POSIX script")
	}
	target := proxyCoreTarget{GOOS: goruntime.GOOS, GOARCH: goruntime.GOARCH}
	spec, err := normalizeProxyCoreSpec("mihomo")
	if err != nil {
		t.Fatal(err)
	}
	for _, mode := range []string{"success", "digest_mismatch", "size_mismatch", "bad_archive", "wrong_source", "wrong_version", "save_failure", "canceled"} {
		t.Run(mode, func(t *testing.T) {
			root := t.TempDir()
			app := &App{appRoot: root, config: config.DefaultConfig()}
			installDir := proxyCoreInstallDir(app, spec, target)
			if err := os.MkdirAll(installDir, 0o755); err != nil {
				t.Fatal(err)
			}
			installedPath := filepath.Join(installDir, proxyCoreBinaryName(spec.BinaryBase, target.GOOS))
			const previousContents = "previous verified installed fixture"
			if err := os.WriteFile(installedPath, []byte(previousContents), 0o755); err != nil {
				t.Fatal(err)
			}
			app.config.Browser.ClashBinaryPath = filepath.Join(root, "previous-configured", "mihomo")
			app.config.Browser.DefaultConnectorType = config.BrowserConnectorXray
			beforeBrowser := app.config.Browser
			configPath := app.resolveAppPath("config.yaml")
			if err := app.config.Save(configPath); err != nil {
				t.Fatal(err)
			}
			diskBefore, err := os.ReadFile(configPath)
			if err != nil {
				t.Fatal(err)
			}
			if mode == "save_failure" {
				if err := os.Remove(configPath); err != nil {
					t.Fatal(err)
				}
				if err := os.Mkdir(configPath, 0o755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(configPath, "preserve"), diskBefore, 0o600); err != nil {
					t.Fatal(err)
				}
			}
			marker := filepath.Join(root, "version-probe-ran")
			version := spec.Version
			if mode == "wrong_version" {
				version = "v1.19.26"
			}
			script := fmt.Sprintf("#!/bin/sh\nprintf ran > '%s'\nprintf 'Mihomo Meta %s %s %s\\n'\n", marker, version, target.GOOS, target.GOARCH)
			release, body := proxyCoreTestGzipRelease(t, spec, target, script)
			switch mode {
			case "digest_mismatch":
				release.Assets[0].Digest = "sha256:" + strings.Repeat("0", 64)
			case "size_mismatch":
				release.Assets[0].Size++
			case "bad_archive":
				body = []byte("not a gzip archive")
				release.Assets[0].Size = int64(len(body))
				release.Assets[0].Digest = fmt.Sprintf("sha256:%x", sha256.Sum256(body))
			case "wrong_source":
				release.Assets[0].BrowserDownloadURL = strings.Replace(release.Assets[0].BrowserDownloadURL, "/v1.19.27/", "/v1.19.26/", 1)
			}
			requests := 0
			client := &http.Client{Transport: proxyCoreTestRoundTripper(func(req *http.Request) (*http.Response, error) {
				requests++
				if req.URL.String() != release.Assets[0].BrowserDownloadURL {
					t.Fatalf("unexpected fixture request URL: %s", req.URL)
				}
				return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewReader(body)), ContentLength: int64(len(body)), Request: req}, nil
			})}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if mode == "canceled" {
				cancel()
			}
			var phases []string
			gotPath, err := app.installProxyCoreRelease(ctx, client, spec, target, release, func(phase string, _ int, _ string) { phases = append(phases, phase) })
			for _, phase := range phases {
				if phase == "done" {
					t.Fatal("transaction helper must leave done-event publication to the Wails wrapper")
				}
			}
			if mode == "success" {
				if err != nil || gotPath != installedPath || requests != 1 {
					t.Fatalf("verified install failed: path=%q err=%v requests=%d", gotPath, err, requests)
				}
				if got, err := os.ReadFile(installedPath); err != nil || string(got) != script {
					t.Fatalf("published core differs from verified candidate: got %q err=%v", got, err)
				}
				if _, err := os.Stat(marker); err != nil {
					t.Fatalf("successful native installation skipped the version probe: %v", err)
				}
				if app.config.Browser.ClashBinaryPath != installedPath || app.config.Browser.DefaultConnectorType != beforeBrowser.DefaultConnectorType {
					t.Fatalf("successful install did not publish the path without changing stacks: %+v", app.config.Browser)
				}
				var persisted config.Config
				data, err := os.ReadFile(configPath)
				if err != nil {
					t.Fatal(err)
				}
				if err := yaml.Unmarshal(data, &persisted); err != nil || persisted.Browser.ClashBinaryPath != installedPath || persisted.Browser.DefaultConnectorType != beforeBrowser.DefaultConnectorType {
					t.Fatalf("persisted configuration does not match successful installation: err=%v config=%+v", err, persisted.Browser)
				}
				return
			}
			if err == nil {
				t.Fatal("invalid or failed candidate was installed successfully")
			}
			if got, readErr := os.ReadFile(installedPath); readErr != nil || string(got) != previousContents {
				t.Fatalf("failure did not preserve previous installed core: got %q err=%v", got, readErr)
			}
			if !reflect.DeepEqual(app.config.Browser, beforeBrowser) {
				t.Fatalf("failed installation changed in-memory browser settings: got %+v want %+v", app.config.Browser, beforeBrowser)
			}
			readPath := configPath
			if mode == "save_failure" {
				readPath = filepath.Join(configPath, "preserve")
			}
			if got, err := os.ReadFile(readPath); err != nil || !bytes.Equal(got, diskBefore) {
				t.Fatalf("failed installation changed existing on-disk configuration: err=%v", err)
			}
			if mode != "wrong_version" && mode != "save_failure" {
				if _, err := os.Stat(marker); !os.IsNotExist(err) {
					t.Fatalf("unverified candidate was executed: %v", err)
				}
			}
			if mode == "wrong_source" && requests != 0 {
				t.Fatalf("forged release URL was requested before validation: %d requests", requests)
			}
		})
	}
}

// TestProxyCoreMihomoOfficialNetworkInstall exercises the production pipeline only
// when explicitly enabled. It downloads the existing fixed release tag from GitHub,
// verifies its SHA-256/size, and runs only the verified candidate's native -v in a
// temporary QA root. It never starts a proxy, browser, or installed desktop app.
// Reproduce with the existing Go caches and an isolated outer HOME, for example:
//
//	LATITUDE_PROXY_CORE_NETWORK_TEST=1 GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off \
//	  go test -mod=readonly ./backend -run '^TestProxyCoreMihomoOfficialNetworkInstall$' -count=1 -v
//
// HOME, user config/data/cache directories, temp paths, and proxy environment are
// additionally isolated inside the test. Local preflight readiness is not proof
// of external proxy connectivity. Do not bypass TLS or integrity failures here.
func TestProxyCoreMihomoOfficialNetworkInstall(t *testing.T) {
	if os.Getenv("LATITUDE_PROXY_CORE_NETWORK_TEST") != "1" {
		t.Skip("official HTTPS download and verified temporary native -v execution are opt-in; run LATITUDE_PROXY_CORE_NETWORK_TEST=1 go test -mod=readonly ./backend -run '^TestProxyCoreMihomoOfficialNetworkInstall$' -count=1 -v")
	}

	qaRoot := t.TempDir()
	for key, subdir := range map[string]string{
		"HOME": "home", "USERPROFILE": "home",
		"XDG_CONFIG_HOME": "xdg/config", "XDG_DATA_HOME": "xdg/data",
		"XDG_CACHE_HOME": "xdg/cache", "XDG_STATE_HOME": "xdg/state", "XDG_RUNTIME_DIR": "xdg/runtime",
		"APPDATA": "appdata", "LOCALAPPDATA": "localappdata",
		"TMPDIR": "tmp", "TMP": "tmp", "TEMP": "tmp",
	} {
		path := filepath.Join(qaRoot, filepath.FromSlash(subdir))
		if err := os.MkdirAll(path, 0o700); err != nil {
			t.Fatal("phase=environment-isolation failed to create a private QA directory")
		}
		t.Setenv(key, path)
	}
	for _, key := range []string{"PATH", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"} {
		t.Setenv(key, "")
	}
	appRoot := filepath.Join(qaRoot, "app")
	if err := os.Mkdir(appRoot, 0o700); err != nil {
		t.Fatal("phase=environment-isolation failed to create the QA app root")
	}
	app := &App{appRoot: appRoot, config: config.DefaultConfig()}
	app.config.Browser.DefaultConnectorType = config.BrowserConnectorMihomo
	spec, err := normalizeProxyCoreSpec("mihomo")
	if err != nil {
		t.Fatal("phase=release-selection could not resolve the default Mihomo specification")
	}
	target := proxyCoreTarget{GOOS: goruntime.GOOS, GOARCH: goruntime.GOARCH}
	if spec.Repo != "MetaCubeX/mihomo" || spec.Version == "" || strings.EqualFold(spec.Version, "latest") {
		t.Fatal("phase=release-selection requires the existing fixed official Mihomo version")
	}

	// Never print raw network errors: net.OpError may contain a resolved IP,
	// while a redirected URL can contain temporary delivery credentials.
	fail := func(phase string, err error) {
		t.Helper()
		class := fmt.Sprintf("%T", err)
		var requestErr *url.Error
		if errors.As(err, &requestErr) {
			class = fmt.Sprintf("https_request/%T", requestErr.Err)
		}
		var networkErr net.Error
		if errors.As(err, &networkErr) && networkErr.Timeout() {
			class = "network_timeout"
		}
		if errors.Is(err, context.Canceled) {
			class = "canceled"
		}
		t.Fatalf("phase=%s failed error_class=%s; raw diagnostic details intentionally suppressed", phase, class)
	}
	checkCleanup := func() {
		t.Helper()
		err := filepath.WalkDir(appRoot, func(_ string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if strings.HasPrefix(entry.Name(), ".proxy-core-") || strings.HasPrefix(entry.Name(), "extract-") {
				return errors.New("temporary installation artifact remains")
			}
			return nil
		})
		if err != nil {
			t.Error("phase=cleanup failed: a temporary installation artifact remains or QA traversal failed")
		}
	}
	t.Cleanup(checkCleanup)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	client, _, err := proxyCoreReleaseHTTPClient(90*time.Second, "direct://")
	if err != nil {
		fail("https-client", err)
	}
	defer client.CloseIdleConnections()
	t.Logf("phase=resolving tag=%s", spec.Version)
	release, err := fetchGitHubRelease(ctx, client, spec.Repo, spec.Version)
	if err != nil {
		fail("fetch-release", err)
	}
	asset, err := selectProxyCoreAsset(spec, release.Assets, target.GOOS, target.GOARCH)
	if err != nil {
		fail("asset-selection", err)
	}
	if err := validateProxyCoreReleaseAsset(spec, release, asset); err != nil {
		fail("release-integrity-metadata", err)
	}
	t.Logf("tag=%s name=%s size=%d digest=%s", release.TagName, asset.Name, asset.Size, asset.Digest)

	var phases []string
	installed, err := app.installProxyCoreRelease(ctx, client, spec, target, release, func(phase string, _ int, _ string) {
		// Keep logs to phase names, not downloader messages containing local
		// paths, URLs, or future proxy diagnostics; coalesce progress repeats.
		if len(phases) == 0 || phases[len(phases)-1] != phase {
			t.Logf("phase=%s", phase)
			phases = append(phases, phase)
		}
	})
	if err != nil {
		fail("official-install", err)
	}
	wantPhases := []string{"downloading", "verifying", "extracting", "validating", "installing"}
	if !reflect.DeepEqual(phases, wantPhases) {
		t.Fatal("phase=pipeline-order expected download/integrity/extract/native-version/install without an early done event")
	}
	// The production helper must complete its native -v check successfully
	// before it reaches installing; do not invoke the binary a second time.
	t.Log("phase=native-version-validated")
	wantPath := filepath.Join(proxyCoreInstallDir(app, spec, target), proxyCoreBinaryName(spec.BinaryBase, target.GOOS))
	if installed != wantPath || app.config.Browser.ClashBinaryPath != wantPath {
		t.Fatal("phase=configuration-validation installed and in-memory paths do not agree")
	}
	if relative, err := filepath.Rel(appRoot, installed); err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
		t.Fatal("phase=installation-boundary binary escaped the temporary QA app root")
	}
	data, err := os.ReadFile(app.resolveAppPath("config.yaml"))
	if err != nil {
		fail("read-qa-configuration", err)
	}
	var persisted config.Config
	if err := yaml.Unmarshal(data, &persisted); err != nil {
		fail("parse-qa-configuration", err)
	}
	if persisted.Browser.ClashBinaryPath != wantPath || persisted.Browser.DefaultConnectorType != config.BrowserConnectorMihomo {
		t.Fatal("phase=configuration-validation persisted Mihomo path or connector differs from the verified installation")
	}
	preflight := app.BrowserProxyConnectorPreflight(ProxyConnectorPreflightRequest{
		ConnectorType: config.BrowserConnectorMihomo, GOOS: target.GOOS, GOARCH: target.GOARCH,
	})
	if !preflight.Ready || preflight.State != ProxyCoreStateReady || preflight.ConnectorType != config.BrowserConnectorMihomo ||
		!reflect.DeepEqual(preflight.RequiredCores, []string{"mihomo"}) || len(preflight.Cores) != 1 || len(preflight.MissingCores) != 0 {
		t.Fatal("phase=local-preflight expected only Mihomo with all local requirements ready")
	}
	status := preflight.Cores[0]
	if status.Core != "mihomo" || !status.Installed || !status.Configured || !status.Active || status.BinaryPath != wantPath {
		t.Fatal("phase=local-preflight did not resolve the verified, configured QA Mihomo binary")
	}
	checkCleanup()
	t.Log("phase=local-preflight-ready-only; no proxy, Chrome, desktop application, or external connectivity test was started")
}

func TestProxyCoreReleaseInstallPreservesArchiveBinaryCase(t *testing.T) {
	if goruntime.GOOS == "windows" {
		t.Skip("native ZIP installation fixture uses a locally authored POSIX script")
	}
	spec, err := normalizeProxyCoreSpec("xray")
	if err != nil {
		t.Fatal(err)
	}
	target := proxyCoreTarget{GOOS: goruntime.GOOS, GOARCH: goruntime.GOARCH}
	const entryName = "Xray"
	script := fmt.Sprintf("#!/bin/sh\nprintf 'Xray %s (fixture)\\n'\n", strings.TrimPrefix(spec.Version, "v"))
	var archive bytes.Buffer
	writer := zip.NewWriter(&archive)
	header := &zip.FileHeader{Name: entryName, Method: zip.Deflate}
	header.SetMode(0o755)
	entry, err := writer.CreateHeader(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.WriteString(entry, script); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	body := archive.Bytes()
	asset := githubReleaseAsset{
		Name: fmt.Sprintf("Xray-%s-%s.zip", target.GOOS, target.GOARCH),
		Size: int64(len(body)), Digest: fmt.Sprintf("sha256:%x", sha256.Sum256(body)),
	}
	asset.BrowserDownloadURL = fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", spec.Repo, spec.Version, asset.Name)
	release := githubRelease{TagName: spec.Version, Assets: []githubReleaseAsset{asset}}
	for _, connector := range []string{config.BrowserConnectorXray, config.BrowserConnectorMihomo} {
		t.Run(connector, func(t *testing.T) {
			app := &App{appRoot: t.TempDir(), config: config.DefaultConfig()}
			app.config.Browser.DefaultConnectorType = connector
			beforeBrowser := app.config.Browser
			client := proxyCoreTestClient(io.NopCloser(bytes.NewReader(body)), asset.Size, http.StatusOK)
			installed, err := app.installProxyCoreRelease(context.Background(), client, spec, target, release, func(string, int, string) {})
			if err != nil {
				t.Fatalf("uppercase archive installation failed: %v", err)
			}
			wantPath := filepath.Join(proxyCoreInstallDir(app, spec, target), entryName)
			if installed != wantPath || filepath.Base(installed) != entryName {
				t.Fatalf("returned path lost the archive's actual binary name: got %q, want %q", installed, wantPath)
			}
			if got, err := os.ReadFile(installed); err != nil || string(got) != script {
				t.Fatalf("returned installation path must exist with verified contents: got %q, err=%v", got, err)
			}
			wantBrowser := beforeBrowser
			wantBrowser.XrayBinaryPath = wantPath
			if !reflect.DeepEqual(app.config.Browser, wantBrowser) {
				t.Fatal("installing Xray changed a setting other than the configured Xray path")
			}
			data, err := os.ReadFile(app.resolveAppPath("config.yaml"))
			if err != nil {
				t.Fatal(err)
			}
			var persisted config.Config
			if err := yaml.Unmarshal(data, &persisted); err != nil {
				t.Fatal(err)
			}
			if persisted.Browser.XrayBinaryPath != installed || persisted.Browser.DefaultConnectorType != connector {
				t.Fatalf("persisted path or stack mismatch: path=%q connector=%q", persisted.Browser.XrayBinaryPath, persisted.Browser.DefaultConnectorType)
			}
			if _, err := os.Stat(persisted.Browser.XrayBinaryPath); err != nil {
				t.Fatalf("persisted Xray path does not exist: %v", err)
			}
		})
	}
}

func TestProxyCoreInstalledLookupKeepsTargetsIsolated(t *testing.T) {
	t.Setenv("PATH", "")
	spec, err := normalizeProxyCoreSpec("mihomo")
	if err != nil {
		t.Fatal(err)
	}
	native := proxyCoreTarget{GOOS: goruntime.GOOS, GOARCH: goruntime.GOARCH}
	otherOS, otherArch := "linux", "amd64"
	if native.GOOS == otherOS {
		otherOS = "darwin"
	}
	if native.GOARCH == otherArch {
		otherArch = "arm64"
	}
	for _, foreign := range []proxyCoreTarget{
		{GOOS: otherOS, GOARCH: native.GOARCH},
		{GOOS: native.GOOS, GOARCH: otherArch},
	} {
		label := foreign.GOOS + "-" + foreign.GOARCH
		t.Run("native_ignores_"+label, func(t *testing.T) {
			app := &App{appRoot: t.TempDir(), config: config.DefaultConfig()}
			app.config.Browser.DefaultConnectorType = config.BrowserConnectorMihomo
			app.config.Browser.ClashBinaryPath = ""
			path := filepath.Join(proxyCoreInstallDir(app, spec, foreign), proxyCoreBinaryName(spec.BinaryBase, foreign.GOOS))
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte("foreign target fixture"), 0o755); err != nil {
				t.Fatal(err)
			}
			status := app.proxyCoreStatus(spec, native)
			if status.Installed || status.State != ProxyCoreStateMissing {
				t.Fatalf("foreign managed core must not make native target ready: %+v", status)
			}
		})
		t.Run("foreign_"+label+"_ignores_native_flat_bin", func(t *testing.T) {
			app := &App{appRoot: t.TempDir(), config: config.DefaultConfig()}
			path := filepath.Join(app.appRoot, "bin", proxyCoreBinaryName(spec.BinaryBase, native.GOOS))
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte("native flat fixture"), 0o755); err != nil {
				t.Fatal(err)
			}
			if got, source, ok := findInstalledProxyCoreBinary(app.appRoot, spec, foreign); ok {
				t.Fatalf("native flat binary cannot satisfy a foreign target: path=%q source=%q", got, source)
			}
		})
		t.Run("matching_platform_"+label+"_is_found", func(t *testing.T) {
			app := &App{appRoot: t.TempDir(), config: config.DefaultConfig()}
			path := filepath.Join(proxyCoreInstallDir(app, spec, foreign), proxyCoreBinaryName(spec.BinaryBase, foreign.GOOS))
			if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte("matching target fixture"), 0o755); err != nil {
				t.Fatal(err)
			}
			if got, source, ok := findInstalledProxyCoreBinary(app.appRoot, spec, foreign); !ok || got != path || source != "downloaded" {
				t.Fatalf("target's own managed platform binary must remain discoverable: path=%q source=%q found=%t", got, source, ok)
			}
		})
	}
}

func TestProxyCoreInstalledLookupIgnoresUnrelatedUnreadableDirectories(t *testing.T) {
	if goruntime.GOOS == "windows" || os.Geteuid() == 0 {
		t.Skip("permission-denied directory regression requires POSIX permission enforcement and a non-root user")
	}
	t.Setenv("PATH", "")
	app := &App{appRoot: t.TempDir(), config: config.DefaultConfig()}
	app.config.Browser.DefaultConnectorType = config.BrowserConnectorMihomo
	app.config.Browser.ClashBinaryPath = ""
	spec, err := normalizeProxyCoreSpec("mihomo")
	if err != nil {
		t.Fatal(err)
	}
	target := proxyCoreTarget{GOOS: goruntime.GOOS, GOARCH: goruntime.GOARCH}
	binDir := filepath.Join(app.appRoot, "bin")
	unrelated := filepath.Join(binDir, "unrelated-unreadable")
	if err := os.MkdirAll(unrelated, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(binDir, proxyCoreBinaryName(spec.BinaryBase, target.GOOS))
	if err := os.WriteFile(path, []byte("valid packaged native fixture"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(unrelated, 0); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Chmod(unrelated, 0o700); err != nil {
			t.Errorf("restore permissions for temporary directory cleanup: %v", err)
		}
	})
	if _, err := os.ReadDir(unrelated); err == nil {
		t.Skip("filesystem permits reading mode-000 directories; permission-denied regression cannot be exercised")
	} else if !os.IsPermission(err) {
		t.Fatalf("unexpected restricted-directory setup error: %v", err)
	}
	status := app.proxyCoreStatus(spec, target)
	if !status.Installed || status.State != ProxyCoreStateReady || status.BinaryPath != path {
		t.Fatalf("unrelated unreadable child must not hide a valid native flat binary: %+v", status)
	}
}

func TestProxyCoreSharedClientPreservesExtensionHTTPSRedirects(t *testing.T) {
	app := &App{appRoot: t.TempDir(), config: config.DefaultConfig()}
	client, err := app.extensionDownloadHTTPClient(false, "")
	if err != nil {
		t.Fatal(err)
	}
	defer client.CloseIdleConnections()
	const initialURL = "https://clients2.google.com/service/update2/crx"
	const archiveURL = "https://clients2.googleusercontent.com/crx/blobs/fixture.crx"
	var requested []string
	client.Transport = proxyCoreTestRoundTripper(func(req *http.Request) (*http.Response, error) {
		requested = append(requested, req.URL.String())
		switch req.URL.String() {
		case initialURL:
			return &http.Response{
				StatusCode: http.StatusFound, Header: http.Header{"Location": []string{archiveURL}},
				Body: io.NopCloser(strings.NewReader("")), Request: req,
			}, nil
		case archiveURL:
			return &http.Response{
				StatusCode: http.StatusOK, Header: make(http.Header),
				Body: io.NopCloser(strings.NewReader("fixture CRX bytes")), Request: req,
			}, nil
		default:
			return nil, fmt.Errorf("unexpected fixture request %q", req.URL.String())
		}
	})
	response, err := client.Get(initialURL)
	if err != nil {
		t.Fatalf("shared client must not apply the GitHub release allowlist to extension HTTPS redirects: %v", err)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(response.Body)
	if err != nil || response.StatusCode != http.StatusOK || string(data) != "fixture CRX bytes" {
		t.Fatalf("extension redirect did not return its fixture archive: status=%d data=%q err=%v", response.StatusCode, data, err)
	}
	if !reflect.DeepEqual(requested, []string{initialURL, archiveURL}) {
		t.Fatalf("extension HTTPS redirect sequence = %q", requested)
	}
}

func TestProxyCoreReleaseClientRestrictsRedirects(t *testing.T) {
	const initialURL = "https://github.com/MetaCubeX/mihomo/releases/download/v1.19.27/fixture.gz"
	for _, tc := range []struct {
		name, destination string
		allowed           bool
	}{
		{name: "release_assets_cdn", destination: "https://release-assets.githubusercontent.com/fixture.gz?signature=fixture", allowed: true},
		{name: "objects_cdn", destination: "https://objects.githubusercontent.com/fixture.gz", allowed: true},
		{name: "offsite_rejected", destination: "https://attacker.invalid/fixture.gz"},
		{name: "http_downgrade_rejected", destination: "http://release-assets.githubusercontent.com/fixture.gz"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client, _, err := proxyCoreReleaseHTTPClient(time.Second, "direct://")
			if err != nil {
				t.Fatal(err)
			}
			defer client.CloseIdleConnections()
			var requested []string
			client.Transport = proxyCoreTestRoundTripper(func(req *http.Request) (*http.Response, error) {
				requested = append(requested, req.URL.String())
				if req.URL.String() == initialURL {
					return &http.Response{
						StatusCode: http.StatusFound, Header: http.Header{"Location": []string{tc.destination}},
						Body: io.NopCloser(strings.NewReader("")), Request: req,
					}, nil
				}
				if req.URL.String() != tc.destination {
					return nil, fmt.Errorf("unexpected fixture request %q", req.URL.String())
				}
				return &http.Response{
					StatusCode: http.StatusOK, Header: make(http.Header),
					Body: io.NopCloser(strings.NewReader("verified fixture archive")), Request: req,
				}, nil
			})
			response, err := client.Get(initialURL)
			if response != nil {
				defer response.Body.Close()
			}
			if !tc.allowed {
				if err == nil || !reflect.DeepEqual(requested, []string{initialURL}) {
					t.Fatalf("unsafe release redirect must fail before contacting its target: requests=%q err=%v", requested, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("official HTTPS CDN redirect was rejected: %v", err)
			}
			body, err := io.ReadAll(response.Body)
			if err != nil || response.StatusCode != http.StatusOK || string(body) != "verified fixture archive" || !reflect.DeepEqual(requested, []string{initialURL, tc.destination}) {
				t.Fatalf("official CDN redirect did not complete: requests=%q status=%d body=%q err=%v", requested, response.StatusCode, body, err)
			}
		})
	}
}
