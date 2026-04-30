
# Daily Instagram Reels

Automated content pipeline that posts to **@craftedday** on Instagram twice a day, fully hands-off. Separate system from the meditation app — different inputs, different outputs, different audience — but lives in the same Vercel project so it can reuse the DB, env, and ffmpeg installer.

> Read this before touching anything in `api/lib/reel.ts`, `api/app/api/cron/generate-reel/`, or `api/app/api/cron/sync-reel-meta/`.

---

## What it does

Twice daily, a Vercel cron:
1. Asks **Claude Opus** for one Reel concept (quote, caption, hashtags, visual prompt) — calibrated to the meditation-Instagram audience (Tara Brach / Sarah Blondin / Yung Pueblo register).
2. Generates a 9:16 cinematic background via **Replicate (Kling v3, 4K mode)** from the visual prompt.
3. Renders the final MP4 with **ffmpeg**: scales/crops to 1080×1920, overlays the quote in Fraunces Bold (upper third), encodes H.264 + AAC.
4. Uploads to **Vercel Blob** (long-term archive) AND **tmpfiles.org** (ephemeral handoff URL — see "Known quirks" below for why both).
5. Posts to Buffer's **GraphQL Publish API** with `mode: shareNow`, `metadata.instagram.type = reel`. Buffer hands off to Instagram's container endpoint.
6. Writes everything to `reel_posts` for anti-repeat history.

A second daily cron syncs back from Buffer + IG Graph API to backfill IG permalink, numeric media id, and engagement metrics on each row.

---

## Stack

| Concern | Service |
|---|---|
| Concept generation | Anthropic Claude Opus 4.7 (extended thinking, high effort) |
| Video generation | Replicate — `kwaivgi/kling-v3-video` (mode=`4k`, audio=true) |
| Render / encode | `@ffmpeg-installer/ffmpeg` + libx264 |
| Long-term storage | `@vercel/blob` (`reels/<date>.mp4` with random suffix) |
| Publish handoff URL | tmpfiles.org (~1hr ephemeral) |
| Publishing | Buffer GraphQL (`https://api.buffer.com/graphql`) |
| Engagement stats | Instagram Graph API (`https://graph.facebook.com/v21.0`) |
| Persistence | PlanetScale Postgres → `reel_posts` table |
| Schedule | Vercel Cron |

---

## Cron schedule

Defined in `api/vercel.json`:

```
0 17 * * *   /api/cron/generate-reel    9am PST / 10am PDT — first daily post
0 23 * * *   /api/cron/generate-reel    3pm PST / 4pm PDT  — second daily post
0  6 * * *   /api/cron/sync-reel-meta   10pm PT — pull IG permalinks, media ids, stats
```

DST drift is accepted — cron is UTC, we don't dual-fire with a guard.

---

## Env vars

### Steady-state (must be set in Vercel prod)

| Var | Purpose | How to get / refresh |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude | console.anthropic.com → API keys |
| `REPLICATE_API_TOKEN` | Kling video gen | replicate.com/account/api-tokens |
| `BUFFER_ACCESS_TOKEN` | Reel publishing | publish.buffer.com → Settings → Developers → Create Access Token |
| `BUFFER_CHANNEL_ID` | IG channel id | Visible in URL on `publish.buffer.com/channels/<id>/settings`. Currently `69ee9bd95c4c051afae20200`. |
| `META_PAGE_ACCESS_TOKEN` | IG insights | **Never expires.** Generated once via `scripts/setup-meta-tokens.ts`. |
| `META_IG_USER_ID` | IG account id | Same script outputs both. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob | Auto-injected when the `craftedday` Blob store is linked to the Vercel project. |

### Optional config (defaults baked in)

| Var | Default | Notes |
|---|---|---|
| `REEL_SECONDS` | 7 | Kling supports 3–15. We use 7. |
| `REPLICATE_MODEL` | `kwaivgi/kling-v3-video` | Override only when experimenting. |

### One-time setup (delete after use)

These are **only** for running `setup-meta-tokens.ts`. Wipe from `.env.local` and never put in Vercel:

