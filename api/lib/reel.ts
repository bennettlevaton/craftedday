// Daily Instagram reel pipeline. Mirrors scripts/reel-generator/generate.ts
// but tuned for a Vercel function: temp files in /tmp, font shipped under
// api/lib/fonts/, env vars sourced from Vercel project settings.
//
// Pipeline:
//   1. Claude Opus → quote + caption + hashtags + visual prompt
//   2. Replicate (Kling v3 4K) → 9:16 background video
//   3. ffmpeg → overlay quote, fade in, encode H.264 + AAC 128k
//   4. R2 → public URL
//   5. Buffer GraphQL → Instagram Reel post (shareNow)

import Anthropic from "@anthropic-ai/sdk";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { spawn } from "child_process";
import { createWriteStream, readFileSync } from "fs";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { put } from "@vercel/blob";
import { log } from "@/lib/log";

const FONT_PATH = join(process.cwd(), "lib/fonts/Fraunces144pt-SemiBold.ttf");
const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;

const REEL_SECONDS = Number(process.env.REEL_SECONDS ?? 7);
const REPLICATE_MODEL = process.env.REPLICATE_MODEL ?? "kwaivgi/kling-v3-video";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export type Post = {
  quote: string;
  caption: string;
  hashtags: string[];
  visualPrompt: string;
};

export type ReelHistory = {
  quotes: string[];        // recent quote strings to avoid repeating
  visualPrompts: string[]; // recent visual prompts to diverge from
};

// Theme pool — random pick per run gives Claude a creative seed without
// over-specifying. Keep items short and evocative; Claude expands.
const THEMES = [
  "letting go", "presence", "transitions", "stillness", "surrender",
  "softness", "focus", "rest", "permission", "trust", "the body",
  "breath", "morning", "endings", "beginnings", "patience", "noticing",
  "less control", "the gap between thoughts", "small returns",
];

