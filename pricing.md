# CraftedDay Pricing & Unit Economics

Snapshot of current configuration. Update when any input changes.

## Revenue side

| Lever | Value |
|---|---|
| Subscription price | **$9.99/mo** |
| Apple Small Business Program (under $1M/yr revenue) | 15% |
| RevenueCat (above $2.5k MTR) | 1% |
| **Net revenue per sub** | **$8.39/mo** |

## Service costs

### TTS — Inworld TTS-1.5-Max

| Plan tier | Monthly fee | Per-char rate | Self-serve threshold |
|---|---|---|---|
| **Self-serve (current)** | $0 | **$50/M chars** | 0–~80 subs |
| $300/mo plan | $300 | $40/M chars | ~80–400 subs |
| $1500/mo plan | $1500 | $30/M chars | 400+ subs |

Concurrency limit on self-serve: 10 simultaneous TTS calls. App is configured for 2 worker functions × `TTS_CONCURRENCY=5` = 10, fully utilizing the cap.

### Anthropic Claude — script generation

| Model | Used for | Input | Output |
|---|---|---|---|
| **Claude Haiku 4.5** | Section plan (1 call/session) | $1/M | $5/M |
| **Claude Opus 4.7** | Section writing (5 parallel calls/session) | $5/M | $25/M |
| Claude Sonnet 4.6 | Preference summary (post-rate, amortized) | $3/M | $15/M |

### Other (effectively zero per session)

| Service | Cost basis | Per-session impact |
|---|---|---|
| Cloudflare R2 storage | $0.015/GB/mo | <$0.001 (5-min MP3 ≈ 4MB, 192k bitrate) |
| R2 egress | Free (S3-compatible w/ no egress fees) | $0 |
| Vercel Functions | Included in Vercel plan | Effectively $0 marginal |
| Vercel Queues | Included in Vercel plan | Effectively $0 marginal |

## Cost per session (current setup: Inworld $50/M + Opus + Haiku)

Spoken chars = `target_seconds × spoken_ratio × 10 chars/sec` (calibrated for Inworld at speaking_rate 0.85).

Spoken ratios per experience level (from `ROLE_SPOKEN_FRACTION` × level modifier):
- Beginner: 60% spoken
- Intermediate: 50% spoken
- Experienced: 40% spoken

### 5-min session breakdown

| Profile | Spoken chars | Inworld TTS | Claude (Haiku + Opus) | **Total** |
|---|---|---|---|---|
| Beginner | 1,800 | $0.090 | $0.037 | **$0.127** |
| Intermediate | 1,500 | $0.075 | $0.037 | $0.112 |
| Experienced | 1,200 | $0.060 | $0.037 | $0.097 |

### 10-min session breakdown

| Profile | Spoken chars | Inworld TTS | Claude (Haiku + Opus) | **Total** |
|---|---|---|---|---|
| Beginner | 3,600 | $0.180 | $0.048 | **$0.228** |
| Intermediate | 3,000 | $0.150 | $0.048 | $0.198 |
| Experienced | 2,400 | $0.120 | $0.048 | $0.168 |

### Claude breakdown per 5-min session

- Haiku plan: ~600 input + ~400 output tokens = $0.0006 + $0.002 = **$0.003**
- 5× Opus sections: ~4,500 input + ~450 output tokens = $0.023 + $0.011 = **$0.034**
- Per-session Claude total: **~$0.037**

10-min sessions: output doubles (~900 tokens) → Opus output ≈ $0.023 → total ~$0.048.

## Per-subscriber cost at full usage (worst case beginner)

What it costs you per month if a subscriber maxes everything: 31 daily 5-min sessions + full 150-min custom cap.

### At launch ($50/M Inworld tier)

| Component | Sessions | Cost |
|---|---|---|
| Daily cron (5-min, 31×/mo) | 31 | $3.94 |
| Custom cap (150 min, all 5-min worst case) | 30 | $3.81 |
| Prompt caching savings on Claude (~$0.01/session × 61) | | –$0.61 |
| **Total worst-case cost** | 61 | **$7.14** |
| Net revenue | | $8.39 |
| **Margin (worst case)** | | **+$1.25** |

### At $40/M Inworld tier (~80 subs)

| Component | Cost |
|---|---|
| Daily cron | $3.39 |
| Custom cap (150 min) | $3.27 |
| **Total** | **$6.66** |
| **Margin** | **+$1.73** |

### At $30/M Inworld tier (~400 subs)

| Component | Cost |
|---|---|
| Daily cron | $2.82 |
| Custom cap (150 min) | $2.73 |
| **Total** | **$5.55** |
| **Margin** | **+$2.84** |

## Realistic-usage per-subscriber math (blended)

Worst case (above) is rare. Most subs use much less. Expected distribution, **with daily-reuse for dormant subs now active**:

| Segment | % of base | Daily plays/mo | Custom min/mo | Daily cost | Custom cost | Margin/mo |
|---|---|---|---|---|---|---|
| Dormant | ~40% | 0 listens | 0 | **$0** (reuses yesterday) | $0 | **+$8.39** |
| Light | ~30% | ~10 listens, ~21 reused | 20 | $1.27 | $0.51 | +$6.61 |
| Engaged | ~20% | ~22 | 60 | $2.79 | $1.52 | +$4.08 |
| Heavy | ~8% | 31 | 100 | $3.94 | $2.54 | +$1.91 |
| Power | ~2% | 31 | 150 | $3.94 | $3.81 | +$0.64 |

