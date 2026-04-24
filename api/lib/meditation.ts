import { and, desc, eq, isNotNull } from "drizzle-orm";
import { spawn } from "child_process";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { anthropic } from "./claude";
import { elevenlabs, VOICES, type VoiceGender } from "./elevenlabs";
import { log } from "./log";
import { db } from "./db";
import { meditations, userProfiles } from "@/db/schema";

const PLANNER_MODEL = "claude-haiku-4-5";
const WRITER_MODEL  = "claude-opus-4-7";
const SUMMARY_MODEL = "claude-sonnet-4-6";

// Single observed rate — chars of spoken text produced per second of actual narration
// at voice speed 0.85 with eleven_v3. Calibrated empirically across multiple runs
// (observedSpokenCharsPerSec landed at 8–10 consistently). Used for BOTH the
// generation target asked of Opus and the post-hoc duration estimate.
const SPOKEN_CHARS_PER_SEC = 10;

// We own silence ourselves — break tags never reach ElevenLabs. So we honor their
// written duration exactly when estimating and when rendering silent PCM.
// Average used for planning only (prompt-side estimate of "how many tags per section").
const AVG_BREAK_SECONDS = 6;

// Spoken fraction per section role — derived in code so Haiku never does ratio math.
const ROLE_SPOKEN_FRACTION: Record<string, number> = {
  open:            0.85,
  settle:          0.72,
  anchor:          0.72,
  active_guidance: 0.74,
  release:         0.66,
  transformation:  0.58,
  quiet_breathing: 0.28,
  return:          0.68,
  close:           0.72,
};

const ROLE_MIN_SPOKEN_SECONDS: Record<string, number> = {
  open: 24,
  settle: 28,
  anchor: 28,
  active_guidance: 30,
  release: 26,
  transformation: 24,
  quiet_breathing: 20,
  return: 22,
  close: 20,
};

function sectionSpokenSeconds(
  role: string,
  durationSeconds: number,
  experienceLevel: string | null,
): number {
  const normalizedRole = role === "silent" ? "quiet_breathing" : role;
  const base = ROLE_SPOKEN_FRACTION[normalizedRole] ?? 0.65;
  // Per-role modifier that produces these overall-session ratios once weighted
  // by section durations: beginner ≈ 60% spoken · intermediate ≈ 50% · experienced ≈ 40%.
  const modifier = experienceLevel === "experienced" ? -0.10
    : experienceLevel === "beginner" ? +0.10
    : 0;
  const minSpoken = Math.min(
    durationSeconds - 4,
    ROLE_MIN_SPOKEN_SECONDS[normalizedRole] ?? 12,
  );
  const computed = Math.round(durationSeconds * Math.min(0.92, Math.max(0.15, base + modifier)));
  return Math.max(minSpoken, computed);
}

function countBreakTags(script: string): number {
  const matches = script.match(/<break time="\d+(?:\.\d+)?s"\s*\/>/g);
  return matches ? matches.length : 0;
}

function estimateScriptDuration(script: string): number {
  let breakSeconds = 0;
  const re = /<break time="(\d+(?:\.\d+)?)s"\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) breakSeconds += parseFloat(m[1]);
  const spokenChars = script.replace(/<break[^>]+\/>/g, "").replace(/\s+/g, " ").trim().length;
  return breakSeconds + spokenChars / SPOKEN_CHARS_PER_SEC;
}

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
  if (!ctx.experienceLevel && !hasGoals && !ctx.preferenceSummary) {
    return "";
  }

  const lines: string[] = [
    "LISTENER CONTEXT",
    "- Do NOT use the listener's name in the meditation.",
  ];
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

type PlanSection = {
  section: string;
  role: string; // open | settle | anchor | active_guidance | release | transformation | quiet_breathing | return | close
  duration_seconds: number;
  guidance_density: "high" | "medium" | "low" | "silent";
  notes: string;
  // derived in code, not from Haiku:
  spoken_seconds: number;
  silence_seconds: number;
};