export function pickTheme(): string {
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

// ---------- Concept ----------

const CONCEPT_SYSTEM = `You are a social media copywriter for CraftedDay. Your entire job is writing reel copy that *meditation-interested people on Instagram* engage with — saves, shares, follows. Not casual scrollers. Specifically the audience that already follows accounts like Tara Brach, Sarah Blondin, Headspace, Sharon Salzberg, Yung Pueblo, Light Watkins.

WHAT CRAFTEDDAY IS:
An AI-generated personalized meditation app. User describes their current mood/situation → app generates a custom ~5-minute guided meditation shaped to that exact day. The hook is "a meditation made for the day you're already having" — not another library of canned 30-min sessions.

WHO YOU'RE WRITING FOR:
The meditation-curious or already-practicing Instagram user. They:
- Engage with content that names a specific feeling or moment they've actually had ("the 3am thought spiral", "morning anxiety before opening the laptop", "the in-between commute mind").
- Reject generic affirmation slop ("You are enough", "Breathe and be happy", "Find your inner peace").
- Save posts that validate without solving, then offer a small doable practice.
- Trust quiet specificity over spiritual platitude.
- Are skeptical of hype, but warm to honesty.

WHAT MAKES A REEL LAND WITH THEM:
1. Names a specific everyday moment (not "stillness" — "the 3pm crash where you can't read another email").
2. Validates without preaching. They feel seen, not lectured.
3. Closes with a soft pull: a fresh today-shaped meditation is one tap away in CraftedDay.

What you are NOT writing:
- Generic spa quotes
- Aphorisms that sound deep but say nothing
- Anything that could appear on a Calm app loading screen unchanged
- Hype, hard sell, or "download now"

AESTHETIC: spa-like, warm, luxe — NOT techy, NOT hype, NOT affirmation cliché.

Output strict JSON only.`;

function conceptUserPrompt(opts: { theme: string; history: ReelHistory }) {
  const { theme, history } = opts;

  const recentQuotesBlock = history.quotes.length
    ? `Recent quotes you have already published (do NOT repeat these or anything structurally/thematically similar — diverge):\n${history.quotes.map((q) => `- ${q}`).join("\n")}\n\n`
    : "";

  const recentVisualsBlock = history.visualPrompts.length
    ? `Recent visual scenes you have already used (pick a meaningfully different scene — different world, different subject, different time of day):\n${history.visualPrompts.slice(0, 30).map((v) => `- ${v.slice(0, 200)}`).join("\n")}\n\n`
    : "";

  return `Generate one Instagram reel concept.

Today's theme seed: **${theme}** — interpret loosely. The quote and scene should sit in this emotional territory but you can angle in from anywhere.

${recentQuotesBlock}${recentVisualsBlock}Output JSON with this exact shape:
{
  "quote": string,           // 4 to 14 words. Sharp, calm, emotionally resonant. No emojis. No clichés.
  "caption": string,         // 2-4 short lines separated by \\n\\n. Reflective, soft CTA at the end. No emojis.
  "hashtags": string[],      // 3-6 lowercase tags, each starting with #. Always include #craftedday. Other tags should pull meditation/mindfulness/calm-aesthetic audiences (e.g. #meditation, #stillness, #morningroutine, #mindfulness, #calm, #innerwork, #presence, #slowliving).
  "visualPrompt": string     // Vertical 9:16 cinematic meditation background. See visual rules below.
}

QUOTE — this is the most important field, the one that sits as huge text overlaid on the video. **Treat it as the headline of the post.**

Length: 4–14 words.
Tone: sharp, calm, emotionally resonant.
Subject: a specific everyday moment a meditation-curious person has actually had — names the feeling, names the situation. Not abstract spiritual talk.

INTERNAL PROCESS (do this in your thinking):
1. Brainstorm 5–7 candidate lines for today's theme.
2. For each, ask: "If a stranger saw this on Instagram with no other context, would they screenshot it?" If no, cut it.
3. Pick the strongest. That's the quote.
4. The remaining strong candidates become the opening of the caption — never let your best line live in the caption while a weaker one is the quote.

CRITICAL — must make sense on first read. Not cryptic. Not riddle-like. Not the kind of line that sounds wise on Instagram and means nothing five seconds later. If a stranger reading it once couldn't paraphrase what you mean, it's wrong.

PLAIN LANGUAGE ONLY. Words a 12-year-old uses every day. No fancy vocabulary. No SAT words. No legal/academic/clinical words. Bad words to never use in a quote:
  re-litigate, contemplate, reconcile, manifest, surrender (as a verb), align,
  attune, regulate, embodied, sovereign, dichotomy, paradox, cultivate,
  invitation (as in "this is an invitation to..."), holding (as in "holding space").
If a meditation-app marketing person from 2019 would say it, don't.

Hits the right register — calibrate to the Yung Pueblo / Sarah Blondin level of meditation Instagram. Direct address. Names a specific thought-pattern or moment. Reframes it. Tone of someone who's done the work:
  - "Throw away the idea that you need to pause your life until you're healed."
  - "A real sign of progress is when you stop punishing yourself for being imperfect."
  - "You don't have to think your way out of feeling something."
  - "Forcing yourself to be happy isn't healing. Being honest about what you feel is."
  - "You are not behind. You were resting."
  - "If a thought keeps coming back, it wants to be felt — not solved."
  - "Your peace doesn't depend on someone else changing."
  - "Rest isn't something you have to earn."
  - "Healing rarely looks like progress. Sometimes it looks like staying still."
  - "Worry is not preparation."

Wrong — vague aphorism that sounds spiritual but says nothing specific:
  - "Arrive before you organize."
  - "Endings deserve the same attention as beginning."
  - "Stillness becomes you."
  - "The center holds."
  - "Light finds shape."
  - "Begin where you are."

No emojis. No "breathe and be happy" affirmation cliché. No "you are enough." Calibration only — invent something fresh.

CAPTION: 2–3 short lines, reflective, slightly direct. The last line is a soft pull toward the app — never salesy, never "download now." Good closers:
  - "A fresh one's waiting in CraftedDay."
  - "CraftedDay makes you a new one every morning."
  - "Open CraftedDay and tell it what kind of day it is."
  - "Built for the day you're already in. CraftedDay."
Vary the closer. Don't repeat the same phrasing across posts.

VISUAL PROMPT: A calm cinematic background, vertical 9:16, photorealistic, shallow depth of field. Pick from one of these worlds and invent the specific image — don't lift the examples:
  • Nature (forests, water, light, weather, mountains, deserts, fields)
  • Wood / natural materials (interiors with warm wood, stone, linen, ceramics, candles)
  • Luxe spa / Aman / Four Seasons / Amangiri / Brando aesthetic (architecture-meets-nature; pools, baths, suites, terraces)

Strict no-list: no people, no faces, no hands, no animals, no text, no logos, no clutter, no aerial drone shots, no sci-fi / fantasy. Sky/water/land must stay crisply separated — no muddy gradient washes.

Camera: locked-off or extremely slow drift. Cinematic, anamorphic, shot on film.
Light: soft, warm, natural — golden hour, candlelight, or diffuse morning light.
Composition: strong negative space in the center third so a quote can sit there.

Return JSON only. No prose, no markdown fence.`;
}

async function generateConcept(opts: { theme: string; history: ReelHistory }): Promise<Post> {
  const res = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8000,
    temperature: 1,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system: CONCEPT_SYSTEM,
    messages: [{ role: "user", content: conceptUserPrompt(opts) }],
  });

  const text = res.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Claude did not return JSON: ${text}`);

  const parsed = JSON.parse(jsonMatch[0]) as Post;
  const wc = parsed.quote ? parsed.quote.split(/\s+/).length : 0;
  if (!parsed.quote || wc < 3 || wc > 16)
    throw new Error(`Quote must be 4-14 words (got ${wc}): "${parsed.quote}"`);
  if (!parsed.caption) throw new Error("Caption missing");
  if (!parsed.hashtags || parsed.hashtags.length < 3 || parsed.hashtags.length > 6)
    throw new Error(`Hashtags must be 3-6, got ${parsed.hashtags?.length}`);
  if (!parsed.visualPrompt) throw new Error("Visual prompt missing");
  return parsed;
}

// ---------- Replicate ----------

async function generateBackground(visualPrompt: string, outPath: string) {
  const create = await fetch(
    `https://api.replicate.com/v1/models/${REPLICATE_MODEL}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
      },
      body: JSON.stringify({
        input: {
          prompt: visualPrompt,
          aspect_ratio: "9:16",
          duration: REEL_SECONDS,
          mode: "4k",
          generate_audio: true,
          negative_prompt:
            "letterbox, black bars, black borders, film matte, frame border, " +
            "vignette, dark edges, pillarbox, widescreen bars, " +
            "people, faces, hands, text, logos, watermark, low quality, " +
            "blurry, oversaturated, cartoon, anime, illustration, " +
            "muddy gradients, color bleeding between sky and water, " +
            "dreamy wash, washed-out colors, AI-generated look",
        },
      }),
    },
  );

  if (!create.ok) {
    throw new Error(`Replicate create failed: ${create.status} ${await create.text()}`);
  }

  let prediction = (await create.json()) as {
    id: string;
    status: string;
    output: string | string[] | null;
    error: string | null;
    urls: { get: string };
  };

  while (prediction.status === "starting" || prediction.status === "processing") {
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await fetch(prediction.urls.get, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    });
    if (!poll.ok) throw new Error(`Replicate poll failed: ${poll.status}`);
    prediction = await poll.json();
  }

  if (prediction.status !== "succeeded") {
    throw new Error(`Replicate failed: ${prediction.status} — ${prediction.error}`);
  }

  const out = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!out) throw new Error("Replicate returned no output URL");
  await downloadFile(out, outPath);
}

