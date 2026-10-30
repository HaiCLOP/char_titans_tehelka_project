// Package httpapi exposes the engine over HTTP. All /v1/* routes and /metrics require
// "Authorization: Bearer <ENGINE_SECRET>". Errors use the PRD shape {error:{code,message}}.
package httpapi

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"runtime/debug"
	"strings"
	"time"

	"civicsense/engine/internal/ai"
	"civicsense/engine/internal/supa"
	"civicsense/engine/internal/workers"
)

const MaxBody = 12 << 20 // 12 MB

var Version = "0.1.0"

type Server struct {
	Secret   string
	DB       *supa.Client
	Router   *ai.Router
	Analyzer *ai.Analyzer
	Logs     *ai.AsyncLogger
	Workers  *workers.Runner
	Log      *slog.Logger
	Started  time.Time
}

var errStatus = map[string]int{
	"VALIDATION_ERROR": 400, "UNAUTHENTICATED": 401, "FORBIDDEN": 403, "NOT_FOUND": 404,
	"INVALID_TRANSITION": 409, "RATE_LIMITED": 429, "INTERNAL": 500, "AI_UNAVAILABLE": 503,
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, code, msg string) {
	st, ok := errStatus[code]
	if !ok {
		st = 500
	}
	writeJSON(w, st, map[string]any{"error": map[string]string{"code": code, "message": msg}})
}

// Handler builds the mux with middleware.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	mux.Handle("GET /metrics", s.auth(http.HandlerFunc(s.metrics)))
	mux.Handle("POST /v1/intake", s.auth(http.HandlerFunc(s.intake)))
	mux.Handle("POST /v1/embed", s.auth(http.HandlerFunc(s.embed)))
	mux.Handle("POST /v1/similar", s.auth(http.HandlerFunc(s.similar)))
	mux.Handle("POST /v1/router/invalidate", s.auth(http.HandlerFunc(s.invalidate)))
	mux.Handle("/v1/", s.auth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fail(w, "NOT_FOUND", "No such route") })))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { fail(w, "NOT_FOUND", "No such route") })
	return s.recover(s.limit(s.access(mux)))
}

func (s *Server) auth(next http.Handler) http.Handler {
	want := sha256.Sum256([]byte(s.Secret))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		tok, ok := strings.CutPrefix(h, "Bearer ")
		got := sha256.Sum256([]byte(strings.TrimSpace(tok)))
		if !ok || s.Secret == "" || subtle.ConstantTimeCompare(got[:], want[:]) != 1 {
			fail(w, "UNAUTHENTICATED", "Missing or invalid engine token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, MaxBody)
		next.ServeHTTP(w, r)
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (sw *statusWriter) WriteHeader(c int) { sw.status = c; sw.ResponseWriter.WriteHeader(c) }

func (s *Server) access(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: 200}
		next.ServeHTTP(sw, r)
		if r.URL.Path != "/health" {
			s.Log.Info("http", "method", r.Method, "path", r.URL.Path, "status", sw.status, "ms", time.Since(start).Milliseconds())
		}
	})
}

func (s *Server) recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if p := recover(); p != nil {
				if p == http.ErrAbortHandler {
					panic(p)
				}
				s.Log.Error("handler panic", "path", r.URL.Path, "panic", p, "stack", string(debug.Stack()))
				fail(w, "INTERNAL", "Internal error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// decode reads a JSON body; false means an error response was written.
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			fail(w, "VALIDATION_ERROR", "Request body larger than 12 MB")
		} else {
			fail(w, "VALIDATION_ERROR", "Invalid JSON body")
		}
		return false
	}
	return true
}

// ---------- handlers ----------

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	dbOK := s.DB != nil && s.DB.Ping(ctx) == nil
	writeJSON(w, 200, map[string]any{
		"ok": true, "uptime_s": int64(time.Since(s.Started).Seconds()), "db_connected": dbOK, "version": Version,
	})
}

func (s *Server) metrics(w http.ResponseWriter, r *http.Request) {
	rm := s.Router.Metrics(r.Context())
	var wk any = map[string]any{}
	if s.Workers != nil {
		wk = s.Workers.Results()
	}
	writeJSON(w, 200, map[string]any{
		"uptime_s":         int64(time.Since(s.Started).Seconds()),
		"version":          Version,
		"config_loaded_at": rm.ConfigLoadedAt,
		"config_from_db":   rm.ConfigFromDB,
		"chains":           rm.Chains,
		"keys":             rm.Keys,
		"open_breakers":    rm.OpenBreakers,
		"logs":             s.Logs.Metrics(),
		"dropped_logs":     s.Logs.Metrics().Dropped,
		"workers":          wk,
	})
}

