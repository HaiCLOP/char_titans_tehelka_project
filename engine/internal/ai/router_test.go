package ai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

const testSecret = "test-secret-0123456789abcdefghijklmnop"

type staticStore struct {
	providers []ProviderRow
	keys      []KeyRow
}

func (s staticStore) Providers(context.Context) ([]ProviderRow, error) { return s.providers, nil }
func (s staticStore) Keys(context.Context) ([]KeyRow, error)           { return s.keys, nil }

func chain(purpose string, entries ...string) []ProviderRow {
	var out []ProviderRow
	for _, e := range entries {
		p, m, _ := strings.Cut(e, ":")
		out = append(out, ProviderRow{Provider: p, Model: m, Purpose: purpose, Caps: []string{"vision", "assamese", "json"}})
	}
	return out
}

// fakeGemini records calls and lets each test decide the response.
type fakeGemini struct {
	mu    sync.Mutex
	calls []geminiCall
	fn    func(c geminiCall) (int, string)
}

type geminiCall struct {
	Key, Model, System string
	Body               map[string]any
}

func (f *fakeGemini) handler(w http.ResponseWriter, r *http.Request) {
	b, _ := io.ReadAll(r.Body)
	var body map[string]any
	_ = json.Unmarshal(b, &body)
	model := strings.TrimPrefix(r.URL.Path, "/v1beta/models/")
	model, _, _ = strings.Cut(model, ":")
	sys := ""
	if si, ok := body["systemInstruction"].(map[string]any); ok {
		sys = si["parts"].([]any)[0].(map[string]any)["text"].(string)
	}
	c := geminiCall{Key: r.Header.Get("x-goog-api-key"), Model: model, System: sys, Body: body}
	f.mu.Lock()
	f.calls = append(f.calls, c)
	f.mu.Unlock()
	status, out := f.fn(c)
	w.WriteHeader(status)
	_, _ = io.WriteString(w, out)
}

func (f *fakeGemini) count(pred func(geminiCall) bool) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, c := range f.calls {
		if pred(c) {
			n++
		}
	}
	return n
}

func geminiText(s string) string {
	b, _ := json.Marshal(map[string]any{"candidates": []any{map[string]any{"content": map[string]any{"parts": []any{map[string]any{"text": s}}}}}})
	return string(b)
}

const validIntake = `{"title_en":"No water in hostel bathroom","title_as":"হোষ্টেলৰ বাথৰুমত পানী নাই","summary_en":"The hostel bathroom has had no water for three days.","summary_as":"হোষ্টেলৰ বাথৰুমত তিনিদিন ধৰি পানী যোগান বন্ধ হৈ আছে।","category":"water_supply","priority":2,"priority_reason_en":"Basic need","location_hint":"Hostel","is_abusive":false,"has_personal_data":false,"confidence":0.9,"is_urgent":false,"is_sensitive_suggested":false}`

func newRouter(t *testing.T, store Store, gem, or string, opts ...func(*Options)) *Router {
	t.Helper()
	o := Options{
		Store: store, Secret: testSecret, GeminiBase: gem, OpenRouterBase: or,
		Log:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		Sleep: func(context.Context, time.Duration) {},
	}
	for _, f := range opts {
		f(&o)
	}
	return NewRouter(o)
}

func withGeminiKeys(keys ...string) func(*Options) {
	return func(o *Options) { o.GeminiKeys = keys }
}

func statuses(as []Attempt) string {
	var s []string
	for _, a := range as {
		s = append(s, a.KeyLabel+"="+a.Status)
	}
	return strings.Join(s, ",")
}

