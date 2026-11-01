package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Speech: speech-to-text and text-to-speech on Gemini's free tier, through the same router
// (key rotation, cooldown, circuit breaker, ai_logs) as every other model call.
//   - STT sends the recording inline to a Gemini text model and asks for a verbatim transcript.
//   - TTS uses Gemini's speech model, which returns 24 kHz 16-bit mono PCM; it is wrapped as WAV.
// Assamese works both ways (checked by a TTS → STT round trip).

const (
	PurposeSTT Purpose = "stt"
	PurposeTTS Purpose = "tts"

	MaxAudioBytes = 8 << 20 // decoded recording
	// Gemini's audio latency swings from ~2 s to 25 s+ for the same clip, so a second request goes out
	// (least-recently-used key, so usually the other one) if the first has not answered by then.
	sttHedgeAfter = 6 * time.Second
	MaxSpeakRunes = 600
	DefaultVoice  = "Kore"
)

var audioMimes = map[string]bool{
	"audio/webm": true, "audio/ogg": true, "audio/wav": true, "audio/x-wav": true, "audio/mpeg": true,
	"audio/mp3": true, "audio/mp4": true, "audio/aac": true, "audio/flac": true,
}

// ParseAudioDataURL accepts "data:audio/<type>[;codecs=…];base64,<payload>".
func ParseAudioDataURL(s string) (Image, error) {
	if !strings.HasPrefix(s, "data:audio/") {
		return Image{}, errors.New("audio must be a data:audio/ URL")
	}
	meta, payload, ok := strings.Cut(s[len("data:"):], ",")
	if !ok || !strings.HasSuffix(meta, ";base64") || payload == "" {
		return Image{}, errors.New("audio data URL must be base64")
	}
	mime, _, _ := strings.Cut(strings.TrimSuffix(meta, ";base64"), ";") // drop ;codecs=opus
	if !audioMimes[mime] {
		return Image{}, errors.New("unsupported audio type " + mime)
	}
	if base64.StdEncoding.DecodedLen(len(payload)) > MaxAudioBytes {
		return Image{}, errors.New("recording is too long")
	}
	return Image{Mime: mime, Base64: payload}, nil
}

type Transcript struct {
	Text string `json:"text"`
	Lang string `json:"lang"` // "as" | "en"
}

const sttSystem = `You transcribe short voice notes from students at Dibrugarh University, Assam, describing campus problems.
Write exactly what was said, in the language it was spoken. Assamese must be written in Assamese script with ৰ and ৱ (never the Bengali letter র).
Do not translate, summarise, answer or add anything. If there is no speech, output nothing.`

var bengaliRa = regexp.MustCompile(`র`)

func scriptLang(s string) string {
	for _, r := range s {
		if r >= 0x0980 && r <= 0x09FF {
			return "as"
		}
	}
	return "en"
}

type sttResult struct {
	t        Transcript
	model    string
	attempts []Attempt
	err      error
}

// Transcribe turns a recording into text. hint ("as"/"en") only nudges the model. Hedged: see sttHedgeAfter.
func (r *Router) Transcribe(ctx context.Context, audio Image, hint string) (Transcript, string, []Attempt, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	results := make(chan sttResult, 2)
	launch := func() {
		go func() {
			t, m, a, err := r.transcribeOnce(ctx, audio, hint)
			results <- sttResult{t, m, a, err}
		}()
	}
	launch()
	hedge := time.NewTimer(sttHedgeAfter)
	defer hedge.Stop()
	inFlight, hedged := 1, false
	var all []Attempt
	var lastErr error
	for {
		select {
		case <-hedge.C:
			if !hedged {
				hedged = true
				inFlight++
				launch()
			}
		case res := <-results:
			inFlight--
			all = append(all, res.attempts...)
			if res.err == nil {
				return res.t, res.model, all, nil
			}
			lastErr = res.err
			// Unhedged and failed means every model and key already failed; a hedge would only repeat it.
			if inFlight == 0 {
				return Transcript{}, "", all, lastErr
			}
		}
	}
}

