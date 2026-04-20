// Generates the one-time welcome meditation for new CraftedDay users.
// Run once, upload to R2 as stock/welcome.mp3, then add the URL to env.
//
//   cd api && npm run welcome:generate
//
// Saves to: R2 stock/welcome.mp3
// Add output URL to Vercel + .env.local as WELCOME_MEDITATION_URL

import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import Anthropic from "@anthropic-ai/sdk";
import { ElevenLabsClient } from "elevenlabs";
import { config } from "dotenv";

config({ path: ".env.local" });

const {
  ANTHROPIC_API_KEY,
  ELEVENLABS_API_KEY,
  CLOUDFLARE_R2_ACCOUNT_ID,
  CLOUDFLARE_R2_ACCESS_KEY_ID,
  CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  CLOUDFLARE_R2_BUCKET_NAME,
  CLOUDFLARE_R2_PUBLIC_URL,
} = process.env;

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const elevenlabs = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });

// Female voice (Lauren) — same as the default app voice
const VOICE_ID = "pjcYQlDFKMbcOUp6F5GD";
const DURATION_SECONDS = 600; // 10 minutes

const SYSTEM_PROMPT = `You are writing a guided meditation script for a new user's very first session with a meditation app called CraftedDay.

This is a special moment — their first breath, their first pause. The script should feel like a warm welcome into a practice, not a product demo. Never mention the app by name in the script. Just guide them.

The meditation should:
- Open by acknowledging this is a fresh beginning — a moment they carved out for themselves
- Establish breath as the anchor for their practice going forward
- Include a gentle body scan from top to bottom
- Have a section where they set a personal intention for their practice (open-ended — what do they want this space to be for them?)
- Close with a grounding return and a quiet sense of possibility

Tone: warm, unhurried, human. Write in second person ("you"), use inclusive "we" for shared moments. Short sentences. No robotic instruction.

Target: ${DURATION_SECONDS / 60} minutes (narration + silences combined). ~${Math.round((DURATION_SECONDS / 60) * 140 * 0.80)} words of narration.

Use <break time="Xs" /> tags for silence. Stack consecutive 3s tags for longer pauses. Every sentence ends with a break tag.

BREATH CYCLES ARE ONE UNIT: "Breathe in. <break time="4s"/> And breathe out. <break time="6s"/>" — never stack breaks between inhale and exhale.

Output ONLY the script. No titles, headers, or explanation.`;

async function main() {
  console.log("→ Generating welcome meditation script...");

  const response = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 20000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          "Write the welcome meditation now. This person has never meditated before. They just signed up and are taking their very first moment of stillness.",
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No script generated");
  }
  const script = textBlock.text.trim();
  console.log(
    `  Script ready (${script.length} chars, ~${response.usage.output_tokens} tokens)`,
  );

  console.log("→ Synthesizing audio via ElevenLabs...");
  const trailing =
    " <break time=\"3s\" /> <break time=\"3s\" /> <break time=\"3s\" /> <break time=\"3s\" />";
  const stream = await elevenlabs.textToSpeech.convert(VOICE_ID, {
    text: script + trailing,
    model_id: "eleven_turbo_v2_5",
    output_format: "mp3_44100_128",
    voice_settings: {
      stability: 0.35,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
      speed: 0.7,
    },
  });

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const audio = Buffer.concat(chunks);
  console.log(`  Audio ready (${(audio.length / 1024 / 1024).toFixed(2)} MB)`);

  console.log("→ Uploading to R2...");
  const key = "stock/welcome.mp3";
  await r2.send(
    new PutObjectCommand({
      Bucket: CLOUDFLARE_R2_BUCKET_NAME!,
      Key: key,
      Body: audio,
      ContentType: "audio/mpeg",
    }),
  );

  const url = `${CLOUDFLARE_R2_PUBLIC_URL}/${key}`;
  console.log(`\n✓ Welcome meditation uploaded`);
  console.log(`  ${url}`);
  console.log(`\nAdd to Vercel + .env.local:`);
  console.log(`  WELCOME_MEDITATION_URL=${url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
