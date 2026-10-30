package supa

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"
)

// dropFirst closes the TCP connection without a response on the first n requests.
func dropFirst(n int32, calls *atomic.Int32) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) <= n {
			conn, _, err := w.(http.Hijacker).Hijack()
			if err == nil {
				conn.Close()
			}
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[{"id":"x"}]`))
	}
}

func TestSelectRetriesDroppedConnection(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(dropFirst(1, &calls))
	defer srv.Close()

	var out []map[string]string
	if err := New(srv.URL, "k", nil).Select(context.Background(), "complaints", url.Values{}, &out); err != nil {
		t.Fatalf("select should survive one dropped connection: %v", err)
	}
	if calls.Load() != 2 || len(out) != 1 {
		t.Fatalf("calls=%d rows=%d, want 2 calls and 1 row", calls.Load(), len(out))
	}
}

func TestInsertIsNotRetried(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(dropFirst(1, &calls))
	defer srv.Close()

	err := New(srv.URL, "k", nil).Insert(context.Background(), "notifications", []map[string]string{{"a": "b"}}, nil)
	if err == nil {
		t.Fatal("insert on a dropped connection should fail, not retry")
	}
	if calls.Load() != 1 {
		t.Fatalf("calls=%d, want 1 (no retry for inserts)", calls.Load())
	}
}