type ParsedPlan = {
  title: string;
  technique: string;
  anchor: string;
  imagery: string;
  opening_context: string;
  experienceLevel: string | null;
  arc: PlanSection[];
};

function buildSectionSystem(listenerBlock: string): string {
  return `${listenerBlock}You are rendering one section of an ongoing guided meditation. The listener is already inside the session — do not re-introduce it.

TONE
- Warm, intimate, human — as if sitting cross-legged next to the listener.
- Second person ("you") for direct guidance, "we" for shared moments.
- Short sentences. Conversational. Never clinical, never listy.

BREATH
- Reference breath as a recurring anchor.
- Never count breaths.
- A break after "breathe in" means the listener is actively inhaling. The next words must resolve that breath.

SILENCE
- Every sentence ends with exactly one <break time="Xs" /> tag.
- Allowed values: 3s (short), 6s (medium), 9s (long), 12s (very long, quiet sections only).
- Do not stack consecutive break tags. One tag per sentence end.
- Do not use any other numeric value. Pick one of 3, 6, 9, 12.

DURATION DISCIPLINE
- Hit the spoken target. Do not come in materially short.
- Under target by a little is acceptable. Under target by a lot is a failure.
- Do not compress the section into a tiny amount of prose.
- The listener should feel continuously accompanied, even in quieter sections.

ANTI-PADDING
- Do not ramble.
- Do not repeat the same instruction twice.
- Do not restate the listener's situation.
- Do not add generic therapy language.
- Do not fill space with decorative metaphors.

QUIET SECTIONS
- Quiet does NOT mean nearly wordless.
- In quiet_breathing sections, keep the language sparse but present: brief check-ins, anchor reminders, body cues, and return lines spread across the section.
- Never collapse a long quiet section into just one opening line and one closing line.

OUTPUT: script text with break tags only. No headers, no labels, no explanation.`;
}

function densityInstructions(density: string, experienceLevel: string | null): string {
  const exp = experienceLevel === "experienced" ? "experienced"
    : experienceLevel === "intermediate" ? "intermediate"
    : "beginner";

  const table: Record<string, Record<string, string>> = {
    high: {
      beginner:     "8–10 short sentences. Mostly 3s breaks; a couple 6s. Stay close and active.",
      intermediate: "7–9 short sentences. Mostly 3s breaks; occasional 6s. Keep the voice present.",
      experienced:  "6–8 short sentences. Mostly 3s breaks; occasional 6s. Efficient but still present.",
    },
    medium: {
      beginner:     "6–8 short sentences. Mix of 3s and 6s breaks. Keep clear anchor reminders throughout.",
      intermediate: "5–7 short sentences. Mostly 6s; some 3s. Let the section breathe without disappearing.",
      experienced:  "4–6 short sentences. Mostly 6s; an occasional 9s. Minimal but present.",
    },
    low: {
      beginner:     "4–5 short sentences. Mostly 6s; at most one 9s. Keep gentle check-ins present.",
      intermediate: "4 short sentences. Mostly 6s; one or two 9s. Sparse but still active.",
      experienced:  "3–4 short sentences. Mix of 6s and 9s breaks. Quiet, but not empty.",
    },
    silent: {
      beginner:     "Quiet, not mute: 4 short sentences minimum, each ending with a 9s or 12s break.",
      intermediate: "Quiet, not mute: 3–4 short sentences, each ending with a 9s or 12s break.",
      experienced:  "Quiet, not mute: 3 short sentences minimum, each ending with a 9s or 12s break.",
    },
  };

  return (table[density] ?? table.medium)[exp];
}

