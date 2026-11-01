package workers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"path"
	"strings"
	"time"

	"civicsense/engine/internal/ai"
	"civicsense/engine/internal/mail"
	"civicsense/engine/internal/supa"
)

// Deps are what the jobs need.
type Deps struct {
	DB       *supa.Client
	Analyzer *ai.Analyzer
	Mail     *mail.Sender // nil or unconfigured: notification emails wait in the queue
	SiteURL  string
	Now      func() time.Time

	briefFailAt time.Time // back off 10 min after a failed brief so we don't burn quota every minute
}

func (d *Deps) now() time.Time {
	if d.Now != nil {
		return d.Now().UTC()
	}
	return time.Now().UTC()
}

const openFilter = "not.in.(resolved,closed,rejected,duplicate)"

// Jobs returns the background jobs.
func Jobs(d *Deps) []Job {
	return []Job{
		{Name: "heal_pending_ai", Every: time.Minute, Timeout: 55 * time.Second, Run: d.HealPendingAI},
		{Name: "sla_alerts", Every: time.Minute, Timeout: 30 * time.Second, Run: d.SLAAlerts},
		{Name: "auto_close", Every: time.Minute, Timeout: 30 * time.Second, Run: d.AutoClose},
		{Name: "daily_brief", Every: time.Minute, Timeout: 55 * time.Second, Run: d.DailyBrief},
		{Name: "notification_email", Every: 30 * time.Second, Timeout: 25 * time.Second, Run: d.NotificationEmail},
	}
}

// ---------- 1. heal_pending_ai ----------

type pendingRow struct {
	ID           string         `json:"id"`
	Code         string         `json:"code"`
	OriginalText string         `json:"original_text"`
	Status       string         `json:"status"`
	AIStatus     string         `json:"ai_status"`
	AIMeta       map[string]any `json:"ai_meta"`
	SummaryEn    *string        `json:"summary_en"`
	ImageURLs    []string       `json:"image_urls"`
	Locations    *struct {
		NameEn string `json:"name_en"`
	} `json:"locations"`
}

// HealPendingAI re-runs intake for complaints submitted while AI was down (ai_status
// pending/fallback) and fills missing embeddings. original_text is never touched;
// category/priority only change while the ticket is still submitted/needs_review.
func (d *Deps) HealPendingAI(ctx context.Context) (int, error) {
	var rows []pendingRow
	err := d.DB.Select(ctx, "complaints", url.Values{
		"select": {"id,code,original_text,status,ai_status,ai_meta,summary_en,image_urls,locations(name_en)"},
		"or":     {"(ai_status.in.(pending,fallback),and(embedding.is.null,ai_status.neq.failed))"},
		"order":  {"created_at.asc"},
		"limit":  {"5"},
	}, &rows)
	if err != nil {
		return 0, err
	}
	done := 0
	var errs []string
	for _, c := range rows {
		if ctx.Err() != nil {
			break
		}
		if err := d.healOne(ctx, c); err != nil {
			errs = append(errs, c.Code+": "+err.Error())
			continue
		}
		done++
	}
	if len(errs) > 0 {
		return done, errors.New(strings.Join(errs, "; "))
	}
	return done, nil
}

