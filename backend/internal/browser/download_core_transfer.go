package browser

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var coreContentRange = regexp.MustCompile(`^bytes ([0-9]+)-([0-9]+)/([0-9]+)$`)

const maxCoreDownloadSize int64 = 10 << 30

func parseCoreRange(value string) (start, end, total int64, err error) {
	m := coreContentRange.FindStringSubmatch(value)
	if m == nil {
		return 0, 0, 0, fmt.Errorf("invalid Content-Range: %q", value)
	}
	values := []*int64{&start, &end, &total}
	for i, out := range values {
		*out, err = strconv.ParseInt(m[i+1], 10, 64)
		if err != nil {
			return
		}
	}
	if start > end || end >= total || total > maxCoreDownloadSize {
		err = fmt.Errorf("invalid range bounds")
	}
	return
}

// Progress counts only verified chunks; retries overwrite their original offsets.
func doConcurrentDownload(ctx context.Context, client *http.Client, targetUrl string, tempFile *os.File, sendEvent func(string, int, string)) error {
	if sendEvent == nil {
		sendEvent = func(string, int, string) {}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetUrl, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Range", "bytes=0-0")
	req.Header.Set("Accept-Encoding", "identity")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	if resp.StatusCode == http.StatusOK {
		resp.Body.Close()
		sendEvent("downloading", 0, "服务器不支持分片，使用单流下载...")
		return doSingleThreadDownload(ctx, client, targetUrl, tempFile, 0, sendEvent)
	}
	start, end, total, rangeErr := parseCoreRange(resp.Header.Get("Content-Range"))
	probe, readErr := io.ReadAll(io.LimitReader(resp.Body, 2))
	closeErr := resp.Body.Close()
	if resp.StatusCode != http.StatusPartialContent || rangeErr != nil || start != 0 || end != 0 || len(probe) != 1 || readErr != nil || closeErr != nil {
		return fmt.Errorf("invalid range probe (HTTP %d): %v", resp.StatusCode, rangeErr)
	}
	validator := resp.Header.Get("ETag")
	// Without a strong resource identity, parallel requests can splice different
	// revisions of the same size. One response stream is the safe fallback.
	if len(validator) < 2 || !strings.HasPrefix(validator, `"`) || !strings.HasSuffix(validator, `"`) {
		sendEvent("downloading", 0, "服务器未提供强版本标识，使用单流下载...")
		return doSingleThreadDownload(ctx, client, targetUrl, tempFile, 0, sendEvent)
	}
	if err := tempFile.Truncate(total); err != nil {
		return err
	}
	workers := int64(8)
	if total < workers {
		workers = total
	}
	child, cancel := context.WithCancel(ctx)
	defer cancel()
	var wg sync.WaitGroup
	var mu sync.Mutex
	var firstErr error
	var completed int64
	sendEvent("downloading", 0, fmt.Sprintf("正在验证并下载 %d 字节", total))
	for i := int64(0); i < workers; i++ {
		lo, hi := total*i/workers, total*(i+1)/workers-1
		wg.Add(1)
		go func() {
			defer wg.Done()
			var chunkErr error
			for attempt := 0; attempt < 3; attempt++ {
				if child.Err() != nil {
					chunkErr = child.Err()
					break
				}
				chunkErr = downloadCoreChunk(child, client, targetUrl, tempFile, lo, hi, total, validator)
				if chunkErr == nil {
					break
				}
				if attempt < 2 {
					select {
					case <-child.Done():
					case <-time.After(time.Duration(attempt+1) * 100 * time.Millisecond):
					}
				}
			}
			mu.Lock()
			defer mu.Unlock()
			if chunkErr != nil {
				if firstErr == nil {
					firstErr = chunkErr
					cancel()
				}
				return
			}
			completed += hi - lo + 1
			// Completion is emitted only after all chunks and the final file sync pass.
			percent := int(completed * 100 / total)
			if percent > 99 {
				percent = 99
			}
			sendEvent("downloading", percent, fmt.Sprintf("已验证 %d / %d 字节", completed, total))
		}()
	}
	wg.Wait()
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if firstErr != nil {
		return firstErr
	}
	if completed != total {
		return fmt.Errorf("incomplete download: %d/%d", completed, total)
	}
	if err := tempFile.Sync(); err != nil {
		return err
	}
	sendEvent("downloading", 100, "下载内容校验完成")
	return nil
}

type coreOffsetWriter struct {
	file   *os.File
	offset int64
}

func (w *coreOffsetWriter) Write(p []byte) (int, error) {
	n, err := w.file.WriteAt(p, w.offset)
	w.offset += int64(n)
	if err == nil && n != len(p) {
		err = io.ErrShortWrite
	}
	return n, err
}

func downloadCoreChunk(ctx context.Context, client *http.Client, url string, file *os.File, start, end, total int64, validator string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", start, end))
	req.Header.Set("Accept-Encoding", "identity")
	if validator != "" {
		req.Header.Set("If-Range", validator)
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	lo, hi, size, err := parseCoreRange(resp.Header.Get("Content-Range"))
	if resp.StatusCode != http.StatusPartialContent || err != nil || lo != start || hi != end || size != total {
		return fmt.Errorf("invalid chunk %d-%d response (HTTP %d)", start, end, resp.StatusCode)
	}
	if resp.Header.Get("Content-Encoding") != "" && resp.Header.Get("Content-Encoding") != "identity" {
		return fmt.Errorf("encoded range response")
	}
	currentValidator := resp.Header.Get("ETag")
	if currentValidator == "" {
		currentValidator = resp.Header.Get("Last-Modified")
	}
	if validator != "" && currentValidator != validator {
		return fmt.Errorf("download resource changed")
	}
	expected := end - start + 1
	if resp.ContentLength >= 0 && resp.ContentLength != expected {
		return fmt.Errorf("chunk Content-Length mismatch")
	}
	if _, err := io.CopyN(&coreOffsetWriter{file, start}, resp.Body, expected); err != nil {
		return fmt.Errorf("chunk write/read: %w", err)
	}
	var extra [1]byte
	n, err := io.ReadFull(resp.Body, extra[:])
	if n != 0 || err != io.EOF {
		return fmt.Errorf("chunk has excess or unreadable bytes: %v", err)
	}
	return resp.Body.Close()
}

func doSingleThreadDownload(ctx context.Context, client *http.Client, targetUrl string, tempFile *os.File, _ int64, sendEvent func(string, int, string)) error {
	if sendEvent == nil {
		sendEvent = func(string, int, string) {}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetUrl, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept-Encoding", "identity")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP状态码异常: %d", resp.StatusCode)
	}
	if resp.ContentLength > maxCoreDownloadSize {
		return fmt.Errorf("download exceeds size limit")
	}
	if err := tempFile.Truncate(0); err != nil {
		return err
	}
	if _, err := tempFile.Seek(0, io.SeekStart); err != nil {
		return err
	}
	var downloaded int64
	var lastProgress time.Time
	writer := &coreDownloadWriter{ctx: ctx, writeFunc: func(p []byte) (int, error) {
		n, err := tempFile.Write(p)
		downloaded += int64(n)
		if time.Since(lastProgress) >= time.Second {
			percent := 0
			if resp.ContentLength > 0 {
				percent = int(downloaded * 100 / resp.ContentLength)
				if percent > 99 {
					percent = 99
				}
			}
			sendEvent("downloading", percent, fmt.Sprintf("已接收 %d 字节", downloaded))
			lastProgress = time.Now()
		}
		return n, err
	}}
	n, err := io.Copy(writer, io.LimitReader(resp.Body, maxCoreDownloadSize+1))
	if err != nil {
		return err
	}
	if n > maxCoreDownloadSize || (resp.ContentLength >= 0 && n != resp.ContentLength) {
		return fmt.Errorf("download length mismatch")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := resp.Body.Close(); err != nil {
		return err
	}
	if err := tempFile.Sync(); err != nil {
		return err
	}
	sendEvent("downloading", 100, "下载内容校验完成")
	return nil
}
