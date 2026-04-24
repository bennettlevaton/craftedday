// Generates the one-time welcome meditation via the same pipeline used for
// every other session (Haiku plan → Opus sections → eleven_v3 TTS → PCM
// assembly), so tone, pacing, and duration land identically to live output.
//
// Produces female + male audio, uploads to R2, and writes the full data
// (URLs + script + title) to api/lib/welcome-data.json. The app reads from
// there on onboarding to grant new users their first session instantly.
//
// Run from the api/ directory (so tsx picks up tsconfig paths):
//   cd api && npm run welcome:generate
//
// After running: commit api/lib/welcome-data.json and deploy.

import { writeFileSync } from "fs";
import { join } from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "dotenv";

// Must load env BEFORE importing any api/lib module — those modules
// initialize Anthropic/ElevenLabs/R2 clients at module-load time using
// process.env. Static imports are hoisted above this call, so we load
// the pipeline modules dynamically inside main().
config({ path: ".env.local" });

const DURATION_SECONDS = 600;
const TITLE = "Your first session";
const PROMPT =
  "A welcoming first meditation — a gentle invitation into the practice. " +
  "Establish the breath as an anchor, a light body scan from head to toe, " +
  "and an open-ended moment for them to set an intention for what this " +
  "practice will be for them.";

// Neutral listener context — we don't know them yet, and this session should
// feel universal. Beginner pacing keeps it unhurried for first-timers.
const LISTENER_CONTEXT = {
  name: null,
  experienceLevel: "beginner",
  primaryGoals: [] as string[],
  primaryGoalCustom: null,
  preferenceSummary: null,
};

async function main() {
  // Dynamic imports AFTER dotenv has populated process.env.
  const { generateScript, generateAudio } = await import("../api/lib/meditation");
  const { r2, R2_BUCKET, R2_PUBLIC_URL } = await import("../api/lib/r2");

  async function renderAndUpload(
    gender: "female" | "male",
    script: string,
  ): Promise<string> {
    console.log(`→ Synthesizing audio (${gender}) via eleven_v3 pipeline...`);
    const audio = await generateAudio(script, gender, DURATION_SECONDS);
    console.log(`  Audio ready (${(audio.length / 1024 / 1024).toFixed(2)} MB)`);

    const key = `stock/welcome-${gender}.mp3`;
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: audio,
        ContentType: "audio/mpeg",
      }),
    );
    const url = `${R2_PUBLIC_URL}/${key}`;
    console.log(`  Uploaded → ${url}`);
    return url;
  }

  console.log("→ Generating welcome script (Haiku plan → Opus sections)...");
  const { script, title } = await generateScript(
    PROMPT,
    DURATION_SECONDS,
    LISTENER_CONTEXT,
    { timeOfDay: null }, // universal — no greeting tied to time of day
  );
  console.log(`  Script ready (${script.length} chars, title: "${title}")`);

  // Sequential, not parallel — the app's pipeline already saturates the
  // ElevenLabs concurrency cap (5 on Starter) within a single voice render.
  // Running both voices at once would trip rate_limit_error.
  const femaleUrl = await renderAndUpload("female", script);
  const maleUrl = await renderAndUpload("male", script);

  const data = {
    title: TITLE,
    duration: DURATION_SECONDS,
    prompt: "Your first session — a gentle welcome into the practice.",
    script,
    female: { audioUrl: femaleUrl },
    male: { audioUrl: maleUrl },
    generatedAt: new Date().toISOString(),
  };

  const outPath = join(__dirname, "..", "api", "lib", "welcome-data.json");
  writeFileSync(outPath, JSON.stringify(data, null, 2));

  console.log(`\n✓ Welcome data written to ${outPath}`);
  console.log(`  Commit and deploy — new users will get this on onboarding.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
