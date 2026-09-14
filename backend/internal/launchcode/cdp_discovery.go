package launchcode

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
)

func isCDPDiscoveryPath(path string) bool {
	switch path {
	case "/json", "/json/", "/json/list", "/json/version", "/json/new":
		return true
	}
	return false
}

// Discovery must advertise the authenticated entry point, otherwise clients
// immediately leave it for Chrome's unprotected internal debugging listener.
func rewriteCDPDiscovery(resp *http.Response, entryHost, targetHost string) error {
	if resp.StatusCode != http.StatusOK {
		return nil
	}
	const limit = 4 << 20
	data, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	closeErr := resp.Body.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if len(data) > limit {
		return fmt.Errorf("CDP discovery response too large")
	}
	var payload any
	if err := json.Unmarshal(data, &payload); err != nil {
		return fmt.Errorf("invalid CDP discovery response: %w", err)
	}
	var rewrite func(any)
	rewrite = func(value any) {
		switch item := value.(type) {
		case []any:
			for _, child := range item {
				rewrite(child)
			}
		case map[string]any:
			for key, child := range item {
				text, ok := child.(string)
				if ok && key == "webSocketDebuggerUrl" {
					u, err := url.Parse(text)
					if err == nil && u.Host == targetHost {
						u.Host = entryHost
						item[key] = u.String()
					}
				} else if ok && key == "devtoolsFrontendUrl" {
					u, err := url.Parse(text)
					if err == nil {
						q := u.Query()
						ws, err := url.Parse("ws://" + q.Get("ws"))
						if err == nil && ws.Host == targetHost {
							ws.Host = entryHost
							q.Set("ws", ws.Host+ws.RequestURI())
							u.RawQuery = q.Encode()
							item[key] = u.String()
						}
					}
				} else {
					rewrite(child)
				}
			}
		}
	}
	rewrite(payload)
	data, err = json.Marshal(payload)
	if err != nil {
		return err
	}
	resp.Body = io.NopCloser(bytes.NewReader(data))
	resp.ContentLength = int64(len(data))
	resp.Header.Set("Content-Length", strconv.Itoa(len(data)))
	return nil
}
