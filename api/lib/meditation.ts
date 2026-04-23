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

// Two separate rates — named explicitly so they are never confused.
// PROMPT: chars we ask Opus to write per second of spoken time (generation target).
// AUDIO:  observed spoken chars per second of actual narration (for duration estimation).
const SPOKEN_CHARS_PER_SEC_PROMPT = 28;
const SPOKEN_CHARS_PER_SEC_AUDIO  = 15;

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
  const modifier = experienceLevel === "experienced" ? -0.05
    : experienceLevel === "beginner" ? +0.05
    : 0;
  const minSpoken = Math.min(
    durationSeconds - 6,
    ROLE_MIN_SPOKEN_SECONDS[normalizedRole] ?? 20,
  );
  const computed = Math.round(durationSeconds * Math.min(0.92, Math.max(0.20, base + modifier)));
  return Math.max(minSpoken, computed);
}

function estimateScriptDuration(script: string): number {
  let breakSeconds = 0;
  const re = /<break time="(\d+(?:\.\d+)?)s"\s*\/>/g;
  let m;
  while ((m = re.exec(script)) !== null) breakSeconds += parseFloat(m[1]);
  const spokenChars = script.replace(/<break[^>]+\/>/g, "").replace(/\s+/g, " ").trim().length;
  return breakSeconds + spokenChars / SPOKEN_CHARS_PER_SEC_AUDIO;
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
- Every sentence ends with at least one <break time="Xs" /> tag.
- Use only 3s, 6s, or 9s break tags.
- Do not stack consecutive break tags.
- Use fewer 9s tags than 3s and 6s tags.

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
      beginner:     "8–10 short sentences. Use mostly 3s pauses, occasional 6s pauses. Stay close and active.",
      intermediate: "7–9 short sentences. Use 3s pauses, occasional 6s pauses. Keep the voice present.",
      experienced:  "6–8 short sentences. Use 3s pauses, occasional 6s pauses. Efficient but still present.",
    },
    medium: {
      beginner:     "6–8 short sentences. Use 3s and 6s pauses. Keep clear anchor reminders throughout.",
      intermediate: "5–7 short sentences. Use mostly 6s pauses with some 3s pauses. Let the section breathe without disappearing.",
      experienced:  "4–6 short sentences. Use mostly 6s pauses with occasional 3s or 9s pauses. Minimal but present.",
    },
    low: {
      beginner:     "4–5 short sentences. Use mostly 6s pauses and at most one 9s pause. Keep gentle check-ins present.",
      intermediate: "4 short sentences. Use mostly 6s pauses and at most one or two 9s pauses. Sparse but still active.",
      experienced:  "3–4 short sentences. Use 6s pauses and at most two 9s pauses. Quiet, but not empty.",
    },
    silent: {
      beginner:     "Treat this like a very quiet section, not a mute section: 4 short sentences minimum, with 6s and 9s pauses.",
      intermediate: "Treat this like a very quiet section, not a mute section: 3–4 short sentences, with 6s and 9s pauses.",
      experienced:  "Treat this like a very quiet section, not a mute section: 3 short sentences minimum, with 6s and 9s pauses.",
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
  const targetSpokenChars = Math.round(section.spoken_seconds * SPOKEN_CHARS_PER_SEC_PROMPT);
  const minSpokenChars = Math.round(targetSpokenChars * 0.9);
  const maxSpokenChars = Math.round(targetSpokenChars * 1.15);
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

SPOKEN TARGET: ${targetSpokenChars} characters.
Minimum acceptable: ${minSpokenChars} characters.
Hard maximum: ${maxSpokenChars} characters.
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
    // Derive spoken/silence split in code — Haiku only outputs role + duration_seconds
    raw.arc = (raw.arc ?? []).map((s: PlanSection) => {
      const normalizedRole = s.role === "silent" ? "quiet_breathing" : s.role;
      const spokenSecs = sectionSpokenSeconds(normalizedRole, s.duration_seconds, listenerContext.experienceLevel);
      return {
        ...s,
        role: normalizedRole,
        spoken_seconds: spokenSecs,
        silence_seconds: Math.max(6, s.duration_seconds - spokenSecs),
      };
    });
    raw.experienceLevel = listenerContext.experienceLevel;
    plan = raw as ParsedPlan;
  } catch {
    throw new Error("Failed to parse plan JSON from Haiku");
  }

  log("write", "generating sections sequentially", {
    sections: plan.arc.length,
    arc: plan.arc.map(s => ({ role: s.role, duration: s.duration_seconds, spoken: s.spoken_seconds, silence: s.silence_seconds })),
  });

  // Phase 2: Write sections sequentially so continuity cues are real
  const sectionSystem = buildSectionSystem(listenerBlock);
  const sectionTexts: string[] = [];
  for (let i = 0; i < plan.arc.length; i++) {
    const section = plan.arc[i];
    const text = await writeSectionScript(
      section,
      plan,
      userPrompt,
      timeOfDay,
      sectionSystem,
      i === 0,
      i > 0 ? plan.arc[i - 1].notes : null,
    );
    sectionTexts.push(text);
  }

  const script = sectionTexts.join("\n\n");

  // Enforce the per-plan silence budget — scale all break values proportionally.
  // Now that normalizeBreakTags is removed, ElevenLabs honors individual values
  // directly so scaling works correctly without stacking side-effects.
  const plannedSilence = plan.arc.reduce((s, sec) => s + sec.silence_seconds, 0);
  const processed = enforceBreakBudget(script, plannedSilence);

  log("write", "script ready", {
    ms: Date.now() - started,
    sections: plan.arc.length,
    scriptChars: processed.length,
    estimatedSeconds: Math.round(estimateScriptDuration(processed)),
    targetSeconds,
    rawBreakSeconds: Math.round(sumBreakSeconds(script)),
    finalBreakSeconds: Math.round(sumBreakSeconds(processed)),
  });

  return { script: processed, title: plan.title ?? "A moment for you" };
}