async function downloadFile(url: string, outPath: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(outPath));
}

// ---------- Render ----------

function wrapInto(quote: string, n: number): string[] {
  const words = quote.trim().split(/\s+/);
  if (n <= 1 || words.length <= n) return [quote];
  const per = Math.ceil(words.length / n);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += per) {
    lines.push(words.slice(i, i + per).join(" "));
  }
  return lines;
}

// Pick the line wrap that yields the largest font without overflowing
// `maxTextWidth`. The 0.50 char-width factor is calibrated for Fraunces
// SemiBold lowercase and includes a small safety buffer. Prefer candidates
// whose natural fit clears `floor`; if none do (very long quote), fall back
// to the candidate with the largest fit and accept a sub-floor font rather
// than overflow the frame.
function layoutQuote(quote: string, maxTextWidth: number, ceiling: number, floor: number) {
  const candidates = [1, 2, 3, 4, 5, 6].map((n) => {
    const lines = wrapInto(quote, n);
    const longest = Math.max(...lines.map((l) => l.length));
    const fit = Math.floor(maxTextWidth / (longest * 0.50));
    return { lines, fit };
  });
  const viable = candidates.filter((c) => c.fit >= floor);
  const pool = viable.length ? viable : candidates;
  pool.sort((a, b) => b.fit - a.fit);
  const best = pool[0];
  return { lines: best.lines, fontsize: Math.min(ceiling, best.fit) };
}

