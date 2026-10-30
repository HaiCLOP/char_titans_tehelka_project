# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Reporters:** Dibrugarh University students and staff, mostly on phones, reporting a campus problem (water, power, sanitation, safety…) in Assamese or English, often with a photo, then following it until it is fixed.
- **Field staff:** electricians, plumbers, cleaners, wardens who work the tickets assigned to them, mostly on phones.
- **Department admins / super admin:** heads of sections on laptops who triage, assign and watch SLAs, the map and an AI assistant.
- **Hackathon judges** (Game of Codes, 4 Nov 2026, PS-04) watch a live demo on a mirrored phone and a laptop. Both the student flow and the admin flow are judged equally.

## Product Purpose
Turn one photo or sentence in any language into a structured bilingual ticket that reaches the right department with an SLA clock, and let the reporter follow every step live in their own language. Success: a complaint is understood, deduplicated across languages, routed and resolved, and nobody has to retype or translate anything.

## Positioning
Assamese is a working language, not a translated skin: the AI reads Assamese input, writes Assamese output (ৰ/ৱ, never Bengali র), and matches the same issue reported in the other language. Built around real DU buildings and departments.

## Operating Context
Campus outdoors and in hostels on mid-range Android phones (360 px wide, 4G); offices on laptops. Demo runs from a Windows laptop with a Go backend engine exposed through a Cloudflare tunnel.

## Capabilities and Constraints
- Stack: Next.js 16 App Router, Tailwind v4, next-intl, Supabase (Postgres + pgvector, Auth, Storage, Realtime), Go engine for AI and background jobs. No new libraries without asking Arnav.
- Bilingual everywhere (cookie `cs_locale`), Assamese digits, `_en`/`_as` data columns.
- Light and dark mode. Works at 360 px; student mobile uses a bottom nav.
- Priority colours P1–P4 are functional and stay.
- Real auth only: no demo accounts or demo mode.
- Undecided: real campus photos, campus map illustration, emergency phone numbers (owned by Aman).

## Brand Commitments
- Name: CivicSense. Pitch: "One photo, any language — the right department knows in 5 seconds."
- Visual reference pinned by the user (2026-10-31): calm monochrome workspace UI (grey page, white surfaces, near-black primary, floating icon rail, bold tight display headings, large soft cards, segmented pill tabs, colour only for meaning). Pure monochrome: the PRD's three colour themes (Tea Garden, Brahmaputra, Muga) are dropped; only light/dark remains.
- Must not look AI-generated / "vibe coded".

## Evidence on Hand
- Seeded departments (8) and placeholder locations (10) in `supabase/seed.sql`; no real complaints, photos or users yet.
- No testimonials, metrics or press exist; never invent them. Demo data must be labelled or come from the live DB.

## Product Principles
1. AI suggests, people decide: show AI output as an editable proposal, never a verdict.
2. Every step visible to the reporter, in their language.
3. Privacy is explicit: public/private, anonymous and sensitive are separate, visible controls.
4. Nothing is a dead end: every list has loading, empty and error states; complaints submit even when AI is down.
5. Urgent means help first: emergency contacts shown, never a claim that help was dispatched.

## Accessibility & Inclusion
WCAG AA contrast in light and dark; Assamese line-height 1.6; large font-size option; reduced motion respected; keyboard-accessible controls.