func (r *Router) transcribeOnce(ctx context.Context, audio Image, hint string) (Transcript, string, []Attempt, error) {
	prompt := "Transcribe this voice note."
	if hint == "as" {
		prompt += " It is probably in Assamese."
	}
	req := GenRequest{System: sttSystem, Text: prompt, Images: []Image{audio}}
	var out string
	model, attempts, err := r.run(ctx, PurposeSTT, runOpts{}, func(ctx context.Context, m ModelEntry, k Key) error {
		if m.Provider != "google" {
			return errors.New("speech needs Gemini")
		}
		text, err := r.gemini.generate(ctx, k.Value, m.Model, req)
		if err != nil {
			return err
		}
		out = strings.TrimSpace(text)
		return nil
	})
	if err != nil {
		return Transcript{}, "", attempts, err
	}
	out = bengaliRa.ReplaceAllString(out, "ৰ")
	return Transcript{Text: out, Lang: scriptLang(out)}, model, attempts, nil
}

// Speak reads text aloud and returns a WAV file.
func (r *Router) Speak(ctx context.Context, text, voice string) ([]byte, string, []Attempt, error) {
	if voice == "" {
		voice = DefaultVoice
	}
	var wav []byte
	model, attempts, err := r.run(ctx, PurposeTTS, runOpts{}, func(ctx context.Context, m ModelEntry, k Key) error {
		if m.Provider != "google" {
			return errors.New("speech needs Gemini")
		}
		pcm, rate, err := r.gemini.tts(ctx, k.Value, m.Model, text, voice)
		if err != nil {
			return err
		}
		wav = pcmToWAV(pcm, rate)
		return nil
	})
	return wav, model, attempts, err
}

func (g *gemini) tts(ctx context.Context, key, model, text, voice string) ([]byte, int, error) {
	body := map[string]any{
		"contents": []map[string]any{{"parts": []map[string]any{{"text": text}}}},
		"generationConfig": map[string]any{
			"responseModalities": []string{"AUDIO"},
			"speechConfig": map[string]any{
				"voiceConfig": map[string]any{"prebuiltVoiceConfig": map[string]any{"voiceName": voice}},
			},
		},
	}
	var out struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					InlineData struct {
						MimeType string `json:"mimeType"`
						Data     string `json:"data"`
					} `json:"inlineData"`
				} `json:"parts"`
			} `json:"content"`
			FinishReason string `json:"finishReason"`
		} `json:"candidates"`
	}
	u := g.base + "/v1beta/models/" + url.PathEscape(model) + ":generateContent"
	if err := postJSON(ctx, g.hc, u, map[string]string{"x-goog-api-key": key}, body, &out); err != nil {
		return nil, 0, err
	}
	if len(out.Candidates) == 0 || len(out.Candidates[0].Content.Parts) == 0 {
		return nil, 0, invalidf("no audio returned")
	}
	part := out.Candidates[0].Content.Parts[0].InlineData
	pcm, err := base64.StdEncoding.DecodeString(part.Data)
	if err != nil || len(pcm) == 0 {
		return nil, 0, invalidf("bad audio payload")
	}
	return pcm, pcmRate(part.MimeType), nil
}

// pcmRate reads "audio/L16;codec=pcm;rate=24000"; Gemini TTS is 24 kHz when unstated.
func pcmRate(mime string) int {
	for _, p := range strings.Split(mime, ";") {
		if v, ok := strings.CutPrefix(strings.TrimSpace(p), "rate="); ok {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				return n
			}
		}
	}
	return 24000
}

// pcmToWAV wraps 16-bit little-endian mono PCM in a WAV header.
func pcmToWAV(pcm []byte, rate int) []byte {
	var b bytes.Buffer
	w := func(v any) { _ = binary.Write(&b, binary.LittleEndian, v) }
	b.WriteString("RIFF")
	w(uint32(36 + len(pcm)))
	b.WriteString("WAVEfmt ")
	w(uint32(16))
	w(uint16(1)) // PCM
	w(uint16(1)) // mono
	w(uint32(rate))
	w(uint32(rate * 2))
	w(uint16(2))
	w(uint16(16))
	b.WriteString("data")
	w(uint32(len(pcm)))
	b.Write(pcm)
	return b.Bytes()
}
