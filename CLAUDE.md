# CraftedDay

AI-powered personalized meditation app. User describes their current mood/situation, Claude generates a custom meditation script, ElevenLabs voices it, user listens.

## Domain

craftedday.com

---

## Product Vision

### Core Features (v1)

1. **Create meditation** — default 10 minutes (variable length later)
2. **Context input** — user describes current state/mood, factored into generation
3. **History** — view and re-listen to past sessions
4. **Rating + feedback** — 1-5 stars + text, stored and fed back into future Claude prompts to personalize over time
5. **Voice gender toggle** — male/female narrator (expand to more voice controls later)

### UX Principles

- **Aesthetic:** luxe, calming, spa-like. NOT techy/AI-forward.
- **Home screen:** ChatGPT-style — low friction. "How are you feeling today?" + text input + button.
- **Do NOT harp on AI branding.** Users should feel like they're meditating, not using an AI app.

### Screens

| Screen | File | Purpose |
|--------|------|---------|
| Home | `mobile/lib/screens/home_screen.dart` | "How are you feeling?" input + generate |
| Player | `mobile/lib/screens/player_screen.dart` | Active meditation playback |
| Post-session | `mobile/lib/screens/post_session_screen.dart` | Rating (1-5) + optional feedback — prompted immediately after session ends |
| History | `mobile/lib/screens/history_screen.dart` | List of past sessions, re-playable |
| Profile/Stats | `mobile/lib/screens/profile_screen.dart` | Streak, total hours, total sessions, avg rating, favorite time, voice gender toggle |

### User Stats to Track

- Current streak
- Total hours meditated
- Total sessions
- Average rating
- Favorite time of day (derived from session timestamps)

### Feedback Loop (Personalization)

Ratings + feedback on past sessions are stored and woven into the Claude system prompt for future generations. Example: "This user rated breathing-focused sessions 5 stars, rated body scans poorly. Lean into breathwork."

---

## Design System

### Color Palette — "Morning light"
(defined in `mobile/lib/theme/colors.dart`)

| Token | Hex | Use |
|-------|-----|-----|
| background | `#F5EFE6` | Warm cream base |
| surface | `#FAF6EF` | Cards, inputs, elevated surfaces |
| textPrimary | `#2B2622` | Headings, body |
| textSecondary | `#8B7F72` | Muted taupe for subtext |
| accent | `#C17A4A` | Soft terracotta — CTAs, rating stars, primary actions |
| divider | `#E8DFD1` | Subtle borders |

### Typography
(defined in `mobile/lib/theme/app_theme.dart`)

- **Headings:** Fraunces (serif, elegant)
- **Body:** Inter (clean, readable)

### Shape/Spacing Conventions

- Buttons: 100px border radius (pill-shaped)
- Cards/inputs: 20px border radius
- Horizontal page padding: 28px
- Vertical section spacing: 32-48px (generous whitespace)

---

## Stack

- **Mobile:** Flutter (iOS first, Android later) — `mobile/`
- **API:** Next.js (App Router, TypeScript) on Vercel — `api/`
- **Database:** PlanetScale PostgreSQL via Drizzle ORM
- **Auth:** Clerk (`clerk_flutter` SDK in Flutter, `@clerk/nextjs` in API)
- **Audio storage:** Cloudflare R2 (S3-compatible, no egress fees)
- **AI:** Anthropic Claude API — meditation script generation
- **TTS:** ElevenLabs — converts script to audio
- **Subscriptions:** RevenueCat (iOS + Android)
- **Routing (Flutter):** go_router

---

## Repo Layout

```
craftedday/
├── CLAUDE.md                         # this file — source of truth for project context
├── bin/
│   ├── setup                         # copies .env.local.example → .env.local, creates mobile/.env
│   └── dev                           # starts api + flutter with prefixed logs, Ctrl+C stops both
├── api/                              # Next.js on Vercel
│   ├── app/api/
│   │   ├── meditation/generate/route.ts   # POST — generate meditation (stub)
│   │   └── history/route.ts               # GET — user's past sessions (stub)
│   ├── lib/
│   │   ├── claude.ts                 # Anthropic client
│   │   ├── elevenlabs.ts             # ElevenLabs client + default VOICE_ID
│   │   ├── r2.ts                     # Cloudflare R2 (S3-compatible)
│   │   └── db.ts                     # postgres.js + drizzle, strips sslrootcert param
│   ├── db/schema.ts                  # Drizzle pg schema — users, meditations
│   ├── drizzle.config.ts             # drizzle-kit config, loads .env.local via dotenv
│   └── .env.local                    # real keys (gitignored)
└── mobile/                           # Flutter iOS app
    ├── lib/
    │   ├── main.dart                 # entry, MaterialApp.router
    │   ├── router.dart               # go_router routes for all screens
    │   ├── theme/
    │   │   ├── colors.dart           # AppColors tokens
    │   │   └── app_theme.dart        # ThemeData with Fraunces + Inter
    │   ├── screens/                  # see Screens table above
    │   ├── services/api_service.dart # Dio client (stub)
    │   ├── models/meditation.dart    # Meditation model
    │   ├── widgets/                  # shared UI (empty)
    │   └── providers/                # Riverpod state (empty)
    ├── pubspec.yaml                  # clerk_flutter, dio, just_audio, flutter_riverpod, go_router, google_fonts
    └── .env                          # API_BASE_URL
```