func (d *Deps) healOne(ctx context.Context, c pendingRow) error {
	patch := map[string]any{}
	summary := ""
	if c.SummaryEn != nil {
		summary = *c.SummaryEn
	}
	needsIntake := c.AIStatus == "pending" || c.AIStatus == "fallback" || strings.TrimSpace(summary) == ""
	if needsIntake {
		loc := ""
		if c.Locations != nil {
			loc = c.Locations.NameEn
		}
		imgs := d.loadImages(ctx, c.ImageURLs)
		if strings.TrimSpace(c.OriginalText) == "" && len(imgs) == 0 {
			// Nothing to analyse: mark failed so it stops being picked every tick.
			return d.DB.Patch(ctx, "complaints", url.Values{"id": {"eq." + c.ID}}, map[string]any{"ai_status": "failed"}, nil)
		}
		res := d.Analyzer.Analyze(ctx, ai.IntakeInput{Text: c.OriginalText, Images: imgs, LocationName: loc})
		if res.Source != "ai" {
			return errors.New("AI still unavailable")
		}
		in := res.Intake
		meta := c.AIMeta
		if meta == nil {
			meta = map[string]any{}
		}
		meta["model"] = res.Model
		meta["source"] = "ai"
		meta["healed_by"] = "engine"
		meta["healed_at"] = d.now().Format(time.RFC3339)
		meta["prompt_version"] = ai.IntakePromptVersion
		meta["confidence"] = in.Confidence
		meta["categories"] = in.Categories
		meta["priority_reason_en"] = in.PriorityReasonEn
		meta["location_hint"] = in.LocationHint
		meta["is_abusive"] = in.IsAbusive
		meta["has_personal_data"] = in.HasPersonalData
		meta["is_urgent"] = in.IsUrgent
		meta["is_sensitive_suggested"] = in.IsSensitiveSuggested
		meta["suggested_category"] = in.Category
		meta["suggested_priority"] = in.Priority
		if res.AssameseAutofixed {
			meta["assamese_autofixed"] = true
		}
		patch["title_en"], patch["title_as"] = in.TitleEn, in.TitleAs
		patch["summary_en"], patch["summary_as"] = in.SummaryEn, in.SummaryAs
		patch["ai_status"] = "done"
		patch["ai_meta"] = meta
		if c.Status == "submitted" || c.Status == "needs_review" { // nobody has triaged it yet
			patch["category"], patch["priority"] = in.Category, in.Priority
			if in.IsUrgent {
				patch["is_urgent"] = true
			}
		}
		summary = in.SummaryEn
	}
	if strings.TrimSpace(summary) != "" {
		if vec, _, _, err := d.Analyzer.R.Embed(ctx, summary); err == nil {
			patch["embedding"] = vec
		} else if !needsIntake {
			return errors.New("embedding unavailable")
		}
	}
	if len(patch) == 0 {
		return nil
	}
	return d.DB.Patch(ctx, "complaints", url.Values{"id": {"eq." + c.ID}}, patch, nil)
}

// loadImages downloads up to 3 complaint photos from Storage as data URLs (best effort).
func (d *Deps) loadImages(ctx context.Context, paths []string) []ai.Image {
	var out []ai.Image
	for _, p := range paths {
		if len(out) == 3 {
			break
		}
		if strings.Contains(p, "://") || p == "" {
			continue
		}
		p = strings.TrimPrefix(strings.TrimPrefix(p, "/"), "complaint-photos/")
		data, mime, err := d.DB.Download(ctx, "complaint-photos", p, 4<<20)
		if err != nil {
			continue
		}
		if !strings.HasPrefix(mime, "image/") {
			switch strings.ToLower(path.Ext(p)) {
			case ".png":
				mime = "image/png"
			case ".webp":
				mime = "image/webp"
			default:
				mime = "image/jpeg"
			}
		}
		b64 := base64.StdEncoding.EncodeToString(data)
		out = append(out, ai.Image{Mime: mime, Base64: b64, DataURL: "data:" + mime + ";base64," + b64})
	}
	return out
}

// ---------- 2. sla_alerts ----------

type overdueRow struct {
	ID           string  `json:"id"`
	Code         string  `json:"code"`
	DepartmentID *string `json:"department_id"`
}

