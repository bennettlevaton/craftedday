# CraftedDay

AI-powered personalized meditation app. User describes their current mood/situation, Claude generates a custom meditation script, ElevenLabs voices it, user listens.

> **Also read `CODING.md`** for schema, API, Flutter, and general code conventions before making changes.

---

## 🚀 Launch Checklist

### 1. Apple Developer Account ($99/yr)
- [ ] Enroll at developer.apple.com if not already
- [ ] Create App ID (`com.craftedday.app`)
- [ ] Enable "Sign In with Apple" capability on the App ID
- [ ] Create a Service ID for Clerk Apple OAuth
- [ ] Generate a Sign In with Apple Key (.p8 file)
- [ ] Create distribution provisioning profile
- [ ] Create App Store Connect record for CraftedDay

### 2. Xcode
- [ ] **Add "Sign In with Apple" capability** — Runner target → Signing & Capabilities → + Capability
- [ ] Set bundle ID (`com.craftedday.app`)
- [ ] Set team to Apple Developer account
- [ ] Set version + build number
- [ ] Create distribution provisioning profile

### 3. Clerk Production
- [ ] Create production Clerk app (separate from current test app)
- [ ] Configure Apple Sign In (Service ID + Team ID + Key ID + .p8)
- [ ] Configure Google Sign In (Google Cloud OAuth credentials)
- [ ] Add `craftedday://oauth-callback` to allowed redirect URLs
- [ ] Swap all keys to `pk_live_` / `sk_live_` in Vercel + Flutter `.env`

### 4. RevenueCat + In-App Purchase
- [ ] Create subscription product in App Store Connect (e.g. $9.99/mo, $59.99/yr)
- [ ] Set up RevenueCat account + project
- [ ] Connect App Store Connect to RevenueCat
- [ ] Integrate RevenueCat Flutter SDK
- [ ] Gate daily session card behind paywall
- [ ] Add paywall screen

### 5. Database
- [ ] Add missing columns in PlanetScale (admin credential):
  ```sql
  ALTER TABLE meditations ADD COLUMN title VARCHAR(128);
  ALTER TABLE meditations ADD COLUMN feeling VARCHAR(10);
  ALTER TABLE meditations ADD COLUMN what_helped VARCHAR(32);
  ```

### 6. Vercel Production
- [ ] Set `CRON_SECRET` to a strong random string (not `craftedday-cron-2026`)
- [ ] Wire `craftedday.com` custom domain
- [ ] Confirm all env vars set (Clerk live keys, etc.)
- [ ] Verify cron runs at 5am UTC (`/api/cron/generate-daily`)

### 7. Legal (required for App Store)
- [ ] **Privacy Policy** — host at `craftedday.com/privacy`. Must cover: data collected, Clerk auth, AI processing, ElevenLabs TTS. Tools: Termly, iubenda, or custom.
- [ ] **Terms of Service** — required for subscriptions, host at `craftedday.com/terms`

### 8. Landing Page (`craftedday.com`)
- [ ] Basic page explaining the app
- [ ] App Store link (once live)
- [ ] Privacy policy + terms in footer
- [ ] Support email address

