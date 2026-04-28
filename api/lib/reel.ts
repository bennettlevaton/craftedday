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

// Spectral Medium — humanist serif by Production Type. Lower stroke contrast
// and calmer terminals than Fraunces 144pt SemiBold (which is a display cut
// optimized for posters). Reads closer to the wellness/Calm grid aesthetic.
// Cormorant Garamond would also fit but only ships as a variable font in
// google/fonts and ffmpeg's drawtext can't cleanly select weight axes.
const FONT_PATH = join(process.cwd(), "lib/fonts/Spectral-SemiBold.ttf");
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
  "caption": string,         // 2-3 short lines separated by \\n\\n (max 3). Reflective, soft CTA at the end. Each line adds a NEW beat — never paraphrase or explain the quote. No emojis.
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

Hits the right register — name an observable behavior or body state the reader instantly recognizes as themselves. Not a belief, not a reframe, not wisdom. The "shit, this is me" line that gets screenshotted and DMed to a friend. Tone is warm and direct, never preachy.

HOOK BANK — pick one structure, weighted toward the top:

1. JUXTAPOSITION (~35% — strongest pattern). Two clauses: one place the body/clock has moved on, another place the mind/nervous system hasn't. Almost always lands.
   - "your body is in bed. your jaw is still in the meeting."
   - "the car is parked. your mind is still driving."
   - "the conversation ended hours ago. your mind is still in it."
   - "you closed the laptop an hour ago. your shoulders haven't."

2. UNNOTICED HABIT (~20%). Catch the reader doing the thing they didn't realize they were doing.
   - "you finally sat down and immediately picked up your phone."
   - "you stopped tasting your coffee three sips in."
   - "you've read that sentence three times and don't know what it said."

3. BODY TENSION (~20%). Name a specific somatic clench, anchored to a time.
   - "you've been holding your shoulders up since 9am."
   - "you've been clenching your jaw the whole meeting."
   - "you haven't taken a real breath since you opened your laptop."

4. MODERN WORK FATIGUE (~15%). Slack/inbox/laptop dissociation, post-work decompression failure.
   - "you started the day inside other people's emergencies."
   - "watching one more episode is not the same as decompressing."
   - "answering one more email is not winding down."

5. SELF-TALK (~10%). The gap between how you talk to others and how you talk to yourself.
   - "you speak to everyone more gently than you speak to yourself."
   - "rereading the text three times before you send it isn't caring more — it's anxiety."

Wrong — universal aphorism / wisdom drop with no specific moment named (sounds profound, slides off):
  - "Worry is not preparation."
  - "Healing rarely looks like progress."
  - "You are not behind. You were resting."
  - "Rest isn't something you have to earn."
  - "Arrive before you organize."
  - "Endings deserve the same attention as beginning."
  - "Stillness becomes you."
  - "Begin where you are."

Test: if the line could appear on a Yung Pueblo tile unchanged, it's wrong. The line should describe a body, a behavior, or a specific moment — something a reader can point at and say "that's literally me right now."

No emojis. No "breathe and be happy" affirmation cliché. No "you are enough." Calibration only — invent something fresh.

CAPTION: 2–3 short lines (max 3), separated by \\n\\n. The caption must extend the quote, not soften or summarize it.

EVERY caption line must be as concrete as the quote. Same register: name a body, a behavior, a real moment. No "soft wellness filler" — no "honor your nervous system," "give yourself grace," "trust the process," "your body is wisdom," "presence is a gift." If a line could appear on a generic mindfulness account, cut it.

Structure that works:
  Line 1 — extend or sharpen the quote with a second concrete observation.
  Line 2 (optional) — one practical, body-level micro-action OR one more recognized moment. Never a moral.
  Line 3 (closer) — soft pull toward CraftedDay.

Good caption (concrete throughout):
  Quote: "you came home an hour ago. your shoulders haven't."
  → "the body doesn't always arrive when you do.
     one honest exhale counts as coming back.
     open CraftedDay and tell it what kind of day it was."

Bad caption (drifts into wellness filler):
  → "the body holds what the mind cannot release.
     give yourself permission to soften.
     your nervous system will thank you."

Read your caption back before finalizing — every sentence must parse cleanly on first read. No broken syntax, no "the body X than the body does" tautologies, no half-finished metaphors.

Closers — vary across posts, never repeat verbatim:
  - "a fresh one's waiting in CraftedDay."
  - "CraftedDay makes you a new one every morning."
  - "open CraftedDay and tell it what kind of day it is."
  - "built for the day you're already in. CraftedDay."
Never salesy, never "download now."

VISUAL PROMPT: A calm cinematic background for a premium meditation brand. Vertical 9:16, photorealistic, shallow depth of field, loopable.

Aesthetic: quiet luxury wellness, editorial, soft spiritual. Restorative, emotionally safe, slow nervous system energy. Should feel like something the viewer wants to associate with publicly.

