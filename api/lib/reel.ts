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
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
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

const CONCEPT_SYSTEM = `You are the editorial voice for CraftedDay, an AI-powered personalized meditation app.

Your audience: people who already meditate or want to. Calm, reflective, slightly skeptical of generic wellness sludge.

Aesthetic: spa-like, warm, luxe — NOT techy, NOT hype, NOT affirmation cliché.

You have creative latitude. Surprise the reader. Don't recycle the obvious meditation-influencer phrasings. Output strict JSON only.`;

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
  "quote": string,           // <= 10 words, sharp, calm, emotionally resonant. No emojis. No clichés.
  "caption": string,         // 2-4 short lines separated by \\n\\n. Reflective, soft CTA at the end. No emojis.
  "hashtags": string[],      // 3-6 lowercase tags, each starting with #
  "visualPrompt": string     // Vertical 9:16 cinematic meditation background. See visual rules below.
}

QUOTE: Sharp, calm, emotionally resonant. <=10 words. No emojis. No "breathe and be happy" affirmation cliché. No "you are enough". Examples of the right register: "Peace starts where control ends." / "Stillness is a skill." / "You are not your next thought." But invent something fresh — these are calibration only, not a template.

CAPTION: 2–4 short lines, reflective, slightly direct. Soft CTA at end (e.g. "try it tonight" / "let it sit").

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
    max_tokens: 800,
    temperature: 1,
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
  if (!parsed.quote || parsed.quote.split(/\s+/).length > 10)
    throw new Error(`Quote must be <= 10 words: "${parsed.quote}"`);
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

function layoutQuote(quote: string, maxTextWidth: number, ceiling: number) {
  const candidates = [1, 2, 3].map((n) => {
    const lines = wrapInto(quote, n);
    const longest = Math.max(...lines.map((l) => l.length));
    const fit = Math.floor(maxTextWidth / (longest * 0.52));
    return { lines, fontsize: Math.min(ceiling, fit) };
  });
  candidates.sort((a, b) => b.fontsize - a.fontsize);
  return candidates[0];
}

function escDrawtext(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019");
}

async function renderReel(backgroundPath: string, quote: string, outPath: string) {
  const SIDE_MARGIN = 88;
  const maxTextWidth = TARGET_WIDTH - SIDE_MARGIN * 2;
  const { lines, fontsize: fitFontsize } = layoutQuote(quote, maxTextWidth, 168);
  const fontsize = Math.max(72, fitFontsize);
  const lineGap = Math.round(fontsize * 0.18);

  const blockCenterY = `h*0.36`;
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
      `borderw=4`,
      `bordercolor=black@0.65`,
      `shadowcolor=black@0.55`,
      `shadowx=0`,
      `shadowy=4`,
      `alpha='if(lt(t,0.4),t/0.4,1)'`,
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
    "-preset", "medium",
    "-crf", "20",
    "-r", "30",
    "-g", "60",
    "-keyint_min", "60",
    "-sc_threshold", "0",
    "-bf", "0",
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

async function uploadToR2(localPath: string, date: string): Promise<string> {
  const key = `reels/${date}.mp4`;
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: readFileSync(localPath),
      ContentType: "video/mp4",
    }),
  );
  return `${R2_PUBLIC_URL}/${key}`;
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

    log("reel", "r2:upload");
    const publicUrl = await uploadToR2(reelPath, date);
    log("reel", "r2:done", { publicUrl });

    log("reel", "buffer:post");
    const bufferPostId = await postToBuffer(post, publicUrl);
    log("reel", "buffer:done", { bufferPostId });

    return { post, theme, publicUrl, bufferPostId };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