### 9. App Store Connect Listing
- [ ] App name, subtitle, description, keywords
- [ ] Screenshots (6.9" iPhone required)
- [ ] App preview video (optional)
- [ ] Age rating (likely 4+)
- [ ] Support URL + Privacy Policy URL

### 10. Flutter `.env` (production)
```
API_BASE_URL=https://craftedday.com
CLERK_PUBLISHABLE_KEY=pk_live_...
```

### 11. Final QA
- [ ] Full auth flow on real device (Apple + Google)
- [ ] Generate meditation → check-in → history
- [ ] Daily session card appears after cron runs
- [ ] Notifications fire at 3pm, cancel after session
- [ ] Profile edits persist
- [ ] Sign out + sign back in
- [ ] Subscriptions gate correctly

**Rough timeline:** 2-3 weeks moving steadily. App Store review (~7 days) is the long pole.

---

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

## Development Constraints

- **ElevenLabs free plan: ~10 minutes of TTS output per month.** During development, generate short meditations (~30 seconds total output) to avoid burning quota.
- Controlled via `MEDITATION_TARGET_SECONDS` env var — set to `30` locally, `600` (10 min) in production.
- Break tags (`<break time="Xs"/>`) still produce audio output and count against quota — keep breaks short during testing.

---

## Active Implementation: Generate Endpoint

Current focus: `POST /api/meditation/generate` — the core loop.

**In progress:**
- [x] Schema: add voice_gender to users, rating/feedback to meditations
- [x] ElevenLabs lib: Lauren (female) + Evan (male) voice IDs
- [x] Push updated schema to PlanetScale (user ran db:push)
- [x] Ensure test user on generate (auto-upsert inline)
- [x] Implement generate endpoint (Claude → ElevenLabs → R2 → DB)
- [x] Flutter: real ApiService calling /api/meditation/generate
- [x] Flutter: loading state on Home ("Crafting your session...")
- [x] Flutter: audio playback via just_audio in Player
- [x] Flutter: home screen "Begin" button wired to ApiService
- [x] Flutter: Player auto-navigates to post-session on completion
- [x] End-to-end test on simulator
- [x] POST /api/meditation/:id/rate + Post-session submit
- [x] GET /api/history + History screen fetches real data
- [x] GET /api/stats + Profile screen shows real streak/sessions/hours/favorite time
- [x] GET/PATCH /api/user/preferences + voice toggle in Profile
- [x] Home uses user's saved voice preference when generating
- [x] Schema split: user_profiles table for behavioral data
- [x] Onboarding flow (name, experience, primary goal)
- [x] Preference summary: Claude Sonnet distills all rated sessions, cached on profile, refreshed fire-and-forget from /rate
- [x] Listener context (name, experience, goal, preference summary) injected into generate system prompt

**Explicitly deferred:**
- Auth (using hardcoded test user for now)
- Feedback history in Claude prompt (no ratings yet)
- Variable duration (fixed at MEDITATION_TARGET_SECONDS)
- Streaming audio
- Background jobs / retries
- Background music mix (nice-to-have — would mix ambient track under TTS audio before R2 upload)
- Wire history screen to real data (currently empty-state only)
- Voice selection UI (defaults to female Lauren for now)

---

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
- [x] Everything above shipped
- [x] Vercel deployed (craftedday.com)
- [x] Breathing cue audio generated (female + male, in mobile/assets/audio/breathing/)
- [x] Breathing cue audio wired to loading screen
- [x] Auth: Clerk sign-in (Apple native + Google OAuth), all routes protected
- [x] users table removed — Clerk user ID is the direct anchor
- [x] App icons generated
- [ ] Auth: test full flow on real device (sign in → onboarding → home → session)
- [ ] Deploy auth changes to Vercel
- [ ] RevenueCat subscriptions
- [ ] Generation speed for long sessions
- [ ] "Today's session" home redesign (see Decisions Log)

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

## Meditation Style Reference

The tone/structure target comes from a real meditation the user's wife recorded with him. Key qualities to preserve:

- Opens in the middle of a breath, no "welcome" preamble
- Inclusive language — "we're going to", "let's", "we begin"
- Anchor a specific body part (belly button, belly, breath)
- Personal, human asides are welcome
- Arc: settle → anchor → body work → release → integrate → close
- Generous silence between phrases (via `<break time="Xs" />`)

The system prompt in `api/lib/meditation.ts:buildSystemPrompt` encodes this.

---

## Decisions Log

- **Warm light palette (not dark).** User associates meditation with warm, inviting colors — sand, linen, morning sunlight. Rejected dark "deep dusk" proposal.
- **PlanetScale PostgreSQL, not MySQL.** User's connection string is Postgres. Switched from `@planetscale/database` (MySQL HTTP driver) to `postgres` (postgres.js).
- **Admin credential for migrations, app credential for runtime.** `pg_read_all_data` + `pg_write_all_data` roles can't DDL. User needs admin role only for `db:push`; app uses restricted role.
- **UI-first build order.** User wanted to validate the feel before wiring API integrations.
- **Post-session rating is its own screen.** Rating is prompted immediately after a session ends while feedback is fresh — not buried in history.
- **AWS habit, but skipped AWS.** User preferred Next.js/Vercel + Supabase-style services since they already know them; was not set on AWS.
- **ElevenLabs model: `eleven_multilingual_v2` with tuned voice settings.** Switched from `turbo_v2_5` because turbo felt robotic for meditation. Multilingual v2 is slower but much more expressive. Settings: stability 0.75, similarity 0.75, style 0.15, speaker boost on.
- **ElevenLabs Starter plan.** User upgraded from Free because Lauren/Evan library voices require paid tier.
- **Auth uses Clerk directly — no users table.** Clerk user ID is the primary key for user_profiles and meditations. getOrCreateProfile creates the profile row lazily on first API call.
- **OAuth uses externalApplication (Safari).** SFSafariViewController doesn't dismiss reliably after custom URL scheme callbacks. External browser works cleanly.
- **"Today's session" home redesign proposed.** Key concepts: pre-generated daily session card, 3-state post-session check-in (calmer/same/more tense), weekly summary card, return nudge with reminder. Ship order: today card → check-in → sessions+feelings storage → weekly summary.
- **Script style is opinionated.** The Claude system prompt enforces inclusive "we" language and no generic "welcome" preamble, modeled on a real meditation script from the user's wife.
