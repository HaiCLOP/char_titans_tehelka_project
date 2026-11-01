package httpapi

import (
	"encoding/base64"
	"net/http"
	"regexp"
	"strings"
	"time"

	"civicsense/engine/internal/ai"
)

var voiceRe = regexp.MustCompile(`^[A-Za-z]{2,20}$`)

// POST /v1/stt {audio: "data:audio/webm;base64,…", lang?: "as"|"en"} → {text, lang, model, ms}
func (s *Server) stt(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Audio string `json:"audio"`
		Lang  string `json:"lang"`
	}
	if !decode(w, r, &req) {
		return
	}
	audio, err := ai.ParseAudioDataURL(req.Audio)
	if err != nil {
		fail(w, "VALIDATION_ERROR", err.Error())
		return
	}
	started := time.Now()
	t, model, _, err := s.Router.Transcribe(r.Context(), audio, req.Lang)
	if err != nil {
		fail(w, "AI_UNAVAILABLE", "Speech recognition unavailable")
		return
	}
	writeJSON(w, 200, map[string]any{"text": t.Text, "lang": t.Lang, "model": model, "ms": time.Since(started).Milliseconds()})
}

// POST /v1/tts {text, voice?} → {audio: base64 WAV, mime: "audio/wav", model, ms}
func (s *Server) tts(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Text  string `json:"text"`
		Voice string `json:"voice"`
	}
	if !decode(w, r, &req) {
		return
	}
	text := strings.TrimSpace(req.Text)
	if text == "" || len([]rune(text)) > ai.MaxSpeakRunes {
		fail(w, "VALIDATION_ERROR", "text required (max 600 characters)")
		return
	}
	if req.Voice != "" && !voiceRe.MatchString(req.Voice) {
		fail(w, "VALIDATION_ERROR", "invalid voice")
		return
	}
	started := time.Now()
	wav, model, _, err := s.Router.Speak(r.Context(), text, req.Voice)
	if err != nil {
		fail(w, "AI_UNAVAILABLE", "Speech synthesis unavailable")
		return
	}
	writeJSON(w, 200, map[string]any{
		"audio": base64.StdEncoding.EncodeToString(wav), "mime": "audio/wav", "model": model, "ms": time.Since(started).Milliseconds(),
	})
}
