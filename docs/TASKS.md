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
- [ ] Arnav: enable Google provider + redirect URLs; assign first super_admin via SQL; security-advisor fixes (RPC grants, match_complaints privacy, status_transitions read policy)
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
- [ ] Migration 6: column-restricting update trigger (owner/assignee), stop full-row public reads (`complaints public read`), notifications `with check`
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
