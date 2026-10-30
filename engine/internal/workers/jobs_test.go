package workers

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"civicsense/engine/internal/supa"
)

type fakeREST struct {
	mu   sync.Mutex
	reqs []string // "METHOD path?query"
	body map[string][]byte
}

func (f *fakeREST) handler(w http.ResponseWriter, r *http.Request) {
	b, _ := io.ReadAll(r.Body)
	f.mu.Lock()
	key := r.Method + " " + r.URL.Path
	f.reqs = append(f.reqs, key+"?"+r.URL.RawQuery)
	f.body[key] = b
	f.mu.Unlock()
	if r.Header.Get("apikey") != "service-key" || r.Header.Get("Authorization") != "Bearer service-key" {
		w.WriteHeader(401)
		return
	}
	switch key {
	case "GET /rest/v1/complaints":
		_, _ = io.WriteString(w, `[{"id":"c1","code":"CS-AAAAAA","department_id":"d1"},{"id":"c2","code":"CS-BBBBBB","department_id":null}]`)
	case "GET /rest/v1/profiles":
		_, _ = io.WriteString(w, `[{"id":"u1"},{"id":"u2"}]`)
	case "POST /rest/v1/notifications", "PATCH /rest/v1/complaints":
		w.WriteHeader(204)
	default:
		w.WriteHeader(404)
	}
}

func TestSLAAlerts(t *testing.T) {
	f := &fakeREST{body: map[string][]byte{}}
	srv := httptest.NewServer(http.HandlerFunc(f.handler))
	defer srv.Close()
	d := &Deps{DB: supa.New(srv.URL, "service-key", nil), Now: func() time.Time { return time.Date(2026, 11, 4, 9, 0, 0, 0, time.UTC) }}
	n, err := d.SLAAlerts(context.Background())
	if err != nil || n != 2 {
		t.Fatalf("n=%d err=%v reqs=%v", n, err, f.reqs)
	}
	var notes []map[string]string
	if err := json.Unmarshal(f.body["POST /rest/v1/notifications"], &notes); err != nil {
		t.Fatal(err)
	}
	if len(notes) != 2 || notes[0]["user_id"] != "u1" || notes[0]["title_en"] != "CS-AAAAAA is overdue" {
		t.Fatalf("notes %+v", notes)
	}
	if strings.Contains(notes[0]["title_as"], "র") || !strings.Contains(notes[0]["title_as"], "ৰ") {
		t.Fatalf("title_as must use ৰ not র: %q", notes[0]["title_as"])
	}
	var patch string
	for _, r := range f.reqs {
		if strings.HasPrefix(r, "PATCH") {
			patch = r
		}
		if strings.HasPrefix(r, "GET /rest/v1/complaints") && !strings.Contains(r, "sla_alerted_at=is.null") {
			t.Fatalf("query must filter sla_alerted_at: %s", r)
		}
	}
	if !strings.Contains(patch, "id=in.%28c1%2Cc2%29") {
		t.Fatalf("patch %q", patch)
	}
}

func TestRunnerRecoversPanics(t *testing.T) {
	r := NewRunner(slog.New(slog.NewTextHandler(io.Discard, nil)), 0,
		Job{Name: "boom", Every: time.Hour, Run: func(context.Context) (int, error) { panic("kaboom") }})
	res := r.RunOnce(context.Background(), r.jobs[0])
	if !strings.Contains(res.Error, "kaboom") {
		t.Fatalf("res %+v", res)
	}
	if got := r.Results()["boom"]; got == nil || got.Runs != 1 {
		t.Fatalf("results %+v", got)
	}
}
