# CivicSense — Campus Together

Bilingual (অসমীয়া + English) AI-powered campus issue management for Dibrugarh University.
Game of Codes · ANAZORI v16.0 · PS-04. Team: Arnav, Devansh, Darsh, Aman.

## Setup (Windows, keep everything on E:)

```powershell
# one time: keep pnpm's package store off C:
corepack enable
pnpm config set store-dir E:\.pnpm-store

cd E:\Projects
git clone https://github.com/HaiCLOP/char_titans_tehelka_project.git civicsense
cd civicsense
copy .env.example .env.local   # then fill in the values (ask Arnav)
pnpm install
pnpm dev                       # http://localhost:3000
```

## Database (Arnav, once)
Supabase dashboard → SQL Editor → run in order:
1. `supabase/migrations/20261030000000_init.sql`
2. `supabase/migrations/20261031000000_privacy_staff.sql`
3. `supabase/seed.sql`

Then make yourself super admin: `update profiles set role = 'super_admin' where id = '<your auth user id>';`

## Scripts
`pnpm dev` · `pnpm build && pnpm start` (local production build = demo backup) · `pnpm lint` · `pnpm exec tsc --noEmit`

## Where things are
- `src/lib/ai/router.ts` — model/key rotation, failover, circuit breaker, logging
- `src/lib/ai/intake.ts` — complaint → bilingual structured ticket, embeddings
- `src/lib/domain.ts` — shared enums + Zod schemas
- `supabase/migrations` — schema, RLS, RPCs, triggers
- `messages/{en,as}.json` — all UI text
- `docs/TASKS.md` — who does what, day by day

Rules for humans and AI agents: **read `AGENTS.md` first.**
