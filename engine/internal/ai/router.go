package ai

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"sort"
	"sync"
	"time"
)

/*
Router: Go port of src/lib/ai/router.ts.
  - model chain per purpose from ai_providers (priority order), refreshed every 30 s
  - keys from ai_keys (AES-GCM) + GEMINI_API_KEYS / OPENROUTER_API_KEYS env, LRU first, per-key RPM
  - 429/401/403 → key cools 60 s, next key; 5xx/network → one retry with jitter, then next model;
    timeout / invalid output → next model
  - circuit breaker: 3 failures in 60 s → model skipped for 30 s
  - simulate_failure keys act as 429 without a network call
  - every attempt logged to ai_logs asynchronously
*/

const (
	keyCooldown    = 60 * time.Second
	rpmWindow      = 60 * time.Second
	breakerWindow  = 60 * time.Second
	breakerOpenFor = 30 * time.Second
	breakerFails   = 3
	configTTL      = 30 * time.Second
)

// ProviderRow / KeyRow are the DB shapes the router needs.
type ProviderRow struct {
	Provider string   `json:"provider"`
	Model    string   `json:"model"`
	Purpose  string   `json:"purpose"`
	Caps     []string `json:"caps"`
}

type KeyRow struct {
	ID              string `json:"id"`
	Provider        string `json:"provider"`
	Label           string `json:"label"`
	KeyEncrypted    string `json:"key_encrypted"`
	KeyLast4        string `json:"key_last4"`
	RPMLimit        int    `json:"rpm_limit"`
	SimulateFailure bool   `json:"simulate_failure"`
}

// Store loads router config. Providers must be enabled rows ordered by priority.
type Store interface {
	Providers(ctx context.Context) ([]ProviderRow, error)
	Keys(ctx context.Context) ([]KeyRow, error)
}

type Options struct {
	Store          Store // may be nil → defaults + env keys only
	Secret         string
	GeminiKeys     []string
	OpenRouterKeys []string
	GeminiBase     string
	OpenRouterBase string
	HTTP           *http.Client
	Logs           *AsyncLogger // may be nil
	Log            *slog.Logger
	// Sleep is used for the 5xx retry jitter (tests replace it).
	Sleep func(ctx context.Context, d time.Duration)
}

type keyState struct {
	cooldownUntil time.Time
	lastUsed      time.Time
	calls         []time.Time
	ok, fail      int64
}

type breaker struct {
	fails     []time.Time
	openUntil time.Time
}

type snapshot struct {
	at     time.Time
	chains map[Purpose][]ModelEntry
	keys   []Key
	dbOK   bool
}

type Router struct {
	opt    Options
	gemini *gemini
	or     *openRouter
	free   *freeModels
	log    *slog.Logger

	cfgMu sync.Mutex
	cfg   *snapshot

	mu       sync.Mutex
	keys     map[string]*keyState
	breakers map[string]*breaker
}

func NewRouter(o Options) *Router {
	if o.HTTP == nil {
		o.HTTP = &http.Client{Timeout: 60 * time.Second}
	}
	if o.GeminiBase == "" {
		o.GeminiBase = DefaultGeminiBase
	}
	if o.OpenRouterBase == "" {
		o.OpenRouterBase = DefaultOpenRouterBase
	}
	if o.Log == nil {
		o.Log = slog.Default()
	}
	if o.Sleep == nil {
		o.Sleep = func(ctx context.Context, d time.Duration) {
			t := time.NewTimer(d)
			defer t.Stop()
			select {
			case <-t.C:
			case <-ctx.Done():
			}
		}
	}
	return &Router{
		opt:      o,
		gemini:   &gemini{base: o.GeminiBase, hc: o.HTTP},
		or:       &openRouter{base: o.OpenRouterBase, hc: o.HTTP},
		free:     &freeModels{base: o.OpenRouterBase, hc: o.HTTP, ttl: time.Hour},
		log:      o.Log,
		keys:     map[string]*keyState{},
		breakers: map[string]*breaker{},
	}
}

