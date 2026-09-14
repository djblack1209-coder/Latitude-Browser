package browser

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/ulikunitz/xz"
)

type coreTarEntry struct {
	name string
	link string
	body string
	kind byte
}

func TestCoreArchiveInternalLinksAndCompressedArchives(t *testing.T) {
	entries := []coreTarEntry{{name: "bundle/bin/chrome", body: "executable"}, {name: "bundle/current", link: "bin", kind: tar.TypeSymlink}, {name: "bundle/alias", link: "current/chrome", kind: tar.TypeSymlink}}
	source := writeCoreTar(t, entries)
	for _, format := range []string{"tar", "tar.gz", "tar.xz", "zip"} {
		t.Run(format, func(t *testing.T) {
			archive := source
			if format != "tar" {
				archive = filepath.Join(t.TempDir(), "core."+format)
				f, err := os.Create(archive)
				if err != nil {
					t.Fatal(err)
				}
				if format == "zip" {
					w := zip.NewWriter(f)
					for _, entry := range entries {
						h := &zip.FileHeader{Name: entry.name, Method: zip.Deflate}
						body := entry.body
						h.SetMode(0755)
						if entry.kind == tar.TypeSymlink {
							h.SetMode(os.ModeSymlink | 0777)
							body = entry.link
						}
						dst, err := w.CreateHeader(h)
						if err != nil {
							t.Fatal(err)
						}
						dst.Write([]byte(body))
					}
					if err = w.Close(); err != nil {
						t.Fatal(err)
					}
				} else {
					var w io.WriteCloser
					if format == "tar.gz" {
						w = gzip.NewWriter(f)
					} else {
						w, err = xz.NewWriter(f)
						if err != nil {
							t.Fatal(err)
						}
					}
					in, err := os.Open(source)
					if err != nil {
						t.Fatal(err)
					}
					_, err = io.Copy(w, in)
					in.Close()
					if err != nil {
						t.Fatal(err)
					}
					if err = w.Close(); err != nil {
						t.Fatal(err)
					}
				}
				if err = f.Close(); err != nil {
					t.Fatal(err)
				}
			}
			dest := filepath.Join(t.TempDir(), "extract")
			if err := ExtractCoreArchiveAndStripRootForImport(archive, dest, func(int, string) {}); err != nil {
				t.Fatal(err)
			}
			for _, name := range []string{"bin/chrome", "current/chrome", "alias"} {
				data, err := os.ReadFile(filepath.Join(dest, name))
				if err != nil || string(data) != "executable" {
					t.Fatalf("internal link/root strip: %s %q %v", name, data, err)
				}
			}
		})
	}
}

func TestCoreArchiveRejectsIndirectLinkWritesAndRootStripEscape(t *testing.T) {
	cases := map[string][]coreTarEntry{
		"later-link":          {{name: "bundle/link/file", body: "file"}, {name: "bundle/link", link: "real", kind: tar.TypeSymlink}, {name: "bundle/real/file", body: "real"}},
		"internal-link-write": {{name: "bundle/real/file", body: "real"}, {name: "bundle/link", link: "real", kind: tar.TypeSymlink}, {name: "bundle/link/file", body: "overwritten"}},
		"strip-escape":        {{name: "bundle/file", body: "file"}, {name: "bundle/link", link: "../outside", kind: tar.TypeSymlink}},
		"loop":                {{name: "bundle/a", link: "b", kind: tar.TypeSymlink}, {name: "bundle/b", link: "a", kind: tar.TypeSymlink}},
		"absolute-name":       {{name: "/absolute/file", body: "file"}},
	}
	for name, entries := range cases {
		t.Run(name, func(t *testing.T) {
			if err := ExtractCoreArchiveAndStripRootForImport(writeCoreTar(t, entries), filepath.Join(t.TempDir(), "extract"), func(int, string) {}); err == nil {
				t.Fatal("unsafe archive accepted")
			}
		})
	}
}

