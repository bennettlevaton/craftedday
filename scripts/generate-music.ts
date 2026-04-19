// Generates an ambient meditation track via ElevenLabs Music API and uploads
// it to the craftedday R2 bucket under stock_music/<uuid>.mp3.
//
// Run from the api/ directory so that dotenv picks up api/.env.local and the
// api/ node_modules is in scope:
//
//   cd api && npm run music:generate
//
// Optional override:
//   MUSIC_PROMPT="your custom prompt" npm run music:generate

import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";

config({ path: ".env.local" });

const {
  ELEVENLABS_API_KEY,
  CLOUDFLARE_R2_ACCOUNT_ID,
  CLOUDFLARE_R2_ACCESS_KEY_ID,
  CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  CLOUDFLARE_R2_BUCKET_NAME,
  CLOUDFLARE_R2_PUBLIC_URL,
  MUSIC_PROMPT,
} = process.env;

const required = {
  ELEVENLABS_API_KEY,
  CLOUDFLARE_R2_ACCOUNT_ID,
  CLOUDFLARE_R2_ACCESS_KEY_ID,
  CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  CLOUDFLARE_R2_BUCKET_NAME,
  CLOUDFLARE_R2_PUBLIC_URL,
};
for (const [key, value] of Object.entries(required)) {
  if (!value) {
    console.error(`Missing env: ${key}`);
    process.exit(1);
  }
}

const DEFAULT_PROMPT = `A 5-minute sustained ambient drone for meditation. Warm analog synth pads held at a steady volume throughout. No percussion, no drums, no vocals, no spoken word, no melody, no distinct musical phrases. No dynamic swells, no builds, no drops, no dramatic moments. Unchanging texture — the first minute should sound the same as the last. Think Brian Eno's Music for Airports or a tanpura drone. Soft warm low-mid frequencies with gentle high-end shimmer, consistent across the full duration. The listener should barely notice it — it's meant to fade into the background under guided meditation narration. Loops seamlessly.`;

const MUSIC_LENGTH_MS = 300_000; // 5 minutes

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

async function main() {
  const id = randomUUID();
  const prompt = MUSIC_PROMPT ?? DEFAULT_PROMPT;
  const started = Date.now();

  console.log(`→ Generating ${MUSIC_LENGTH_MS / 60_000}-min ambient track: ${id}`);
  console.log(`  Prompt: ${prompt.slice(0, 80)}${prompt.length > 80 ? "…" : ""}`);

  const res = await fetch("https://api.elevenlabs.io/v1/music/compose", {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      prompt,
      music_length_ms: MUSIC_LENGTH_MS,
      output_format: "mp3_44100_128",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`✗ ElevenLabs Music API error ${res.status}`);
    console.error(body);
    process.exit(1);
  }

  const audio = Buffer.from(await res.arrayBuffer());
  const mb = (audio.length / 1024 / 1024).toFixed(2);
  console.log(`  Generated ${mb} MB in ${Math.round((Date.now() - started) / 1000)}s`);

  const key = `stock_music/${id}.mp3`;
  await r2.send(
    new PutObjectCommand({
      Bucket: CLOUDFLARE_R2_BUCKET_NAME!,
      Key: key,
      Body: audio,
      ContentType: "audio/mpeg",
    }),
  );

  const url = `${CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
  console.log(`✓ Uploaded to R2`);
  console.log(`  ${url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