function buildSectionUserPrompt(
  section: PlanSection,
  plan: ParsedPlan,
  userPrompt: string,
  timeOfDay: string | null,
  isFirst: boolean,
  prevSectionNotes: string | null,
): string {
  const targetSpokenChars = Math.round(section.spoken_seconds * SPOKEN_CHARS_PER_SEC);
  const minSpokenChars = Math.round(targetSpokenChars * 0.9);
  const maxSpokenChars = Math.round(targetSpokenChars * 1.15);
  const targetBreakTags = Math.max(1, Math.round(section.silence_seconds / AVG_BREAK_SECONDS));
  const densityGuide = densityInstructions(section.guidance_density, plan.experienceLevel ?? null);

  return `SESSION
Technique: ${plan.technique}
Anchor: ${plan.anchor}
Imagery: ${plan.imagery}
Listener input: "${userPrompt}"
${timeOfDay ? `Time of day: ${timeOfDay}` : ""}
${prevSectionNotes ? `\nContinuity: previous section covered "${prevSectionNotes}". Continue naturally — do not re-introduce.` : ""}

SECTION: ${section.section} (role: ${section.role})
${section.notes}

DENSITY: ${densityGuide}

SPOKEN TARGET: ${targetSpokenChars} characters (this translates to ~${section.spoken_seconds}s of narration).
Minimum acceptable: ${minSpokenChars} characters.
Hard maximum: ${maxSpokenChars} characters.
SILENCE TARGET: approximately ${targetBreakTags} total <break time="3s" /> tags across the section (they may be single or stacked).
Do not come in under the minimum unless doing so would force obvious repetition.
The section should feel complete, spacious, and substantial.

${isFirst ? "This is the opening — start with a spoken sentence immediately, no leading break tags." : "Assume the listener is already settled. Continue naturally from the prior section. Do not restart the meditation."}

Script with break tags only.`;
}

async function generatePlan(
  userPrompt: string,
  targetSeconds: number,
  listenerBlock: string,
  timeOfDay: string | null,
): Promise<string> {
  const started = Date.now();
  const minutes = Math.round(targetSeconds / 60);
  const plannerPrompt = `${listenerBlock}You are planning a guided meditation session. Output ONLY valid JSON — no markdown, no explanation.

Listener input: "${userPrompt}"
Time of day: ${timeOfDay ?? "any time"}
Target duration: ${minutes} minutes (${targetSeconds} seconds)

Output this exact JSON:
{
  "title": "3-5 word evocative title",
  "technique": "1-2 specific techniques (e.g. box breathing, body scan, noting, visualization)",
  "anchor": "specific anchor point (e.g. belly button, chest rise, feet on floor)",
  "imagery": "specific release and transformation imagery",
  "arc": [
    {
      "section": "short section name",
      "role": "open | settle | release | transformation | quiet_breathing | return | close",
      "duration_seconds": 0,
      "guidance_density": "high | medium | low | silent",
      "notes": "what specifically happens — be concrete, 1 sentence"
    }
  ]
}

Rules:
- Sum of all duration_seconds must equal EXACTLY ${targetSeconds}. Use simple round integers.
- 4–5 sections total. Prefer fewer, larger sections over many small ones.
- Must include roles: open, at least one quiet_breathing section, close.
- Do NOT use the role "silent". Use "quiet_breathing" for the quiet section.
- open → high density. quiet_breathing → low or silent density. close → medium density.
- The quiet_breathing section should usually be 25-40% of the total session, not more.
- Prefer functional section names, not poetic ones.`;

  const res = await anthropic.messages.create({
    model: PLANNER_MODEL,
    max_tokens: 4000,
    messages: [{ role: "user", content: plannerPrompt }],
  });

  log("plan", "response content types", {
    types: res.content.map((b) => b.type),
  });

  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`No plan from Haiku — got: ${res.content.map((b) => b.type).join(", ")}`);
  }

  log("plan", "ready", {
    ms: Date.now() - started,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  });

  return textBlock.text.trim();
}

