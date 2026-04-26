// Generates TTS audio for each breathing cue shown on the loading screen.
// Produces both female (Luna) and male (Gareth) voice variants on Inworld TTS,
// matching the runtime voice picks in api/lib/inworld.ts.
//
// Run from the api/ directory:
//   cd api && npm run cues:generate
//
// Output: mobile/assets/audio/breathing/female/cue_00.mp3 ... cue_16.mp3
//                                         male/cue_00.mp3   ... cue_16.mp3

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { config } from "dotenv";

config({ path: ".env.local" });

const IN_WORLD_API = process.env.IN_WORLD_API;
if (!IN_WORLD_API) {
  console.error("Missing IN_WORLD_API");
  process.exit(1);
}

const VOICES = {
  female: "Luna",
  male: "Gareth",
} as const;

// Slower than the meditation pace — cues are short, slowing them lets each
// breath instruction breathe (heh).
const SPEAKING_RATE = 0.8;

const CUES = [
  "Crafting your session. Begin settling in now.",
  "Find a comfortable position.",
  "Let your eyes close softly.",
  "Breathe in slowly through your nose.",
  "And let it all the way out.",
  "Feel your feet grounded beneath you.",
  "Allow your shoulders to drop.",
  "Breathe in what you need today.",
  "Breathe out whatever you're carrying.",
  "Let your jaw soften.",
  "Your hands, open and easy.",
  "Stay with your breath.",
  "Breathing in calm.",
  "Breathing out tension.",
  "One more slow breath in.",
  "And let it go.",
  "Your session is almost ready.",
];

async function generateCue(text: string, voiceId: string): Promise<Buffer> {
  const res = await fetch("https://api.inworld.ai/tts/v1/voice", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${IN_WORLD_API}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      model_id: "inworld-tts-1.5-max",
      audio_config: {
        audio_encoding: "MP3",
        speaking_rate: SPEAKING_RATE,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "<unreadable>");
    throw new Error(`Inworld TTS ${res.status}: ${err.slice(0, 200)}`);
  }

  const json = (await res.json()) as { audioContent?: string };
  if (!json.audioContent) {
    throw new Error("Inworld response missing audioContent");
  }
  return Buffer.from(json.audioContent, "base64");
}

async function main() {
  const root = join(__dirname, "..", "mobile", "assets", "audio", "breathing");

  for (const gender of ["female", "male"] as const) {
    const dir = join(root, gender);
    mkdirSync(dir, { recursive: true });
    console.log(`\n→ Generating ${gender} voice (${CUES.length} cues)...`);

    for (let i = 0; i < CUES.length; i++) {
      const cue = CUES[i];
      const filename = `cue_${String(i).padStart(2, "0")}.mp3`;
      process.stdout.write(`  [${i + 1}/${CUES.length}] "${cue.slice(0, 40)}" `);
      const audio = await generateCue(cue, VOICES[gender]);
      writeFileSync(join(dir, filename), audio);
      console.log(`✓ ${(audio.length / 1024).toFixed(0)}KB`);
    }

    console.log(`✓ ${gender} done`);
  }

  console.log("\n✓ All cues generated.");
  console.log("  Run flutter pub get and restart the app.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
