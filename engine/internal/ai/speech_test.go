package ai

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseAudioDataURL(t *testing.T) {
	im, err := ParseAudioDataURL("data:audio/webm;codecs=opus;base64,AAAA")
	if err != nil || im.Mime != "audio/webm" || im.Base64 != "AAAA" {
		t.Fatalf("got %+v, %v", im, err)
	}
	for _, bad := range []string{"data:image/png;base64,AAAA", "data:audio/webm,AAAA", "data:audio/x-evil;base64,AAAA"} {
		if _, err := ParseAudioDataURL(bad); err == nil {
			t.Errorf("%q: expected an error", bad)
		}
	}
}

func TestPCMToWAVHeader(t *testing.T) {
	wav := pcmToWAV(make([]byte, 480), pcmRate("audio/L16;codec=pcm;rate=24000"))
	if string(wav[0:4]) != "RIFF" || string(wav[8:12]) != "WAVE" || len(wav) != 44+480 {
		t.Fatalf("bad header / length %d", len(wav))
	}
	if rate := binary.LittleEndian.Uint32(wav[24:28]); rate != 24000 {
		t.Fatalf("rate %d", rate)
	}
	if pcmRate("audio/L16") != 24000 {
		t.Fatal("default rate should be 24000")
	}
}

func TestTranscribeFixesBengaliRa(t *testing.T) {
	fg := &fakeGemini{fn: func(c geminiCall) (int, string) {
		return 200, geminiText(" হোষ্টেলর পানী নাই ")
	}}
	srv := httptest.NewServer(http.HandlerFunc(fg.handler))
	defer srv.Close()
	r := newRouter(t, nil, srv.URL, srv.URL, withGeminiKeys("k1"))
	tr, model, _, err := r.Transcribe(context.Background(), Image{Mime: "audio/webm", Base64: "AAAA"}, "as")
	if err != nil {
		t.Fatal(err)
	}
	if tr.Text != "হোষ্টেলৰ পানী নাই" || tr.Lang != "as" || model != "gemini-flash-lite-latest" {
		t.Fatalf("got %+v via %s", tr, model)
	}
	if !strings.Contains(fg.calls[0].System, "ৰ") {
		t.Fatal("system prompt should ask for Assamese ৰ")
	}
}

func TestSpeakReturnsWAV(t *testing.T) {
	pcm := base64.StdEncoding.EncodeToString(make([]byte, 96))
	fg := &fakeGemini{fn: func(c geminiCall) (int, string) {
		b, _ := json.Marshal(map[string]any{"candidates": []any{map[string]any{"content": map[string]any{"parts": []any{
			map[string]any{"inlineData": map[string]any{"mimeType": "audio/L16;codec=pcm;rate=24000", "data": pcm}},
		}}}}})
		return 200, string(b)
	}}
	srv := httptest.NewServer(http.HandlerFunc(fg.handler))
	defer srv.Close()
	r := newRouter(t, nil, srv.URL, srv.URL, withGeminiKeys("k1"))
	wav, model, _, err := r.Speak(context.Background(), "নমস্কাৰ", "")
	if err != nil || model != "gemini-2.5-flash-preview-tts" || len(wav) != 44+96 {
		t.Fatalf("len %d model %s err %v", len(wav), model, err)
	}
	gc := fg.calls[0].Body["generationConfig"].(map[string]any)
	if gc["responseModalities"].([]any)[0] != "AUDIO" {
		t.Fatal("should request audio")
	}
}