async function writeSectionScript(
  section: PlanSection,
  plan: ParsedPlan,
  userPrompt: string,
  timeOfDay: string | null,
  sectionSystem: string,
  isFirst: boolean,
  prevSectionNotes: string | null,
): Promise<string> {
  const started = Date.now();
  const response = await anthropic.messages.create({
    model: WRITER_MODEL,
    max_tokens: 4000,
    system: sectionSystem,
    messages: [{
      role: "user",
      content: buildSectionUserPrompt(section, plan, userPrompt, timeOfDay, isFirst, prevSectionNotes),
    }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`No text from Opus for section "${section.section}"`);
  }
  const text = textBlock.text.trim();
  log("write", `section:${section.section}`, {
    ms: Date.now() - started,
    chars: text.length,
    spokenSeconds: section.spoken_seconds,
    silenceSeconds: section.silence_seconds,
    outputTokens: response.usage.output_tokens,
  });
  return text;
}

export async function generateScript(
  userPrompt: string,
  targetSeconds: number,
  listenerContext: ListenerContext,
  options: { timeOfDay?: string | null } = {},
): Promise<{ script: string; title: string }> {
  const started = Date.now();
  const listenerBlock = buildListenerContextBlock(listenerContext);

  const timeOfDay = "timeOfDay" in options
    ? options.timeOfDay ?? null
    : (() => {
        const hour = new Date().getHours();
        return hour < 5 ? "late night"
          : hour < 12 ? "morning"
          : hour < 17 ? "afternoon"
          : hour < 21 ? "evening" : "night";
      })();

  log("plan", "generating", { targetSeconds, timeOfDay, promptLen: userPrompt.length });

  // Phase 1: Haiku generates a plan with per-section spoken/silence targets
  const planText = await generatePlan(userPrompt, targetSeconds, listenerBlock, timeOfDay);

  let plan: ParsedPlan;
  try {
    const stripped = planText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const raw = JSON.parse(stripped);
    raw.arc = (raw.arc ?? []).map((s: PlanSection) => {
      const normalizedRole = s.role === "silent" ? "quiet_breathing" : s.role;
      const spokenSecs = sectionSpokenSeconds(normalizedRole, s.duration_seconds, listenerContext.experienceLevel);
      return {
        ...s,
        role: normalizedRole,
        spoken_seconds: spokenSecs,
        silence_seconds: Math.max(2, s.duration_seconds - spokenSecs),
      };
    });
    raw.experienceLevel = listenerContext.experienceLevel;
    plan = raw as ParsedPlan;
  } catch {
    throw new Error("Failed to parse plan JSON from Haiku");
  }

  log("write", "generating sections in parallel", {
    sections: plan.arc.length,
    arc: plan.arc.map(s => ({ role: s.role, duration: s.duration_seconds, spoken: s.spoken_seconds, silence: s.silence_seconds })),
  });

  // Phase 2: Write all sections in parallel. Continuity cues come from plan.arc[i-1].notes
  // (static plan data, not prior section text), so there's no real ordering dependency.
  const sectionSystem = buildSectionSystem(listenerBlock);
  const sectionTexts = await Promise.all(
    plan.arc.map((section, i) =>
      writeSectionScript(
        section,
        plan,
        userPrompt,
        timeOfDay,
        sectionSystem,
        i === 0,
        i > 0 ? plan.arc[i - 1].notes : null,
      ),
    ),
  );

  const rawScript = sectionTexts.join("\n\n");

  // Clamp any out-of-range break tag values to the allowed set {3, 6, 9, 12}.
  // ElevenLabs never sees these — we parse them into silent PCM ourselves.
  const processed = clampBreakTags(rawScript);

  log("write", "script ready", {
    ms: Date.now() - started,
    sections: plan.arc.length,
    scriptChars: processed.length,
    breakTagCount: countBreakTags(processed),
    estimatedSeconds: Math.round(estimateScriptDuration(processed)),
    targetSeconds,
  });

  return { script: processed, title: plan.title ?? "A moment for you" };
}

// Clamp any stray break tag values to the allowed set {3, 6, 9, 12}. Anything else
// gets snapped to the nearest allowed value so parsing stays predictable.
function clampBreakTags(script: string): string {
  const allowed = [3, 6, 9, 12];
  return script.replace(/<break time="(\d+(?:\.\d+)?)s"\s*\/>/g, (_, secs) => {
    const val = parseFloat(secs);
    const snapped = allowed.reduce((best, a) =>
      Math.abs(a - val) < Math.abs(best - val) ? a : best,
    allowed[0]);
    return `<break time="${snapped}s" />`;
  });
}


// Minimum silence inserted at the tail of every session.
const MIN_TAIL_SILENCE_SECONDS = 6;

// Parallelism for TTS requests — capped by your ElevenLabs plan's concurrent-request
// limit. Override via ELEVENLABS_CONCURRENCY env var when you upgrade the plan.
const TTS_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.ELEVENLABS_CONCURRENCY ?? "5", 10) || 5,
);

