import { anthropic } from "./claude";
import { elevenlabs, VOICES, type VoiceGender } from "./elevenlabs";
import { log } from "./log";

const MODEL = "claude-sonnet-4-6";

function buildSystemPrompt(targetSeconds: number): string {
  const minutes = Math.round(targetSeconds / 60);
  const label = targetSeconds < 60 ? `${targetSeconds} seconds` : `${minutes} minute`;

  return `You are writing a guided meditation script for audio narration. Write in a warm, intimate, personal tone — as if you are meditating alongside the listener, not instructing them from above.

Target total duration: ${label} (narration + silences combined).

VOICE AND TONE
- Warm, unhurried, human. Soft but grounded.
- Inclusive language: "we're going to", "let's", "we begin". Listener is with you.
- Second person ("you") for direct guidance, "we" for shared moments.
- Short sentences. Natural breath cadence.
- Gentle personal asides are welcome ("notice how the air cools your nostrils on the inhale, warms on the exhale").
- NEVER robotic, listy, or instructional-sounding.
- NEVER say "welcome", "today we'll", "in this meditation". Begin in the middle of a breath.

STRUCTURE (arc)
1. Gentle settling — a few slow breath cues, noticing sensation. Generous silence between phrases.
2. An anchor — something specific (the belly, the chest rising, the feet on the floor).
3. The body of the meditation — shaped by what the listener shared with you. Weave their context through breath, body awareness, or release work.
4. A return — softening back toward the breath, the body.
5. A quiet close — not "open your eyes" unless it fits. Leave them settled.

SILENCE
- Use <break time="Xs" /> tags for pauses between phrases. This is how the listener gets time to breathe and feel.
- For a ${label} session, use breaks generously. Short phrases followed by breaks of 3-8 seconds.
- Never two sentences in a row without a break.

OUTPUT
- Output ONLY the script with break tags. No title, no headers, no explanation.
- Do not mention that you are an AI, a meditation app, or that this is personalized.
- Do not reference time ("for the next ten minutes"), just guide.

Write as if you are a real person sitting cross-legged next to the listener, speaking from your own practice.`;
}

export async function generateScript(
  userPrompt: string,
  targetSeconds: number,
): Promise<string> {
  const started = Date.now();
  log("claude", "generating script", { targetSeconds, promptLen: userPrompt.length });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: buildSystemPrompt(targetSeconds),
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response from Claude");
  }
  const script = block.text.trim();
  log("claude", "script ready", {
    ms: Date.now() - started,
    scriptLen: script.length,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });
  return script;
}

export async function generateAudio(
  script: string,
  voiceGender: VoiceGender,
): Promise<Buffer> {
  const started = Date.now();
  const voiceId = VOICES[voiceGender];
  log("elevenlabs", "synthesizing audio", {
    voiceGender,
    scriptLen: script.length,
  });

  try {
    const stream = await elevenlabs.textToSpeech.convert(voiceId, {
      text: script,
      model_id: "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
      voice_settings: {
        stability: 0.75,
        similarity_boost: 0.75,
        style: 0.15,
        use_speaker_boost: true,
      },
    });

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buf = Buffer.concat(chunks);
    log("elevenlabs", "audio ready", {
      ms: Date.now() - started,
      bytes: buf.length,
    });
    return buf;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "body" in err) {
      try {
        const body = (err as { body: ReadableStream }).body;
        const reader = body.getReader();
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);
        log("elevenlabs", "error body", { body: text });
      } catch {
        // ignore — original error still throws below
      }
    }
    throw err;
  }
}
