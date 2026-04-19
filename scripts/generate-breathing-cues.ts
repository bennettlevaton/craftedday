// Generates TTS audio for each breathing cue shown on the loading screen.
// Produces both female and male voice variants.
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

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
if (!ELEVENLABS_API_KEY) {
  console.error("Missing ELEVENLABS_API_KEY");
  process.exit(1);
}

const VOICES = {
  female: "pjcYQlDFKMbcOUp6F5GD",
  male: "FxUqz8G7NkRtbO7TA7gS",
} as const;

const VOICE_SETTINGS = {
  stability: 0.35,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
  speed: 0.75,
};

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

async function generateCue(
  text: string,
  voiceId: string,
): Promise<Buffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        output_format: "mp3_44100_128",
        voice_settings: VOICE_SETTINGS,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error ${res.status}: ${err}`);
  }

  return Buffer.from(await res.arrayBuffer());
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
