<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# CivicSense — rules for AI coding agents (Antigravity, Claude, Copilot)

Bilingual (Assamese + English) AI campus issue manager for the Game of Codes hackathon (4 Nov 2026).
PRD: `docs/PRD.md` (source of truth)

## Stack (do not add libraries without asking Arnav)
Next.js 16 App Router + TypeScript strict · Tailwind v4 · next-intl · Supabase (Postgres + pgvector, Auth, Storage, Realtime) ·
Vercel AI SDK v7 (`generateText` + `Output.object`, NOT `generateObject`) · Zod v4 · TanStack Query · lucide-react · sonner · framer-motion · recharts.

## Next 16 specifics
- `src/proxy.ts` replaces `middleware.ts`. Don't create middleware.ts.
- `cookies()`, `headers()`, `params` are async — always `await`.

## Language rules (judges check these)
- NEVER hardcode user-facing text. Add the key to BOTH `messages/en.json` and `messages/as.json`.
- Server components: `getTranslations()`; client components: `useTranslations()`.
- Assamese uses ৰ (U+09F0) and ৱ (U+09F1). Bengali র (U+09B0) is a bug. Check: `grep -c র messages/as.json` must be 0.
- Language is a cookie (`cs_locale`), not a URL prefix. Switch = set cookie + `router.refresh()`.
- Numbers in Assamese UI: `toLocaleDigits(n, locale)` from `@/lib/utils`.
- Every DB text the user sees has `_en` and `_as` columns — pick by locale.

## Styling rules
- Use theme tokens only: `bg-background bg-surface bg-surface-muted text-foreground text-muted-foreground border-border bg-primary text-primary bg-primary-soft text-accent`, priority colours `bg-p1..p4`. No raw hex colours in components.
- Cards: `rounded-card border border-border bg-surface p-5 shadow-sm`. Buttons: `rounded-full`.
- Must work at 360 px wide and in all 3 themes × light/dark. Design reference: see PRD "UI/UX and theme system".
- Every list: loading skeleton, empty state, error state.

## Data rules
- Server code: `createClient()` from `@/lib/supabase/server` (RLS applies). Only Arnav's API code uses `createAdminClient()`.
- Client code: `@/lib/supabase/client`. Never import anything `server-only` into a client component.
- Shared types/enums/schemas live in `src/lib/domain.ts` — import, don't redefine.
- Schema changes = new file in `supabase/migrations/` (Arnav reviews).

## AI rules
- Every model call goes through `runAI()` in `src/lib/ai/router.ts` (key rotation + failover + logging). Never call a provider directly.
- OpenRouter: FREE models only (`:free` suffix); the router refuses paid ones.
- AI output must be validated with a Zod schema.

## Folder ownership (avoid merge conflicts)
- Arnav: `src/lib/ai`, `src/lib/supabase`, `src/app/api`, `supabase/`
- Devansh: `src/app/report`, `src/app/admin` (dashboard, queue, map), `src/components/report`, `src/components/admin`
- Darsh: landing, `src/app/my`, `src/app/c`, notifications, profile, `src/app/sys-*` UI, `src/components/ticket`, `src/components/system`
- Shared (`src/components/shell`, `globals.css`, `messages/*`): small PRs, tell the team.

## Git
Branch `feature/<name>-<thing>`, PR into `main`, Arnav reviews. Pull `main` every morning. Never commit `.env.local`.
