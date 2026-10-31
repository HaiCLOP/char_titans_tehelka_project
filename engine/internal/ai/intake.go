package ai

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"strings"
	"sync"
	"time"
)

// Intake mirrors IntakeSchema in src/lib/domain.ts plus is_urgent / is_sensitive_suggested.
type Intake struct {
	TitleEn              string  `json:"title_en"`
	TitleAs              string  `json:"title_as"`
	SummaryEn            string  `json:"summary_en"`
	SummaryAs            string  `json:"summary_as"`
	Category             string  `json:"category"`
	Priority             int     `json:"priority"`
	PriorityReasonEn     string  `json:"priority_reason_en"`
	LocationHint         *string `json:"location_hint"`
	IsAbusive            bool    `json:"is_abusive"`
	AbusiveReasonEn      *string `json:"abusive_reason_en"`
	AbusiveReasonAs      *string `json:"abusive_reason_as"`
	HasPersonalData      bool    `json:"has_personal_data"`
	Confidence           float64 `json:"confidence"`
	IsUrgent             bool    `json:"is_urgent"`
	IsSensitiveSuggested bool    `json:"is_sensitive_suggested"`
	IsRelevant           bool    `json:"is_relevant"`
	RejectionReasonEn    *string `json:"rejection_reason_en"`
	RejectionReasonAs    *string `json:"rejection_reason_as"`
	HasAbusiveImage      bool    `json:"has_abusive_image"`
	HasExplicitImage     bool    `json:"has_explicit_image"`
	HasAiImage           bool    `json:"has_ai_image"`
	ImageRejectionReasonEn *string `json:"image_rejection_reason_en"`
	ImageRejectionReasonAs *string `json:"image_rejection_reason_as"`
}

// IntakeResult mirrors IntakeResult in src/lib/ai/intake.ts. AssameseAutofixed is an
// engine extra: true when র→ৰ had to be replaced mechanically after the strict retry.
type IntakeResult struct {
	Intake            Intake    `json:"intake"`
	Source            string    `json:"source"` // ai | fallback
	Model             string    `json:"model,omitempty"`
	Attempts          []Attempt `json:"attempts"`
	Ms                int64     `json:"ms"`
	AssameseAutofixed bool      `json:"assamese_autofixed,omitempty"`
}

type IntakeInput struct {
	Text         string
	Images       []Image
	LocationName string
}

