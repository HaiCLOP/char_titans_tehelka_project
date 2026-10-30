package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"civicsense/engine/internal/ai"
	"civicsense/engine/internal/supa"
)

const secret = "0123456789abcdef-test"

func newServer() *httptest.Server {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	r := ai.NewRouter(ai.Options{GeminiBase: "http://127.0.0.1:1", OpenRouterBase: "http://127.0.0.1:1", Log: log})
	s := &Server{Secret: secret, DB: supa.New("", "", nil), Router: r, Analyzer: ai.NewAnalyzer(r), Log: log, Started: time.Now()}
	return httptest.NewServer(s.Handler())
}

func call(t *testing.T, srv *httptest.Server, method, path, token, body string) (int, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

func TestAuthAndErrors(t *testing.T) {
	srv := newServer()
	defer srv.Close()
	if st, out := call(t, srv, "GET", "/health", "", ""); st != 200 || out["ok"] != true || out["db_connected"] != false {
		t.Fatalf("health %d %v", st, out)
	}
	for _, tok := range []string{"", "wrong-token-wrong-token"} {
		st, out := call(t, srv, "POST", "/v1/intake", tok, `{"text":"x"}`)
		if st != 401 || out["error"].(map[string]any)["code"] != "UNAUTHENTICATED" {
			t.Fatalf("token %q: %d %v", tok, st, out)
		}
	}
	if st, _ := call(t, srv, "GET", "/metrics", "", ""); st != 401 {
		t.Fatalf("metrics without token: %d", st)
	}
	if st, out := call(t, srv, "POST", "/v1/intake", secret, `{"text":""}`); st != 400 || out["error"].(map[string]any)["code"] != "VALIDATION_ERROR" {
		t.Fatalf("empty intake %d %v", st, out)
	}
	if st, _ := call(t, srv, "POST", "/v1/intake", secret, `{"text":"x","images":["http://evil"]}`); st != 400 {
		t.Fatalf("bad image %d", st)
	}
	big := `{"text":"` + strings.Repeat("a", 13<<20) + `"}`
	if st, out := call(t, srv, "POST", "/v1/intake", secret, big); st != 400 || !strings.Contains(out["error"].(map[string]any)["message"].(string), "12 MB") {
		t.Fatalf("big body %d %v", st, out)
	}
	if st, out := call(t, srv, "POST", "/v1/embed", secret, `{"text":"hello"}`); st != 503 || out["error"].(map[string]any)["code"] != "AI_UNAVAILABLE" {
		t.Fatalf("embed without keys %d %v", st, out)
	}
}

func TestIntakeFallbackShape(t *testing.T) {
	srv := newServer()
	defer srv.Close()
	st, out := call(t, srv, "POST", "/v1/intake", secret, `{"text":"Someone is threatening me near the gate","images":[],"locationName":"Main Gate"}`)
	if st != 200 || out["source"] != "fallback" {
		t.Fatalf("%d %v", st, out)
	}
	if _, ok := out["attempts"].([]any); !ok {
		t.Fatalf("attempts must be an array: %v", out["attempts"])
	}
	if _, ok := out["ms"].(float64); !ok {
		t.Fatal("ms missing")
	}
	in := out["intake"].(map[string]any)
	for _, k := range []string{"title_en", "title_as", "summary_en", "summary_as", "category", "priority", "priority_reason_en",
		"location_hint", "is_abusive", "has_personal_data", "confidence", "is_urgent", "is_sensitive_suggested"} {
		if _, ok := in[k]; !ok {
			t.Errorf("intake.%s missing", k)
		}
	}
	if in["is_urgent"] != true || in["priority"].(float64) != 1 {
		t.Fatalf("intake %v", in)
	}
	st, out = call(t, srv, "GET", "/metrics", secret, "")
	if st != 200 || out["keys"] == nil || out["workers"] == nil {
		t.Fatalf("metrics %d %v", st, out)
	}
}
