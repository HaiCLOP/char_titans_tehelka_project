package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const (
	DefaultGeminiBase     = "https://generativelanguage.googleapis.com"
	DefaultOpenRouterBase = "https://openrouter.ai"
	EmbedDims             = 768
)

// Image is one inline image taken from a data URL.
type Image struct {
	Mime    string // image/png
	Base64  string // raw base64 payload
	DataURL string // original data: URL (OpenRouter accepts it as image_url)
}

// ParseDataURL accepts "data:image/<type>;base64,<payload>".
func ParseDataURL(s string) (Image, error) {
	if !strings.HasPrefix(s, "data:image/") {
		return Image{}, errors.New("image must be a data:image/ URL")
	}
	meta, payload, ok := strings.Cut(s[len("data:"):], ",")
	if !ok || !strings.HasSuffix(meta, ";base64") || payload == "" {
		return Image{}, errors.New("image data URL must be base64")
	}
	return Image{Mime: strings.TrimSuffix(meta, ";base64"), Base64: payload, DataURL: s}, nil
}

// GenRequest is a single-turn generation: system prompt + user text + images.
type GenRequest struct {
	System string
	Text   string
	Images []Image
	JSON   bool           // ask for a JSON object
	Schema map[string]any // Gemini responseSchema (OpenAPI subset); optional
}

type httpDoer interface {
	Do(*http.Request) (*http.Response, error)
}

func postJSON(ctx context.Context, hc httpDoer, u string, headers map[string]string, body any, out any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := hc.Do(req)
	if err != nil {
		var ue *url.Error
		if errors.As(err, &ue) {
			return ue.Err // drop the URL from the message
		}
		return err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 16<<20))
	if err != nil {
		return err
	}
	if res.StatusCode >= 300 {
		return &ProviderError{Status: res.StatusCode, Msg: providerMsg(data)}
	}
	if err := json.Unmarshal(data, out); err != nil {
		return invalidf("provider response not JSON")
	}
	return nil
}

// providerMsg extracts error.message if present, truncated. Never includes request headers.
func providerMsg(data []byte) string {
	var e struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	msg := strings.TrimSpace(string(data))
	if json.Unmarshal(data, &e) == nil && e.Error.Message != "" {
		msg = e.Error.Message
	}
	if len(msg) > 300 {
		msg = msg[:300]
	}
	return msg
}

// ---------- Gemini ----------

type gemini struct {
	base string
	hc   httpDoer
}

func (g *gemini) generate(ctx context.Context, key, model string, r GenRequest) (string, error) {
	parts := []map[string]any{{"text": r.Text}}
	for _, im := range r.Images {
		parts = append(parts, map[string]any{"inlineData": map[string]any{"mimeType": im.Mime, "data": im.Base64}})
	}
	body := map[string]any{
		"contents": []map[string]any{{"role": "user", "parts": parts}},
	}
	if r.System != "" {
		body["systemInstruction"] = map[string]any{"parts": []map[string]any{{"text": r.System}}}
	}
	if r.JSON {
		gc := map[string]any{"responseMimeType": "application/json"}
		if r.Schema != nil {
			gc["responseSchema"] = r.Schema
		}
		body["generationConfig"] = gc
	}
	var out struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
			FinishReason string `json:"finishReason"`
		} `json:"candidates"`
		PromptFeedback struct {
			BlockReason string `json:"blockReason"`
		} `json:"promptFeedback"`
	}
	u := g.base + "/v1beta/models/" + url.PathEscape(model) + ":generateContent"
	if err := postJSON(ctx, g.hc, u, map[string]string{"x-goog-api-key": key}, body, &out); err != nil {
		return "", err
	}
	if len(out.Candidates) == 0 {
		return "", invalidf("no candidates (block reason %q)", out.PromptFeedback.BlockReason)
	}
	var sb strings.Builder
	for _, p := range out.Candidates[0].Content.Parts {
		sb.WriteString(p.Text)
	}
	if strings.TrimSpace(sb.String()) == "" {
		return "", invalidf("empty output (finish %s)", out.Candidates[0].FinishReason)
	}
	return sb.String(), nil
}

func (g *gemini) embed(ctx context.Context, key, model, text string) ([]float64, error) {
	body := map[string]any{
		"model":                "models/" + model,
		"content":              map[string]any{"parts": []map[string]any{{"text": text}}},
		"taskType":             "SEMANTIC_SIMILARITY",
		"outputDimensionality": EmbedDims,
	}
	var out struct {
		Embedding struct {
			Values []float64 `json:"values"`
		} `json:"embedding"`
	}
	u := g.base + "/v1beta/models/" + url.PathEscape(model) + ":embedContent"
	if err := postJSON(ctx, g.hc, u, map[string]string{"x-goog-api-key": key}, body, &out); err != nil {
		return nil, err
	}
	if len(out.Embedding.Values) != EmbedDims {
		return nil, invalidf("embedding has %d dims, want %d", len(out.Embedding.Values), EmbedDims)
	}
	return out.Embedding.Values, nil
}

// ---------- OpenRouter (free models only) ----------

func IsFreeOpenRouterModel(id string) bool { return strings.HasSuffix(id, ":free") }

type openRouter struct {
	base string
	hc   httpDoer
}

func (o *openRouter) generate(ctx context.Context, key, model string, r GenRequest) (string, error) {
	if !IsFreeOpenRouterModel(model) {
		return "", fmt.Errorf("%w: %s", ErrPaidModel, model) // never call it
	}
	var user any = r.Text
	if len(r.Images) > 0 {
		content := []map[string]any{{"type": "text", "text": r.Text}}
		for _, im := range r.Images {
			content = append(content, map[string]any{"type": "image_url", "image_url": map[string]any{"url": im.DataURL}})
		}
		user = content
	}
	msgs := []map[string]any{}
	if r.System != "" {
		msgs = append(msgs, map[string]any{"role": "system", "content": r.System})
	}
	msgs = append(msgs, map[string]any{"role": "user", "content": user})
	body := map[string]any{"model": model, "messages": msgs}
	if r.JSON {
		body["response_format"] = map[string]any{"type": "json_object"}
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Code    any    `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	headers := map[string]string{"Authorization": "Bearer " + key, "X-Title": "CivicSense"}
	if err := postJSON(ctx, o.hc, o.base+"/api/v1/chat/completions", headers, body, &out); err != nil {
		return "", err
	}
	if out.Error != nil { // OpenRouter sometimes reports upstream errors with HTTP 200
		code := 502
		if n, ok := out.Error.Code.(float64); ok && n >= 400 {
			code = int(n)
		}
		return "", &ProviderError{Status: code, Msg: out.Error.Message}
	}
	if len(out.Choices) == 0 || strings.TrimSpace(out.Choices[0].Message.Content) == "" {
		return "", invalidf("empty completion")
	}
	return out.Choices[0].Message.Content, nil
}

// extractJSON strips ``` fences / leading prose some free models add.
func extractJSON(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.Index(s, "```"); i >= 0 {
		rest := s[i+3:]
		rest = strings.TrimPrefix(rest, "json")
		if j := strings.Index(rest, "```"); j >= 0 {
			s = strings.TrimSpace(rest[:j])
		}
	}
	if i, j := strings.IndexByte(s, '{'), strings.LastIndexByte(s, '}'); i >= 0 && j > i {
		s = s[i : j+1]
	}
	return s
}