// ParseIntake validates raw model JSON. Missing/short required strings, unknown category
// or priority outside 1–4 → ErrInvalidOutput. Over-long strings are truncated.
func ParseIntake(raw string) (Intake, error) {
	var m struct {
		TitleEn              *string  `json:"title_en"`
		TitleAs              *string  `json:"title_as"`
		SummaryEn            *string  `json:"summary_en"`
		SummaryAs            *string  `json:"summary_as"`
		Category             *string  `json:"category"`
		Priority             *float64 `json:"priority"`
		PriorityReasonEn     *string  `json:"priority_reason_en"`
		LocationHint         *string  `json:"location_hint"`
		IsAbusive            *bool    `json:"is_abusive"`
		AbusiveReasonEn      *string  `json:"abusive_reason_en"`
		AbusiveReasonAs      *string  `json:"abusive_reason_as"`
		HasPersonalData      *bool    `json:"has_personal_data"`
		Confidence           *float64 `json:"confidence"`
		IsUrgent             *bool    `json:"is_urgent"`
		IsSensitiveSuggested *bool    `json:"is_sensitive_suggested"`
		IsRelevant           *bool    `json:"is_relevant"`
		RejectionReasonEn    *string  `json:"rejection_reason_en"`
		RejectionReasonAs    *string  `json:"rejection_reason_as"`
		HasAbusiveImage      *bool    `json:"has_abusive_image"`
		HasExplicitImage     *bool    `json:"has_explicit_image"`
		HasAiImage           *bool    `json:"has_ai_image"`
		ImageRejectionReasonEn *string `json:"image_rejection_reason_en"`
		ImageRejectionReasonAs *string `json:"image_rejection_reason_as"`
	}
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return Intake{}, invalidf("not JSON: %v", err)
	}
	need := func(name string, p *string, min, max int) (string, error) {
		if p == nil {
			return "", invalidf("%s missing", name)
		}
		s := strings.TrimSpace(*p)
		if len([]rune(s)) < min {
			return "", invalidf("%s too short", name)
		}
		return runes(s, max), nil
	}
	var out Intake
	var err error
	if out.TitleEn, err = need("title_en", m.TitleEn, 3, 90); err != nil {
		return out, err
	}
	if out.TitleAs, err = need("title_as", m.TitleAs, 3, 120); err != nil {
		return out, err
	}
	if out.SummaryEn, err = need("summary_en", m.SummaryEn, 10, 400); err != nil {
		return out, err
	}
	if out.SummaryAs, err = need("summary_as", m.SummaryAs, 10, 500); err != nil {
		return out, err
	}
	if m.Category == nil || !validCategory(*m.Category) {
		return out, invalidf("bad category")
	}
	out.Category = *m.Category
	if m.Priority == nil || *m.Priority != math.Trunc(*m.Priority) || *m.Priority < 1 || *m.Priority > 4 {
		return out, invalidf("bad priority")
	}
	out.Priority = int(*m.Priority)
	if m.PriorityReasonEn != nil {
		out.PriorityReasonEn = runes(strings.TrimSpace(*m.PriorityReasonEn), 160)
	}
	if m.LocationHint != nil {
		if h := strings.TrimSpace(*m.LocationHint); h != "" && !strings.EqualFold(h, "null") {
			h = runes(h, 80)
			out.LocationHint = &h
		}
	}
	b := func(p *bool) bool { return p != nil && *p }
	out.IsAbusive, out.HasPersonalData = b(m.IsAbusive), b(m.HasPersonalData)
	out.AbusiveReasonEn = m.AbusiveReasonEn
	out.AbusiveReasonAs = m.AbusiveReasonAs
	out.IsUrgent, out.IsSensitiveSuggested = b(m.IsUrgent), b(m.IsSensitiveSuggested)
	out.IsRelevant = m.IsRelevant == nil || *m.IsRelevant
	out.RejectionReasonEn = m.RejectionReasonEn
	out.RejectionReasonAs = m.RejectionReasonAs
	out.HasAbusiveImage = b(m.HasAbusiveImage)
	out.HasExplicitImage = b(m.HasExplicitImage)
	out.HasAiImage = b(m.HasAiImage)
	out.ImageRejectionReasonEn = m.ImageRejectionReasonEn
	out.ImageRejectionReasonAs = m.ImageRejectionReasonAs
	out.Confidence = 0.5
	if m.Confidence != nil {
		out.Confidence = math.Max(0, math.Min(1, *m.Confidence))
	}
	missingSafety := m.IsAbusive == nil || m.IsUrgent == nil || m.IsSensitiveSuggested == nil || m.IsRelevant == nil
	if missingSafety {
		// Missing safety fields must trigger manual review (Item 2)
		out.IsSensitiveSuggested = true
		out.Confidence = 0.5
	}
	if out.IsUrgent {
		out.Priority = 1 // PRD rule 5
	}
	return out, nil
}

func (i Intake) drift() bool { return HasBengaliDrift(i.TitleAs + i.SummaryAs) }

func (i *Intake) fixDrift() {
	i.TitleAs, i.SummaryAs = FixBengaliDrift(i.TitleAs), FixBengaliDrift(i.SummaryAs)
}

// ---------- analyzer with a small in-memory cache ----------

type cacheEntry struct {
	at  time.Time
	res IntakeResult
}

type Analyzer struct {
	R   *Router
	mu  sync.Mutex
	hit map[string]cacheEntry
}

func NewAnalyzer(r *Router) *Analyzer { return &Analyzer{R: r, hit: map[string]cacheEntry{}} }

const (
	cacheTTL = 10 * time.Minute
	cacheMax = 256
)

func cacheKey(in IntakeInput) string {
	h := sha256.New()
	h.Write([]byte(IntakePromptVersion + "\x00" + in.Text + "\x00" + in.LocationName))
	for _, im := range in.Images {
		h.Write([]byte("\x00" + im.DataURL))
	}
	return hex.EncodeToString(h.Sum(nil))
}

