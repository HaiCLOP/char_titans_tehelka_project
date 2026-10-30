package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"sort"
	"sync"
	"time"
)

// freeModels discovers OpenRouter's currently free models (cached 1 h). Free models
// change often, so they are never hardcoded. Paid ones are filtered out here and
// refused again by the provider.
type freeModels struct {
	base string
	hc   httpDoer
	ttl  time.Duration

	mu     sync.Mutex
	at     time.Time
	models []orModel
}

type orModel struct {
	ID           string `json:"id"`
	Architecture struct {
		InputModalities []string `json:"input_modalities"`
	} `json:"architecture"`
	SupportedParameters []string `json:"supported_parameters"`
	ContextLength       int      `json:"context_length"`
	Pricing             struct {
		Prompt     string `json:"prompt"`
		Completion string `json:"completion"`
	} `json:"pricing"`
}

func (m orModel) vision() bool { return contains(m.Architecture.InputModalities, "image") }
func (m orModel) json() bool {
	return contains(m.SupportedParameters, "structured_outputs") || contains(m.SupportedParameters, "response_format")
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func (f *freeModels) refresh(ctx context.Context) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.base+"/api/v1/models", nil)
	if err != nil {
		return
	}
	res, err := f.hc.Do(req)
	if err != nil {
		return
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, 32<<20))
	if err != nil {
		return
	}
	var body struct {
		Data []orModel `json:"data"`
	}
	if json.Unmarshal(data, &body) != nil {
		return
	}
	var free []orModel
	for _, m := range body.Data {
		if IsFreeOpenRouterModel(m.ID) && m.Pricing.Prompt == "0" && m.Pricing.Completion == "0" {
			free = append(free, m)
		}
	}
	f.models, f.at = free, time.Now()
}

// list returns up to 3 free model ids. With needVision only image-capable models are
// returned; JSON-capable models are preferred when wantJSON.
func (f *freeModels) list(ctx context.Context, needVision, wantJSON bool) []string {
	f.mu.Lock()
	if f.at.IsZero() || time.Since(f.at) > f.ttl {
		f.refresh(ctx) // on failure keeps the stale list
	}
	models := append([]orModel(nil), f.models...)
	f.mu.Unlock()

	var cand []orModel
	for _, m := range models {
		if needVision && !m.vision() {
			continue
		}
		cand = append(cand, m)
	}
	sort.SliceStable(cand, func(i, j int) bool {
		if wantJSON && cand[i].json() != cand[j].json() {
			return cand[i].json()
		}
		return cand[i].ContextLength > cand[j].ContextLength
	})
	var out []string
	for i := 0; i < len(cand) && i < 3; i++ {
		out = append(out, cand[i].ID)
	}
	return out
}