// Target speech chars per TTS chunk. Small value = one chunk per sentence-ish, which
// means every break tag Opus wrote gets honored as exact PCM silence at the right
// place (not clumped at coarse chunk boundaries). Small-chunk cost is more TTS
// round-trips — mitigated by concurrency above.
const TARGET_CHARS_PER_CHUNK = 150;

// Safety cap: if a v3 chunk returns more audio than (expected * this multiplier),
// we truncate. Expected = text.length / SPOKEN_CHARS_PER_SEC. This keeps a runaway
// chunk from producing 10+ minutes of garbage.
const CHUNK_DURATION_SAFETY_MULTIPLIER = 2.2;

type ScriptSegment =
  | { kind: "speech"; text: string }
  | { kind: "pause"; seconds: number };

// Parse a script with <break time="Xs" /> tags into alternating speech/pause segments.
// Break tags are fully owned by us from here on — they never reach ElevenLabs.
function parseScriptSegments(script: string): ScriptSegment[] {
  const segments: ScriptSegment[] = [];
  const re = /<break time="(\d+(?:\.\d+)?)s"\s*\/>/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) {
    const before = script.slice(lastIdx, m.index).replace(/\s+/g, " ").trim();
    if (before) segments.push({ kind: "speech", text: before });
    segments.push({ kind: "pause", seconds: parseFloat(m[1]) });
    lastIdx = m.index + m[0].length;
  }
  const tail = script.slice(lastIdx).replace(/\s+/g, " ").trim();
  if (tail) segments.push({ kind: "speech", text: tail });
  return segments;
}

type TtsChunk = {
  text: string;               // plain speech sent to ElevenLabs (no break tags)
  followingPauseSec: number;  // silent PCM to concat AFTER this chunk's audio
};

// Group segments into TTS chunks. A chunk is a run of speech joined by the pauses
// that fall inside it (rendered as "..." so ElevenLabs gives a natural micro-pause).
// When a pause arrives and the current chunk has enough text, that pause becomes
// the chunk boundary and its seconds are preserved as inter-chunk silent PCM.
function buildTtsChunks(segments: ScriptSegment[]): TtsChunk[] {
  const chunks: TtsChunk[] = [];
  let currentText = "";
  let trailingPause = 0;

  const pushChunk = (pauseAfter: number) => {
    if (!currentText) return;
    chunks.push({ text: currentText.trim(), followingPauseSec: pauseAfter });
    currentText = "";
  };

  for (const seg of segments) {
    if (seg.kind === "speech") {
      currentText = currentText ? `${currentText} ${seg.text}` : seg.text;
      continue;
    }
    // pause
    if (currentText.length >= TARGET_CHARS_PER_CHUNK) {
      pushChunk(seg.seconds);
    } else if (!currentText) {
      // Leading pause before any speech — tack onto whatever comes next.
      trailingPause += seg.seconds;
    } else {
      // Pause inside a chunk — render as ellipsis so TTS still beats slightly,
      // but preserve the DESIGNED silence as added silent PCM at the boundary
      // by folding it into the next boundary pause.
      currentText += seg.seconds >= 6 ? " ... ... " : " ... ";
    }
  }

  if (currentText) {
    pushChunk(0);
  }

  // Prepend any leading pause to the first chunk's preceding silence (we'll add
  // it to the tail silence for simplicity — listener notices tail much more).
  if (trailingPause > 0 && chunks.length > 0) {
    chunks[chunks.length - 1].followingPauseSec += trailingPause;
  }

  return chunks;
}