// Analyze runs intake through the router; never fails (keyword fallback last).
func (a *Analyzer) Analyze(ctx context.Context, in IntakeInput) IntakeResult {
	started := time.Now()
	key := cacheKey(in)
	a.mu.Lock()
	if e, ok := a.hit[key]; ok && time.Since(e.at) < cacheTTL {
		a.mu.Unlock()
		r := e.res
		r.Ms = time.Since(started).Milliseconds()
		return r
	}
	a.mu.Unlock()

	ask := func(strict bool) (Intake, string, []Attempt, error) {
		var parsed Intake
		_, model, attempts, err := a.R.Generate(ctx, PurposeIntake, GenRequest{
			System: IntakeSystem(strict),
			Text:   intakeUserText(in.Text, in.LocationName),
			Images: in.Images,
			JSON:   true,
			Schema: intakeSchema(),
		}, func(raw string) error {
			p, err := ParseIntake(raw)
			if err == nil {
				parsed = p
			}
			return err
		})
		return parsed, model, attempts, err
	}

	res := IntakeResult{Source: "ai"}
	it, model, attempts, err := ask(false)
	if err != nil {
		res = IntakeResult{Intake: FallbackIntake(in.Text), Source: "fallback", Attempts: attempts}
		a.R.opt.Logs.Log(PurposeIntake, Attempt{Provider: "engine", Model: "keyword-fallback", KeyLabel: "-", Status: StatusFallback, Error: "all models failed"})
		res.Ms = time.Since(started).Milliseconds()
		return res // fallback results are not cached so the next call retries AI
	}
	if it.drift() {
		it2, model2, attempts2, err2 := ask(true)
		attempts = append(attempts, attempts2...)
		if err2 == nil {
			it, model = it2, model2
		}
		if it.drift() { // still drifting: mechanical replacement as a last resort
			it.fixDrift()
			res.AssameseAutofixed = true
		}
	}
	res.Intake, res.Model, res.Attempts = it, model, attempts
	res.Ms = time.Since(started).Milliseconds()

	a.mu.Lock()
	if len(a.hit) >= cacheMax {
		for k, e := range a.hit {
			if time.Since(e.at) >= cacheTTL || len(a.hit) >= cacheMax {
				delete(a.hit, k)
			}
			if len(a.hit) < cacheMax/2 {
				break
			}
		}
	}
	a.hit[key] = cacheEntry{at: time.Now(), res: res}
	a.mu.Unlock()
	return res
}

// ---------- daily brief ----------

type Brief struct {
	En          []string  `json:"en"`
	As          []string  `json:"as"`
	GeneratedAt time.Time `json:"generated_at"`
}

func parseBrief(raw string) (Brief, error) {
	var b Brief
	if err := json.Unmarshal([]byte(raw), &b); err != nil {
		return b, invalidf("brief not JSON")
	}
	clean := func(xs []string) []string {
		var out []string
		for _, x := range xs {
			if x = strings.TrimSpace(x); x != "" {
				out = append(out, runes(x, 300))
			}
		}
		if len(out) > 3 {
			out = out[:3]
		}
		return out
	}
	b.En, b.As = clean(b.En), clean(b.As)
	if len(b.En) != 3 || len(b.As) != 3 {
		return b, invalidf("brief needs 3 bullets per language")
	}
	return b, nil
}

// DailyBrief turns stats JSON into 3 EN + 3 AS bullets (strict retry on Bengali drift).
func (a *Analyzer) DailyBrief(ctx context.Context, stats any) (Brief, string, error) {
	data, err := json.Marshal(stats)
	if err != nil {
		return Brief{}, "", err
	}
	ask := func(strict bool) (Brief, string, error) {
		var b Brief
		_, model, _, err := a.R.Generate(ctx, PurposeDailyBrief, GenRequest{
			System: dailyBriefPrompt(strict), Text: "Statistics JSON:\n" + string(data), JSON: true, Schema: dailyBriefSchema(),
		}, func(raw string) error {
			p, err := parseBrief(raw)
			if err == nil {
				b = p
			}
			return err
		})
		return b, model, err
	}
	b, model, err := ask(false)
	if err != nil {
		return b, "", err
	}
	if HasBengaliDrift(strings.Join(b.As, "")) {
		if b2, m2, err2 := ask(true); err2 == nil {
			b, model = b2, m2
		}
		for i := range b.As {
			b.As[i] = FixBengaliDrift(b.As[i])
		}
	}
	b.GeneratedAt = time.Now().UTC()
	return b, model, nil
}
