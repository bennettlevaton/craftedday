// Inworld TTS client. Sole TTS provider for the app.
//
// Auth: IN_WORLD_API is the already-base64-encoded `client_id:client_secret`
// pair Inworld provides. We pass it through as-is in the Basic header.
//
// Pricing: $50/M chars on self-serve, $40/M on $300 plan, $30/M on $1500 plan.
// Top of TTS-Arena quality leaderboard as of Mar 2026.

import { log } from "./log";

const INWORLD_URL = "https://api.inworld.ai/tts/v1/voice";
const INWORLD_MODEL = "inworld-tts-1.5-max";

// Starting voice picks for testing. Iterate after listening — Inworld has a
// catalog and supports voice cloning from a 5–10s reference if needed.
export const INWORLD_VOICES = {
  female: "Deborah",
  male: "Damon",
} as const;

// Canonical voice-gender type for the whole app. We only surface female/male
// to users; voice IDs above are the implementation detail.
export type VoiceGender = keyof typeof INWORLD_VOICES;

export async function inworldTTSToMp3(
  text: string,
  voiceId: string,
): Promise<Buffer> {
  const apiKey = process.env.IN_WORLD_API;
  if (!apiKey) {
    throw new Error("IN_WORLD_API is not set");
  }

  const started = Date.now();
  const res = await fetch(INWORLD_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      model_id: INWORLD_MODEL,
      // Lower temperature = more deterministic / consistent sampling. Default
      // is 1.0; 0.7 keeps the calm meditation register stable across the 30+
      // chunks of a single session and reduces voice drift between sessions.
      temperature: 0.7,
      audio_config: {
        audio_encoding: "MP3",
        // 0.85 = 15% slower than default — calibrated for meditation pace.
        // Inworld accepts 0.5–1.5 with 1.0 as default.
        speaking_rate: 0.85,
        // Sample rate not exposed in audio_config for MP3 — Inworld returns at
        // its native rate (44.1kHz). We decode through ffmpeg to PCM downstream.
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "<unreadable>");
    log("inworld", "tts error", { status: res.status, body: errText.slice(0, 500) });
    throw new Error(`Inworld TTS ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json() as { audioContent?: string };
  if (!json.audioContent) {
    throw new Error("Inworld TTS response missing audioContent");
  }

  const mp3 = Buffer.from(json.audioContent, "base64");
  log("inworld", "chunk synthesized", {
    ms: Date.now() - started,
    chars: text.length,
    bytes: mp3.length,
    voiceId,
  });
  return mp3;
}
