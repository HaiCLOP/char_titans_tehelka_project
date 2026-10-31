# CivicSense — Build PRD v4 (source of truth)

> Game of Codes · ANAZORI v16.0 · Dibrugarh University · PS-04 · Demo **4 Nov 2026, 9:30 AM** · Code freeze **3 Nov, 8 PM**
> Team: Arnav (lead, backend + AI, Claude Code) · Devansh (frontend: report + admin) · Darsh (frontend: tracking + system) · Aman (data, QA, pitch)
>
> This file merges our plan with the best rules from "CivicSense Master PRD v3". Where they differ, **this file wins**.
> Read with `AGENTS.md` (coding rules). Every screen, API and rule here maps to code that exists or must be built.

---

## Changes since v4 (31 Oct) — the code wins where the sections below disagree

- **Real auth only.** Demo accounts, the "Demo login" row and `NEXT_PUBLIC_DEMO_MODE` are removed (migration `20261031230000_remove_demo.sql`). Sections 3 (S03), 11.3 and 15 now mean real accounts created ahead of the demo.
- **Monochrome design replaces the three colour themes.** Tea Garden / Brahmaputra / Muga are dropped; only light and dark remain. Colour is used only for meaning (priority P1–P4, success / warning / danger). Section 6 theme text is superseded by `AGENTS.md` styling rules and `PRODUCT.md`.
- **Go backend engine** (`engine/`, stdlib only): AI router port (key rotation, cooldown, circuit breaker, simulate_failure, free-only OpenRouter), `/v1/intake` `/v1/embed` `/v1/similar` `/v1/router/invalidate`, `/health`, and workers (heal pending AI, SLA alerts, auto-close, daily brief). The web app calls it first and falls back to the TypeScript router. Exposed through a Cloudflare tunnel for the demo.
- **Students give a course, not a department** (migration `20261031235000_profile_course.sql`); only staff belong to fixing departments.
- **Auto-assignment** of safe tickets to field staff by skills, building coverage and load (migration `20261101000000_staff_skills_autoassign.sql`, `rank_assignees` / `auto_assign_complaint`); admins see ranked suggestions in S15.
- **Admin dashboard (S13)** is an "Operations center" (needs-attention cards, KPIs with period deltas, high-priority list, mini campus map, recent reports).
- **P1 status:** Ask CivicSense (S16), ticket chat + AI reply draft + resolution check (M8) are built. Campus Pulse (S02), the admin campus map (S17) and the AI daily brief are being finished in M9.
- **Deferred:** PWA, voice input, PDF report, ⌘K palette, MCP server, `/admin/locations` (S19), bulk queue actions, the 40-complaint `seed-demo.ts` script.

## 0. How to use this with Claude Code

1. Open the repo folder in a terminal, run `claude`. It reads `CLAUDE.md` → `AGENTS.md` → this file.
2. Build **one milestone at a time** (section 14). Paste the milestone prompt; review the diff; run `pnpm lint && pnpm exec tsc --noEmit`; test in the browser in **both languages**; commit.
3. Never let it skip: both message files, loading/empty/error states, 360 px width, RLS.

---

## 1. Product in one paragraph

A student photographs or describes a campus problem in **Assamese or English**. AI turns it into a structured bilingual ticket (title, summary, category, priority, location), finds the same issue even if it was reported in the other language, and routes it to the right department with an SLA clock. Admins and field staff work the ticket through a strict lifecycle while the student follows every step live, in their language. Admins see a dashboard, a campus map and can ask an AI agent questions in Assamese.

**Pitch:** "One photo, any language — the right department knows in 5 seconds."

## 2. Judging criteria → what wins each

| Criterion | Marks | What proves it on stage |
|---|---|---|
| Generative AI integration | 25 | Photo-only intake, cross-lingual duplicate merge, agent with tool trace, AI reply draft, resolution photo check, live failover |
| Full stack | 20 | Next.js API + Supabase Postgres/pgvector/RLS/Realtime/Storage, status-transition rules in DB |
| Assamese-English | 20 | Full workflow in each language, Assamese AI output (ৰ/ৱ correct), Assamese digits, Assamese agent answers |
| Innovation & relevance | 15 | Real DU buildings, campus map, SLA + auto-routing, privacy modes |
| Functionality & UX | 15 | Reference design, mobile-first, realtime updates, no dead ends |
| Presentation | 5 | Scripted 6-minute demo (section 15) |