func TestCoreArchiveUnsafeDownloadDoesNotInstallOrEmitDone(t *testing.T) {
	m, target := coreInstallFixtureManager(t)
	outside := t.TempDir()
	sentinel := filepath.Join(outside, "sentinel")
	os.WriteFile(sentinel, []byte("keep"), 0600)
	archive := writeCoreTar(t, []coreTarEntry{{name: "bundle/link", link: outside, kind: tar.TypeSymlink}, {name: "bundle/link/sentinel", body: "overwritten"}})
	data, err := os.ReadFile(archive)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write(data) }))
	defer server.Close()
	failed := false
	m.downloadAndExtractCoreWithProgress(context.Background(), CoreInput{CoreId: "old", CoreName: "Replacement", CorePath: "chrome/saved"}, server.URL+"/core.tar", "direct://", true, func(phase string, _ int, _ string) {
		if phase == "done" {
			t.Error("unsafe download emitted done")
		}
		failed = failed || phase == "error"
	})
	if !failed {
		t.Fatal("unsafe download did not fail")
	}
	if got, _ := os.ReadFile(sentinel); string(got) != "keep" {
		t.Fatal("unsafe download wrote outside extraction root")
	}
	if got, _ := os.ReadFile(filepath.Join(target, "old-marker")); string(got) != "old working core" {
		t.Fatal("unsafe download replaced working core")
	}
}

func writeCoreTar(t *testing.T, entries []coreTarEntry) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "core.tar")
	f, err := os.Create(p)
	if err != nil {
		t.Fatal(err)
	}
	w := tar.NewWriter(f)
	for _, e := range entries {
		kind := e.kind
		if kind == 0 {
			kind = tar.TypeReg
		}
		size := int64(len(e.body))
		if kind != tar.TypeReg {
			size = 0
		}
		if err := w.WriteHeader(&tar.Header{Name: e.name, Typeflag: kind, Linkname: e.link, Mode: 0755, Size: size}); err != nil {
			t.Fatal(err)
		}
		if size > 0 {
			if _, err = w.Write([]byte(e.body)); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err = w.Close(); err != nil {
		t.Fatal(err)
	}
	if err = f.Close(); err != nil {
		t.Fatal(err)
	}
	return p
}
func TestCoreArchiveRejectsLinkEscapeBeforeAnyExternalWrite(t *testing.T) {
	for _, kind := range []string{"absolute", "relative", "chain"} {
		t.Run(kind, func(t *testing.T) {
			root := t.TempDir()
			stage := filepath.Join(root, "stage")
			outside := filepath.Join(root, "outside")
			if err := os.Mkdir(outside, 0700); err != nil {
				t.Fatal(err)
			}
			sentinel := filepath.Join(outside, "sentinel")
			os.WriteFile(sentinel, []byte("keep"), 0600)
			link := outside
			if kind == "relative" {
				link = "../../outside"
			}
			entries := []coreTarEntry{{name: "bundle/link", link: link, kind: tar.TypeSymlink}}
			if kind == "chain" {
				entries = []coreTarEntry{{name: "bundle/first", link: outside, kind: tar.TypeSymlink}, {name: "bundle/link", link: "first", kind: tar.TypeSymlink}}
			}
			entries = append(entries, coreTarEntry{name: "bundle/link/sentinel", body: "overwritten"})
			archive := writeCoreTar(t, entries)
			done := false
			err := ExtractCoreArchiveAndStripRootForImport(archive, stage, func(p int, _ string) { done = done || p == 100 })
			if err == nil {
				t.Error("unsafe archive accepted")
			}
			if done {
				t.Error("unsafe archive emitted completion")
			}
			if got, _ := os.ReadFile(sentinel); string(got) != "keep" {
				t.Errorf("external sentinel overwritten: %q", got)
			}
		})
	}
}

func TestCoreArchiveBzip2InternalLinkFixture(t *testing.T) {
	data, err := base64.StdEncoding.DecodeString("QlpoOTFBWSZTWfQPh/AAAIt/gMqAAQBAAPuAAACQAn5nnkAICCAAdBJKNQ9T0j0GU0BpifqgklGgAAAAD7LviZzM5kAPQJIRRZ0WEoOnUREIQwDKSTTgCgMCKVtEUgUxYq0WmYFnGIslfXv2e0xyNdU/jlpovpvuOdI3jfoKbOSLneyWYkH8XckU4UJD0D4fwA==")
	if err != nil {
		t.Fatal(err)
	}
	archive := filepath.Join(t.TempDir(), "core.tar.bz2")
	if err := os.WriteFile(archive, data, 0600); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(t.TempDir(), "extract")
	if err := ExtractCoreArchiveAndStripRootForImport(archive, dest, func(int, string) {}); err != nil {
		t.Fatal(err)
	}
	if got, err := os.ReadFile(filepath.Join(dest, "current", "chrome")); err != nil || string(got) != "executable" {
		t.Fatalf("bzip2 fixture: %q %v", got, err)
	}
}