// defaultChains mirrors supabase/seed.sql (used when ai_providers is empty/unreachable).
func defaultChains() map[Purpose][]ModelEntry {
	g := func(model string, caps ...string) ModelEntry { return ModelEntry{"google", model, caps} }
	free := func(caps ...string) ModelEntry { return ModelEntry{"openrouter", "auto:free", caps} }
	return map[Purpose][]ModelEntry{
		PurposeIntake:          {g("gemini-flash-latest", "vision", "assamese", "json"), g("gemini-flash-lite-latest", "vision", "assamese", "json"), free("vision", "assamese", "json")},
		PurposeEmbed:           {g("gemini-embedding-001", "embed")},
		PurposeDedupVerify:     {g("gemini-flash-lite-latest", "assamese", "json"), g("gemini-flash-latest", "assamese", "json"), free("assamese", "json")},
		PurposeAgent:           {g("gemini-flash-latest", "tools", "assamese"), g("gemini-flash-lite-latest", "tools", "assamese"), free("tools", "assamese")},
		PurposeReplyDraft:      {g("gemini-flash-latest", "assamese"), free("assamese")},
		PurposeTranslateMsg:    {g("gemini-flash-lite-latest", "assamese"), g("gemini-flash-latest", "assamese"), free("assamese")},
		PurposeResolutionCheck: {g("gemini-flash-latest", "vision", "json")},
		PurposeDailyBrief:      {g("gemini-flash-latest", "assamese"), free("assamese")},
		// Speech is Gemini-only (free tier); OpenRouter has no free audio models.
		PurposeSTT: {g("gemini-flash-lite-latest", "audio", "assamese"), g("gemini-flash-latest", "audio", "assamese")},
		PurposeTTS: {g("gemini-2.5-flash-preview-tts", "tts")},
	}
}

// ---------- config ----------

// Invalidate forces the next call to reload chains and keys.
func (r *Router) Invalidate() {
	r.cfgMu.Lock()
	if r.cfg != nil {
		r.cfg.at = time.Time{}
	}
	r.cfgMu.Unlock()
}

// Reload fetches chains/keys now.
func (r *Router) Reload(ctx context.Context) {
	r.Invalidate()
	r.config(ctx)
}

// Start refreshes config every 30 s until ctx is done.
func (r *Router) Start(ctx context.Context) {
	go func() {
		t := time.NewTicker(configTTL)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				r.Reload(ctx)
			}
		}
	}()
}

func (r *Router) config(ctx context.Context) *snapshot {
	r.cfgMu.Lock()
	defer r.cfgMu.Unlock()
	if r.cfg != nil && time.Since(r.cfg.at) < configTTL {
		return r.cfg
	}
	next := &snapshot{at: time.Now(), chains: map[Purpose][]ModelEntry{}}
	var dbKeys []Key
	if r.opt.Store != nil {
		lctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		providers, perr := r.opt.Store.Providers(lctx)
		keyRows, kerr := r.opt.Store.Keys(lctx)
		cancel()
		if perr == nil && kerr == nil {
			next.dbOK = true
			for _, p := range providers {
				next.chains[Purpose(p.Purpose)] = append(next.chains[Purpose(p.Purpose)], ModelEntry{p.Provider, p.Model, p.Caps})
			}
			for _, k := range keyRows {
				if k.SimulateFailure {
					// No decryption needed: the key is never sent anywhere.
					dbKeys = append(dbKeys, Key{ID: k.ID, Provider: k.Provider, Label: k.Label, Last4: k.KeyLast4, RPM: k.RPMLimit, Simulate: true})
					continue
				}
				v, err := DecryptKey(r.opt.Secret, k.KeyEncrypted)
				if err != nil {
					r.log.Warn("skipping undecryptable ai_key", "label", k.Label)
					continue
				}
				dbKeys = append(dbKeys, Key{ID: k.ID, Provider: k.Provider, Label: k.Label, Value: v, Last4: k.KeyLast4, RPM: k.RPMLimit})
			}
		} else {
			r.log.Warn("router config load failed; using last known/defaults", "providers_err", errStr(perr), "keys_err", errStr(kerr))
			if r.cfg != nil && r.cfg.dbOK { // keep the last good DB config
				next.chains = r.cfg.chains
				for _, k := range r.cfg.keys {
					if k.ID != "" {
						dbKeys = append(dbKeys, k)
					}
				}
				next.dbOK = false
			}
		}
	}
	next.keys = append(next.keys, dbKeys...)
	for i, v := range r.opt.GeminiKeys {
		next.keys = append(next.keys, Key{Provider: "google", Label: fmt.Sprintf("env-gemini-%d", i+1), Value: v, Last4: last4(v), RPM: 10})
	}
	for i, v := range r.opt.OpenRouterKeys {
		next.keys = append(next.keys, Key{Provider: "openrouter", Label: fmt.Sprintf("env-openrouter-%d", i+1), Value: v, Last4: last4(v), RPM: 10})
	}
	for i := range next.keys {
		if next.keys[i].RPM <= 0 {
			next.keys[i].RPM = 10
		}
	}
	r.cfg = next
	return next
}