**Mandatory checklist (from PS):** responsive web app ✔ · APIs ✔ · persistent DB ✔ · LLM integration ✔ · Assamese input processed by core AI ✔ · Assamese output ✔ · language switch ✔ · one full workflow in each language ✔ · Unicode Assamese rendering/input/storage ✔ · 3 Assamese + 3 English test scenarios incl. one language-specific ✔ (section 16).

## 3. Product rules (non-negotiable)

1. **AI suggests, people decide — except safe auto-routing.** AI may auto-route a ticket only if: confidence ≥ 0.75, not sensitive, not urgent, not abusive. Everything else goes to `needs_review`. AI never closes, merges silently, or rejects.
2. **Duplicates are suggestions.** The reporter chooses "Me too" or "Submit anyway"; admins can unmerge.
3. **Original text is never overwritten.** AI versions sit next to it.
4. **Privacy is independent controls:** `visibility` (public/private), `anonymous` (hide reporter from admins and public), `is_sensitive` (forces private; admins only).
5. **Urgent content** (fire, injury, violence, medical) → `is_urgent`, priority 1, and the reporter immediately sees the campus emergency/security numbers. We never claim to dispatch help.
6. **Every complaint can be submitted even if all AI is down** (keyword fallback, `ai_status = fallback`).
7. **Every status change** writes a timeline event and a bilingual notification (DB triggers already do this).
8. **Status transitions are enforced in the DB** (section 8.2). The UI only shows valid next actions.

## 4. Roles

| Role | Who | Can |
|---|---|---|
| `student` | Students | Report, track own, see public issues, Me too, chat on own tickets, rate/reopen |
| `staff` | University employees (non-admin) | Same as student |
| `field_staff` | Electrician, plumber, cleaner, hostel warden | See/update tickets **assigned to them**, internal notes, mark resolved with photo |
| `dept_admin` | Head of a section | Everything for their department: triage, assign, status, reply, dashboard, map, agent |
| `super_admin` | Arnav (demo) | Everything + departments + system panel |

Roles are set only by super admin (never self-selected). Demo accounts (section 11.3) cover each role.

## 5. Scope

**P0 — must work by 1 Nov night (core demo):** auth + demo accounts · language & theme switch · report form (text/photo/location/privacy) · AI preview · duplicate check + Me too · submit with auto-routing + SLA · my reports · ticket detail + live timeline · notifications · admin dashboard · admin queue · admin ticket workspace (triage/assign/status) · field staff queue · system panel (keys/models/logs/failover).

**P1 — show-off, by 2 Nov night:** Ask CivicSense agent · bilingual ticket chat · AI reply draft · resolution photo check · campus map · AI daily brief · Campus Pulse (public) · rate & reopen.

**P2 — only if all 6 scenarios pass twice:** voice input · PDF report · PWA · ⌘K command palette · MCP server.

**Out of scope:** multi-institution tenancy, native apps, offline sync, SMS/WhatsApp/email, AI-image-forgery detection, Snowflake.

## 6. Design system

Reference: the green "A Cleaner, Safer, Better Campus" mockup (sidebar, hero photo, KPI cards, illustrated map, AI insights, issue cards, recent activity).

- **Themes:** Tea Garden (default, deep green) · Brahmaputra (blue) · Muga (maroon/gold) × light/dark. Tokens in `src/app/globals.css`; components use token classes only (see AGENTS.md).
- **Shape:** cards `rounded-card` (1rem), buttons/chips `rounded-full`, soft `shadow-sm`, cream background.
- **Type:** Inter + Noto Sans Bengali; Assamese gets line-height 1.6.
- **Priority chips:** P1 Critical `bg-p1` · P2 High `bg-p2` · P3 Medium `bg-p3` · P4 Low `bg-p4` (same in all themes).
- **Status chips:** submitted/triaged/needs_review = neutral · assigned/in_progress = primary · resolved/closed = p4 green · duplicate/rejected = muted.
- **Layouts:** Student = sidebar on desktop, **bottom nav on mobile** (Home, Report [big centre button], My Reports, Map, Profile). Admin = collapsible sidebar + wide content. System panel = minimal dark admin layout.
- **Motion:** framer-motion for list inserts, status chip pulse once on change, view-transition on theme/language switch. Respect reduced motion.
- **Every data screen:** skeleton while loading · friendly empty state with an action · error state with Retry · forbidden state.

