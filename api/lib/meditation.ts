import { and, desc, eq, isNotNull } from "drizzle-orm";
import { anthropic } from "./claude";
import { elevenlabs, VOICES, type VoiceGender } from "./elevenlabs";
import { log } from "./log";
import { db } from "./db";
import { meditations, userProfiles } from "@/db/schema";

const SCRIPT_MODEL = "claude-opus-4-7";
const SUMMARY_MODEL = "claude-sonnet-4-6";

type ListenerContext = {
  name: string | null;
  experienceLevel: string | null;
  primaryGoals: string[];
  primaryGoalCustom: string | null;
  preferenceSummary: string | null;
};

const GOAL_BIAS: Record<string, string> = {
  stress: "bias toward breath and grounding",
  sleep: "softer pacing, lower energy, less stimulation",
  focus: "alertness and presence, not drowsiness",
  anxiety: "settling the nervous system, steady slow cues",
  general: "balanced, let the listener's input guide the shape",
};

function buildListenerContextBlock(ctx: ListenerContext): string {
  const hasGoals = ctx.primaryGoals.length > 0;
  if (
    !ctx.name &&
    !ctx.experienceLevel &&
    !hasGoals &&
    !ctx.preferenceSummary
  ) {
    return "";
  }

  const lines: string[] = ["LISTENER CONTEXT"];
  if (ctx.name) {
    lines.push(`- Name: ${ctx.name} (use sparingly, only in natural moments)`);
  }
  if (ctx.experienceLevel) {
    const label = {
      beginner:
        "new to meditation — keep guidance concrete, explain less-common cues",
      intermediate: "some experience — assume familiarity with basic cues",
      experienced: "experienced — you can be more subtle, less instructional",
    }[ctx.experienceLevel] ?? ctx.experienceLevel;
    lines.push(`- Experience: ${label}`);
  }
  if (hasGoals) {
    const structured = ctx.primaryGoals.filter((g) => g !== "other");
    const biases = structured
      .map((g) => GOAL_BIAS[g])
      .filter(Boolean);

    const parts: string[] = [];
    if (structured.length > 0) {
      parts.push(structured.join(", "));
    }
    if (ctx.primaryGoals.includes("other") && ctx.primaryGoalCustom) {
      parts.push(`also: "${ctx.primaryGoalCustom}"`);
    }
    lines.push(`- Primary intentions: ${parts.join(" · ")}`);
    if (biases.length > 0) {
      lines.push(`  (${biases.join("; ")})`);
    }
  }
  if (ctx.preferenceSummary) {
    lines.push(
      "",
      "PREFERENCE PROFILE (from past sessions)",
      ctx.preferenceSummary,
    );
  }
  return lines.join("\n") + "\n\n";
}

function buildSystemPrompt(targetSeconds: number, listenerBlock: string): string {
  const minutes = Math.round(targetSeconds / 60);
  const label = targetSeconds < 60 ? `${targetSeconds} seconds` : `${minutes} minute`;

  return `${listenerBlock}You are writing a guided meditation script for audio narration. Write in a warm, intimate, personal tone — as if you are meditating alongside the listener, not instructing them from above.

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
  listenerContext: ListenerContext,
): Promise<string> {
  const started = Date.now();
  const listenerBlock = buildListenerContextBlock(listenerContext);
  log("claude", "generating script", {
    targetSeconds,
    promptLen: userPrompt.length,
    hasListenerContext: listenerBlock.length > 0,
  });

  const response = await anthropic.messages.create({
    model: SCRIPT_MODEL,
    max_tokens: 3000,
    system: [
      {
        type: "text",
        text: buildSystemPrompt(targetSeconds, listenerBlock),
        cache_control: { type: "ephemeral" },
      },
    ],
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
    cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
  });
  return script;
}

function applyPacingBreaks(script: string): string {
  return script
    .replace(/([.!?])(?!\s*<break)/g, '$1 <break time="1.2s" />')
    .replace(/,(?!\s*<break)/g, ', <break time="0.4s" />');
}

export async function generateAudio(
  script: string,
  voiceGender: VoiceGender,
): Promise<Buffer> {
  const started = Date.now();
  const voiceId = VOICES[voiceGender];
  const voiceSettings = {
    stability: 1.0,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true,
    speed: 0.7,
  };
  log("elevenlabs", "synthesizing audio", {
    voiceGender,
    voiceId,
    scriptLen: script.length,
    model: "eleven_flash_v2_5",
    voiceSettings,
  });

  try {
    const stream = await elevenlabs.textToSpeech.convert(voiceId, {
      text: script,
      model_id: "eleven_flash_v2_5",
      output_format: "mp3_44100_128",
      voice_settings: voiceSettings,
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

export async function refreshPreferenceSummary(userId: string): Promise<void> {
  const started = Date.now();

  const sessions = await db
    .select({
      prompt: meditations.prompt,
      rating: meditations.rating,
      feedback: meditations.feedback,
      createdAt: meditations.createdAt,
    })
    .from(meditations)
    .where(
      and(eq(meditations.userId, userId), isNotNull(meditations.rating)),
    )
    .orderBy(desc(meditations.createdAt));

  if (sessions.length === 0) {
    log("summary", "no rated sessions yet, skipping", { userId });
    return;
  }

  const now = Date.now();
  const blocks = sessions.map((s, i) => {
    const days = Math.max(
      0,
      Math.floor((now - new Date(s.createdAt).getTime()) / 86_400_000),
    );
    const recency = i < 10 ? " (RECENT — weight heavily)" : "";
    return `[Session ${i + 1} · ${days}d ago · ${s.rating}/5${recency}] "${s.prompt}"
  Feedback: ${s.feedback?.trim() || "(none)"}`;
  });

  const response = await anthropic.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 500,
    system: `You are building a meditation preference profile from a user's rated sessions.

Weight the 10 most recent sessions heavily; use earlier sessions as background context.

Produce 100-150 words in second person ("You respond well to..."). Cover:
- Styles and techniques they respond well to
- What to avoid
- Recurring themes in their prompts
- Notable patterns in how they rate sessions

Output ONLY the profile paragraph. No headers, no bullets, no preamble.`,
    messages: [{ role: "user", content: blocks.join("\n\n") }],
  });

  const block = response.content[0];
  if (block.type !== "text") {
    log("summary", "unexpected response, skipping", { userId });
    return;
  }

  await db
    .update(userProfiles)
    .set({
      preferenceSummary: block.text.trim(),
      preferenceSummaryUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.userId, userId));

  log("summary", "updated", {
    userId,
    sessionCount: sessions.length,
    ms: Date.now() - started,
    summaryLen: block.text.length,
  });
}