type intakeReq struct {
	Text         string   `json:"text"`
	Images       []string `json:"images"`
	LocationName string   `json:"locationName"`
}

func (s *Server) intake(w http.ResponseWriter, r *http.Request) {
	var req intakeReq
	if !decode(w, r, &req) {
		return
	}
	if len([]rune(req.Text)) > 2000 {
		fail(w, "VALIDATION_ERROR", "text longer than 2000 characters")
		return
	}
	if len(req.Images) > 3 {
		fail(w, "VALIDATION_ERROR", "at most 3 images")
		return
	}
	if len([]rune(req.LocationName)) > 120 {
		fail(w, "VALIDATION_ERROR", "locationName longer than 120 characters")
		return
	}
	if strings.TrimSpace(req.Text) == "" && len(req.Images) == 0 {
		fail(w, "VALIDATION_ERROR", "text or image required")
		return
	}
	imgs := make([]ai.Image, 0, len(req.Images))
	for _, u := range req.Images {
		im, err := ai.ParseDataURL(u)
		if err != nil {
			fail(w, "VALIDATION_ERROR", err.Error())
			return
		}
		imgs = append(imgs, im)
	}
	res := s.Analyzer.Analyze(r.Context(), ai.IntakeInput{Text: req.Text, Images: imgs, LocationName: req.LocationName})
	if res.Attempts == nil {
		res.Attempts = []ai.Attempt{}
	}
	writeJSON(w, 200, res)
}

func (s *Server) embed(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Text string `json:"text"`
	}
	if !decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Text) == "" || len([]rune(req.Text)) > 8000 {
		fail(w, "VALIDATION_ERROR", "text required (max 8000 characters)")
		return
	}
	vec, model, _, err := s.Router.Embed(r.Context(), req.Text)
	if err != nil {
		fail(w, "AI_UNAVAILABLE", "Embedding unavailable")
		return
	}
	writeJSON(w, 200, map[string]any{"embedding": vec, "model": model})
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type Match struct {
	ID         string  `json:"id"`
	Code       string  `json:"code"`
	TitleEn    *string `json:"title_en"`
	TitleAs    *string `json:"title_as"`
	Status     string  `json:"status"`
	LocationID *string `json:"location_id"`
	MetooCount int     `json:"metoo_count"`
	Similarity float64 `json:"similarity"`
}

func (s *Server) similar(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SummaryEn  string   `json:"summary_en"`
		LocationID *string  `json:"location_id"`
		Threshold  *float64 `json:"threshold"`
	}
	if !decode(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.SummaryEn) == "" || len([]rune(req.SummaryEn)) > 2000 {
		fail(w, "VALIDATION_ERROR", "summary_en required (max 2000 characters)")
		return
	}
	th := 0.80
	if req.Threshold != nil {
		if *req.Threshold < 0 || *req.Threshold > 1 {
			fail(w, "VALIDATION_ERROR", "threshold must be between 0 and 1")
			return
		}
		th = *req.Threshold
	}
	var loc any
	if req.LocationID != nil && *req.LocationID != "" {
		if !uuidRe.MatchString(*req.LocationID) {
			fail(w, "VALIDATION_ERROR", "location_id must be a UUID")
			return
		}
		loc = *req.LocationID
	}
	vec, _, _, err := s.Router.Embed(r.Context(), req.SummaryEn)
	if err != nil {
		fail(w, "AI_UNAVAILABLE", "Embedding unavailable")
		return
	}
	matches := []Match{}
	err = s.DB.RPC(r.Context(), "match_complaints", map[string]any{
		"query_embedding": vec, "match_threshold": th, "match_count": 3, "filter_location": loc,
	}, &matches)
	if err != nil {
		s.Log.Warn("match_complaints failed", "err", err.Error())
		fail(w, "INTERNAL", "Similarity search failed")
		return
	}
	if matches == nil {
		matches = []Match{}
	}
	writeJSON(w, 200, matches)
}

func (s *Server) invalidate(w http.ResponseWriter, r *http.Request) {
	s.Router.Reload(r.Context())
	writeJSON(w, 200, map[string]any{"ok": true})
}
