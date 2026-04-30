# CraftedDay

AI-powered personalized meditation app. User describes their current mood/situation, Claude generates a custom meditation script, Inworld voices it, user listens.

> **Also read `CODING.md`** for schema, API, Flutter, and general code conventions before making changes.

> **For the daily Instagram reels system, read `REELS.md`.** Separate pipeline (Claude → Replicate → ffmpeg → Buffer → IG) with its own crons, env vars, and quirks. Don't touch `api/lib/reel.ts`, `api/app/api/cron/generate-reel/`, or `api/app/api/cron/sync-reel-meta/` without reading it.

> ⚠️ **Never ship breaking API changes.** The iOS app in production cannot be atomically updated. Renaming/removing JSON fields, changing types, or tightening request validators will crash the App Store build the next time it calls that endpoint. Add new fields alongside old ones; only remove old fields after the older build is confirmed gone. See "Mobile compatibility" in `CODING.md`.

---

## 🚀 Launch Checklist

### 1. Apple Developer Account ($99/yr)
- [x] Enroll at developer.apple.com if not already
- [x] Create App ID (`com.craftedday.craftedday`)
- [x] Enable "Sign In with Apple" capability on the App ID
- [x] Create a Service ID for Clerk Apple OAuth
- [x] Generate a Sign In with Apple Key (.p8 file)
- [x] Create distribution provisioning profile
- [x] Create App Store Connect record for CraftedDay

### 2. Xcode
- [x] **Add "Sign In with Apple" capability** — Runner target → Signing & Capabilities → + Capability
- [x] Set bundle ID (`com.craftedday.craftedday`)
- [x] Set team to Apple Developer account
- [x] Set version + build number
- [x] Create distribution provisioning profile

### 3. Clerk Production
- [x] Create production Clerk app (separate from current test app)
- [x] Configure Apple Sign In (Service ID + Team ID + Key ID + .p8)
- [x] Configure Google Sign In (Google Cloud OAuth credentials)
- [x] Add `craftedday://oauth-callback` to allowed redirect URLs
- [x] Swap all keys to `pk_live_` / `sk_live_` in Vercel + Flutter `.env`

### 4. RevenueCat + In-App Purchase
- [x] Create subscription product in App Store Connect ($19.99/mo)
- [x] Set up RevenueCat account + project
- [x] Connect App Store Connect to RevenueCat (attach product to default offering)
- [x] Configure App Store Server Notifications → RC's ingest URL
- [x] Set RC webhook URL + `REVENUECAT_WEBHOOK_SECRET` in Vercel prod
- [x] Integrate RevenueCat Flutter SDK
- [x] Backend (`subscriptions` + `usage_periods` tables) is source of truth — mobile reads `/api/usage`, RC SDK only used for identity/purchase/restore + optimistic post-purchase flip
- [x] `SKIP_SUBSCRIPTION_CHECK=true` bypasses gating everywhere (generate, daily, cron, usage endpoint) for dev
- [x] Gate daily session card behind paywall
- [x] Add paywall screen

### 5. Database
- [x] Add missing columns in PlanetScale (admin credential):
  ```sql
  ALTER TABLE meditations ADD COLUMN title VARCHAR(128);
  ALTER TABLE meditations ADD COLUMN feeling VARCHAR(10);
  ALTER TABLE meditations ADD COLUMN what_helped VARCHAR(32)[];
  ```

### 6. Vercel Production
- [x] Set `CRON_SECRET` to a strong random string
- [x] Wire `craftedday.com` custom domain
- [x] Confirm all env vars set (Clerk live keys, etc.)
- [x] Verify cron runs at 8am UTC (`/api/cron/generate-daily`)

### 7. Legal (required for App Store)
- [x] **Privacy Policy** — host at `craftedday.com/privacy`. Must cover: data collected, Clerk auth, AI processing, Inworld TTS.
- [x] **Terms of Service** — required for subscriptions, host at `craftedday.com/terms`

### 8. Landing Page (`craftedday.com`)
- [x] Basic page explaining the app
- [ ] App Store link (once live)
- [x] Privacy policy + terms in footer
- [x] Support email address

