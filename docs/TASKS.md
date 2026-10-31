# Tasks — freeze 3 Nov 8 PM

Full spec: `docs/PRD.md` (build milestones in section 14)

## Done (30 Oct, Arnav)
- [x] Next 16 scaffold, Tailwind v4 theme tokens (Tea Garden / Brahmaputra / Muga × light/dark), live switchers
- [x] Bilingual i18n (en/as), Assamese font, Assamese digits helper
- [x] Supabase clients + session proxy
- [x] DB schema: 13 tables, RLS, triggers (SLA, events, bilingual notifications, Me too), RPCs (dedup match, dashboard, trends, top locations, dept load), storage buckets, realtime — tested on real Postgres
- [x] AI router: Gemini key rotation + free-only OpenRouter fallback, circuit breaker, logs
- [x] AI intake (text + photo → bilingual ticket) with Assamese drift retry + keyword fallback; `/api/ai/analyze`
- [x] Home shell in the reference design

## 31 Oct
- [x] Arnav (M1): migration 3 (`app_config` + emergency/security number placeholders, `ai_keys.simulate_failure`, `profiles.font_size`, `profiles.onboarded_at`); `/login` (Google + email magic link), `/auth/callback`, sign-out action, role-based redirect + onboarding redirect; `src/lib/api.ts` + `src/lib/auth.ts` helpers. **Demo accounts / demo login dropped by request — real auth only.**
- [x] Arnav: run migrations 1–4 + seed on Supabase (via Supabase MCP)
- [x] Security-advisor fixes (RPC grants, match_complaints privacy, status_transitions read policy) — migration 5 `20261031200000_security_hardening.sql`
- [ ] Arnav: enable Google provider + redirect URLs in Supabase Auth; assign first super_admin via SQL
- [x] Arnav: Go backend engine (`engine/`, stdlib only): AI router port (key rotation, cooldown, breaker, simulate_failure, free-only OpenRouter), `/v1/intake` `/v1/embed` `/v1/similar` `/v1/router/invalidate`, `/health` `/metrics`, workers (heal_pending_ai, sla_alerts, auto_close, daily_brief); migration 4 (`complaints.sla_alerted_at`); web `analyzeComplaint()` calls engine first, falls back to TS router; intake gains `is_urgent` + `is_sensitive_suggested`
- [x] M2: shared UI kit `src/components/ui/*` (+ barrel), `BottomNav` + `(student)` route-group layout, `AdminSidebar` + `/admin` layout/placeholder, `src/lib/image.ts` (WebP ≤ 400 KB), `src/lib/search.ts`, `src/lib/lang.ts` (mocks + `/dev/ui` gallery since removed)
- [ ] Arnav: test engine against live Gemini/OpenRouter/Supabase; cloudflared tunnel dry run
- [x] Arnav (M3 backend): `/api/upload`, `/api/complaints/similar` (engine first, public tickets only), `POST /api/complaints` submit pipeline, `/api/locations`, `/api/meta/config`
- [x] Arnav (M4 backend): `GET /api/complaints` (mine/public/dept/assigned, keyset pages), `GET /api/complaints/[id]`, support, verify, notifications list + mark read, `PATCH /api/profile`
- [x] Arnav: migration 5 security hardening (match_complaints public-only, RPC grants, status_transitions readable, search_path); Tailwind wired into Turbopack (`next.config.ts`)
- [x] M3 + M4 screens: `/report` (AI preview, dedup drawer + Me too, urgent banner, per-photo upload progress), `/report/done`, `/my` (realtime), `/c/[id]` (timeline, verify/reopen, Me too; realtime for owner/staff, polling otherwise), `/notifications`, `/profile`, header bell component, root `not-found` + `error`
- [x] Demo cleanup: removed `/dev/ui`, `src/lib/mock.ts`, `public/mock/`; migration `20261031230000_remove_demo.sql` (drops `app_config.demo_mode`, applied live)
- [x] S04 `/onboarding` (language → about you → done; saves via `PATCH /api/profile`, no redirect loop)
- [x] S11 `/map` (schematic campus plan from `locations.map_x/map_y`, open public issues per building, category + fixed-in-7-days filters in URL, sortable building list, Drawer per building)
- [x] M5 (admin core + field staff): `PATCH /api/complaints/[id]`, `/resolve`, `/link`, `/similar` (admin, private in reach), `/notes` (internal), `/api/upload/resolution`, `/api/admin/stats`, `/api/admin/staff`, `/api/meta/transitions`, `src/lib/admin.ts`; screens `/admin` (S13), `/admin/queue` (S14, realtime, URL filters), `/admin/t/[id]` (S15 without P1 rail items), `/staff` (S12); admin sidebar trimmed to working pages; field-staff "My work" nav item. Bulk queue actions skipped.
- [x] Migration 10 (`20261101000000_staff_skills_autoassign.sql`, applied live): `profiles.skills / coverage_location_ids / active / last_assigned_at`, `profiles_guard` (only super admin changes role/department/skills/coverage/active; staff may set own department; no self-demote), `rank_assignees()` (skills + buildings + load), `auto_assign_complaint()` (service role, safe tickets only, bilingual event + assignee notification), email lookup RPCs; guard + scoring proven in a rolled-back SQL test
- [x] S18 `/admin/departments` (super admin): department CRUD (bilingual names, categories, SLA hours) + members panel (add by email, role, skills, building coverage, activate/deactivate, open jobs); APIs `/api/admin/departments[/id]`, `/api/admin/members[/id]`; sidebar item (super admin only)
- [x] Auto-assign safe tickets in the submit pipeline (`src/lib/assign.ts`); workspace ranked suggestions with one-click Assign + "Auto-assigned" reason (`GET /api/complaints/[id]/assignees`); queue "Auto" marker
- [x] M6 (system panel): S20 overview (engine + web router state, per model×purpose success/p50/p95/last error from the last 100 calls, per key calls/min, cooldown, failures; 5 s refresh), S21 keys (add encrypted, enable/disable, **Simulate failure**, delete, Test all; env keys read-only), S22 model chains (reorder, enable/disable, add with free-only OpenRouter check, remove, Test through the real router), S23 AI logs (filters, keyset pages, failover chains grouped); `/api/sys/{health,keys,keys/test,models,test,logs}`; access = secret path rewrite in `src/proxy.ts` + super_admin + SYS_PANEL_EMAILS, else 404 (`src/lib/sys.ts`); TS router honours `ai_keys.simulate_failure` like the engine, `invalidateRouterCache()` + engine `/v1/router/invalidate` after every change
- [x] M8 (chat, reply draft, resolution check): bilingual ticket chat `GET/POST /api/complaints/[id]/messages` (owner / dept admins / assignee via RLS, non-internal only, auto-detected language, `translate_msg` translation stored in `body_translated` (best effort), 20 msgs / 10 min, new-message notification to the other side, realtime INSERT+UPDATE); `POST /api/complaints/[id]/reply-draft` (`reply_draft`, reporter's language, status/department/SLA facts only, Assamese drift guard); `GET/POST /api/complaints/[id]/check-resolution` (`resolution_check`, before vs after photo, advisory, saved to `ai_meta.resolution_check`); `src/lib/assist/*`; `TicketChat` mounted on `/c/[id]` (S08); `ReplyDraftPanel` + `ResolutionCheckPanel` for the S15 rail; live-tested against Gemini
- [x] M7 Ask CivicSense (S16): `/admin/agent` chat (suggestion chips per language, answers in the question's language, inline bar/line chart from tool data, "How I got this" trace, loading/error+retry/empty, sticky composer at 360 px) + `POST /api/admin/agent` (admins, 30 questions/h in-memory per instance). `src/lib/agent/*`: 7 read-only Zod-validated tools scoped server-side (dept_admin = own department, super_admin = all or picked; department_load only for super admin viewing all), ≤ 4 tool rounds through `runAI("agent")`, grounded prompt + glossary, Bengali-ra drift guard (strict retry, then replace with ৰ). Tested live on Gemini with a temporary dataset (deleted).
- [x] M9 (map + pulse + brief): S17 `/admin/map` (base-table tickets in the admin's scope incl. private/sensitive via RLS, URL filters status group / 1-7-30 days / priority / category / department for super admin, size = open count, ring = top priority, Drawer → `/admin/t/[id]`; reuses `CampusMap` via props; admin sidebar points to it); S02 `/pulse` (signed-out OK; fixed this week, avg hours to fix, open now, 14-day trend, 30-day category bars, recently fixed from `complaints_public`; rail item + home link); daily brief `GET /api/admin/brief` (`src/lib/brief.ts`: engine cache → `daily_brief:<dept|all>` 1 h cache, `runAI("daily_brief")` from aggregates only, quiet-day flag, Zod, Bengali-ra drift guard) + `AdminBriefCard` on `/admin` and cached campus brief on the home aside; live-tested on Gemini
- [x] Migration 6 (`20261031220000_privacy_columns.sql`): column-restricting update trigger (owner/assignee), full-row public reads dropped (`complaints_public` + `public_complaint_events()`), notifications `with check`
- Arnav: `/api/complaints` (intake + dedup + routing); deploy to Vercel
- Devansh: `/report` form (text, 3 photos compressed, building combobox, AI preview card, duplicate prompt), `/report/done`, onboarding
- Darsh: landing polish, `/my`, `/c/[id]` ticket + timeline, notifications bell (realtime)
- Aman: real DU buildings (+ coordinates), departments, SLA hours; 40 seed complaints (20 Assamese); 10 campus photos; hero photo; ask coordinators about demo slot / projector / hotspot

## 1 Nov
- Arnav: agent + tools, reply draft, message translation, daily brief
- Devansh: admin dashboard + charts, queue table
- Darsh: admin ticket workspace, system panel (keys, models, logs)
- Aman: Assamese string review via quality gate, test sheet

## 2 Nov
- Arnav: resolution check, safety filter, retry job · Devansh: campus map, ⌘K, mobile · Darsh: chat UI, Campus Pulse, departments · Aman: test round 1, deck, backup video

## 3 Nov
- Everyone: bug fixes · Aman: 2 full rehearsals · 8 PM freeze

## M10 — polish & hardening (31 Oct)
- [x] Empty / loading / error audit: route-level `loading.tsx` + `error.tsx` (Retry + Go home) inside the student, staff and admin shells (`src/components/segment-states.tsx`); every TanStack list already had skeleton / empty / error + Retry
- [x] 360 px audit: no horizontal scroll on the audited pages (except `/map`, see below); tap targets ≥ 40 px (small buttons, tabs, language switch, header logo, dialog close, photo remove, queue toggle, agent scope select); the report sticky bar never covers content; dialogs cap at 88dvh with a pinned action footer
- [x] Theme audit: AA contrast for body and muted text on every surface in light + dark; light `--success` / `--warning` darkened for AA on their soft chips; new `--danger-foreground` (white in light, near-black in dark) for danger buttons and the emergency call button; small text moved from `subtle-foreground` to `muted-foreground`; no raw hex in components
- [x] Assamese audit: `grep -c র messages/as.json` = 0, en/as key sets identical, no hardcoded JSX strings, Assamese digits in the agent trace and the ops KPI deltas / mini-map counts; Bengali র in code only inside drift guards and search folding
- [x] Warm-up script `scripts/warmup.mjs` (`pnpm warmup`)
- [x] Local production build in `.next-prod` (`NEXT_DIST_DIR`) + smoke test on :3300
- [x] Security quick pass: no secrets in git history, `.env.local` ignored, every `/api` route checks auth/role; Supabase advisors reviewed
- [x] CI (`.github/workflows/ci.yml`): lint, typecheck, build, gofmt, go vet, go test
- [x] `/map` overflow fixed by the canvas campus map (labels are drawn inside the canvas). Remaining at 360 px: the signed-out Assamese header (`ছাইন ইন কৰক` button) is ~7 px too wide — shell owner
- [x] Real campus map kit: `public/campus/` (trimmed map-data.json, characters, ATTRIBUTION.txt), migration `20261101060000_real_campus_locations.sql` (83 real places, 10 placeholders updated in place, `profiles.avatar_character`), `CampusAtlas` canvas renderer on /map, /admin/map and the /admin mini map, pixel-character avatars + profile picker. name_as of the 83 places still needs a native-speaker read

## Deferred (not in the demo)
- Deferred: P2 voice input, PDF report, PWA, ⌘K command palette, MCP server
- Deferred: `/admin/locations` (S19) — locations are edited in SQL / seed for now
- Deferred: bulk queue actions (S14)
- Deferred: 40 seed complaints through the real pipeline (`scripts/seed-demo.ts`) — the demo uses live reports

## Demo checklist (PRD §15 → what to open)
Before: web, engine and tunnel running; `pnpm warmup -- --intake` on the demo laptop; phone signed in as the Assamese reporter, a second phone/profile as the English reporter, laptop as the department admin, another browser profile as super admin, field staff account on a phone.

| Time | Step | Screen / URL |
|---|---|---|
| 0:00 | Problem statement | slide |
| 0:30 | Assamese report with photo → bilingual preview → submit, routed + SLA | phone: language switch in the top bar → `/report` → `/report/done?id=…` |
| 1:30 | English duplicate → "Already reported" (Assamese ticket shown in English) → Me too | second reporter: `/report` duplicate drawer |
| 2:15 | Ticket arrives live, dashboard, map, assign field staff | laptop: `/admin` (Operations center) → `/admin/queue` → `/admin/map` → `/admin/t/<id>` (assign / ranked suggestions) |
| 3:00 | Draft reply → arrives in Assamese for the reporter | `/admin/t/<id>` Draft reply → phone `/c/<id>` chat + `/notifications` |
| 3:40 | Agent question in Assamese → answer + chart + tool trace | `/admin/agent` |
| 4:30 | Simulate key failure → submit again → failover in logs | `/<SYS_PANEL_PATH>/keys` (Simulate failure) → phone `/report` → `/<SYS_PANEL_PATH>/logs` |
| 5:10 | Field staff resolves with after-photo → AI check → reporter confirms + rates | staff phone `/staff` → `/admin/t/<id>` Check resolution → phone `/c/<id>` Confirm fixed |
| 5:40 | Architecture + impact | slide; public `/pulse` |
