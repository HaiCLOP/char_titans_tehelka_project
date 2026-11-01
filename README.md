# CivicSense — Campus Together

Bilingual (অসমীয়া + English) AI-powered campus issue management for Dibrugarh University.
Game of Codes · ANAZORI v16.0 · PS-04. Team: Arnav, Devansh, Darsh, Aman.

Rules for humans and AI agents: **read `AGENTS.md` first.** Product spec: `docs/PRD.md`. Plan and demo checklist: `docs/TASKS.md`.

## Setup (Windows, keep everything on E:)

```powershell
# one time: keep pnpm's package store off C:
corepack enable
pnpm config set store-dir E:\.pnpm-store

cd E:\Projects
git clone https://github.com/HaiCLOP/char_titans_tehelka_project.git civicsense
cd civicsense
copy .env.example .env.local   # then fill in the values (ask Arnav)
corepack pnpm install
```

## Environment variables (`.env.local`, never committed)

| Variable | Used by | What |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Supabase project (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | web server, engine | bypasses RLS — server only |
| `AI_KEYS_SECRET` | web, engine | AES-GCM key for API keys stored in `ai_keys` |
| `GEMINI_API_KEYS`, `OPENROUTER_API_KEYS` | web, engine | comma-separated bootstrap keys (OpenRouter: free models only) |
| `SYS_PANEL_PATH`, `SYS_PANEL_EMAILS` | web | secret path segment + email allowlist of the system panel |
| `NEXT_PUBLIC_SITE_URL` | web | optional public base URL for auth redirects |
| `ENGINE_URL`, `ENGINE_SECRET` | web, engine | Go engine address + shared secret; leave `ENGINE_URL` empty to use the in-process TypeScript AI router |
| `ENGINE_PORT` | engine | optional, default 8080 |
| `RESEND_API_KEY`, `RESEND_FROM` | web, engine | invite emails (web) and queued notification emails (engine worker `notification_email`) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | web | optional shared cache for RAG embeddings and agent answers |
| `NEXT_DIST_DIR` | web build | optional build folder (default `.next`), see "Local production build" |

## How to run

1. **Web app** — `corepack pnpm dev` → http://localhost:3000 (only one `next dev` at a time).
2. **Engine** (AI + background workers) — see `engine/README.md` (Go caches must stay on E:):
   ```powershell
   cd engine; go run ./cmd/engine      # http://localhost:8080/health
   ```
   It reads `..\.env.local`. Set `ENGINE_URL=http://localhost:8080` for the web app.
3. **Tunnel** (demo, when the web app runs on Vercel) — `cloudflared tunnel --url http://localhost:8080`, then put the printed `https://….trycloudflare.com` URL in `ENGINE_URL` of the deployment and redeploy/restart.
4. **Warm-up** (before the demo) — compiles the key routes and wakes the engine:
   ```powershell
   corepack pnpm warmup                                   # http://localhost:3000
   corepack pnpm warmup -- --base http://localhost:3300   # another server
   corepack pnpm warmup -- --intake                       # also one engine /v1/intake call (1 AI call)
   ```
   Prints `status` + `ms` for home, `/pulse`, `/map`, `/login`, `/report`, `/admin`, `/api/meta/transitions`, `/api/locations`, `/api/meta/config` and the engine `/health`. It reads `ENGINE_URL` / `ENGINE_SECRET` from the environment or `.env.local` and never prints them. Exit code 1 if anything is down or returns 5xx.

## Local production build (offline backup)

`next build` into `.next` would clobber a running `next dev`, so build into a separate folder (Git Bash):

```bash
NEXT_DIST_DIR=.next-prod corepack pnpm build
NEXT_DIST_DIR=.next-prod corepack pnpm start -p 3300   # http://localhost:3300
```

`.next-prod/` is git- and eslint-ignored.

## Database setup

Fresh Supabase project: apply every migration in `supabase/migrations` **in filename order** (`supabase db push`, or paste each file into the SQL editor in this order), then `supabase/seed.sql`:

1. `20261030000000_init.sql`
2. `20261031000000_privacy_staff.sql`
3. `20261031120000_app_config.sql`
4. `20261031180000_engine_config.sql`
5. `20261031200000_security_hardening.sql`
6. `20261031220000_privacy_columns.sql`
7. `20261031230000_remove_demo.sql`
8. `20261031235000_profile_course.sql`
9. `20261031240000_complaints_admin_view.sql`
10. `20261101000000_staff_skills_autoassign.sql`
11. `20261101030000_review_fixes.sql`
12. `20261101040000_revoke_rls_auto_enable.sql`
13. `20261101050000_anonymous_owners.sql`
14. `20261101060000_real_campus_locations.sql`
15. `20261101070000_notification_fanout.sql`
16. `20261101080000_emergency_auto_assign.sql`
17. `20261101090000_rag_search.sql`
18. `20261101100000_assignment_workflow.sql`
19. `20261101110000_notification_queue.sql` (enables Supabase Queues / pgmq)
20. `supabase/seed.sql`

Any migration added later goes after these, again in filename order. **The shared project (`fszfozblvqtpoobmougu`) already has them — never re-run old migrations there; apply only new files.**

Then make yourself super admin: `update profiles set role = 'super_admin' where id = '<your auth user id>';`

## Known limitations (from the Oct 31 code review)

- **Anonymous reports:** the reporter is stored only in `complaint_owners` (readable by that reporter alone); `complaints.user_id`, event actors and chat senders are empty for anonymous reports. Two small gaps remain: photo storage paths start with the uploader's id, and live updates on "My reports" for one's own anonymous tickets arrive on refresh rather than instantly.
- **AI router cooldowns / circuit breaker** live in memory per process (one web server + one engine on the demo laptop). Rate limits are already shared in Postgres (`hit_rate_limit`).
- **Sensitive reports** can only be assigned to department admins; field staff are blocked by a database trigger and cannot read them.
- **Placeholder data:** campus locations, map positions and emergency numbers in `seed.sql` / `app_config` are placeholders until confirmed by the university.

## Checks (run before every push; CI runs the same)

`corepack pnpm lint` · `corepack pnpm typecheck` · `NEXT_DIST_DIR=.next-prod corepack pnpm build` · `grep -c র messages/as.json` (must print 0) · in `engine/`: `gofmt -l .` (empty), `go vet ./...`, `go test ./...`

## Where things are
- `src/lib/ai/router.ts` — model/key rotation, failover, circuit breaker, logging (TypeScript fallback for the engine)
- `src/lib/ai/intake.ts` — complaint → bilingual structured ticket, embeddings
- `src/lib/domain.ts` — shared enums + Zod schemas
- `engine/` — Go engine: AI router, `/v1/*` endpoints, background workers
- `supabase/migrations` — schema, RLS, RPCs, triggers
- `messages/{en,as}.json` — all UI text
- `scripts/warmup.mjs` — demo warm-up
- `docs/TASKS.md` — who does what, day by day, demo checklist