### 9. App Store Connect Listing
- [x] App name, subtitle, description, keywords
- [x] Screenshots (6.9" iPhone required)
- [n/a] App preview video (optional)
- [x] Age rating (likely 4+)
- [x] Support URL + Privacy Policy URL

### 10. Flutter `.env` (production)
```
API_BASE_URL=https://craftedday.com
CLERK_PUBLISHABLE_KEY=pk_live_...
```

### 11. Final QA
- [x] Full auth flow on real device (Apple + Google)
- [x] Generate meditation → check-in → history
- [x] Daily session card appears after cron runs
- [x] Notifications fire at user's hour, cancel after session
- [x] Profile edits persist
- [x] Sign out + sign back in
- [ ] Subscriptions gate correctly

**Currently blocked on:** Apple tax form fix (emailed Apple, waiting).

---

## Domain

craftedday.com

---

## Product Vision

### Core Features (v1)

1. **Daily session** — pre-generated each morning by cron, surfaced on home
2. **Custom meditation** — user describes current mood, Claude generates a personalized session
3. **Context input** — user describes current state/mood, factored into generation
4. **History** — view and re-listen to past sessions
5. **Post-session check-in** — feeling + what helped (multi-select) + optional note, fed back into future generations

### UX Principles

- **Aesthetic:** luxe, calming, spa-like. NOT techy/AI-forward.
- **Home screen:** ChatGPT-style — low friction. "How are you feeling today?" + text input + button.
- **Do NOT harp on AI branding.** Users should feel like they're meditating, not using an AI app.

### Screens

| Screen | File | Purpose |
|--------|------|---------|
| Home | `mobile/lib/screens/home_screen.dart` | "How are you feeling?" input + generate, daily card, streak |
| Player | `mobile/lib/screens/player_screen.dart` | Active meditation playback |
| Post-session | `mobile/lib/screens/post_session_screen.dart` | Feeling + what-helped (multi-select) + note |
| History | `mobile/lib/screens/history_screen.dart` | List of past sessions, re-playable |
| Profile/Stats | `mobile/lib/screens/profile_screen.dart` | Streak, total hours, total sessions, favorite time |
| Paywall | `mobile/lib/screens/paywall_screen.dart` | Trial + $19.99/mo subscription |

### User Stats Tracked

- Current streak (from `meditation_sessions`)
- Total hours meditated
- Total sessions
- Favorite time of day (derived from session timestamps)

### Feedback Loop (Personalization)

Post-session check-ins (feeling, multi-select what_helped, freeform note) feed `refreshPreferenceSummary` — Claude Sonnet distills the last 20 sessions into a 100–150 word behavioral profile cached on `user_profiles.preference_summary`. The profile is injected into both the Haiku planner and the Opus writer for every future session.

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
- **API:** Next.js 16 (App Router, TypeScript) on Vercel — `api/`
- **Async work:** Vercel Queues (`@vercel/queue`) for meditation generation
- **Database:** PlanetScale PostgreSQL via Drizzle ORM
- **Auth:** Clerk (`clerk_flutter` SDK in Flutter, `@clerk/nextjs` in API)
- **Audio storage:** Cloudflare R2 (S3-compatible, no egress fees)
- **AI:** Anthropic Claude API — Haiku for planning, Opus for writing, Sonnet for preference summaries
- **TTS:** Inworld (`inworld-tts-1.5-max`) — female voice is a custom-cloned Grace, male is `Damon`
- **Subscriptions:** RevenueCat (iOS + Android)
- **Routing (Flutter):** go_router

---

## Repo Layout

```
craftedday/
├── CLAUDE.md                          # this file
├── CODING.md                          # schema, API, Flutter conventions
├── bin/
│   ├── setup                          # creates .env.local + mobile/.env
│   └── dev                            # boots iOS sim, starts api + flutter
├── scripts/
│   ├── generate-breathing-cues.ts     # regenerates loading-screen cues (Inworld)
│   ├── generate-welcome.ts            # regenerates the canned welcome session
│   └── generate-music.ts              # ambient track generation
├── api/                               # Next.js on Vercel
│   ├── app/api/
│   │   ├── meditation/
│   │   │   ├── generate/route.ts      # POST — enqueue custom session
│   │   │   ├── jobs/[id]/route.ts     # GET — poll job status
│   │   │   ├── worker/route.ts        # Vercel Queue consumer
│   │   │   └── [id]/checkin/route.ts  # POST — feeling + what_helped + feedback
│   │   ├── session/daily/route.ts     # GET — today's daily session
│   │   ├── cron/generate-daily/route.ts
│   │   ├── history/route.ts
│   │   ├── stats/route.ts
│   │   ├── usage/route.ts             # subscription state + quota (mobile source of truth)
│   │   ├── user/...                   # onboarding + preferences
│   │   └── revenuecat/webhook/route.ts
│   ├── lib/
│   │   ├── claude.ts                  # Anthropic client
│   │   ├── inworld.ts                 # Inworld TTS client + INWORLD_VOICES
│   │   ├── meditation.ts              # planner + writer + audio assembly + TECHNIQUE_CUES
│   │   ├── archetypes.ts              # 8-archetype rotation for daily sessions
│   │   ├── daily.ts                   # daily session enqueue + grant
│   │   ├── jobs.ts                    # Vercel Queue producer
│   │   ├── celebration.ts             # post-checkin closing line (Haiku)
│   │   ├── subscription.ts            # /usage logic, gates, quota
│   │   ├── stats.ts                   # streak / totals computation
│   │   ├── welcome-data.json          # pre-generated welcome session
│   │   ├── r2.ts                      # Cloudflare R2 client
│   │   └── db.ts                      # postgres.js + drizzle
│   ├── db/schema.ts                   # Drizzle Postgres schema
│   ├── drizzle.config.ts
│   └── .env.local                     # gitignored
└── mobile/                            # Flutter iOS app
    ├── lib/
    │   ├── main.dart                  # entry, MaterialApp.router
    │   ├── router.dart                # go_router routes
    │   ├── theme/
    │   ├── screens/                   # see Screens table
    │   ├── services/
    │   │   ├── api_service.dart       # Dio client
    │   │   ├── notification_service.dart  # daily reminder via flutter_local_notifications
    │   │   ├── subscription_service.dart  # reads /api/usage, gates UI
    │   │   └── support_service.dart   # mailto + clipboard fallback
    │   └── models/
    ├── assets/audio/breathing/female/  # cue_00.mp3 ... cue_16.mp3 (Grace voice)
    └── pubspec.yaml
```

---

## Database Schema

(source: `api/db/schema.ts` — Drizzle Postgres)

```
user_profiles       — user_id (Clerk), name, experience_level, primary_goals[],
                      primary_goal_custom, voice_gender, notification_hour,
                      preference_summary, preference_summary_updated_at,
                      onboarded_at, updated_at
daily_sessions      — (user_id, date) primary key, meditation_id, created_at
meditations         — id, user_id, prompt, script, audio_url, duration, title,
                      feeling, what_helped (varchar[]), feedback, archetype,
                      is_favorite, created_at
meditation_sessions — id, user_id, meditation_id, listened_seconds, completed,
                      created_at — one row per actual listen. Streak / "did
                      they meditate today" derived from this, NOT from
                      meditations (which only tracks generation).
meditation_jobs     — async generation status row (pending → processing →
                      done/failed). Driven by Vercel Queues (topic:
                      meditation-generate).
subscriptions       — clerk_id PK, status, period_type, product_id,
                      period_start, period_end — fed by RC webhook
usage_periods       — append-only; one row per billing period.
                      custom_minutes_used, dailyCount, period_end=NULL is the
                      current open period
```

No `users` table — Clerk user ID is the primary key across `user_profiles`, `meditations`, and `subscriptions`. `getOrCreateProfile` creates the profile row lazily on first API call.

---

## API Routes

- `POST /api/meditation/generate` — enqueue custom session (returns jobId)
- `GET /api/meditation/jobs/[id]` — poll job status, returns final audioUrl
- `POST /api/meditation/worker` — Vercel Queue consumer (air-gapped, no auth needed)
- `POST /api/meditation/[id]/checkin` — feeling + what_helped[] + feedback; refreshes preference summary via `after()`
- `GET /api/session/daily` — today's daily session (subscriber gate)
- `POST /api/cron/generate-daily` — fires at 8am UTC (midnight PT), enqueues a daily for each subscriber
- `GET /api/history` — past sessions
- `GET /api/stats` — streak / totals / favorite time
- `GET /api/usage` — subscription state + remaining quota (mobile source of truth)
- `GET/PATCH /api/user/preferences` — voice gender, reminder hour
- `POST /api/user/onboarding` — completes onboarding, grants welcome session
- `POST /api/revenuecat/webhook` — subscription state from RC

---

## Core User Flow

1. User signs in (Clerk) → onboarding (name, experience level, primary goals, reminder hour) → welcome session granted from `welcome-data.json`
2. Home: "How are you feeling?" + text input. Daily session card visible if subscribed and not yet checked in today.
3. User submits prompt → `/api/meditation/generate` enqueues a job → mobile polls `/api/meditation/jobs/[id]`
4. Worker: Haiku plan → Opus sections (parallel) → Inworld TTS (parallel) → PCM assembly → R2 upload → DB insert → mark job done
5. Player streams audio. Logs listen progress to `meditation_sessions`.
6. On session end → post-session check-in (feeling, multi-select what_helped, freeform note)
7. `refreshPreferenceSummary` runs via `after()` to update the Sonnet-distilled profile for next session

---

## Environment Variables (`api/.env.local`)

```
ANTHROPIC_API_KEY
GROQ_API_KEY                     # post-session celebration line (llama-3.1-8b-instant)
IN_WORLD_API                     # base64(client_id:client_secret) for Inworld
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
PLANETSCALE_DATABASE_URL         # Postgres conn string; sslrootcert=system stripped in code
CLOUDFLARE_R2_ACCOUNT_ID
CLOUDFLARE_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY
CLOUDFLARE_R2_BUCKET_NAME        # craftedday
CLOUDFLARE_R2_PUBLIC_URL
REVENUECAT_WEBHOOK_SECRET
CRON_SECRET
TTS_CONCURRENCY=10               # default; override only if Inworld plan changes
SKIP_SUBSCRIPTION_CHECK=true     # local-dev only; bypasses all gates
```

`.env.local.example` is gitignored (was filled with real keys during setup). Use `bin/setup` after cloning to bootstrap `.env.local`.

---

## Scripts

```
bin/setup                  # creates .env.local from example + mobile/.env
bin/dev                    # boots iOS sim, starts api + flutter with prefixed logs
cd api && npm run cues:generate      # regenerates breathing cues (Grace voice)
cd api && npm run welcome:generate   # regenerates welcome-data.json + uploads to R2
cd api && npm run music:generate     # ambient track generation
```

---

## Meditation Style Reference

The tone/structure target comes from real meditations the user's wife (Grace) recorded. Key qualities:

- Opens in the middle of a breath, no "welcome" preamble
- "We" / "we're gonna" / "let's" for shared moments; "you" for direct guidance
- Belly button is the house anchor — listener places a finger on it to draw awareness
- Personal asides are welcome and humanizing ("my own brain feels sticky today")
- Vivid, slightly playful imagery (king-sized bed for the brain, sewage valve at the base of the skull) over clinical phrasing
- Generous silence between phrases (via `<break time="Xs" />`)

The system prompt + `TECHNIQUE_CUES` library in `api/lib/meditation.ts` encode this.

---

## Meditation Generation Pipeline

All logic lives in `api/lib/meditation.ts`. Two phases: script generation (Claude) and audio synthesis (Inworld + our own PCM assembly).

### Phase 1 — Script (Claude)

1. **Plan (Haiku)** — `generatePlan` asks `claude-haiku-4-5` for a JSON arc of 4–5 sections. Each section gets a `role`, `duration_seconds`, `guidance_density`, `notes`, and a `techniques: string[]` array of keys from `TECHNIQUE_CUES`. Haiku never computes spoken/silence splits.
2. **Beginner scaffolding** — for beginners, a planner-only block restricts technique selection by session number:
   - Sessions 1–2: only `belly_button_anchor` + `layered_breath`
   - Sessions 3–5: add `body_scan_topdown` (gentle), `cloud_suspension`, `forceful_exhale_close` — no brain drain or roots
   - Sessions 6–10: full library, max one "heavy" technique per session
   - Intermediate / experienced users skip scaffolding entirely. `sessionNumber` is computed in the worker (count of prior `meditations` rows + 1) and passed only to the planner so the cached writer system prompt stays stable.
3. **Split derivation (code, not model)** — for each section, `sectionSpokenSeconds` applies `ROLE_SPOKEN_FRACTION` (e.g. `open: 0.85`, `quiet_breathing: 0.28`, `close: 0.72`) plus a level modifier. Beginner +0.20, experienced −0.10. Produces overall session ratios of roughly 70% / 50% / 40% spoken once weighted by section durations.
4. **Write sections (Opus, parallel)** — `writeSectionScript` runs all sections through `claude-opus-4-7` via `Promise.all`. Continuity uses the prior section's `notes` from the plan (not prior output text), so there's no ordering dependency. Script phase ≈ 10s for a 5-min session. The system prompt is cached (`cache_control: ephemeral`) — first call writes, subsequent reads at ~10% rate.
5. **TECHNIQUE_CUES injection** — when a section has techniques tagged, the cue text is injected into the user prompt with explicit guidance: "phrase in your own voice, keep the concrete physical references and imagery."

Calibration constant: `SPOKEN_CHARS_PER_SEC = 13`. Calibrated empirically against Inworld TTS-1.5-Max at `speaking_rate: 0.85`. Used for both the prompt char target (inflated by `OPUS_DELIVERY_FACTOR = 1.3` to compensate for systematic Opus under-delivery) and the post-hoc duration estimate.

### Phase 2 — Audio (Inworld + us)

Key idea: **Inworld only does pure speech. We own all silence.** Break tags never reach the TTS engine. Inserting silence ourselves at the PCM layer guarantees pause durations match the script and gives us deterministic two-sided correction toward the target duration.

1. **Parse** — `parseScriptSegments` splits the script into alternating `{kind: "speech", text}` and `{kind: "pause", seconds}` segments.
2. **Build TTS chunks** — `buildTtsChunks` walks segments creating one chunk per sentence. Every break tag becomes a chunk boundary; the pause duration is recorded as `followingPauseSec`. Sentence-per-chunk granularity means every designed pause becomes a real silent-PCM gap at the intended position.
3. **Synthesize in parallel** — `parallelMap` fires Inworld requests concurrently up to `TTS_CONCURRENCY` (default 10, override via env).
4. **Safety cap** — each chunk has an expected duration of `chars ÷ SPOKEN_CHARS_PER_SEC`. If returned PCM exceeds `2.2× expected + 5s`, it's truncated. Cheap insurance against any provider-side regression.
5. **Assembly** — concatenate `chunk0 PCM` + `silentPCM(followingPauseSec[0] + extraGap)` + `chunk1 PCM` + ... + tail silence (`MIN_TAIL_SILENCE_SECONDS = 6`). Two-sided correction: shortfall vs. target padded across gaps + tail; overshoot scales planned silence down (floor 0.4× — never collapse pauses to nothing). Final audio lands at target within ~1 second.
6. **Loudness** — final MP3 is loudnorm'd to `I=-22 LUFS, TP=-1.5 dBFS, LRA=11` via ffmpeg. Single-pass; adds ~4s.
7. **Voice consistency** — single voice ID per session. No previous_text/next_text stitching needed for Inworld.

### Typical run (5-minute session, beginner)

| Phase | Time |
|---|---|
| Plan (Haiku) | ~4s |
| Sections (Opus, parallel) | ~10s |
| Audio (~30 chunks, 10 concurrent) | ~13s |
| Loudnorm + upload + DB | ~5s |
| **Total** | **~30s** |

### Env / config knobs

- Session length is set per-request, not via env. Daily sessions are fixed at 5 min (`DEFAULT_DURATION = 300` in `api/lib/daily.ts`). Custom sessions default to 10 min and are user-selectable on the home screen, clamped 30–600s in `api/app/api/meditation/generate/route.ts`.
- `TTS_CONCURRENCY` — Inworld parallelism cap (default 10; full self-serve plan).
- Voice IDs in `api/lib/inworld.ts`: `INWORLD_VOICES.female` (Grace clone), `INWORLD_VOICES.male` (Damon — currently deprecated, toggle hidden in profile).

### Daily session timezone

Daily session date keys use `America/Los_Angeles` so PT users don't lose "today" when UTC rolls over. Cron fires at 8am UTC (midnight PT).

---

## Tech Debt + Deferred

**Known issues:**
- **RC webhook has no event-ID dedupe.** `openNewPeriod` is idempotent on `(clerkId, periodStart)` and self-heals lingering open rows, but we don't persist `event.id`. Long term: add a `webhook_events` table keyed on RC event id.
- **Worker's daily-session date inconsistency.** `worker/route.ts:todayEst()` uses `America/New_York` while `lib/daily.ts:todayPacific()` uses LA. Since cron fires at midnight PT (3am ET) and worker completes within a few minutes, both resolve to the same date in practice — but they should be unified to one timezone helper to prevent latent drift.

**Deferred (intentional):**
- Streaming audio
- Background music mix during meditation
- Voice selection UI (toggle hidden — defaults to female Grace clone)
- Weekly digest, milestone badges, escalating re-engagement notifications, in-app pattern feedback
- Recommendation engine ("because breath worked, try this…")
- Implicit experience-level upleveling
- Share-streak card

---

## Decisions Log

- **User stats are denormalized on `user_profiles`.** `current_streak / total_sessions / total_seconds / favorite_time_bucket / last_session_at` live on the profile row. `recomputeUserStats(userId)` in `api/lib/stats.ts` aggregates from `meditation_sessions` and writes back; called from `/listen` on every session (once per session — completion or early-exit, not per progress tick). Replace-not-increment, so any drift self-heals on the next listen. `computeUserStats` is now a single-row read used by `/api/stats` and `/checkin`. Streak walk capped to last 90 days (anything older can't extend a current streak). `favoriteTime` API field still returned ("—" when null) for iOS production compat.
- **Async generation runs on Vercel Queues (`@vercel/queue`, topic `meditation-generate`).** Replaced a previous DB-poll + self-`fetch` chain that dropped invocations and left jobs stuck. Producer is `send()` in `enqueueJob`; consumer is `handleCallback` in the worker route (air-gapped — no bearer auth needed). `meditation_jobs` row is the polling source of truth for mobile, not the queue itself. Visibility timeout 600s with SDK auto-extend covers ~30s typical / 800s max generations. **Queue concurrency = 1, TTS_CONCURRENCY = 10** — single in-flight generation gets the full Inworld self-serve cap. Tradeoff: a 2nd concurrent user queues behind the 1st (~13s wait). Right call pre-scale; flip back to 2 × 5 once collisions become common (~50+ DAU).
- **Inworld TTS over ElevenLabs.** Migrated for better expressive prosody, support for voice cloning from a 5–10s reference (used to clone Grace), and more deterministic chunk-duration behavior. ElevenLabs v3 had break-tag instability that produced runaway 10+ minute chunks; not an issue with Inworld but we kept the safety cap as cheap insurance.
- **Silence is ours, not Inworld's.** Break tags from Opus are parsed out by `parseScriptSegments` and become silent PCM buffers we concat between TTS chunks. Inworld only sees pure spoken text. Guarantees pause durations match the script and gives us deterministic two-sided duration correction.
- **Sentence-per-chunk TTS.** Every break tag becomes a chunk boundary at the designed sentence-end position. Larger chunks would absorb pauses as ellipses and clump silence at coarse boundaries. Tradeoff is more requests, mitigated by `TTS_CONCURRENCY = 10`.
- **Parallel Opus section writes.** Sections only depend on `plan.arc[i-1].notes` (static plan data), not prior output, so `Promise.all` across sections is safe and cuts script time from ~22s to ~10s.
- **`SPOKEN_CHARS_PER_SEC = 13`.** Calibrated from observed Inworld audio (was 10 for ElevenLabs v3). Used for both the prompt char target and the duration estimate.
- **Beginner modifier +0.20.** Produces overall session spoken ratios of ~70% / 50% / 40% for beginner / intermediate / experienced. Beginners need more guidance, less silence — confirmed by every major meditation app's beginner content trending 65–75% spoken.
- **Beginner scaffolding by `sessionNumber`.** Sessions 1–2 limited to belly-button anchor + layered breath; 3–5 add gentle body scan + cloud suspension; 6–10 allow full library with one heavy technique max. Lives in the planner prompt only — kept out of the cached writer system prompt so caching stays effective.
- **Grace technique library (`TECHNIQUE_CUES`).** Nine named techniques drawn from real Grace transcripts: belly-button anchor (the house anchor), layered breath, top-down body scan, brain drain valve, cloud suspension, black specks release, roots-and-earth-energy, intention rehearsal, forceful exhale close. The Haiku planner picks 1–3 per session and tags them per section; the Opus writer pulls the cue text into the section prompt and phrases in its own voice.
- **`what_helped` is multi-select varchar[] with 8 buckets.** `breath, body, belly_anchor, release, silence, visualization, voice, pacing`. Replaced the original 4-bucket single-select. Aggregated into top-3 in the preference summary.
- **Post-session celebration line runs on Groq `llama-3.1-8b-instant`, not Anthropic Haiku.** Haiku was ~1.0–1.2s, blocking the post-checkin transition. Groq lands in ~150–250ms (1000 tok/s, ~150ms TTFT). System prompt + fallback unchanged. Timeout tightened from 1500ms → 800ms. Adds Groq as a new sub-processor — privacy policy at `craftedday.com/privacy` needs to list it alongside Anthropic and Inworld.
- **Preference summary refresh uses Next.js `after()`.** Was previously fire-and-forget right before the response — Vercel froze the runtime post-response and the 2–5s Sonnet call got cut off, leaving summaries stale. Now wrapped in `after()` so it runs to completion within `maxDuration`. If the work ever grows past ~10s or starts needing retries, migrate to a queue (pattern is identical to meditation generation).
- **Notification timezone fix (flutter_timezone).** `tz.initializeTimeZones()` only loads the IANA database — `tz.local` stays at UTC. Added `flutter_timezone` to detect the device's zone and `tz.setLocalLocation()` so 8am means 8am wall-clock, not 8am UTC.
- **Daily session timezone is PT (`America/Los_Angeles`).** UTC-based date rollover made "today" disappear at 4–5pm PT. Cron fires at 8am UTC (midnight PT). Endpoint and `lib/daily.ts` both use `todayPacific()`. Worker's `todayEst()` is a known inconsistency (see Tech Debt).
- **Backend is source of truth for subscription state.** The `subscriptions` table (written by RC webhook) decides access; mobile reads `/api/usage` on login and treats that as authoritative. RC SDK is only used for (a) `Purchases.logIn(clerkId)`, (b) purchase/restore flows, and (c) an optimistic `isPremium = true` flip right after purchase while we wait for the webhook.
- **`rc_customer_id` column dropped from `subscriptions`.** Since `Purchases.logIn(clerkId)` runs before any purchase, RC's `app_user_id` *is* the Clerk ID — the column was always a duplicate. Bring it back if we ever support anonymous-purchase-then-login.
- **Daily session is a subscriber perk with no quota.** Quota only applies to `/api/meditation/generate`. `/api/session/daily` and the cron enqueue gate on `isSubscribed()` only.
- **`SKIP_SUBSCRIPTION_CHECK=true` bypasses all gates** — `/generate`, `/session/daily`, cron, and `/api/usage` (which returns `subscribed:true` so mobile passes the paywall). Local-dev only.
- **Auth uses Clerk directly — no users table.** Clerk user ID is the primary key for `user_profiles`, `meditations`, `subscriptions`. `getOrCreateProfile` creates the profile row lazily on first API call.
- **OAuth uses externalApplication (Safari).** SFSafariViewController doesn't dismiss reliably after custom URL scheme callbacks. External browser works cleanly.
- **Streak from `meditation_sessions`, not `meditations`.** Streak / "did they meditate today" comes from actual listens (sessions), not generations. A re-listen creates a new session row.
- **Contact support via mailto + clipboard fallback.** Home-screen lifebuoy opens a prefilled mail draft. Player's early-exit sheet (before 70% played) offers "Just stopping" / "Something felt off" / "Audio problem" — the latter two open a draft with the failing session's ID. No mail client → clipboard + snackbar.
- **Warm light palette (not dark).** Meditation = warm, inviting (sand, linen, morning sunlight). Rejected dark "deep dusk" proposal.
- **PlanetScale PostgreSQL, not MySQL.** Connection string is Postgres. Use `postgres` (postgres.js), not `@planetscale/database`.
- **Admin credential for migrations, app credential for runtime.** `pg_read_all_data` + `pg_write_all_data` roles can't DDL. Admin role only for `db:push`; app uses restricted role.