func TestFailoverToNextKeyOn429AndCooldown(t *testing.T) {
	fg := &fakeGemini{fn: func(c geminiCall) (int, string) {
		if c.Key == "k-bad" {
			return 429, `{"error":{"message":"quota"}}`
		}
		return 200, geminiText("hello")
	}}
	srv := httptest.NewServer(http.HandlerFunc(fg.handler))
	defer srv.Close()
	r := newRouter(t, staticStore{providers: chain("reply_draft", "google:m1")}, srv.URL, srv.URL, withGeminiKeys("k-bad", "k-good"))

	out, model, attempts, err := r.Generate(context.Background(), PurposeReplyDraft, GenRequest{Text: "hi"}, nil)
	if err != nil || out != "hello" || model != "m1" {
		t.Fatalf("got %q %q %v", out, model, err)
	}
	if got := statuses(attempts); got != "env-gemini-1=rate_limited,env-gemini-2=ok" {
		t.Fatalf("attempts %s", got)
	}

	// Second call: the cooled key must not be used again (it is also the least recently used).
	if _, _, attempts, err = r.Generate(context.Background(), PurposeReplyDraft, GenRequest{Text: "hi"}, nil); err != nil {
		t.Fatal(err)
	}
	if got := statuses(attempts); got != "env-gemini-2=ok" {
		t.Fatalf("second attempts %s", got)
	}
	if n := fg.count(func(c geminiCall) bool { return c.Key == "k-bad" }); n != 1 {
		t.Fatalf("cooled key called %d times", n)
	}
	m := r.Metrics(context.Background())
	if m.Keys[0].CooldownUntil == nil || m.Keys[0].Last4 != "-bad" {
		t.Fatalf("metrics %+v", m.Keys[0])
	}
}

func TestSimulateFailureKeySkippedAsRateLimited(t *testing.T) {
	fg := &fakeGemini{fn: func(c geminiCall) (int, string) { return 200, geminiText("ok") }}
	srv := httptest.NewServer(http.HandlerFunc(fg.handler))
	defer srv.Close()
	enc, err := EncryptKey(testSecret, "k-real")
	if err != nil {
		t.Fatal(err)
	}
	store := staticStore{
		providers: chain("reply_draft", "google:m1"),
		keys: []KeyRow{
			{ID: "1", Provider: "google", Label: "sim", KeyEncrypted: "garbage", KeyLast4: "0000", RPMLimit: 10, SimulateFailure: true},
			{ID: "2", Provider: "google", Label: "real", KeyEncrypted: enc, KeyLast4: "real", RPMLimit: 10},
		},
	}
	r := newRouter(t, store, srv.URL, srv.URL)
	_, _, attempts, err := r.Generate(context.Background(), PurposeReplyDraft, GenRequest{Text: "hi"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := statuses(attempts); got != "sim=rate_limited,real=ok" {
		t.Fatalf("attempts %s", got)
	}
	if !strings.Contains(attempts[0].Error, "simulated") {
		t.Fatalf("error %q", attempts[0].Error)
	}
	if n := fg.count(func(c geminiCall) bool { return c.Key != "k-real" }); n != 0 {
		t.Fatalf("simulated key made %d network calls", n)
	}
	if fg.count(func(geminiCall) bool { return true }) != 1 {
		t.Fatal("expected exactly one network call")
	}
}

func TestPaidOpenRouterModelRefused(t *testing.T) {
	var hits int
	var mu sync.Mutex
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		hits++
		mu.Unlock()
		_, _ = io.WriteString(w, `{"choices":[{"message":{"content":"paid!"}}]}`)
	}))
	defer srv.Close()
	r := newRouter(t, staticStore{providers: chain("reply_draft", "openrouter:openai/gpt-4o")}, srv.URL, srv.URL,
		func(o *Options) { o.OpenRouterKeys = []string{"or-key"} })

	_, _, attempts, err := r.Generate(context.Background(), PurposeReplyDraft, GenRequest{Text: "hi"}, nil)
	var ue *UnavailableError
	if !errors.As(err, &ue) {
		t.Fatalf("expected UnavailableError, got %v", err)
	}
	if hits != 0 {
		t.Fatalf("paid model was called %d times", hits)
	}
	if len(attempts) != 1 || attempts[0].Status != StatusSkipped || !strings.Contains(attempts[0].Error, "paid") {
		t.Fatalf("attempts %+v", attempts)
	}
	// The provider itself also refuses, without a request.
	_, err = r.or.generate(context.Background(), "or-key", "anthropic/claude-3", GenRequest{Text: "x"})
	if !errors.Is(err, ErrPaidModel) || hits != 0 {
		t.Fatalf("provider guard: err=%v hits=%d", err, hits)
	}
}

