// Local text-overlay tuning loop. Reuses ONE cached background mp4 and renders
// the overlay (font, layout, stroke, position) for a small set of test quotes.
// No Replicate, no Buffer, no DB.
//
// Drop a 9:16 mp4 at scripts/tmp/background.mp4 (any vertical clip works —
// even an image-loop). Then from api/:
//   npm run reel:preview
//
// Iterate by editing renderReel in api/lib/reel.ts and re-running — ~2s per
// quote, no API calls.

import { config } from "dotenv";
config({ path: ".env.local" });

import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const BG_PATH = resolve(SCRIPTS_DIR, "tmp", "background.mp4");
const OUT_DIR = resolve(SCRIPTS_DIR, "tmp", "previews");

// Edge-case set: short, medium, long, lowercase poetic, body/somatic.
// Add/remove freely — the point is to catch layout regressions across lengths.
const QUOTES = [
  "the house went quiet. you can too.",
  "the meeting ended. your body is learning that now.",
  "morning arrived softly. the phone did not.",
  "your body is in bed. your jaw is still in the meeting.",
  "you've been holding your shoulders up since 9am.",
  "some doors close once. the mind keeps opening them.",
  "you carried too much today. put some of it here.",
];

// Synthesizes a 9:16 warm-earth solid via ffmpeg's lavfi color source. Good
// enough to judge text legibility, contrast, stroke, and layout. Drop a real
// Kling clip at scripts/tmp/background.mp4 anytime to override.
async function ensureBackground() {
  if (existsSync(BG_PATH)) return;
  await mkdir(dirname(BG_PATH), { recursive: true });
  console.log(`No background at ${BG_PATH} — generating warm placeholder...`);
  await new Promise<void>((res, rej) => {
    const p = spawn(ffmpegInstaller.path, [
      "-y",
      "-f", "lavfi",
      "-i", "color=c=0x6b5942:s=1080x1920:r=30:d=7",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-t", "7",
      BG_PATH,
    ]);
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); });
    p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}\n${err.slice(-500)}`))));
  });
  console.log(`  → wrote placeholder ${BG_PATH}\n`);
}

async function main() {
  await ensureBackground();
  const { renderReel } = await import("../api/lib/reel");
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`\nRendering ${QUOTES.length} previews from ${BG_PATH}\n  → ${OUT_DIR}\n`);
  const t0 = Date.now();
  for (let i = 0; i < QUOTES.length; i++) {
    const out = join(OUT_DIR, `preview-${String(i + 1).padStart(2, "0")}.mp4`);
    const t = Date.now();
    await renderReel(BG_PATH, QUOTES[i], out);
    console.log(`  [${i + 1}/${QUOTES.length}] ${((Date.now() - t) / 1000).toFixed(1)}s  "${QUOTES[i]}"`);
  }
  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