// Bounded-concurrency executor so we don't blast 20 parallel TTS requests.
async function parallelMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

// PCM spec: 22050 Hz, 16-bit signed little-endian, mono.
const PCM_SAMPLE_RATE = 22050;
const PCM_BYTE_RATE = PCM_SAMPLE_RATE * 2; // 16-bit mono

// Produce N seconds of silent 16-bit PCM at PCM_SAMPLE_RATE. Silence = all-zero bytes.
function silencePcm(seconds: number): Buffer {
  const bytes = Math.max(0, Math.round(seconds * PCM_BYTE_RATE));
  return Buffer.alloc(bytes);
}

function pcmToMp3(pcm: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath.path, [
      "-f", "s16le", "-ar", String(PCM_SAMPLE_RATE), "-ac", "1", "-i", "pipe:0",
      "-codec:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1",
    ]);
    const out: Buffer[] = [];
    ff.stdout.on("data", (d: Buffer) => out.push(d));
    ff.stderr.on("data", () => {}); // suppress ffmpeg progress noise
    ff.on("close", (code) => code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exited ${code}`)));
    ff.stdin.write(pcm);
    ff.stdin.end();
  });
}

async function synthesizeChunk(
  text: string,
  voiceId: string,
  voiceSettings: Record<string, unknown>,
  seed: number,
): Promise<Buffer> {
  // eleven_v3 doesn't support previous_text/next_text request stitching. The only
  // cross-chunk consistency knobs available are voice_settings (stability etc.)
  // and a shared seed — passing the same seed to every chunk in a session makes
  // the model's random draws reproducible, which reduces accent/pace drift.
  const stream = await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    model_id: "eleven_v3",
    output_format: "pcm_22050",
    voice_settings: voiceSettings,
    seed,
  }, { timeoutInSeconds: 300 });
  const parts: Buffer[] = [];
  for await (const chunk of stream) {
    parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts);
}

export async function generateAudio(
  script: string,
  voiceGender: VoiceGender,
  targetSeconds: number,
): Promise<Buffer> {
  const started = Date.now();
  const voiceId = VOICES[voiceGender];
  const voiceSettings = {
    // Higher stability = less random creative drift between chunks (accent, pace,
    // intonation stay more consistent across the ~10 separate TTS calls per session).
    // Tradeoff: slightly less expressive prosody.
    stability: 0.9,
    similarity_boost: 0.95,
    style: 0.0,
    use_speaker_boost: true,
    speed: 0.85,
  };

  // Parse the script into speech/pause segments and build TTS chunks.
  // ElevenLabs only sees pure spoken text — never break tags. We own silence entirely.
  const segments = parseScriptSegments(script);
  const ttsChunks = buildTtsChunks(segments);
  const totalPlannedSilence = ttsChunks.reduce((a, c) => a + c.followingPauseSec, 0);

  log("elevenlabs", "synthesizing audio", {
    voiceGender,
    voiceId,
    scriptChars: script.length,
    targetSeconds,
    chunks: ttsChunks.length,
    chunkChars: ttsChunks.map((c) => c.text.length),
    plannedInterChunkSilence: ttsChunks.map((c) => c.followingPauseSec),
    totalPlannedSilence,
    model: "eleven_v3",
    voiceSettings,
  });

  try {
    // Synthesize all chunks with bounded concurrency + per-chunk duration safety cap.
    // If a v3 chunk hallucinates (returns >2.2x expected audio), we truncate it.
    // One random seed for the whole session. Every chunk uses it so the voice
    // samples from the same generative neighborhood — less accent/pace drift.
    const sessionSeed = Math.floor(Math.random() * 2_147_483_647);

    const pcmChunks = await parallelMap(ttsChunks, TTS_CONCURRENCY, async (chunk, idx) => {
      const expectedSec = Math.max(4, chunk.text.length / SPOKEN_CHARS_PER_SEC);
      const maxSec = expectedSec * CHUNK_DURATION_SAFETY_MULTIPLIER + 5;
      const pcm = await synthesizeChunk(
        chunk.text,
        voiceId,
        voiceSettings,
        sessionSeed,
      );
      const actualSec = pcm.length / PCM_BYTE_RATE;
      if (actualSec > maxSec) {
        const truncated = pcm.subarray(0, Math.round(maxSec * PCM_BYTE_RATE));
        log("elevenlabs", "chunk duration exceeded safety cap, truncating", {
          chunkIndex: idx,
          textChars: chunk.text.length,
          expectedSec: Math.round(expectedSec),
          actualSec: Math.round(actualSec),
          truncatedToSec: Math.round(maxSec),
        });
        return truncated;
      }
      return pcm;
    });

    // Measure real spoken audio per chunk.
    const chunkDurations = pcmChunks.map((b) => b.length / PCM_BYTE_RATE);
    const rawSpokenSeconds = chunkDurations.reduce((a, b) => a + b, 0);

    // Deterministic silence placement:
    //   - Every chunk gets its planned followingPauseSec silence after it.
    //   - Then we add any remaining shortfall vs. target, split between gaps and tail.
    const plannedTotal = rawSpokenSeconds + totalPlannedSilence + MIN_TAIL_SILENCE_SECONDS;
    const shortfall = Math.max(0, targetSeconds - plannedTotal);
    const numGaps = Math.max(0, ttsChunks.length - 1);
    const extraPerGap = numGaps > 0 ? (shortfall * 0.6) / numGaps : 0;
    const extraTail = shortfall - extraPerGap * numGaps;
    const tailSilence = MIN_TAIL_SILENCE_SECONDS + extraTail;

    // Assemble: [chunk0 pcm][planned pause 0 + extra gap][chunk1 pcm]...[tail]
    const assembled: Buffer[] = [];
    for (let i = 0; i < pcmChunks.length; i++) {
      assembled.push(pcmChunks[i]);
      const isLast = i === pcmChunks.length - 1;
      const plannedPause = ttsChunks[i].followingPauseSec;
      if (isLast) {
        // Fold any planned pause on the last chunk into tail.
        assembled.push(silencePcm(plannedPause + tailSilence));
      } else {
        assembled.push(silencePcm(plannedPause + extraPerGap));
      }
    }
    const pcmData = Buffer.concat(assembled);
    const buf = await pcmToMp3(pcmData);

    const finalDurationSeconds = Math.round(pcmData.length / PCM_BYTE_RATE);
    const durationErrorSeconds = finalDurationSeconds - targetSeconds;
    const durationErrorPct = Math.round((durationErrorSeconds / targetSeconds) * 100);
    const totalSpokenChars = ttsChunks.reduce((a, c) => a + c.text.length, 0);
    const observedSpokenCharsPerSec = +(totalSpokenChars / rawSpokenSeconds).toFixed(2);

    log("elevenlabs", "audio ready", {
      ms: Date.now() - started,
      bytes: buf.length,
      targetSeconds,
      rawSpokenSeconds: Math.round(rawSpokenSeconds),
      chunkDurations: chunkDurations.map((s) => Math.round(s)),
      totalPlannedSilence,
      extraPerGap: Math.round(extraPerGap),
      tailSilence: Math.round(tailSilence),
      finalDurationSeconds,
      durationErrorSeconds,
      durationErrorPct: `${durationErrorPct > 0 ? "+" : ""}${durationErrorPct}%`,
      totalSpokenChars,
      observedSpokenCharsPerSec,
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

  // Fetch all sessions with any check-in data
  const sessions = await db
    .select({
      prompt: meditations.prompt,
      feeling: meditations.feeling,
      whatHelped: meditations.whatHelped,
      feedback: meditations.feedback,
      duration: meditations.duration,
      createdAt: meditations.createdAt,
    })
    .from(meditations)
    .where(
      and(
        eq(meditations.userId, userId),
        isNotNull(meditations.feeling),
      ),
    )
    .orderBy(desc(meditations.createdAt));

  if (sessions.length === 0) {
    log("summary", "no check-ins yet, skipping", { userId });
    return;
  }

  // Compute behavioral stats
  const total = sessions.length;
  const calmerCount = sessions.filter((s) => s.feeling === "calmer").length;
  const tenseCount = sessions.filter((s) => s.feeling === "tense").length;
  const calmerPct = Math.round((calmerCount / total) * 100);

  const helpedCounts: Record<string, number> = {};
  for (const s of sessions) {
    if (s.whatHelped) helpedCounts[s.whatHelped] = (helpedCounts[s.whatHelped] ?? 0) + 1;
  }
  const topHelped = Object.entries(helpedCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, 2);

  const mornings = sessions.filter((s) => new Date(s.createdAt).getHours() < 12).length;
  const afternoons = sessions.filter((s) => { const h = new Date(s.createdAt).getHours(); return h >= 12 && h < 17; }).length;
  const evenings = sessions.filter((s) => new Date(s.createdAt).getHours() >= 17).length;
  const peakTime = mornings >= afternoons && mornings >= evenings ? "morning"
    : afternoons >= evenings ? "afternoon" : "evening";

  const avgDuration = Math.round(
    sessions.reduce((acc, s) => acc + (s.duration ?? 600), 0) / total / 60,
  );

  const statsBlock = `BEHAVIORAL STATS (${total} sessions with check-ins):
- Felt calmer after ${calmerPct}% of sessions (${calmerCount}/${total})
- Peak meditation time: ${peakTime} (${mornings} morning / ${afternoons} afternoon / ${evenings} evening)
- Average session: ${avgDuration} min
${topHelped.length > 0 ? `- What helps most: ${topHelped.join(", ")}` : ""}`;

  const now = Date.now();
  const blocks = sessions.slice(0, 20).map((s, i) => {
    const days = Math.max(0, Math.floor((now - new Date(s.createdAt).getTime()) / 86_400_000));
    const recency = i < 10 ? " (RECENT)" : "";
    return `[Session ${i + 1} · ${days}d ago · feeling: ${s.feeling ?? "?"}${s.whatHelped ? ` · helped: ${s.whatHelped}` : ""}${recency}] "${s.prompt}"
  Note: ${s.feedback?.trim() || "(none)"}`;
  });

  const response = await anthropic.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 500,
    system: `You are building a meditation preference profile from a user's session history and check-ins.

Weight the 10 most recent sessions heavily. Use the behavioral stats as ground truth; use session details for color.

Produce 100-150 words in second person ("You respond well to..."). Cover:
- Outcome patterns (when they feel calmer vs same/tense)
- What techniques help them most
- Recurring themes in their prompts
- Behavioral patterns (time of day, duration preferences)
- What to lean into and what to avoid

Output ONLY the profile paragraph. No headers, no bullets, no preamble.`,
    messages: [{ role: "user", content: `${statsBlock}\n\nSESSION DETAILS (most recent first):\n${blocks.join("\n\n")}` }],
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