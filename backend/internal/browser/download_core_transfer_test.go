package browser

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
)

func TestConcurrentDownloadValidatesChunks(t *testing.T) {
	for _, mode := range []string{"valid", "tiny", "status", "ignored-range", "wrong-range", "short", "oversized", "retry", "changed-version", "invalid-probe"} {
		t.Run(mode, func(t *testing.T) {
			data := bytes.Repeat([]byte("abcdefgh"), 100)
			if mode == "tiny" {
				data = []byte("abc")
			}
			var mu sync.Mutex
			attempts := map[string]int{}
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var start, end int
				if _, err := fmt.Sscanf(r.Header.Get("Range"), "bytes=%d-%d", &start, &end); err != nil {
					t.Error(err)
					w.WriteHeader(400)
					return
				}
				if start < 0 || end < start || end >= len(data) {
					t.Errorf("invalid range requested: %d-%d", start, end)
					w.WriteHeader(416)
					return
				}
				probe := start == 0 && end == 0
				w.Header().Set("ETag", `"version-one"`)
				if !probe && mode == "changed-version" {
					w.Header().Set("ETag", `"version-two"`)
				}
				if !probe && r.Header.Get("If-Range") != `"version-one"` {
					t.Errorf("missing version guard")
				}

				mu.Lock()
				attempts[r.Header.Get("Range")]++
				attempt := attempts[r.Header.Get("Range")]
				mu.Unlock()
				if !probe && (mode == "status" || (mode == "retry" && attempt == 1)) {
					w.WriteHeader(500)
					return
				}
				if !probe && mode == "ignored-range" {
					_, _ = w.Write(data)
					return
				}
				cr := fmt.Sprintf("bytes %d-%d/%d", start, end, len(data))
				if (!probe && mode == "wrong-range") || (probe && mode == "invalid-probe") {
					cr = "bytes 0-1/800"
				}
				w.Header().Set("Content-Range", cr)
				w.WriteHeader(206)
				part := data[start : end+1]
				if !probe && mode == "short" {
					part = part[:len(part)-1]
				}
				_, _ = w.Write(part)
				if !probe && mode == "oversized" {
					_, _ = w.Write([]byte("extra"))
				}
			}))
			defer srv.Close()
			file, err := os.CreateTemp(t.TempDir(), "download-")
			if err != nil {
				t.Fatal(err)
			}
			defer file.Close()
			events, lastPercent := 0, -1
			err = doConcurrentDownload(context.Background(), srv.Client(), srv.URL, file, func(_ string, percent int, _ string) {
				events++
				if percent < lastPercent {
					t.Errorf("progress regressed")
				}
				lastPercent = percent
				if percent > 100 {
					t.Errorf("progress exceeded 100: %d", percent)
				}
			})
			if mode == "valid" || mode == "tiny" || mode == "retry" {
				if err != nil {
					t.Fatal(err)
				}
				if events < 2 || lastPercent != 100 {
					t.Fatalf("progress never completed: %d/%d", events, lastPercent)
				}
				if mode == "retry" {
					mu.Lock()
					for key, n := range attempts {
						if key != "bytes=0-0" && n < 2 {
							t.Errorf("retry not exercised")
						}
					}
					mu.Unlock()
				}
				got, err := os.ReadFile(file.Name())
				if err != nil || !bytes.Equal(got, data) {
					t.Fatalf("download bytes mismatch: %v", err)
				}
			} else if err == nil {
				t.Fatal("invalid chunk response returned success")
			}
		})
	}
}

func TestConcurrentDownloadCancellationAndWriteFailure(t *testing.T) {
	data := bytes.Repeat([]byte("x"), 80)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var lo, hi int
		fmt.Sscanf(r.Header.Get("Range"), "bytes=%d-%d", &lo, &hi)
		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", lo, hi, len(data)))
		w.WriteHeader(206)
		w.Write(data[lo : hi+1])
	}))
	defer srv.Close()
	file, err := os.CreateTemp(t.TempDir(), "part-")
	if err != nil {
		t.Fatal(err)
	}
	file.Close()
	if err := downloadCoreChunk(context.Background(), srv.Client(), srv.URL, file, 0, 9, 80, ""); err == nil {
		t.Fatal("WriteAt failure ignored")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := doConcurrentDownload(ctx, srv.Client(), srv.URL, file, nil); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation lost: %v", err)
	}
}

func TestSingleStreamDoesNotAcceptTruncation(t *testing.T) {
	for _, truncate := range []bool{false, true} {
		t.Run(fmt.Sprint(truncate), func(t *testing.T) {
			data := bytes.Repeat([]byte("stream"), 30)
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Length", fmt.Sprint(len(data)))
				if truncate {
					w.Write(data[:len(data)-1])
				} else {
					w.Write(data)
				}
			}))
			defer srv.Close()
			file, err := os.CreateTemp(t.TempDir(), "single-")
			if err != nil {
				t.Fatal(err)
			}
			defer file.Close()
			complete := false
			err = doConcurrentDownload(context.Background(), srv.Client(), srv.URL, file, func(_ string, p int, _ string) {
				if p == 100 {
					complete = true
				}
			})
			if truncate {
				if err == nil || complete {
					t.Fatal("truncated stream reported completion")
				}
			} else {
				if err != nil || !complete {
					t.Fatalf("valid stream failed: %v", err)
				}
				got, _ := os.ReadFile(file.Name())
				if !bytes.Equal(got, data) {
					t.Fatal("single stream bytes mismatch")
				}
			}
		})
	}
}

func TestConcurrentDownloadWithoutStrongValidatorUsesSingleStream(t *testing.T) {
	for _, tag := range []string{"", `W/"weak"`} {
		t.Run(tag, func(t *testing.T) {
			fullRequests := 0
			data := bytes.Repeat([]byte("data"), 30)
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Range") == "bytes=0-0" {
					w.Header().Set("Content-Range", fmt.Sprintf("bytes 0-0/%d", len(data)))
					w.Header().Set("ETag", tag)
					w.WriteHeader(206)
					w.Write(data[:1])
					return
				}
				if r.Header.Get("Range") != "" {
					t.Error("unsafe parallel request without strong validator")
					w.WriteHeader(500)
					return
				}
				fullRequests++
				w.Write(data)
			}))
			defer srv.Close()
			file, err := os.CreateTemp(t.TempDir(), "fallback-")
			if err != nil {
				t.Fatal(err)
			}
			defer file.Close()
			if err = doConcurrentDownload(context.Background(), srv.Client(), srv.URL, file, nil); err != nil {
				t.Fatal(err)
			}
			got, _ := os.ReadFile(file.Name())
			if !bytes.Equal(got, data) || fullRequests != 1 {
				t.Fatalf("invalid single stream fallback: %d", fullRequests)
			}
		})
	}
}
