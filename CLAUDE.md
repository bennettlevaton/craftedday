# CraftedDay

AI-powered personalized meditation app. User describes their current mood/situation, Claude generates a custom meditation script, ElevenLabs voices it, user listens.

## Stack

- **Mobile:** Flutter (iOS first, Android later) — `mobile/`
- **API:** Next.js (App Router, TypeScript) on Vercel — `api/`
- **Database:** PlanetScale (MySQL) via Drizzle ORM
- **Auth:** Clerk (`clerk_flutter` SDK in Flutter, `@clerk/nextjs` in API)
- **Audio storage:** Cloudflare R2 (S3-compatible, no egress fees)
- **AI:** Anthropic Claude API — meditation script generation
- **TTS:** ElevenLabs — converts script to audio
- **Subscriptions:** RevenueCat (iOS + Android)

## Domain

craftedday.com

## Core User Flow

1. User inputs current mood/situation (text)
2. Next.js API calls Claude to generate personalized meditation script
3. Script sent to ElevenLabs, returns audio
4. Audio stored in Cloudflare R2
5. Flutter app streams/plays audio
6. Session saved to PlanetScale for history

## Database Schema

```
users       — id, clerk_id, email, created_at
meditations — id, user_id, prompt, script, audio_url, duration, created_at
```

## API Routes

- `POST /api/meditation/generate` — takes user prompt, returns audio URL
- `GET /api/history` — returns user's past sessions

## Project Status

- [ ] Accounts created (Anthropic, ElevenLabs, Clerk, PlanetScale, Cloudflare, Vercel)
- [ ] Git repo initialized
- [ ] Next.js scaffolded
- [ ] Flutter scaffolded
- [ ] Env vars configured
- [ ] DB schema pushed
- [ ] Core generate endpoint working
- [ ] Flutter audio playback working
- [ ] Auth wired up
- [ ] RevenueCat subscription flow

## Environment Variables (api/)

```
ANTHROPIC_API_KEY=
ELEVENLABS_API_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
PLANETSCALE_DATABASE_URL=
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=craftedday-audio
```
