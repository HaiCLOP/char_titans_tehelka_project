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
- [ ] Arnav: run migrations on Supabase; enable Google provider + redirect URLs; assign first super_admin via SQL
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