| Var | Why temporary |
|---|---|
| `META_APP_ID` | Only the script reads it |
| `META_APP_SECRET` | Sensitive — page token doesn't need it once generated |
| `META_SHORT_TOKEN` | Expires in ~1hr |

### Refreshing tokens

- **`META_PAGE_ACCESS_TOKEN`** — never expires. Refresh only if revoked or the Page admin changes. Re-run `scripts/setup-meta-tokens.ts`.
- **`BUFFER_ACCESS_TOKEN`** — generated in Buffer's developer settings; expires when revoked. To refresh, hit Buffer dashboard → Developers → re-issue.
- **`REPLICATE_API_TOKEN`** — never expires unless rotated. Top up credit at replicate.com/account/billing.
- **`ANTHROPIC_API_KEY`** — never expires; rotate at console.anthropic.com.

---

## Setup scripts

`scripts/setup-meta-tokens.ts` — runs the four-step Meta token dance in one go. Handles both **direct Page admin** AND **Business-Portfolio-owned Pages** (the latter requires the `business_management` scope on the short-lived token). Outputs the two env vars you actually need.

```sh
# 1. In Graph API Explorer (developers.facebook.com → Tools → Graph API Explorer):
#    pick your app, generate a token with these scopes:
#      instagram_basic, instagram_manage_insights,
#      pages_show_list, pages_read_engagement, business_management
# 2. Add temporarily to api/.env.local:
#      META_APP_ID, META_APP_SECRET, META_SHORT_TOKEN
# 3. Run from api/:
cd api
NODE_PATH=./node_modules npx tsx ../scripts/setup-meta-tokens.ts
# 4. Paste the META_PAGE_ACCESS_TOKEN + META_IG_USER_ID outputs into Vercel.
# 5. Delete META_APP_ID, META_APP_SECRET, META_SHORT_TOKEN from .env.local.
```

`scripts/test-buffer-post.ts` — diagnostic. Submits a video URL to Buffer and prints whether IG actually accepted it (Buffer reports success on submission even when IG rejects later). Use this whenever changing the encoder, the host, or the Buffer mutation shape.

```sh
NODE_PATH=./node_modules npx tsx ../scripts/test-buffer-post.ts <video_url> reel
```

---

## Schema

`reel_posts` (in `api/db/schema.ts`):

```
id                    serial PK
date                  YYYY-MM-DD pacific
quote, caption, hashtags[], visualPrompt, theme   ← what was generated
videoUrl                                           ← Vercel Blob (permanent)
bufferPostId                                       ← Buffer's internal post id
instagramPostId                                    ← URL shortcode (e.g. "DAxYz123")
instagramMediaId                                   ← numeric (for Graph API insights)
instagramPermalink                                 ← https://www.instagram.com/reel/.../
metaSyncedAt                                       ← when permalink was filled
likes, comments, saves, shares, reach, plays, views, totalInteractions
statsSyncedAt                                      ← last insights fetch
createdAt
```

Index on `created_at desc` — every read is a recency-ordered slice.

After schema changes: `cd api && npm run db:push`.

---

## Known quirks (the saga)

This pipeline took several rounds of debugging. Don't repeat the mistakes:

### 1. IG's media-fetcher rejects R2-served URLs

Reels published with a `pub-xxx.r2.dev` URL (or `cdn.craftedday.com` proxied to R2) all failed with the generic `ERROR: ERROR` from IG's container endpoint. Same file served from any non-R2 host works fine. Vercel Blob ALSO failed. Only **tmpfiles.org** worked.

We don't know the underlying reason — IG's fetcher is opaque. The fix is dual-upload: Vercel Blob for permanence, tmpfiles for the actual handoff URL. If tmpfiles ever stops working, swap to file.io or stand up a tiny static handler — see `uploadToTmpfiles` in `api/lib/reel.ts`.

### 2. Buffer's "Channel not found" red herring

`createPost` returns `Channel not found` when Instagram-specific metadata is missing, not when the channel id is wrong. Required fields:
```
metadata.instagram.type             = "reel"
metadata.instagram.shouldShareToFeed = true
```

### 3. Buffer accepts ≠ IG publishes