**Blended average margin per sub: ~$5.80/mo at launch tier** (was ~$3.50 before dormant reuse).

The dormant-reuse logic is the single biggest unit-economic lever. ~40% of subs paying full price while costing ~$0 is what makes $9.99 work.

## Cost composition (5-min beginner session, $50/M tier)

| Component | $ | % |
|---|---|---|
| Inworld TTS | $0.090 | 71% |
| Claude Opus sections | $0.034 | 27% |
| Claude Haiku plan | $0.003 | 2% |
| **Per-session total** | **$0.127** | 100% |

TTS dominates. Claude Opus 4.7 at corrected pricing ($5/$25 per M) is no longer the bottleneck Sonnet swap was meant to solve; the Opus-vs-Sonnet decision is now ~$0.013/session — not worth a quality compromise.

## Optimizations already shipped

✅ **Daily reuse for dormant subs** (`api/lib/daily.ts`). If yesterday's daily has zero `meditation_sessions` rows, today reuses it instead of generating fresh. Single biggest lever — drops dormant cost to ~$0/sub.

✅ **Anthropic prompt caching** on Opus section writer (`api/lib/meditation.ts`). System prompt cached across the 5 parallel section calls. Saves ~$0.01/session.

✅ **Inworld TTS-1.5-Max** replacing ElevenLabs Turbo. Better quality (#1 leaderboard) at lower cost.

✅ **Opus 4.7 at $5/M in / $25/M out** (corrected from old $15/$75 estimate). No need for Sonnet quality compromise.

✅ **Queue concurrency = 2** so two users can generate simultaneously without contention (10 Inworld parallel slots / 5 per worker = 2 workers).

## What's left to optimize, in order of impact-per-effort

### 1. Plan tier upgrades (passive, automatic with growth)
- At ~80 subs: switch Inworld to $300/mo plan ($40/M chars). Saves ~20% on TTS line.
- At ~400 subs: switch to $1500/mo plan ($30/M chars). Saves another ~25% on TTS.
- Just plan transitions, no code change required.

### 2. ~~Force daily to "experienced" ratio regardless of user level~~ (rejected)
Considered: override `experienceLevel` in `enqueueDailyForUser` to always pass `"experienced"`, getting 40% spoken / 60% silence on every daily regardless of user.
- Would save ~$0.93/sub/mo on engaged beginners
- **Rejected:** beginners need more guidance, not less. Less narration risks early-stage churn from confusion ("the app feels empty"), which dwarfs the savings. Cheap dollar at the cost of new-user retention.

### 3. Reduce Opus section count from 5 to 4
Current pipeline calls Opus 5× in parallel. Going to 4 sections:
- Saves 20% of Opus calls = ~$0.007/session
- **Risk:** less arc structure, sections might feel rushed
- **Code change:** edit Haiku planner prompt to output 4 sections instead of 4-5
- Marginal but free

### 4. Cache Haiku planner output for similar prompts
The Haiku plan call generates structure based on prompt + listener context. For dailies (which use stable archetypes), the plan is fairly deterministic. Could:
- Cache by `(archetype_id, experience_level)` for ~24 hours
- Saves $0.003/session on cache hits
- **Code change:** add LRU or KV cache around `generatePlan`
- Tiny but trivial

### 5. Hibernate truly long-dormant subs
Today's reuse logic chains: if yesterday was reused, today reuses too. Truly dormant users can chain forever at $0 cost, which is fine. But you could also:
- Stop generating ANY daily for users dormant >30 days (not even the reuse insert)
- Re-engage on first open with a fresh session
- Saves the trivial DB write cost on truly inactive users
- Marginal — primarily a cleanup play

### 6. Smaller chunk sizes on Inworld
Current `TARGET_CHARS_PER_CHUNK = 400`. Inworld has lower per-request overhead than ElevenLabs. Could test 600-800 char chunks to reduce request count by ~30-40%, faster generation but possibly less precise silence boundaries. Quality test required.

### 7. Compress final MP3 lower
Current encoding: 192k stereo. Could drop to 128k for daily content (less critical):
- Saves ~30% R2 storage + bandwidth
- Already negligible cost line, so this is purely vanity unless storage scales 100×

## What I'd actually focus on next

**Don't optimize further until you have ~50 paying subs.** Current setup ($1.25 worst case + $5.80 blended margin at launch) is healthy. Real optimization wins come from:
1. Watching `cron:daily` logs to see actual reuse rate (validates the dormant-savings model)
2. Watching Inworld dashboard for actual char usage vs estimates
3. Watching `cache_creation_input_tokens` / `cache_read_input_tokens` in Claude logs

After 30 days of real data, you'll know which levers above actually matter. Optimizing on hypotheticals before that is procrastination.

## Update triggers

Re-run this analysis if any of the following change:

- Subscription price
- Inworld plan tier transition
- TTS model swap (`model_id` in `inworld.ts`)
- `SPOKEN_CHARS_PER_SEC` calibration
- Spoken ratios (`ROLE_SPOKEN_FRACTION` or level modifier)
- `DEFAULT_DURATION` (cron daily length, currently 300s)
- `CUSTOM_MINUTES_LIMIT` (currently 150 min)
- `TRIAL_MINUTES_LIMIT` (currently 60 min)
- Claude pipeline change (model swap or section count)
- Apple revenue threshold crossed ($1M/yr → 30% cut, breaks the model)
