import { ElevenLabsClient } from "elevenlabs";

export const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// Voice IDs are internal — surface only "female"/"male" to users.
export const VOICES = {
  female: "pjcYQlDFKMbcOUp6F5GD",
  male: "FxUqz8G7NkRtbO7TA7gS",
} as const;

export type VoiceGender = keyof typeof VOICES;
