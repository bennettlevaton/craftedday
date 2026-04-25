import { ElevenLabsClient } from "elevenlabs";

export const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// Voice IDs are internal — surface only "female"/"male" to users.
export const VOICES = {
  female: "pjcYQlDFKMbcOUp6F5GD",
  male: "FxUqz8G7NkRtbO7TA7gS",
} as const;

// Fixed per-voice seeds. Same seed across every TTS call keeps the generative
// neighborhood stable session-to-session, not just within one session — so the
// narrator sounds like the same person each time, not a slightly different
// reading of the same voice.
export const VOICE_SEEDS: Record<VoiceGender, number> = {
  female: 1_618_033_988,
  male: 2_718_281_828,
};

export type VoiceGender = keyof typeof VOICES;