func errStr(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// ---------- key + breaker state ----------

func (r *Router) pickKeys(keys []Key, provider string) []Key {
	now := time.Now()
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []Key
	for _, k := range keys {
		if k.Provider != provider {
			continue
		}
		s := r.keys[k.Label]
		if s != nil {
			if s.cooldownUntil.After(now) {
				continue
			}
			if countSince(s.calls, now.Add(-rpmWindow)) >= k.RPM {
				continue
			}
		}
		out = append(out, k)
	}
	sort.SliceStable(out, func(i, j int) bool { return r.lastUsed(out[i].Label).Before(r.lastUsed(out[j].Label)) })
	return out
}

func (r *Router) lastUsed(label string) time.Time {
	if s := r.keys[label]; s != nil {
		return s.lastUsed
	}
	return time.Time{}
}

func countSince(ts []time.Time, since time.Time) int {
	n := 0
	for _, t := range ts {
		if t.After(since) {
			n++
		}
	}
	return n
}

func (r *Router) state(label string) *keyState {
	s := r.keys[label]
	if s == nil {
		s = &keyState{}
		r.keys[label] = s
	}
	return s
}

func (r *Router) markUsed(label string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	s := r.state(label)
	s.lastUsed = now
	kept := s.calls[:0]
	for _, t := range s.calls {
		if now.Sub(t) < rpmWindow {
			kept = append(kept, t)
		}
	}
	s.calls = append(kept, now)
}

func (r *Router) markResult(label string, ok bool, cool bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	s := r.state(label)
	if ok {
		s.ok++
	} else {
		s.fail++
	}
	if cool {
		s.cooldownUntil = time.Now().Add(keyCooldown)
	}
}

func breakerID(e ModelEntry) string { return e.Provider + "/" + e.Model }

func (r *Router) breakerOpen(e ModelEntry) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	b := r.breakers[breakerID(e)]
	return b != nil && b.openUntil.After(time.Now())
}

func (r *Router) breakerFail(e ModelEntry) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	b := r.breakers[breakerID(e)]
	if b == nil {
		b = &breaker{}
		r.breakers[breakerID(e)] = b
	}
	kept := b.fails[:0]
	for _, t := range b.fails {
		if now.Sub(t) < breakerWindow {
			kept = append(kept, t)
		}
	}
	b.fails = append(kept, now)
	if len(b.fails) >= breakerFails {
		b.openUntil = now.Add(breakerOpenFor)
		b.fails = nil
		r.log.Warn("circuit breaker opened", "model", breakerID(e), "for_s", breakerOpenFor.Seconds())
	}
}

func (r *Router) breakerOK(e ModelEntry) {
	r.mu.Lock()
	delete(r.breakers, breakerID(e))
	r.mu.Unlock()
}

// ---------- run ----------

type runOpts struct {
	needVision bool
	wantJSON   bool
	timeout    time.Duration
}

func classify(attemptCtx context.Context, err error) (status string, retryable bool) {
	var pe *ProviderError
	switch {
	case errors.Is(err, ErrInvalidOutput):
		return StatusInvalid, false
	case errors.Is(err, ErrPaidModel):
		return StatusError, false
	case errors.Is(err, context.DeadlineExceeded) || errors.Is(attemptCtx.Err(), context.DeadlineExceeded):
		return StatusTimeout, false
	case errors.As(err, &pe):
		if pe.Status == 429 || pe.Status == 401 || pe.Status == 403 {
			return StatusRateLimited, false
		}
		return StatusError, pe.Status >= 500
	default:
		return StatusError, true // network error
	}
}