function sumBreakSeconds(script: string): number {
  let total = 0;
  const re = /<break time="(\d+(?:\.\d+)?)s"\s*\/>/g;
  let m;
  while ((m = re.exec(script)) !== null) total += parseFloat(m[1]);
  return total;
}

// If the model over-spends the silence budget, scale all break values down
// proportionally so total silence fits within budget before normalizing.
function enforceBreakBudget(script: string, budgetSeconds: number): string {
  const total = sumBreakSeconds(script);
  if (total <= budgetSeconds) return script;
  const scale = budgetSeconds / total;
  return script.replace(/<break time="(\d+(?:\.\d+)?)s"\s*\/>/g, (_, secs) => {
    const scaled = Math.max(1, Math.round(parseFloat(secs) * scale * 10) / 10);
    return `<break time="${scaled}s" />`;
  });
}


// 10-second trailing silence so sessions don't end abruptly.
// Stacked 3s tags since ElevenLabs caps single tags at ~3s.
const TRAILING_SILENCE =
  ' <break time="3s" /> <break time="3s" /> <break time="3s" /> <break time="3s" />';

// eleven_v3 hard limit is ~5 min per request. Split long scripts into chunks
// at natural section-transition boundaries (lines ending with multiple break tags
// followed by a blank line) so the MP3 join lands in silence.
function splitScriptIntoChunks(script: string, numChunks = 5): string[] {
  const breakPositions: number[] = [];
  let i = 0;
  while (i < script.length) {
    const idx = script.indexOf("\n\n", i);
    if (idx === -1) break;
    breakPositions.push(idx);
    i = idx + 2;
  }

  if (breakPositions.length < numChunks - 1) return [script];

  const MULTI_BREAK_RE = /(<break time="\d+s" \/>[\s]*){2,}$/;
  const MIN_CHUNK = 100;

  function findBestSplit(targetPos: number, existingSplits: number[]): number {
    const eligible = (p: number) => existingSplits.every((s) => Math.abs(p - s) > MIN_CHUNK);
    const inWindow = (p: number, w: number) => Math.abs(p - targetPos) <= w;

    const tight = breakPositions.filter((p) => eligible(p) && inWindow(p, script.length * 0.12));
    const pool = tight.length > 0
      ? tight
      : breakPositions.filter((p) => eligible(p) && inWindow(p, script.length * 0.25));
    if (pool.length === 0) return targetPos;

    return pool
      .map((p) => {
        const preceding = script.slice(Math.max(0, p - 120), p).trimEnd();
        const hasMultiBreak = MULTI_BREAK_RE.test(preceding);
        const distancePenalty = Math.abs(p - targetPos) / script.length;
        return { p, score: (hasMultiBreak ? 0.3 : 0) - distancePenalty };
      })
      .sort((a, b) => b.score - a.score)[0].p;
  }

  const splits: number[] = [];
  for (let k = 1; k < numChunks; k++) {
    splits.push(findBestSplit(Math.floor((script.length * k) / numChunks), splits));
  }

  const boundaries = [0, ...splits, script.length];
  const chunks = boundaries
    .slice(0, -1)
    .map((start, k) => script.slice(start, boundaries[k + 1]).trim())
    .filter((c) => c.replace(/<break[^>]+\/>/g, "").trim().length >= MIN_CHUNK);

  if (chunks.length < 2) return [script];
  return chunks;
}