function escDrawtext(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019");
}

async function renderReel(backgroundPath: string, quote: string, outPath: string) {
  // 120px each side ≈ 11% — leaves headroom against IG's center-crop preview
  // (the in-feed thumbnail clips slightly tighter than the full reel frame).
  const SIDE_MARGIN = 120;
  const maxTextWidth = TARGET_WIDTH - SIDE_MARGIN * 2;
  // All-lowercase, no caps anywhere — calmer, less shouty, matches reference
  // Insta accounts (thegracieglow et al.) the team is calibrating against.
  const lowercased = quote.toLowerCase();
  const { lines, fontsize } = layoutQuote(lowercased, maxTextWidth, 130, 60);
  const lineGap = Math.round(fontsize * 0.16);

  const blockCenterY = `h*0.42`;
  const N = lines.length;
  const drawTexts = lines.map((line, i) => {
    const offset = `${blockCenterY}-(${N}*text_h+${(N - 1) * lineGap})/2+${i}*(text_h+${lineGap})`;
    return [
      `drawtext=fontfile='${FONT_PATH}'`,
      `text='${escDrawtext(line)}'`,
      `fontcolor=#FAF6EF`,
      `fontsize=${fontsize}`,
      `x=(w-text_w)/2`,
      `y=${offset}`,
      `borderw=2`,
      `bordercolor=black@0.40`,
      `shadowcolor=black@0.45`,
      `shadowx=0`,
      `shadowy=3`,
    ].join(":");
  });

  const filter = [
    `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${TARGET_WIDTH}:${TARGET_HEIGHT}`,
    ...drawTexts,
  ].join(",");

  // Encoder settings tuned to Instagram Reels' strictest published spec:
  // H.264 Main/4.0, 30fps CFR, closed GOP every 2s, no B-frames, AAC 48kHz
  // stereo 128k, +faststart. Buffer rejects on broader tolerances than IG
  // itself does, so we lock everything down.
  await runFfmpeg([
    "-y",
    "-stream_loop", "-1",
    "-i", backgroundPath,
    "-t", String(REEL_SECONDS),
    "-vf", filter,
    "-c:v", "libx264",
    "-profile:v", "main",
    "-level", "4.0",
    "-pix_fmt", "yuv420p",
    "-preset", "slow",
    "-crf", "17",
    "-maxrate", "12M",
    "-bufsize", "24M",
    "-r", "30",
    "-g", "60",
    "-keyint_min", "60",
    "-sc_threshold", "0",
    "-bf", "0",
    "-color_primaries", "bt709",
    "-color_trc", "bt709",
    "-colorspace", "bt709",
    "-color_range", "tv",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ar", "48000",
    "-ac", "2",
    "-movflags", "+faststart",
    outPath,
  ]);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegInstaller.path, args);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

// ---------- Upload ----------
//
// Two destinations per reel:
//   • Vercel Blob — long-term storage, URL goes into reel_posts.videoUrl for
//     archive/replay/history.
//   • tmpfiles.org — short-lived (~1hr) URL handed to Buffer for IG publish.
//     IG's Graph API media fetcher choked with `ERROR: ERROR` on every "real"
//     host we tried (R2 pub-xxx.r2.dev, R2 behind cdn.craftedday.com, and
//     Vercel Blob's *.public.blob.vercel-storage.com). The exact same file
//     posted successfully when fetched from tmpfiles. We don't know why IG's
//     fetcher tolerates tmpfiles and not the others. If tmpfiles ever stops
//     working, swap to file.io or stand up our own minimal /tmp server.

