package ai

import (
	"context"
	"net/url"

	"civicsense/engine/internal/supa"
)

// SupaStore reads router config from Supabase and writes ai_logs.
type SupaStore struct{ DB *supa.Client }

func (s SupaStore) Providers(ctx context.Context) ([]ProviderRow, error) {
	var rows []ProviderRow
	err := s.DB.Select(ctx, "ai_providers", url.Values{
		"select":  {"provider,model,purpose,caps"},
		"enabled": {"eq.true"},
		"order":   {"priority.asc"},
	}, &rows)
	return rows, err
}

func (s SupaStore) Keys(ctx context.Context) ([]KeyRow, error) {
	var rows []KeyRow
	err := s.DB.Select(ctx, "ai_keys", url.Values{
		"select":  {"id,provider,label,key_encrypted,key_last4,rpm_limit,simulate_failure"},
		"enabled": {"eq.true"},
	}, &rows)
	return rows, err
}

// LogSink inserts ai_logs rows in one request.
func (s SupaStore) LogSink() LogSink {
	return func(ctx context.Context, rows []LogRow) error { return s.DB.Insert(ctx, "ai_logs", rows, nil) }
}