// PCM spec: 22050 Hz, 16-bit signed little-endian, mono.
const PCM_SAMPLE_RATE = 22050;
const PCM_BYTE_RATE = PCM_SAMPLE_RATE * 2; // 16-bit mono

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
): Promise<Buffer> {
  const stream = await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    model_id: "eleven_v3",
    output_format: "pcm_22050",
    voice_settings: voiceSettings,
  }, { timeoutInSeconds: 300 });
  const parts: Buffer[] = [];
  for await (const chunk of stream) {
    parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts);
}""

export async function generateAudio(
  script: string,
  voiceGender: VoiceGender,
  targetSeconds: number,
): Promise<Buffer> {
  const started = Date.now();
  const voiceId = VOICES[voiceGender];
  const voiceSettings = {
    stability: 0.8,
    similarity_boost: 0.9,
    style: 0.0,
    use_speaker_boost: true,
    speed: 0.85,
  };

  const chunks = splitScriptIntoChunks(script);
  log("elevenlabs", "synthesizing audio", {
    voiceGender,
    voiceId,
    scriptChars: script.length,
    targetSeconds,
    chunks: chunks.length,
    chunkChars: chunks.map((c) => c.length),
    model: "eleven_v3",
    voiceSettings,
  });

  try {
    // Add trailing silence only to the last chunk, then fire all in parallel.
    const texts = chunks.map((c, idx) =>
      idx === chunks.length - 1 ? c.trimEnd() + TRAILING_SILENCE : c,
    );

    // Raw PCM chunks — no headers, trivially concatenatable.
    const pcmChunks = await Promise.all(
      texts.map((text) => synthesizeChunk(text, voiceId, voiceSettings)),
    );
    const pcmData = Buffer.concat(pcmChunks);
    const buf = await pcmToMp3(pcmData);

    // Duration from raw PCM before encoding (exact)
    const estimatedDurationSeconds = Math.round(pcmData.length / PCM_BYTE_RATE);
    const durationErrorSeconds = estimatedDurationSeconds - targetSeconds;
    const durationErrorPct = Math.round((durationErrorSeconds / targetSeconds) * 100);
    const spokenChars = script.replace(/<break[^>]+\/>/g, "").replace(/\s+/g, " ").trim().length;
    const observedCharsPerSecond = +(spokenChars / estimatedDurationSeconds).toFixed(2);

    log("elevenlabs", "audio ready", {
      ms: Date.now() - started,
      bytes: buf.length,
      targetSeconds,
      estimatedDurationSeconds,
      durationErrorSeconds,
      durationErrorPct: `${durationErrorPct > 0 ? "+" : ""}${durationErrorPct}%`,
      scriptChars: script.length,
      observedCharsPerSecond,
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