async function uploadToBlob(localPath: string, date: string): Promise<string> {
  const blob = await put(`reels/${date}.mp4`, readFileSync(localPath), {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: true,   // Blob v2 defaults to false
  });
  return blob.url;
}

async function uploadToTmpfiles(localPath: string): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([readFileSync(localPath)], { type: "video/mp4" }),
    "reel.mp4",
  );
  const res = await fetch("https://tmpfiles.org/api/v1/upload", {
    method: "POST",
    body: form,
  });
  const json = (await res.json()) as { status?: string; data?: { url?: string } };
  if (json.status !== "success" || !json.data?.url) {
    throw new Error(`tmpfiles upload failed: ${JSON.stringify(json)}`);
  }
  // Response gives http://tmpfiles.org/<id>/<filename> — IG needs the
  // /dl/ direct-download path over https.
  return json.data.url
    .replace(/^http:/, "https:")
    .replace("tmpfiles.org/", "tmpfiles.org/dl/");
}

// ---------- Buffer ----------

async function postToBuffer(post: Post, videoUrl: string): Promise<string> {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  const channelId = process.env.BUFFER_CHANNEL_ID;
  if (!token || !channelId) throw new Error("BUFFER_ACCESS_TOKEN + BUFFER_CHANNEL_ID required");

  const text = `${post.caption}\n\n${post.hashtags.join(" ")}`;

  const mutation = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess { post { id } }
        ... on MutationError { message }
      }
    }
  `;

  const variables = {
    input: {
      text,
      channelId,
      schedulingType: "automatic",
      mode: "shareNow",
      metadata: {
        instagram: { type: "reel", shouldShareToFeed: true },
      },
      assets: { videos: [{ url: videoUrl, thumbnailUrl: videoUrl }] },
    },
  };

  const res = await fetch("https://api.buffer.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: mutation, variables }),
  });

  const json = (await res.json()) as {
    data?: { createPost?: { post?: { id: string }; message?: string } };
    errors?: { message: string }[];
  };

  if (json.errors?.length) throw new Error(`Buffer GraphQL: ${JSON.stringify(json.errors)}`);
  const result = json.data?.createPost;
  if (!result?.post?.id) throw new Error(`Buffer rejected: ${JSON.stringify(json)}`);
  return result.post.id;
}

// ---------- Public entrypoint ----------

export async function generateAndPostReel(opts: {
  date: string;
  theme: string;
  history: ReelHistory;
}) {
  const { date, theme, history } = opts;
  const tmp = `/tmp/reel-${date}-${Date.now()}`;
  await mkdir(tmp, { recursive: true });
  const backgroundPath = join(tmp, "background.mp4");
  const reelPath = join(tmp, "reel.mp4");

  try {
    log("reel", "concept:start", { theme, historySize: history.quotes.length });
    const post = await generateConcept({ theme, history });
    log("reel", "concept:done", { quote: post.quote });

    log("reel", "bg:start", { model: REPLICATE_MODEL });
    await generateBackground(post.visualPrompt, backgroundPath);
    log("reel", "bg:done");

    log("reel", "render:start");
    await renderReel(backgroundPath, post.quote, reelPath);
    log("reel", "render:done");

    // Upload to both in parallel: Blob for permanent storage (DB record),
    // tmpfiles for the IG-fetchable URL we hand to Buffer.
    log("reel", "upload:start");
    const [blobUrl, tmpfilesUrl] = await Promise.all([
      uploadToBlob(reelPath, date),
      uploadToTmpfiles(reelPath),
    ]);
    log("reel", "upload:done", { blobUrl, tmpfilesUrl });

    log("reel", "buffer:post");
    const bufferPostId = await postToBuffer(post, tmpfilesUrl);
    log("reel", "buffer:done", { bufferPostId });

    return { post, theme, publicUrl: blobUrl, bufferPostId };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
