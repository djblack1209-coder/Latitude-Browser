package proxy

import (
	"io"
	"net/http"
	"sync"
)

// Acquire at RoundTrip, not at client construction. Idle clients own no lease;
// response bodies keep the exact bridge alive until Close (also after EOF).
type bridgeHTTPTransport struct {
	acquire func() (string, string, error)
	release func(string)
	build   func(string) (*http.Client, error)
}

func (t *bridgeHTTPTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	endpoint, token, err := t.acquire()
	if err != nil {
		return nil, err
	}
	var once sync.Once
	var client *http.Client
	release := func() {
		once.Do(func() {
			if client != nil {
				client.CloseIdleConnections()
			}
			t.release(token)
		})
	}
	client, err = t.build(endpoint)
	if err != nil {
		release()
		return nil, err
	}
	resp, err := client.Transport.RoundTrip(req)
	if err != nil {
		if resp != nil && resp.Body != nil {
			resp.Body.Close()
		}
		release()
		return nil, err
	}
	if resp.Body == nil {
		release()
		return resp, nil
	}
	resp.Body = &bridgeLeaseBody{ReadCloser: resp.Body, release: release}
	return resp, nil
}
func (t *bridgeHTTPTransport) CloseIdleConnections() {} // Per-request transports close with their body.
type bridgeLeaseBody struct {
	io.ReadCloser
	release func()
	once    sync.Once
	err     error
}

func (b *bridgeLeaseBody) Close() error {
	b.once.Do(func() { b.err = b.ReadCloser.Close(); b.release() })
	return b.err
}
