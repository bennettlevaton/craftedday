import { ElevenLabsClient } from "elevenlabs";

export const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — calm, warm voice
