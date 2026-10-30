# CivicSense backend engine (Go)

A small Go service (standard library only) that runs next to the Next.js app. It does three jobs:

- **AI router.** It is the Go port of `src/lib/ai/router.ts`. It handles model chains, key rotation, cooldowns, the circuit breaker, free-only OpenRouter models and async `ai_logs`.
- **AI endpoints.** Intake, embeddings and similar-ticket search. The web app calls them using `ENGINE_URL` plus `ENGINE_SECRET`.
- **Background workers.** They heal complaints whose AI step failed, send SLA alerts, auto-close resolved tickets and build the daily brief.

```
 Browser ──▶ Next.js (Vercel / localhost:3000)
                 │  Authorization: Bearer ENGINE_SECRET
                 ▼
        ┌──────────────── engine (:8080) ────────────────┐
        │ httpapi  /health /metrics /v1/intake /v1/embed │
        │          /v1/similar /v1/router/invalidate     │
        │    │                                           │
        │    ▼                                           │
        │ ai.Router ── chains (ai_providers, 30 s) ──┐   │
        │    │        keys (ai_keys AES-GCM + env)   │   │
        │    ├──▶ Gemini generateContent/embedContent│   │
        │    └──▶ OpenRouter chat (":free" only)     │   │
        │ AsyncLogger ──(buffered chan)──▶ ai_logs   │   │
        │ workers (60 s): heal_pending_ai, sla_alerts│   │
        │                 auto_close, daily_brief    │   │
        └────────────────────┬───────────────────────────┘
                             ▼ PostgREST (service role)
                     Supabase  /rest/v1, /rest/v1/rpc/*
```

## Keep Go caches on E: (required)

Go's default caches are on C:, so set these before **every** `go` command. Do not use `go env -w`.

PowerShell:

```powershell
$env:GOCACHE="E:\civicsense\.gocache\build"; $env:GOPATH="E:\civicsense\.gocache\path"
$env:GOMODCACHE="E:\civicsense\.gocache\mod"; $env:GOTMPDIR="E:\civicsense\.gocache\tmp"
$env:TMP="E:\civicsense\.gocache\tmp"; $env:TEMP="E:\civicsense\.gocache\tmp"
$env:GOTOOLCHAIN="local"; $env:GOTELEMETRY="off"
```

Git Bash: prefix the command with
`GOCACHE=E:/civicsense/.gocache/build GOPATH=E:/civicsense/.gocache/path GOMODCACHE=E:/civicsense/.gocache/mod GOTMPDIR=E:/civicsense/.gocache/tmp TMP=E:/civicsense/.gocache/tmp TEMP=E:/civicsense/.gocache/tmp GOTOOLCHAIN=local GOTELEMETRY=off`

## Run on Windows

```powershell
cd E:\civicsense\char_titans_tehelka_project\engine
$env:ENGINE_SECRET="<at least 16 random chars>"      # or put it in ..\.env.local
go run ./cmd/engine
# or
go build -o engine.exe ./cmd/engine; .\engine.exe
```

The engine reads the process environment first. It then reads `..\.env.local`, looking relative to the working directory and to the executable, so it shares the web app's file. Real environment variables win. Press Ctrl+C to stop: it shuts down HTTP (10 s), stops the workers and flushes the queued logs.

Tests: `go vet ./...` and `go test ./...`. Both use fake Gemini, OpenRouter and PostgREST servers, so they make no network calls.

## Environment

| Var | Required | Meaning |
|---|---|---|
| `ENGINE_SECRET` | yes, ≥ 16 chars | Bearer token for `/v1/*` and `/metrics`. The engine refuses to start without it. |
| `NEXT_PUBLIC_SUPABASE_URL` | for DB features | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | for DB features | Service-role key. It is sent only in headers and is never logged or returned. |
| `AI_KEYS_SECRET` | for DB keys | Decrypts `ai_keys.key_encrypted`. Uses the same AES-256-GCM format as `src/lib/ai/crypto.ts`. |
| `GEMINI_API_KEYS` | optional | Comma-separated. Labels `env-gemini-N`, 10 RPM each. |
| `OPENROUTER_API_KEYS` | optional | Comma-separated. Labels `env-openrouter-N`. Free models only. |
| `ENGINE_PORT` | no (8080) | Listen port |
| `ENGINE_LOG_LEVEL` | no (info) | debug, info, warn or error. Logs are JSON on stdout. |

Without Supabase settings the engine still serves `/v1/intake` and `/v1/embed`, using the built-in chains (they mirror `supabase/seed.sql`) and env keys. The workers are disabled in that mode.

## Endpoints

Every route except `/health` needs `-H "Authorization: Bearer $ENGINE_SECRET"`. Errors use the shape `{"error":{"code","message"}}` with these codes: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `NOT_FOUND` 404, `AI_UNAVAILABLE` 503, `INTERNAL` 500. The request body limit is 12 MB.