### Shared components (build once, Darsh owns `src/components/ui/*`)
`Button` · `Card` · `Chip` (priority/status/category variants) · `Skeleton` · `EmptyState` · `ErrorState` · `Avatar` · `Drawer` (mobile) / `Dialog` · `Tabs` · `Select` · `Combobox` (location search, both languages) · `PhotoDropzone` · `Timeline` · `KpiCard` (value + label + sparkline) · `IssueCard` (photo, priority chip, title, location, supports, time) · `ActivityItem` · `LangText` (picks `_en`/`_as` by locale) · `RelativeTime` (localised, Assamese digits) · `BottomNav` · `AdminSidebar`.

## 7. Screen inventory (25 screens)

Format: **route — who — purpose.** Then layout, data, actions, states, acceptance. Owner in brackets.

### Public & auth

**S01 `/` — everyone — Home** *(Darsh)* — exists as shell
- Layout: sidebar · header (search, language, theme, bell, profile) · hero with real DU photo + "Report an Issue" · 4 KPI cards · campus map preview + AI insights card · "Ongoing issues near you" (4 IssueCards) · Recent activity (5 items).
- Data: `rpc dashboard_stats()`, `complaints_public` latest 4, `complaint_events` joined public latest 5, `daily_brief` cache.
- Signed-out: same page, CTA goes to `/login?next=/report`.
- Accept: numbers live; Assamese digits in Assamese; looks like the reference at 1440 px and stacks cleanly at 360 px.

**S02 `/pulse` — everyone — Campus Pulse** *(Darsh, P1)*
- KPIs (resolved this week, avg resolution hours, open), category bar chart, 14-day trend line, "Recently resolved" feed. Only `complaints_public`. No names, no photos of people.

**S03 `/login` — everyone — Sign in** *(Arnav)*
- Google button · email magic link · **"Demo login" row (5 one-tap accounts)**, shown only when `NEXT_PUBLIC_DEMO_MODE=true`.
- After login → `next` param or role home (student `/`, field staff `/staff`, admins `/admin`).

**S04 `/onboarding` — new users — Setup** *(Devansh)*
- 3 steps: language (big অসমীয়া / English cards) → who are you (student/staff + hostel or department) → done. Saves to `profiles`. Skipped if already set.

### Reporter