Buffer's `createPost` returns a post id immediately. IG processing happens async. Failures show up later in the post's `status: error` field with `error.rawError` containing the IG-side detail. Always query the post status, never trust the immediate response.

### 4. Encoder over-engineering broke things

Locking the encoder to "IG spec" (Main/4.0, 30fps CFR, closed GOP, BT.709, no B-frames) caused failures across all hosts. Stripped back to libx264 defaults + faststart + AAC 128k @ 48kHz — that's what works. Don't add "defensive" encoder flags without testing first.

### 5. Audio fingerprinting was a wrong guess

We initially thought Kling's AI-generated audio was triggering IG's copyright fingerprint. It wasn't — silent reels failed identically to audio reels from R2. The audio path is fine; Kling audio passes through.

### 6. Buffer's GraphQL doesn't expose engagement

Buffer's public API has `Post.error` and metadata but no `analytics` field. Engagement metrics come from IG Graph API directly — that's why we set up the Meta dev app + Page link.

### 7. IG insights need numeric `media_id`, not the URL shortcode

Buffer's `Post.externalLink` is the IG permalink (`/reel/<shortcode>/`). The Graph API insights endpoint requires the numeric `media_id` (e.g. `17912345678901234`). To map shortcode ↔ media_id, list `/{ig-user-id}/media?fields=id,permalink` and match by permalink. See `fetchPermalinkToMediaId` in the sync cron.

### 8. >1000 follower threshold

Meta's `/insights` endpoint returns empty arrays for several metrics until the IG account has 1000+ followers. The sync cron handles this gracefully — each metric is queried separately and missing ones are skipped.

---

## Operations

### Manually trigger a reel

```sh
curl -X GET 'https://craftedday.com/api/cron/generate-reel' \
  -H "Authorization: Bearer $CRON_SECRET"
```

Takes 60–90s. Returns JSON with `quote`, `bufferPostId`, `publicUrl`. Then watch publish.buffer.com or wait ~5 min for IG to publish.

### Debug a failed post

Get the actual IG rejection reason via Buffer's GraphQL:

```sh
TOKEN=$(grep BUFFER_ACCESS_TOKEN api/.env.local | cut -d= -f2-)
POST_ID="<from logs>"
curl -s -X POST https://api.buffer.com/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"query(\$input: PostInput!){post(input:\$input){status sentAt error{message rawError}}}\",\"variables\":{\"input\":{\"id\":\"$POST_ID\"}}}" \
  | python3 -m json.tool
```

### Force the sync cron

```sh
curl -X GET 'https://craftedday.com/api/cron/sync-reel-meta' \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Editorial voice

The system prompt in `api/lib/reel.ts` is calibrated to the **meditation-curious Instagram audience** — Tara Brach / Sarah Blondin / Headspace / Yung Pueblo register. Not generic spa quotes. Specifically:

- Quotes name a **specific everyday moment** (e.g. "the 3am thought spiral"), not abstract spirituality.
- 4–14 words. Plain language only — no SAT vocab. Words a 12-year-old uses.
- Validates without preaching. Reframes a thought-pattern.
- Caption ends with a soft pull toward CraftedDay (varied phrasing — "a fresh one's waiting in CraftedDay" / "built for the day you're already in").

When examples in the prompt start producing weak output ("Endings deserve the same attention as beginning"), update the bad-examples list and recalibrate. The model self-corrects from concrete examples better than from rules.

---

## Future work

When there's enough data (~30+ posts and >1k followers so insights actually populate):

**Engagement-driven generation.** Same pattern as the meditation app's `refreshPreferenceSummary`:
1. Pull top-5 + bottom-5 reel_posts ordered by engagement.
2. Ask Sonnet to distill a 100-word "what's working / what isn't" summary.
3. Cache it on a new column.
4. Inject into the concept prompt next to the recent-quotes anti-repeat block.

Other deferred:
- Direct Instagram Graph API publishing (skip Buffer entirely) — requires Meta App Review for `instagram_content_publish`, ~2 weeks.
- ElevenLabs ambient music chained in instead of Kling's audio (we have a stock pool in R2 from the meditation app).
- Cross-post to TikTok / Threads via the same Buffer integration.