```bash
S=your-engine-secret; E=http://localhost:8080
curl $E/health                                   # {ok, uptime_s, db_connected, version}
curl -H "Authorization: Bearer $S" $E/metrics    # keys (last4 only), breakers, dropped logs, workers
curl -H "Authorization: Bearer $S" -X POST $E/v1/intake \
  -d '{"text":"হোষ্টেলৰ বাথৰুমত তিনিদিন ধৰি পানী নাই","images":[],"locationName":"Girls Hostel"}'
curl -H "Authorization: Bearer $S" -X POST $E/v1/embed   -d '{"text":"No water in hostel bathroom"}'
curl -H "Authorization: Bearer $S" -X POST $E/v1/similar -d '{"summary_en":"No water in hostel bathroom","threshold":0.8}'
curl -H "Authorization: Bearer $S" -X POST $E/v1/router/invalidate
```

**`/v1/intake`** takes `{text ≤ 2000, images ≤ 3 data:image/...;base64 URLs, locationName ≤ 120}` and returns the same shape as the TS `IntakeResult`:

```json
{
  "intake": {
    "title_en": "", "title_as": "", "summary_en": "", "summary_as": "",
    "category": "water_supply", "priority": 2, "priority_reason_en": "",
    "location_hint": null, "is_abusive": false, "has_personal_data": false,
    "confidence": 0.9, "is_urgent": false, "is_sensitive_suggested": false
  },
  "source": "ai",
  "model": "gemini-flash-latest",
  "attempts": [{"provider":"google","model":"gemini-flash-latest","keyLabel":"env-gemini-1","status":"ok","latencyMs":1830}],
  "ms": 1850,
  "assamese_autofixed": true
}
```

Notes on the intake response:

- `model` is omitted when `source` is `"fallback"`.
- `assamese_autofixed` appears only when it is true. It means র still came back after the strict retry and was replaced with ৰ mechanically.
- `is_urgent: true` always forces `priority` to 1.

**`/v1/similar`** returns up to 3 rows from `match_complaints`: `[{id, code, title_en, title_as, status, location_id, metoo_count, similarity}]`.

## Workers

Each worker runs every 60 s, the first time 10 s after start. Every run has its own timeout and is panic-safe. The last result of each worker is shown on `/metrics`.

| Worker | What it does |
|---|---|
| `heal_pending_ai` | Takes up to 5 of the oldest complaints with `ai_status` pending or fallback, or with no embedding. It re-runs intake on `original_text`, the location name and the stored photos, embeds `summary_en`, then updates the title, summaries, `ai_status=done`, `ai_meta` and the embedding. It never touches `original_text`. It changes category, priority and `is_urgent` only while the status is still `submitted` or `needs_review`. Complaints with nothing to analyse are marked `failed`. |
| `sla_alerts` | For open, overdue complaints where `sla_alerted_at` is null, it sends a bilingual notification to every `dept_admin` of that department, then sets `sla_alerted_at`. |
| `auto_close` | Moves tickets from `resolved` to `closed` when `resolved_at` is more than 7 days old. |
| `daily_brief` | Runs when the `ai_cache` row `daily_brief` has expired. It calls `dashboard_stats`, `category_breakdown` and `top_locations`, asks the AI for 3 EN and 3 AS bullets, and upserts the result with a 1 h expiry. After a failure it waits 10 min before trying again. |

## Router rules

- **Model chains:** read from `ai_providers` (enabled rows, by priority) and reloaded every 30 s or on `/v1/router/invalidate`. If the table is empty or unreachable, the router uses built-in defaults.
- **Keys:** `ai_keys` (enabled) plus env keys. The least recently used key goes first, with a per-key RPM limit over a 60 s sliding window.
- **Rate limits and bad keys:** a 429, 401 or 403 cools that key down for 60 s, and the router tries the next key on the same model.
- **Server and network errors:** a 5xx or network error gets one retry with 300–700 ms jitter, then the router moves to the next model.
- **Timeouts and bad output:** a timeout, or output that fails validation, moves straight to the next model.
- **Circuit breaker:** 3 failures in 60 s skips that model for 30 s.
- **OpenRouter:** only ids ending in `:free` are allowed. `auto:free` is filled from `/api/v1/models`, keeping models whose prompt and completion price are both "0". The list is cached for 1 h, and models that accept images are required when the request has photos. Paid ids are refused and never called.

## Cloudflare tunnel (expose the local engine to Vercel)

```powershell
cloudflared tunnel --url http://localhost:8080
```

Copy the printed `https://<random>.trycloudflare.com` URL. Set it as `ENGINE_URL` in the web app's env (Vercel project settings or `.env.local`), next to the same `ENGINE_SECRET`. The URL changes each time a quick tunnel starts.

## Failure demo (PRD section 15, 4:30)

1. Open `/metrics` (or the system panel) and note that the keys are healthy.
2. Set `ai_keys.simulate_failure = true` on the first Gemini key, either in the system panel or with SQL: `update ai_keys set simulate_failure = true where label = '...'`.
3. Run `POST /v1/router/invalidate` so the change applies now instead of within 30 s.
4. Submit a complaint. In `attempts` and `ai_logs`, that key shows `rate_limited` ("simulated failure (429)") and the next key or model answers.
5. In `/metrics`, that key now has a `cooldown_until` value and a higher `fail` count.
6. Turn it back off, call invalidate again, and the key is used again once its 60 s cooldown ends.