// SLAAlerts notifies the department admins once per overdue open complaint.
// Each complaint goes through rpc sla_alert_complaint (migration 11), which claims the complaint
// (sla_alerted_at) and writes the bilingual notifications in ONE transaction: a crash or retry can
// neither duplicate alerts nor lose the marker, and two engines running at once can't both alert.
func (d *Deps) SLAAlerts(ctx context.Context) (int, error) {
	var rows []overdueRow
	err := d.DB.Select(ctx, "complaints", url.Values{
		"select":         {"id,code,department_id"},
		"status":         {openFilter},
		"sla_due_at":     {"lt." + d.now().Format(time.RFC3339)},
		"sla_alerted_at": {"is.null"},
		"order":          {"sla_due_at.asc"},
		"limit":          {"50"},
	}, &rows)
	if err != nil || len(rows) == 0 {
		return 0, err
	}
	done := 0
	for _, c := range rows {
		var sent int
		if err := d.DB.RPC(ctx, "sla_alert_complaint", map[string]any{"cid": c.ID}, &sent); err != nil {
			return done, fmt.Errorf("sla_alert_complaint %s: %w", c.Code, err)
		}
		done++
	}
	return done, nil
}

// ---------- 3. auto_close ----------

// AutoClose closes tickets resolved more than 7 days ago (reporter never confirmed).
func (d *Deps) AutoClose(ctx context.Context) (int, error) {
	var closed []struct {
		ID string `json:"id"`
	}
	err := d.DB.Patch(ctx, "complaints", url.Values{
		"status":      {"eq.resolved"},
		"resolved_at": {"lt." + d.now().Add(-7*24*time.Hour).Format(time.RFC3339)},
		"select":      {"id"},
	}, map[string]any{"status": "closed"}, &closed)
	return len(closed), err
}

// ---------- 4. daily_brief ----------

const briefHash = "daily_brief"

// DailyBrief regenerates the cached admin brief when the cache row has expired.
func (d *Deps) DailyBrief(ctx context.Context) (int, error) {
	var cached []struct {
		ExpiresAt *string `json:"expires_at"`
	}
	if err := d.DB.Select(ctx, "ai_cache", url.Values{"select": {"expires_at"}, "hash": {"eq." + briefHash}}, &cached); err != nil {
		return 0, err
	}
	if len(cached) == 1 && cached[0].ExpiresAt != nil {
		if t, err := time.Parse(time.RFC3339Nano, *cached[0].ExpiresAt); err == nil && t.After(d.now()) {
			return 0, nil // still fresh
		}
	}
	var dash, cats, locs json.RawMessage
	if err := d.DB.RPC(ctx, "dashboard_stats", map[string]any{}, &dash); err != nil {
		return 0, fmt.Errorf("dashboard_stats: %w", err)
	}
	if err := d.DB.RPC(ctx, "category_breakdown", map[string]any{"days": 1}, &cats); err != nil {
		return 0, fmt.Errorf("category_breakdown: %w", err)
	}
	if err := d.DB.RPC(ctx, "top_locations", map[string]any{"days": 1, "lim": 5}, &locs); err != nil {
		return 0, fmt.Errorf("top_locations: %w", err)
	}
	stats := map[string]any{"overall": dash, "categories_last_24h": cats, "top_locations_last_24h": locs}
	if !d.briefFailAt.IsZero() && d.now().Sub(d.briefFailAt) < 10*time.Minute {
		return 0, nil
	}
	brief, model, err := d.Analyzer.DailyBrief(ctx, stats)
	if err != nil {
		d.briefFailAt = d.now()
		return 0, fmt.Errorf("daily brief AI (retry in 10 min): %w", err)
	}
	d.briefFailAt = time.Time{}
	row := map[string]any{
		"hash":    briefHash,
		"purpose": "daily_brief",
		"response": map[string]any{
			"en": brief.En, "as": brief.As, "generated_at": brief.GeneratedAt.Format(time.RFC3339), "model": model,
		},
		"expires_at": d.now().Add(time.Hour).Format(time.RFC3339),
	}
	if err := d.DB.Upsert(ctx, "ai_cache", []map[string]any{row}); err != nil {
		return 0, fmt.Errorf("upsert ai_cache: %w", err)
	}
	return 1, nil
}
