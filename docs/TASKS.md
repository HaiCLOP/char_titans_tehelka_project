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
- [x] M2: shared UI kit `src/components/ui/*` (+ barrel), `BottomNav` + `(student)` route-group layout, `AdminSidebar` + `/admin` layout/placeholder, `src/lib/mock.ts` (typed mocks for every PRD §10 API), `src/lib/image.ts` (WebP ≤ 400 KB), `src/lib/search.ts`, `src/lib/lang.ts`, dev gallery `/dev/ui`
- [ ] Arnav: test engine against live Gemini/OpenRouter/Supabase; cloudflared tunnel dry run
- [x] Arnav (M3 backend): `/api/upload`, `/api/complaints/similar` (engine first, public tickets only), `POST /api/complaints` submit pipeline, `/api/locations`, `/api/meta/config`
- [x] Arnav (M4 backend): `GET /api/complaints` (mine/public/dept/assigned, keyset pages), `GET /api/complaints/[id]`, support, verify, notifications list + mark read, `PATCH /api/profile`
- [x] Arnav: migration 5 security hardening (match_complaints public-only, RPC grants, status_transitions readable, search_path); Tailwind wired into Turbopack (`next.config.ts`)
- [ ] M3 + M4 screens: `/report`, `/report/done`, `/my`, `/c/[id]`, `/notifications`, `/profile`
- [ ] Migration 6: column-restricting update trigger (owner/assignee), stop full-row public reads (`complaints public read`), notifications `with check`
- Arnav: `/api/complaints` (intake + dedup + routing); mocks in `src/lib/mock.ts` by noon; deploy to Vercel
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