func (r *Router) chainFor(ctx context.Context, cfg *snapshot, purpose Purpose, o runOpts, attempts *[]Attempt) []ModelEntry {
	chain := cfg.chains[purpose]
	if len(chain) == 0 {
		chain = defaultChains()[purpose]
	}
	var out []ModelEntry
	for _, m := range chain {
		if o.needVision && !m.has("vision") {
			continue
		}
		switch {
		case m.Provider == "openrouter" && m.Model == "auto:free":
			for _, id := range r.free.list(ctx, o.needVision, o.wantJSON) {
				out = append(out, ModelEntry{"openrouter", id, m.Caps})
			}
		case m.Provider == "openrouter" && !IsFreeOpenRouterModel(m.Model):
			*attempts = append(*attempts, Attempt{Provider: m.Provider, Model: m.Model, KeyLabel: "-", Status: StatusSkipped, Error: ErrPaidModel.Error()})
		case m.Provider != "google" && m.Provider != "openrouter":
			*attempts = append(*attempts, Attempt{Provider: m.Provider, Model: m.Model, KeyLabel: "-", Status: StatusSkipped, Error: "provider not wired"})
		default:
			out = append(out, m)
		}
	}
	return out
}

// run walks the chain. call does one attempt with one key; it must store its own result.
func (r *Router) run(ctx context.Context, purpose Purpose, o runOpts, call func(ctx context.Context, m ModelEntry, k Key) error) (string, []Attempt, error) {
	cfg := r.config(ctx)
	if o.timeout == 0 {
		o.timeout = PurposeTimeout[purpose]
		if o.timeout == 0 {
			o.timeout = 15 * time.Second
		}
	}
	var attempts []Attempt
	chain := r.chainFor(ctx, cfg, purpose, o, &attempts)

	for _, entry := range chain {
		if ctx.Err() != nil {
			break
		}
		if r.breakerOpen(entry) {
			attempts = append(attempts, Attempt{Provider: entry.Provider, Model: entry.Model, KeyLabel: "-", Status: StatusSkipped, Error: "circuit open"})
			continue
		}
		keys := r.pickKeys(cfg.keys, entry.Provider)
		retried := false
	keyLoop:
		for i := 0; i < len(keys); {
			key := keys[i]
			r.markUsed(key.Label)
			if key.Simulate {
				a := Attempt{Provider: entry.Provider, Model: entry.Model, KeyLabel: key.Label, Status: StatusRateLimited, Error: "simulated failure (429)"}
				attempts = append(attempts, a)
				r.markResult(key.Label, false, true)
				r.opt.Logs.Log(purpose, a)
				i++
				continue
			}
			started := time.Now()
			actx, cancel := context.WithTimeout(ctx, o.timeout)
			err := call(actx, entry, key)
			status, retryable := StatusOK, false
			if err != nil {
				status, retryable = classify(actx, err)
			}
			cancel()
			a := Attempt{Provider: entry.Provider, Model: entry.Model, KeyLabel: key.Label, Status: status, LatencyMs: time.Since(started).Milliseconds()}
			if err != nil {
				a.Error = truncate(err.Error(), 300)
			}
			attempts = append(attempts, a)
			r.opt.Logs.Log(purpose, a)

			if err == nil {
				r.markResult(key.Label, true, false)
				r.breakerOK(entry)
				return entry.Model, attempts, nil
			}
			r.markResult(key.Label, false, status == StatusRateLimited)
			if ctx.Err() != nil {
				break keyLoop
			}
			switch {
			case status == StatusRateLimited:
				i++ // same model, next key
			case retryable && !retried:
				retried = true
				r.opt.Sleep(ctx, time.Duration(300+rand.IntN(400))*time.Millisecond)
				// retry the same key once
			default:
				r.breakerFail(entry)
				break keyLoop // next model
			}
		}
	}
	return "", attempts, &UnavailableError{Attempts: attempts}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// Generate runs a text/JSON generation. validate (optional) inspects the raw output
// and returns an ErrInvalidOutput-wrapped error to fail over to the next model.
func (r *Router) Generate(ctx context.Context, purpose Purpose, req GenRequest, validate func(string) error) (string, string, []Attempt, error) {
	var out string
	model, attempts, err := r.run(ctx, purpose, runOpts{needVision: len(req.Images) > 0, wantJSON: req.JSON}, func(ctx context.Context, m ModelEntry, k Key) error {
		var text string
		var err error
		switch m.Provider {
		case "google":
			text, err = r.gemini.generate(ctx, k.Value, m.Model, req)
		case "openrouter":
			text, err = r.or.generate(ctx, k.Value, m.Model, req)
		default:
			return fmt.Errorf("provider %s not wired", m.Provider)
		}
		if err != nil {
			return err
		}
		if req.JSON {
			text = extractJSON(text)
		}
		if validate != nil {
			if err := validate(text); err != nil {
				return err
			}
		}
		out = text
		return nil
	})
	return out, model, attempts, err
}

// Embed returns a 768-d embedding (Gemini only; OpenRouter has no embeddings).
func (r *Router) Embed(ctx context.Context, text string) ([]float64, string, []Attempt, error) {
	var vec []float64
	model, attempts, err := r.run(ctx, PurposeEmbed, runOpts{}, func(ctx context.Context, m ModelEntry, k Key) error {
		if m.Provider != "google" {
			return invalidf("provider %s has no embeddings", m.Provider)
		}
		v, err := r.gemini.embed(ctx, k.Value, m.Model, text)
		if err != nil {
			return err
		}
		vec = v
		return nil
	})
	return vec, model, attempts, err
}

// ---------- metrics ----------

type KeyMetrics struct {
	Label           string     `json:"label"`
	Provider        string     `json:"provider"`
	Last4           string     `json:"last4"`
	Source          string     `json:"source"` // db | env
	Enabled         bool       `json:"enabled"`
	SimulateFailure bool       `json:"simulate_failure"`
	RPMLimit        int        `json:"rpm_limit"`
	CallsLastMinute int        `json:"calls_last_minute"`
	OK              int64      `json:"ok"`
	Fail            int64      `json:"fail"`
	CooldownUntil   *time.Time `json:"cooldown_until"`
}

type BreakerMetrics struct {
	Model     string    `json:"model"`
	OpenUntil time.Time `json:"open_until"`
}

type RouterMetrics struct {
	ConfigLoadedAt time.Time                `json:"config_loaded_at"`
	ConfigFromDB   bool                     `json:"config_from_db"`
	Chains         map[Purpose][]ModelEntry `json:"chains"`
	Keys           []KeyMetrics             `json:"keys"`
	OpenBreakers   []BreakerMetrics         `json:"open_breakers"`
}

func (r *Router) Metrics(ctx context.Context) RouterMetrics {
	cfg := r.config(ctx)
	chains := defaultChains()
	for p, c := range cfg.chains {
		chains[p] = c
	}
	m := RouterMetrics{ConfigLoadedAt: cfg.at, ConfigFromDB: cfg.dbOK, Chains: chains, Keys: []KeyMetrics{}, OpenBreakers: []BreakerMetrics{}}
	now := time.Now()
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, k := range cfg.keys {
		km := KeyMetrics{Label: k.Label, Provider: k.Provider, Last4: k.Last4, Source: "env", Enabled: true, SimulateFailure: k.Simulate, RPMLimit: k.RPM}
		if k.ID != "" {
			km.Source = "db"
		}
		if s := r.keys[k.Label]; s != nil {
			km.CallsLastMinute = countSince(s.calls, now.Add(-rpmWindow))
			km.OK, km.Fail = s.ok, s.fail
			if s.cooldownUntil.After(now) {
				t := s.cooldownUntil
				km.CooldownUntil = &t
			}
		}
		m.Keys = append(m.Keys, km)
	}
	for id, b := range r.breakers {
		if b.openUntil.After(now) {
			m.OpenBreakers = append(m.OpenBreakers, BreakerMetrics{Model: id, OpenUntil: b.openUntil})
		}
	}
	return m
}
