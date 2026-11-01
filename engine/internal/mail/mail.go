// Package mail sends transactional email through Resend's REST API (stdlib only).
package mail

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Sender struct {
	Key  string
	From string
	// Endpoint is overridable for tests.
	Endpoint string
	HTTP     *http.Client
}

func New(key, from string) *Sender {
	if from == "" {
		from = "CivicSense <onboarding@resend.dev>"
	}
	return &Sender{Key: key, From: from, Endpoint: "https://api.resend.com/emails", HTTP: &http.Client{Timeout: 15 * time.Second}}
}

func (s *Sender) Configured() bool { return s != nil && s.Key != "" }

// Send returns an error for anything but a 2xx, so the caller can leave the queue message for a retry.
func (s *Sender) Send(ctx context.Context, to, subject, html, text string) error {
	body, _ := json.Marshal(map[string]any{"from": s.From, "to": []string{to}, "subject": subject, "html": html, "text": text})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.Endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.Key)
	req.Header.Set("Content-Type", "application/json")
	res, err := s.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 300))
		return fmt.Errorf("resend %d: %s", res.StatusCode, bytes.TrimSpace(msg))
	}
	return nil
}
