import { anthropic } from "./claude";
import { elevenlabs, VOICES, type VoiceGender } from "./elevenlabs";

const MODEL = "claude-sonnet-4-6";

function buildSystemPrompt(targetSeconds: number): string {
  const narrationSeconds = Math.floor(targetSeconds * 0.5);
  const approxWords = Math.floor(narrationSeconds * 2.2); // ~2.2 words/sec calm narration

  return `You are a meditation guide creating a personalized session.

Target total duration: ${targetSeconds} seconds (including silences).
Aim for roughly ${narrationSeconds}s of narration (~${approxWords} words) and the rest as silence.

Guidelines:
- Second person ("you"), warm and unhurried
- Short sentences with natural breath cues
- Use <break time="Xs" /> tags between phrases for silence (e.g. <break time="4s" />)
- Keep individual breaks between 2s and 8s for a ${targetSeconds}s session
- No intro text, no explanation, no titles — output ONLY the meditation script
- Do not mention that you are an AI or meditation guide`;
}

export async function generateScript(
  userPrompt: string,
  targetSeconds: number,
): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: buildSystemPrompt(targetSeconds),
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response from Claude");
  }
  return block.text.trim();
}

export async function generateAudio(
  script: string,
  voiceGender: VoiceGender,
): Promise<Buffer> {
  const voiceId = VOICES[voiceGender];
  const stream = await elevenlabs.textToSpeech.convert(voiceId, {
    text: script,
    model_id: "eleven_turbo_v2_5",
    output_format: "mp3_44100_128",
  });

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