Scene — pick one world and invent the specific shot (don't lift examples):
  • Nature in subtle motion: wind through wildflowers, sunlight on water, slow waterfall mist, ocean at sunrise, rain on leaves, floating pollen, forest light beams, mist drifting through trees, ripples on a still lake, meadow grass swaying
  • Warm interiors: linen, warm wood, stone, ceramics, a single candle, morning light through gauze curtains
  • Aman / Amangiri / Four Seasons / Brando aesthetic: pools, baths, terraces where architecture meets nature

Camera: locked-off or extremely slow drift — gentle dolly or handheld micro-movement. Macro lens feel, dreamy focus. Cinematic, anamorphic, shot on film.

Light: golden hour or soft overcast natural light. Warm highlights, gentle shadows.

Color: muted greens, creams, soft gold, warm earth tones. Sky/water/land must stay crisply separated — no muddy gradient washes, no oversaturation.

Motion: very subtle. Wind, breath, water, light shift — small enough that the eye relaxes. No fast cuts, no chaos, no whip pans.

Composition: strong negative space in the center third so 2-3 lines of quote can sit there cleanly.

Strict no-list: no people, no faces, no hands, no animals, no text, no logos, no clutter, no aerial drone shots, no sci-fi / fantasy, no AI-generated look.

Return JSON only. No prose, no markdown fence.`;
}

export async function generateConcept(opts: { theme: string; history: ReelHistory }): Promise<Post> {
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

// Distribute extras to the first lines so the bottom line never trails as a
// 1-2 word stub. `Math.ceil(words/n)` dumps remainder into the last line and
// produces an upside-down-pyramid block (e.g. `[4, 4, 2]` for 10 words at
// n=3). Balanced: `[4, 3, 3]`.
function wrapInto(quote: string, n: number): string[] {
  const words = quote.trim().split(/\s+/);
  if (n <= 1 || words.length <= n) return [quote];
  const base = Math.floor(words.length / n);
  const extra = words.length % n;
  const lines: string[] = [];
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const take = base + (i < extra ? 1 : 0);
    lines.push(words.slice(idx, idx + take).join(" "));
    idx += take;
  }
  return lines;
}

// Bias toward the FEWEST lines that fit within the floor — gives a compact
// 2–3 line block in the upper third (luxe wellness grid reference) instead
// of a tall narrow column. Cap at 4 lines; very long quotes accept a
// sub-floor font rather than spilling to 5+ lines. The 0.52 char-width
// factor is calibrated for Fraunces SemiBold lowercase with a safety buffer.
function layoutQuote(quote: string, maxTextWidth: number, ceiling: number, floor: number) {
  const candidates = [2, 3, 4].map((n) => {
    const lines = wrapInto(quote, n);
    const longest = Math.max(...lines.map((l) => l.length));
    // 0.48 calibrated for Spectral Medium lowercase (narrower than the old
    // Fraunces SemiBold value of 0.52).
    const fit = Math.floor(maxTextWidth / (longest * 0.48));
    return { lines, fit };
  });
  const viable = candidates.find((c) => c.fit >= floor);
  const choice = viable ?? candidates[candidates.length - 1];
  return { lines: choice.lines, fontsize: Math.min(ceiling, choice.fit) };
}

function escDrawtext(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019");
}

export async function renderReel(backgroundPath: string, quote: string, outPath: string) {
  // 140px each side ≈ 13% — more breathing room, matches the luxe wellness
  // grid reference where text sits well inside the frame, never edge-to-edge.
  const SIDE_MARGIN = 140;
  const maxTextWidth = TARGET_WIDTH - SIDE_MARGIN * 2;
  // All-lowercase, no caps anywhere — calmer, less shouty, matches the
  // reference grid (lowercase serif, top-anchored, generous whitespace).
  const lowercased = quote.toLowerCase();
  // Restrained vs. the original 64–96 range, but bumped back up from the
  // first pass which under-shot. Floor 56 keeps even the longest quotes
  // readable without dropping to 5+ lines.
  const { lines, fontsize } = layoutQuote(lowercased, maxTextWidth, 88, 56);
  // Constant line-height — using ffmpeg's `text_h` made spacing uneven because
  // descenders (g/p/y) make some lines taller than others. Fixed step = even
  // rhythm. 1.10 (was 1.18) gives a tighter, more poetic block.
  const lineHeight = Math.round(fontsize * 1.10);

  // Anchored higher (was 0.32) — reference grid sits text in the upper
  // quarter, like "Bloomscroll Break!" / "Your Birth Month → Your Soundscape".
  const blockCenterY = `h*0.24`;
  const N = lines.length;
  const totalHeight = N * lineHeight;
  const drawTexts = lines.map((line, i) => {
    const y = `${blockCenterY}-${totalHeight / 2}+${i * lineHeight}`;
    // No stroke/border. Clean serif on its own. Soft drop shadow only —
    // just enough to anchor the type to the frame without ringing it.
    return [
      `drawtext=fontfile='${FONT_PATH}'`,
      `text='${escDrawtext(line)}'`,
      `fontcolor=#FAF6EF`,
      `fontsize=${fontsize}`,
      `x=(w-text_w)/2`,
      `y=${y}`,
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
