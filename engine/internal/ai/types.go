// Package ai is the Go port of src/lib/ai: model/key router with failover, providers
// (Gemini REST, OpenRouter free models), intake, keyword fallback and the daily brief.
package ai

import (
	"errors"
	"fmt"
	"time"
)

type Purpose string

const (
	PurposeIntake          Purpose = "intake"
	PurposeEmbed           Purpose = "embed"
	PurposeDedupVerify     Purpose = "dedup_verify"
	PurposeAgent           Purpose = "agent"
	PurposeReplyDraft      Purpose = "reply_draft"
	PurposeTranslateMsg    Purpose = "translate_msg"
	PurposeResolutionCheck Purpose = "resolution_check"
	PurposeDailyBrief      Purpose = "daily_brief"
)

// PurposeTimeout mirrors PURPOSE_TIMEOUT_MS in src/lib/ai/types.ts (per attempt).
var PurposeTimeout = map[Purpose]time.Duration{
	PurposeIntake: 15 * time.Second, PurposeEmbed: 5 * time.Second, PurposeDedupVerify: 6 * time.Second,
	PurposeAgent: 25 * time.Second, PurposeReplyDraft: 10 * time.Second, PurposeTranslateMsg: 6 * time.Second,
	PurposeResolutionCheck: 15 * time.Second, PurposeDailyBrief: 20 * time.Second,
	PurposeSTT: 40 * time.Second, PurposeTTS: 30 * time.Second,
}

type ModelEntry struct {
	Provider string   `json:"provider"`
	Model    string   `json:"model"`
	Caps     []string `json:"caps"`
}

func (m ModelEntry) has(cap string) bool {
	for _, c := range m.Caps {
		if c == cap {
			return true
		}
	}
	return false
}

// Attempt status values (ai_logs.status). "skipped" is only reported, never logged.
const (
	StatusOK          = "ok"
	StatusRateLimited = "rate_limited"
	StatusError       = "error"
	StatusTimeout     = "timeout"
	StatusInvalid     = "invalid"
	StatusSkipped     = "skipped"
	StatusFallback    = "fallback"
)

// Attempt matches the TS Attempt type field-for-field (camelCase JSON).
type Attempt struct {
	Provider  string `json:"provider"`
	Model     string `json:"model"`
	KeyLabel  string `json:"keyLabel"`
	Status    string `json:"status"`
	LatencyMs int64  `json:"latencyMs"`
	Error     string `json:"error,omitempty"`
}

// Key is a usable API key. Value is secret: never log or serialise it.
type Key struct {
	ID       string
	Provider string
	Label    string
	Value    string
	Last4    string
	RPM      int
	Simulate bool // ai_keys.simulate_failure: behave as 429 without a network call
}

// ProviderError is an HTTP failure from a model provider.
type ProviderError struct {
	Status int
	Msg    string
}

func (e *ProviderError) Error() string { return fmt.Sprintf("provider http %d: %s", e.Status, e.Msg) }

// ErrInvalidOutput marks unparseable or schema-violating model output → next model.
var ErrInvalidOutput = errors.New("invalid model output")

func invalidf(format string, a ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalidOutput, fmt.Sprintf(format, a...))
}

// ErrPaidModel is returned (without any request) for OpenRouter models not ending in ":free".
var ErrPaidModel = errors.New("refusing paid OpenRouter model (free models only)")

// UnavailableError: every model and key failed.
type UnavailableError struct{ Attempts []Attempt }

func (e *UnavailableError) Error() string { return "all AI models and keys failed" }

func last4(s string) string {
	if len(s) <= 4 {
		return s
	}
	return s[len(s)-4:]
}