---

## Database Schema

(source: `api/db/schema.ts` — Drizzle Postgres)

```
users       — id, clerk_id, email, created_at
              (voice_gender field needs to be added for v1)
meditations — id, user_id, prompt, script, audio_url, duration, created_at
              (rating, feedback fields need to be added for v1)
```

**Schema changes still needed:**
- Add `voice_gender` to users
- Add `rating` (int) and `feedback` (text) to meditations

---

## API Routes (planned)

- `POST /api/meditation/generate` — takes prompt + context, returns audio URL (stub exists)
- `GET /api/history` — returns user's past sessions (stub exists)
- `POST /api/meditation/:id/rate` — submit rating + feedback (not started)
- `GET /api/stats` — user stats (not started)
- `PATCH /api/user/preferences` — update voice gender, etc (not started)

---

## Core User Flow

1. User inputs current mood/situation (text) on Home
2. Next.js API calls Claude with user's feedback history baked into system prompt
3. Script sent to ElevenLabs with user's preferred voice gender
4. Audio stored in Cloudflare R2
5. Flutter streams/plays audio on Player screen
6. Session saved to PlanetScale
7. On session end → Post-session screen: rate + feedback → stored for future personalization

---

## Build Order

1. ✅ Scaffold + design system
2. ⏳ UI screens as static (in progress — all screens have v1 UI, need real data wired)
3. Wire up `/api/meditation/generate` (Claude + ElevenLabs + R2)
4. Flutter: audio playback in Player screen
5. Auth integration (Clerk in Flutter + API)
6. Schema additions (voice_gender, rating, feedback)
7. Rating + feedback endpoint + personalization loop in Claude system prompt
8. Stats computation endpoint
9. RevenueCat subscription flow
10. Vercel deployment + custom domain (craftedday.com)

## Project Status

- [x] Accounts created (Anthropic, ElevenLabs, Clerk, PlanetScale, Cloudflare)
- [x] Git repo initialized
- [x] Next.js scaffolded
- [x] Flutter scaffolded
- [x] Env vars configured
- [x] DB schema pushed to PlanetScale
- [x] Flutter design system (theme, typography, colors)
- [x] Flutter navigation shell (go_router)
- [x] Home screen UI (static)
- [x] Player screen UI (static — no audio yet)
- [x] Post-session rating screen UI (static)
- [x] History screen UI (static with mock data)
- [x] Profile/Stats screen UI (static with mock data)
- [ ] Schema additions (voice_gender, rating, feedback)
- [ ] Core generate endpoint implementation
- [ ] Audio playback wired in Player screen
- [ ] Auth integration (Clerk) in both Flutter + API
- [ ] Wire history screen to real data
- [ ] Rating + feedback endpoint
- [ ] Stats computation
- [ ] RevenueCat subscription flow
- [ ] Vercel deployment

---

## Environment Variables (api/.env.local)

```
ANTHROPIC_API_KEY
ELEVENLABS_API_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
PLANETSCALE_DATABASE_URL      # PostgreSQL connection string with sslrootcert=system stripped in code
CLOUDFLARE_R2_ACCOUNT_ID
CLOUDFLARE_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY
CLOUDFLARE_R2_BUCKET_NAME     # craftedday
CLOUDFLARE_R2_PUBLIC_URL      # Cloudflare "Public Development URL" for the bucket
```

**Note:** `.env.local.example` is gitignored because it was filled with real keys during setup. Use `bin/setup` after cloning to create `.env.local`.

---

## Scripts

```
bin/setup   # creates .env.local from example + mobile/.env
bin/dev     # boots iOS simulator, starts api + flutter with prefixed logs, Ctrl+C stops both
```

---

## Decisions Log

- **Warm light palette (not dark).** User associates meditation with warm, inviting colors — sand, linen, morning sunlight. Rejected dark "deep dusk" proposal.
- **PlanetScale PostgreSQL, not MySQL.** User's connection string is Postgres. Switched from `@planetscale/database` (MySQL HTTP driver) to `postgres` (postgres.js).
- **Admin credential for migrations, app credential for runtime.** `pg_read_all_data` + `pg_write_all_data` roles can't DDL. User needs admin role only for `db:push`; app uses restricted role.
- **UI-first build order.** User wanted to validate the feel before wiring API integrations.
- **Post-session rating is its own screen.** Rating is prompted immediately after a session ends while feedback is fresh — not buried in history.
- **AWS habit, but skipped AWS.** User preferred Next.js/Vercel + Supabase-style services since they already know them; was not set on AWS.