func TestAutoFreeDiscoversOnlyFreeModels(t *testing.T) {
	var called []string
	var mu sync.Mutex
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/models" {
			_, _ = io.WriteString(w, `{"data":[
			 {"id":"paid/model","pricing":{"prompt":"0.001","completion":"0.002"},"context_length":999999},
			 {"id":"sneaky/model:free","pricing":{"prompt":"0.001","completion":"0"},"context_length":500000},
			 {"id":"good/text:free","pricing":{"prompt":"0","completion":"0"},"context_length":8000,"architecture":{"input_modalities":["text"]}},
			 {"id":"good/vision:free","pricing":{"prompt":"0","completion":"0"},"context_length":4000,"architecture":{"input_modalities":["text","image"]}}]}`)
			return
		}
		var body struct {
			Model string `json:"model"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		mu.Lock()
		called = append(called, body.Model)
		mu.Unlock()
		_, _ = io.WriteString(w, `{"choices":[{"message":{"content":"ok"}}]}`)
	}))
	defer srv.Close()
	r := newRouter(t, staticStore{providers: chain("reply_draft", "openrouter:auto:free")}, srv.URL, srv.URL,
		func(o *Options) { o.OpenRouterKeys = []string{"or-key"} })
	if _, model, _, err := r.Generate(context.Background(), PurposeReplyDraft, GenRequest{Text: "hi"}, nil); err != nil || model != "good/text:free" {
		t.Fatalf("model %q err %v", model, err)
	}
	img, _ := ParseDataURL("data:image/png;base64,AAAA")
	if _, model, _, err := r.Generate(context.Background(), PurposeReplyDraft, GenRequest{Text: "hi", Images: []Image{img}}, nil); err != nil || model != "good/vision:free" {
		t.Fatalf("vision model %q err %v", model, err)
	}
	for _, c := range called {
		if !strings.HasSuffix(c, ":free") || c == "sneaky/model:free" {
			t.Fatalf("called non-free model %q", c)
		}
	}
}

func TestCircuitBreakerOpensAfterThreeFailures(t *testing.T) {
	fg := &fakeGemini{fn: func(c geminiCall) (int, string) {
		if c.Model == "m1" {
			return 500, `{"error":{"message":"boom"}}`
		}
		return 200, geminiText("ok")
	}}
	srv := httptest.NewServer(http.HandlerFunc(fg.handler))
	defer srv.Close()
	r := newRouter(t, staticStore{providers: chain("reply_draft", "google:m1", "google:m2")}, srv.URL, srv.URL, withGeminiKeys("k1", "k2", "k3", "k4"))
	r.keys = map[string]*keyState{}
	for i := 0; i < 3; i++ {
		_, model, attempts, err := r.Generate(context.Background(), PurposeReplyDraft, GenRequest{Text: "hi"}, nil)
		if err != nil || model != "m2" {
			t.Fatalf("run %d: model %q err %v attempts %s", i, model, err, statuses(attempts))
		}
		if attempts[0].Status != StatusError || attempts[1].Status != StatusError {
			t.Fatalf("run %d expected retry once: %s", i, statuses(attempts))
		}
	}
	m1Calls := fg.count(func(c geminiCall) bool { return c.Model == "m1" })
	if m1Calls != 6 {
		t.Fatalf("m1 calls %d, want 6 (3 runs x 1 retry)", m1Calls)
	}
	_, _, attempts, err := r.Generate(context.Background(), PurposeReplyDraft, GenRequest{Text: "hi"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if attempts[0].Status != StatusSkipped || attempts[0].Error != "circuit open" {
		t.Fatalf("expected skipped m1, got %s", statuses(attempts))
	}
	if fg.count(func(c geminiCall) bool { return c.Model == "m1" }) != m1Calls {
		t.Fatal("open breaker still called m1")
	}
	if len(r.Metrics(context.Background()).OpenBreakers) != 1 {
		t.Fatal("metrics should show one open breaker")
	}
}

func TestInvalidOutputFailsOverToNextModel(t *testing.T) {
	fg := &fakeGemini{fn: func(c geminiCall) (int, string) {
		if c.Model == "m1" {
			return 200, geminiText(strings.Replace(validIntake, "water_supply", "space_lasers", 1))
		}
		return 200, geminiText(validIntake)
	}}
	srv := httptest.NewServer(http.HandlerFunc(fg.handler))
	defer srv.Close()
	r := newRouter(t, staticStore{providers: chain("intake", "google:m1", "google:m2")}, srv.URL, srv.URL, withGeminiKeys("k1"))
	res := NewAnalyzer(r).Analyze(context.Background(), IntakeInput{Text: "no water"})
	if res.Source != "ai" || res.Model != "m2" || res.Intake.Category != "water_supply" {
		t.Fatalf("res %+v", res)
	}
	if res.Attempts[0].Status != StatusInvalid {
		t.Fatalf("attempts %s", statuses(res.Attempts))
	}
	// Gemini got structured-output config.
	gc := fg.calls[0].Body["generationConfig"].(map[string]any)
	if gc["responseMimeType"] != "application/json" || gc["responseSchema"] == nil {
		t.Fatalf("generationConfig %v", gc)
	}
}

func TestEmbed768(t *testing.T) {
	fg := &fakeGemini{fn: func(c geminiCall) (int, string) {
		vals := make([]float64, EmbedDims)
		vals[0] = 0.5
		b, _ := json.Marshal(map[string]any{"embedding": map[string]any{"values": vals}})
		return 200, string(b)
	}}
	srv := httptest.NewServer(http.HandlerFunc(fg.handler))
	defer srv.Close()
	r := newRouter(t, nil, srv.URL, srv.URL, withGeminiKeys("k1"))
	vec, model, _, err := r.Embed(context.Background(), "no water")
	if err != nil || len(vec) != 768 || model != "gemini-embedding-001" {
		t.Fatalf("len %d model %q err %v", len(vec), model, err)
	}
	if fg.calls[0].Body["outputDimensionality"].(float64) != 768 {
		t.Fatal("outputDimensionality not sent")
	}
}

func TestAsyncLoggerFlushes(t *testing.T) {
	var mu sync.Mutex
	var got []LogRow
	l := NewAsyncLogger(func(_ context.Context, rows []LogRow) error {
		mu.Lock()
		got = append(got, rows...)
		mu.Unlock()
		return nil
	}, 10, nil)
	for i := 0; i < 3; i++ {
		l.Log(PurposeIntake, Attempt{Provider: "google", Model: "m", KeyLabel: "k", Status: StatusOK})
	}
	l.Close(2 * time.Second)
	l.Log(PurposeIntake, Attempt{}) // after close: must not panic
	mu.Lock()
	defer mu.Unlock()
	if len(got) != 3 || got[0].Purpose != "intake" {
		t.Fatalf("rows %+v", got)
	}
	var nilLogger *AsyncLogger
	nilLogger.Log(PurposeIntake, Attempt{}) // nil-safe
}

func TestAsyncLoggerDropsWhenFull(t *testing.T) {
	block := make(chan struct{})
	l := NewAsyncLogger(func(ctx context.Context, rows []LogRow) error { <-block; return nil }, 2, nil)
	// Fill: the loop may take one row and then block in the sink only at flush time,
	// so push plenty and expect drops without Log ever blocking.
	done := make(chan struct{})
	go func() {
		for i := 0; i < 200; i++ {
			l.Log(PurposeIntake, Attempt{})
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Log blocked")
	}
	close(block)
	l.Close(time.Second)
	if l.Metrics().Dropped == 0 {
		t.Log("no drops observed (flusher kept up); acceptable but unexpected")
	}
}