**S05 `/report` — student/staff — Report an issue** *(Devansh)* — the most important screen
- Mobile: single scroll page with sticky bottom "Review" button. Desktop: form left, live AI preview card right.
- Fields: **Description** (textarea, any language, mic button P2) · **Photos** (0–3, camera on mobile, compressed in browser to WebP ≤ 400 KB) · **Location** (Combobox over `locations`, searchable in both languages + free-text "where exactly") · **Visibility** (Public / Private toggle, explained in one line) · **Anonymous** switch · **Sensitive** switch ("harassment, safety or personal matter — only admins will see it"; forces private).
- AI preview: after 1.2 s idle with ≥ 15 chars or any photo → `POST /api/ai/analyze` → card shows title, both summaries (tabs EN/অস), category chip, priority chip with reason, detected location. User can edit title/category/priority before submit. Shows "AI unavailable — we'll analyse it shortly" on fallback.
- Duplicate check: on preview, `POST /api/complaints/similar` → if matches, sheet: "Already reported by N people" + top 3 cards (in the user's language even if originally the other language) + **Me too** / **Submit separately**.
- Urgent: if preview `is_urgent` → red banner with campus security/emergency numbers (from `app_config`) above the submit button.
- Submit → `POST /api/complaints` → `/report/done?id=`.
- States: validation (need text or photo), uploading progress per photo, submitting spinner, rate-limit message (5/hour).
- Accept: Assamese text → Assamese+English preview < 6 s; photo-only works; works with AI disabled.

**S06 `/report/done` — Submitted** *(Devansh)*
- Big check, ticket code `CS-XXXXXX`, routed department, SLA "expect action by …", buttons: Track · Report another · Share link.

**S07 `/my` — My reports** *(Darsh)*
- Tabs: Active · Resolved · All. Search box. IssueCards with status chip + SLA countdown. Realtime: chips update without refresh.

**S08 `/c/[id]` — Ticket detail** *(Darsh)*
- Header: code, status chip, priority chip, category, location, created time, SLA countdown.
- Body: photos carousel · title + summary in current language with "Show original" toggle · Timeline (all `complaint_events`, localised) · Chat (P1, non-internal messages, each shown in reader's language with "original" toggle) · "Me too (N)" if public and not own.
- When `resolved`: resolution note + after-photo + **Confirm fixed** (→ closed, 1–5 rating) / **Not fixed** (→ in_progress with reason). Reopen allowed 7 days after closed.
- Access: owner, admins of dept, assignee, or anyone signed-in if public. Otherwise "not found".

**S09 `/notifications` — Notifications** *(Darsh)* — list (bell in header shows unread count, realtime), click → ticket, mark all read.

**S10 `/profile` — Profile** *(Darsh)* — name, avatar, language, theme, dark mode, hostel/department, font size (normal/large), sign out.

**S11 `/map` — Campus map (student)** *(Devansh, P1)* — same map component as S17, public issues only.

### Field staff

**S12 `/staff` — My assigned work** *(Darsh)*
- Mobile-first list of tickets where `assignee_id = me`, sorted by SLA. Card actions: **Start work** (assigned → in_progress) · **Mark resolved** (opens sheet: note + after-photo required) · Add internal note. Same detail page as S08 with staff actions.

### Admin (dept_admin sees own department; super_admin sees all + department filter)

**S13 `/admin` — Dashboard** *(Devansh)*
- Row 1: KpiCards — Open · Overdue (red) · Resolved this week · Avg resolution time · Satisfaction (avg rating).
- Row 2: 14-day trend (created vs resolved, line) · Category split (bar) · Language split (donut-free: two bars EN/AS).
- Row 3: AI daily brief card (P1) · Overdue list (top 5) · Department leaderboard (super admin).
- Data: `dashboard_stats`, `trend_by_day`, `category_breakdown`, `department_load`, `/api/admin/brief`.

**S14 `/admin/queue` — Triage queue** *(Devansh)*
- Table: code · title (locale) · category · priority · status · location · language flag · reporter (or "Anonymous") · SLA (countdown, red when overdue) · assignee.
- Filters: status (default: open statuses), priority, category, department, location, language, date range, "needs review only", search. URL-synced.
- Row click → S15. Bulk: assign department, assign staff, change priority. New tickets slide in via realtime.
- Mobile: becomes card list.

**S15 `/admin/t/[id]` — Ticket workspace** *(Darsh UI, Arnav APIs)*
- Left: everything from S08 + original text + AI meta (model, confidence, priority reason) + internal notes.
- Right rail "Actions": status buttons (only valid next states) · department select · assignee select (field staff of dept) · priority · category · **Similar tickets** (vector matches, Link as duplicate / Unlink) · **Draft reply** (P1: AI writes reply in reporter's language → editable → send as message) · **Check resolution photo** (P1: before/after verdict + reason; advisory) · urgent/sensitive flags.
- Every action → API → toast → timeline updates.

**S16 `/admin/agent` — Ask CivicSense** *(Arnav, P1)*
- Chat UI, streaming. Suggested chips in current language ("Which hostel has the most water complaints this week?", "এই সপ্তাহত কোনটো বিভাগত বেছি অভিযোগ?"). Answers in the question's language; inline chart when the tool returns series; collapsible "How I got this" showing tools called + params.

**S17 `/admin/map` — Campus map** *(Devansh, P1)*
- Illustrated isometric DU campus image as a Leaflet `ImageOverlay` (`CRS.Simple`); markers at `locations.map_x/map_y`; marker size/colour = open count/top priority. Toggle "Illustrated / Street" (OpenStreetMap with lat/lng). Filter rail (category, priority, status, days). Click building → drawer with its tickets.

**S18 `/admin/departments` — Departments** *(Darsh, super admin)* — CRUD departments (bilingual names), category mapping, SLA hours per priority, members (assign dept_admin / field_staff by email).

**S19 `/admin/locations` — Locations** *(Darsh, super admin, P1)* — CRUD buildings: bilingual names, type, lat/lng, map position (click on campus image to set x/y).

### System panel (super admin + email allowlist + secret path `/${SYS_PANEL_PATH}`)

**S20 `/sys-…` — Overview** *(Darsh UI, Arnav API)* — tile per model×purpose: success rate (last 100 calls), p50/p95 latency, last error; tile per key: calls/min, cooldown, failures. Auto-refresh 5 s.

**S21 `/sys-…/keys` — Keys** — table (label, provider, last 4, enabled, RPM, status) · add key (stored encrypted) · enable/disable · **Simulate failure** toggle per key (forces 429 for the demo) · Test all.

**S22 `/sys-…/models` — Model chains** — per purpose: ordered list (drag to reorder), enable/disable, add model (Gemini id or OpenRouter `:free` id / `auto:free`), Test button runs the purpose's test prompt and shows output + latency.

**S23 `/sys-…/logs` — AI logs** — filterable table of `ai_logs`; failover chains grouped (same request) and highlighted.

### Errors
**S24 `not-found`** and **S25 `error`** pages — bilingual, illustration, "Go home".

## 8. Complaint lifecycle

### 8.1 Flow
`submitted` → (AI) → `triaged` (auto-routed) **or** `needs_review` **or** `duplicate` (only if reporter chose Me too: no new ticket is created — we add support instead).
`triaged` → `assigned` (staff picked) → `in_progress` → `resolved` (note + photo) → `closed` (reporter confirms, or auto after 7 days) ; `resolved` → `in_progress` (reporter says not fixed) ; `closed` → `in_progress` (reopen ≤ 7 days) ; any open → `rejected` (admin, reason required) ; `duplicate` → `triaged` (unmerge).

### 8.2 Enforcement
Table `status_transitions` + trigger `enforce_transition` (migration 2). API returns `409 INVALID_TRANSITION`. The UI renders buttons from the same table (`GET /api/meta/transitions`).

### 8.3 SLA
`departments.sla_hours` per priority (default P1 4h · P2 24h · P3 72h · P4 7 days). `sla_due_at` set by trigger. Overdue = past due and still open → red in queue, counted on dashboard. Me too reaching 5 and 10 raises priority by one (trigger).

## 9. AI system

All calls via `runAI(purpose, fn)` in `src/lib/ai/router.ts` (exists). Chains per purpose in `ai_providers`; keys in `ai_keys` (encrypted) + `GEMINI_API_KEYS` / `OPENROUTER_API_KEYS` env. OpenRouter is **free models only** (`:free`, or `auto:free` = discovered at runtime).

| Purpose | Input → Output | Status |
|---|---|---|
| `intake` | text + ≤3 images + location → `IntakeSchema` (+ add `is_urgent`, `is_sensitive_suggested`) | exists (extend) |
| `embed` | `summary_en` → 768-d vector (gemini-embedding-001) | exists |
| `dedup_verify` | two summaries → `{same: boolean, reason}` | to build |
| `agent` | question + tools → streamed answer + tool trace | to build |
| `reply_draft` | ticket + status + reporter language → reply text | to build |
| `translate_msg` | chat message → other language | to build |
| `resolution_check` | before + after photo → `{verdict: resolved|not_resolved|unclear, reason_en, reason_as}` | to build |
| `daily_brief` | last 24 h stats → 3 bullets EN + AS (cached 1 h) | to build |

**Assamese quality gate (no native reviewer on team):** (1) reject Bengali র in Assamese output → strict retry (exists); (2) glossary injected in prompts (exists, `glossary.ts`); (3) back-translation check in tests (`scripts/eval-assamese.ts`, ≥ 0.85 similarity); (4) UI strings frozen after the gate; (5) ask any Assamese speaker at the venue for a 5-minute read.

**Agent tools (read-only, scoped to the admin's department server-side):** `stats(days)` → dashboard_stats · `trend(days)` · `top_locations(days, category?)` · `by_category(days)` · `department_load()` · `list_complaints(filters, limit≤20)` · `get_complaint(code)`. The model never writes SQL. Max 4 tool steps.

**Duplicate detection:** embed summary → `match_complaints(threshold 0.80, location filter if chosen, 14 days)` → top 1–3 → `dedup_verify` on the top candidate for a confidence label. Shown to reporter (S05) and admin (S15).

## 10. API contracts

Conventions: JSON; Zod-validated in and out; errors `{ error: { code, message } }` with codes `VALIDATION_ERROR 400 · UNAUTHENTICATED 401 · FORBIDDEN 403 · NOT_FOUND 404 · INVALID_TRANSITION 409 · RATE_LIMITED 429 · AI_UNAVAILABLE 503 · INTERNAL 500`. Use the user's Supabase client (RLS) unless noted. Helper `src/lib/api.ts`: `ok(data)`, `fail(code, msg)`, `requireUser()`, `requireRole(...)`.

| Method & route | Body / query | Returns | Who |
|---|---|---|---|
| `POST /api/ai/analyze` ✅ | `{text, images[dataURL], locationName?}` | `{intake, source, model, ms}` | signed in |
| `POST /api/complaints/similar` | `{text_en? , summary_en, location_id?}` | `[{id, code, title_en, title_as, status, metoo_count, similarity}]` | signed in |
| `POST /api/upload` | multipart image | `{path}` in `complaint-photos/{uid}/…` | signed in |
| `POST /api/complaints` | `{text, image_paths[], location_id?, location_note?, visibility, anonymous, is_sensitive, intake (edited preview)}` | `{id, code, department, sla_due_at, status}` | signed in, rate-limited 5/h |
| `GET /api/complaints` | `?scope=mine|public|dept|assigned&status&priority&category&location&lang&q&cursor` | `{items, nextCursor}` | by scope |
| `GET /api/complaints/[id]` | — | detail + signed photo URLs + events | RLS |
| `PATCH /api/complaints/[id]` | `{status?, priority?, category?, department_id?, assignee_id?, note?, reason?}` | updated row | admin / assignee (status only) |
| `POST /api/complaints/[id]/support` | — | `{metoo_count}` | signed in, public tickets |
| `POST /api/complaints/[id]/resolve` | `{note, photo_path}` | row | assignee / admin |
| `POST /api/complaints/[id]/verify` | `{fixed: boolean, rating?, reason?}` | row | reporter |
| `POST /api/complaints/[id]/link` | `{parent_id}` or `{unlink: true}` | row | admin |
| `GET/POST /api/complaints/[id]/messages` | `{body, internal?}` | messages (translated) | owner/admin/assignee |
| `POST /api/complaints/[id]/reply-draft` | — | `{text, lang}` | admin |
| `POST /api/complaints/[id]/check-resolution` | — | `{verdict, reason_en, reason_as}` | admin |
| `GET /api/admin/stats` | `?days` | stats + trend + categories + load | admin |
| `GET /api/admin/brief` | — | `{en[], as[], generated_at}` | admin |
| `POST /api/admin/agent` | AI SDK chat messages | stream | admin |
| `GET /api/meta/transitions` | — | allowed transitions | anyone |
| `GET /api/locations` | `?q` | locations | anyone |
| `GET/POST/PATCH/DELETE /api/sys/keys` | `{label, provider, key, rpm_limit, enabled, simulate_failure}` | keys (masked) | super admin + allowlist |
| `GET/POST/PATCH /api/sys/models` | chain edits | chains | same |
| `POST /api/sys/test` | `{purpose}` | output + attempts | same |
| `GET /api/sys/health` | — | per model/key stats | same |
| `GET /api/sys/logs` | filters | logs | same |

**Submit pipeline (`POST /api/complaints`):** validate → rate limit → if no `intake` passed, run intake → embed (parallel) → choose department by category (`departments.categories`) → decide status (`triaged` if safe-auto-route rule, else `needs_review`) → insert (user client) → store embedding + ai_meta (admin client) → return. If AI fails: insert with fallback intake, `ai_status='fallback'`, `needs_review`.

## 11. Data

### 11.1 Schema
`supabase/migrations/20261030000000_init.sql` and `20261031000000_privacy_staff.sql` (tested). Tables: profiles, departments, locations, complaints, complaint_events, complaint_supporters, messages, notifications, status_transitions, ai_providers, ai_keys, ai_logs, ai_cache. Views: complaints_admin (hides anonymous reporter), complaints_public. RPCs: match_complaints, dashboard_stats, trend_by_day, top_locations, category_breakdown, department_load, support_complaint, check_rate_limit.

**Still to add (Arnav, migration 3):** `app_config` (key/value: emergency numbers, demo mode) · `ai_keys.simulate_failure boolean` · `profiles.font_size`.

### 11.2 Seed (Aman owns the data, Arnav loads it)
- 8 departments (exists, confirm names), 10+ real DU locations with lat/lng and map x/y.
- 40 complaints over the last 14 days: 20 Assamese, 20 English, all categories, mixed statuses, 6 with photos, 5 duplicate pairs across languages.
- `scripts/seed-demo.ts` creates them through the real pipeline (so they have embeddings and AI summaries).

### 11.3 Demo accounts (password login, shown on `/login` in demo mode)
| Name | Role | Language | Use in demo |
|---|---|---|---|
| Priya Gogoi | student (Girls Hostel) | Assamese | reports in Assamese |
| Rahul Sharma | student | English | reports duplicate in English |
| Bikash Saikia | field_staff (Water & Sanitation) | Assamese | fixes issue |
| Mr. Dutta | dept_admin (Water & Sanitation) | English | triage, agent |
| Arnav | super_admin | English | system panel |

## 12. Non-functional targets
AI preview p95 < 6 s · submit < 3 s (+AI) · dashboard < 1.5 s · dedup search < 100 ms · realtime update < 2 s · LCP < 2 s on 4G · works at 360 px · WCAG AA contrast in all 6 theme variants · zero English strings in Assamese core flow.

## 13. Security
RLS everywhere (done) · service role only in `src/lib/supabase/admin.ts` · API keys AES-GCM encrypted, never sent to browser · system panel = secret path + super_admin + email allowlist · rate limits (5 complaints/h, 30 agent q/h) · photos private, signed URLs 1 h · anonymous reporter hidden via view · sensitive forced private (DB constraint) · Zod everywhere · no secrets in git (checked before every push).

## 14. Build milestones (paste into Claude Code one at a time)

Each milestone ends with: lint + typecheck pass, both languages checked, committed, pushed.

**M1 — Auth & demo accounts (Arnav, 31 Oct AM)**
> Read docs/PRD.md sections 4, 7 (S03, S04), 11.3. Add migration 3 (app_config, ai_keys.simulate_failure, profiles.font_size). Build `/login` with Google + magic link + demo-account buttons (NEXT_PUBLIC_DEMO_MODE), `scripts/create-demo-users.ts` using the service role, role-based redirect, `src/lib/api.ts` helpers, `src/lib/auth.ts` (getUser, getProfile, requireRole). Add bilingual strings.

**M2 — Shared UI kit + mocks (Darsh + Arnav, 31 Oct noon)**
> Build the shared components in docs/PRD.md section 6 under src/components/ui using theme tokens only. Add BottomNav and AdminSidebar layouts. Create `src/lib/mock.ts` returning typed fake data for every API in section 10 so screens can be built before APIs exist.

**M3 — Report flow (Devansh + Arnav)**
> Build S05 and S06 exactly as specified, and APIs /api/upload, /api/complaints/similar, POST /api/complaints with the submit pipeline in section 10. Extend IntakeSchema with is_urgent and is_sensitive_suggested.

**M4 — Tracking (Darsh)**
> Build S07, S08, S09, S10 with realtime (Supabase channels) and GET /api/complaints, /api/complaints/[id], support, verify.

**M5 — Admin core (Devansh + Darsh + Arnav)**
> Build S13, S14, S15 (without P1 rail items), S12, PATCH/resolve/link APIs, /api/admin/stats, /api/meta/transitions.

**M6 — System panel (Darsh + Arnav)**
> Build S20–S23 and /api/sys/*. Simulate-failure must make the router treat that key as rate-limited. Invalidate router cache on change.

**— P0 gate: all 6 scenarios in section 16 pass. Deploy to Vercel. —**

**M7 — Agent (Arnav)** S16 + /api/admin/agent with the tools in section 9.
**M8 — Chat, reply draft, resolution check (Arnav + Darsh)** S08 chat, S15 rail items.
**M9 — Map + Pulse + brief (Devansh + Darsh)** S11, S17, S02, daily brief.
**M10 — Polish & hardening (all, 3 Nov)** empty/error states audit, 360 px audit, theme audit, Assamese audit, warm-up script, local production build test.

## 15. Demo script (6 min, two screens: phone mirrored + laptop)

| Time | Presenter | Action | Proves |
|---|---|---|---|
| 0:00 | Aman | Real DU photo: "Complaints get lost, duplicated, ignored." | Relevance |
| 0:30 | Arnav (phone as Priya) | Switch to অসমীয়া, photo + "হোষ্টেলৰ বাথৰুমত তিনিদিন ধৰি পানী নাই" → preview in both languages → submit → routed to Water & Sanitation, SLA shown | Assamese AI, multimodal |
| 1:30 | Arnav (phone as Rahul) | English: "No water in girls hostel washroom" → "Already reported" (Assamese ticket shown in English) → Me too | Cross-lingual dedup |
| 2:15 | Arnav (laptop as Mr. Dutta) | Ticket arrived live, dashboard, map, assign Bikash | Full stack, realtime |
| 3:00 | Arnav | Draft reply → arrives in Assamese on Priya's phone | Bilingual output |
| 3:40 | Arnav | Agent: "এই সপ্তাহত কোনটো হোষ্টেলত পানীৰ অভিযোগ বেছি?" → Assamese answer + chart + tool trace | Agent, grounded |
| 4:30 | Arnav | System panel: simulate key failure → submit again → works, log shows failover | Reliability |
| 5:10 | Arnav (as Bikash) | Resolve with after-photo → AI check → Priya confirms + rates | Lifecycle |
| 5:40 | Aman | Architecture slide, impact, close | Clarity |

Backup: pre-recorded video, local production build, second hotspot.

## 16. Test scenarios (must pass twice in a row before freeze)

| ID | Lang | Input | Expected |
|---|---|---|---|
| EN1 | English | "Water leaking from the ceiling on the library 2nd floor" | plumbing, P2, Estate & Maintenance, Assamese summary correct |
| EN2 | English | Photo of overflowing bin, no text | sanitation, location from picker, AI-written title |
| EN3 | English | Agent: "Which hostel had the most complaints this week?" | Correct number from DB + chart |
| AS1 | Assamese | হোষ্টেলৰ বাথৰুমত তিনিদিন ধৰি পানী নাই | water_supply, P2, both summaries, Assamese has ৰ not র |
| AS2 *(language-specific)* | Assamese | Same issue as an existing English ticket | Shown as duplicate across languages; Me too works |
| AS3 | Assamese | Agent: এই সপ্তাহত কোনটো বিভাগত আটাইতকৈ বেছি অভিযোগ আহিছে? | Assamese answer, correct data |
| NEG1 | — | All AI keys disabled | Complaint still submits, "AI pending" shown |
| NEG2 | — | Student opens another student's private ticket URL | Not found |
| NEG3 | — | "Someone is threatening me near the gate" | urgent + sensitive suggested, private, emergency numbers shown |

## 17. Risks

| Risk | Mitigation |
|---|---|
| Gemini free-tier limits during demo | 4 keys rotating + OpenRouter free fallback + cache |
| Assamese quality | Quality gate (section 9), glossary, venue read-through |
| Venue internet | Two hotspots, local production build |
| Antigravity/Claude Code drift from conventions | AGENTS.md, shared components, PR review by Arnav |
| Scope creep | P0 gate before any P1; freeze 3 Nov 8 PM |
| Merge conflicts | Folder ownership in AGENTS.md, daily merges |

## 18. Open items
- [ ] Demo slot length, slides required, projector/HDMI, hotspots allowed (Aman → coordinators)
- [ ] Real DU building list + coordinates + campus photo (Aman, 31 Oct)
- [ ] Campus emergency/security numbers for `app_config` (Aman)
- [ ] Illustrated campus image for the map (Devansh, generate 31 Oct)
