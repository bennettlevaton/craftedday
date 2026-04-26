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
| **Total worst-case cost** | 61 | **$7.75** |
| Net revenue | | $8.39 |
| **Margin (worst case)** | | **+$0.64** |

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

Worst case (above) is rare. Most subs use much less. Expected distribution:

| Segment | % of base | Daily plays/mo | Custom min/mo | Cost/mo | Margin/mo |
|---|---|---|---|---|---|
| Dormant | ~40% | 0 listens, 31 generated | 0 | $3.94 | +$4.45 |
| Light | ~30% | ~10 | 20 | $3.94 + $0.51 = $4.45 | +$3.94 |
| Engaged | ~20% | ~22 | 60 | $3.94 + $1.52 = $5.46 | +$2.93 |
| Heavy | ~8% | 31 | 100 | $3.94 + $2.54 = $6.48 | +$1.91 |
| Power | ~2% | 31 | 150 | $7.75 | +$0.64 |

**Blended average margin per sub: ~$3.50/mo at launch tier.**

## Cost composition (5-min beginner session, $50/M tier)

| Component | $ | % |
|---|---|---|
| Inworld TTS | $0.090 | 71% |
| Claude Opus sections | $0.034 | 27% |
| Claude Haiku plan | $0.003 | 2% |
| **Per-session total** | **$0.127** | 100% |

TTS dominates. Claude Opus 4.7 at corrected pricing ($5/$25 per M) is no longer the bottleneck Sonnet swap was meant to solve; the Opus-vs-Sonnet decision is now ~$0.013/session — not worth a quality compromise.

## Levers if margins compress later

In rough order of impact-per-effort:

1. **Move to $40/M Inworld plan** when sub count crosses ~80 (volume tier savings).
2. **Skip cron for dormant subs** (no session opened in last N days) → no daily generated for them. Pure savings, zero quality impact.
3. **Force daily to "experienced" ratio (40% spoken)** regardless of user level → daily cost from $3.94 → $3.04/sub/mo (~23% saving).
4. **Move to $30/M Inworld plan** at ~400 subs.
5. **Add Anthropic prompt caching** for the section system prompt (identical across 5 parallel calls) → ~50% Claude input savings → ~$0.011/session save → small but free win.

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
