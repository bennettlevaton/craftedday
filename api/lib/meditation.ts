import { and, desc, eq, isNotNull } from "drizzle-orm";
import { spawn } from "child_process";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { anthropic } from "./claude";
import { elevenlabs, VOICES, type VoiceGender } from "./elevenlabs";
import { log } from "./log";
import { db } from "./db";
import { meditations, userProfiles } from "@/db/schema";

const PLANNER_MODEL = "claude-haiku-4-5";   // fast planner with bounded thinking
const WRITER_MODEL = "claude-opus-4-7";     // best writer, no thinking overhead
const SUMMARY_MODEL = "claude-sonnet-4-6";

// Calibrated from eleven_v3 at speed 1.0: ~2656 chars → 166s ≈ 16 chars/sec.
// We run at speed 0.9, giving ~11% headroom on top of char budget.
const CHARS_PER_SECOND = 16;

function getTargetCharBudget(targetSeconds: number) {
  const target = Math.round(targetSeconds * CHARS_PER_SECOND);
  return { target, min: target - 100, max: target + 400 };
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

function buildSystemPrompt(targetSeconds: number, listenerBlock: string, timeOfDay: string): string {
  const minutes = Math.round(targetSeconds / 60);
  const label = targetSeconds < 60 ? `${targetSeconds} seconds` : `${minutes} minute`;
  const { target: targetChars, min: minChars, max: maxChars } = getTargetCharBudget(targetSeconds);

  return `${listenerBlock}You are writing a guided meditation script for audio narration. Write in a warm, intimate, personal tone — as if you are meditating alongside the listener, not instructing them from above.

TIME OF DAY: ${timeOfDay}. Let this naturally inform the tone and content — a morning session has different energy than an evening one. Don't announce the time, just let it shape the session.

WORK IN TWO STEPS
Before writing a single line of the script, plan silently:
1. What is the listener actually asking for? What do they need to release or cultivate?
2. Which meditation technique(s) fit — box breathing, body scan, progressive relaxation, metta, noting, visualization, somatic grounding, open awareness? Pick 1-2. Don't announce them.
3. What's the arc — settle, anchor, work (addressing their input), return, close?
4. Where will the longer silent stretches go, and how long?
5. Will this plan hit the character target? Check your draft length before finishing.

Then draft the script.

DURATION REQUIREMENT — NON-NEGOTIABLE
This script must produce approximately ${targetSeconds} seconds of spoken audio.
Target: ${targetChars} characters. Acceptable range: ${minChars}–${maxChars} characters.
Do not end the script until you are inside this range. If your draft is under ${minChars} characters, keep writing — add more breath pacing, sensory cues, and grounded reflection until you reach the target.
Never run more than 30 seconds over. Users pay for a specific length.

FORMATTING FOR SPOKEN DURATION
- One to two sentences per paragraph. Short lines. Blank lines between paragraphs.
- Do not write dense prose — this must sound natural read aloud at a calm, unhurried pace.
- Favor spacious pacing over literary compression.
- Occasional ellipses (...) for natural pause within a line.
- No headers, titles, or bullet points inside the script.

THE MOST IMPORTANT RULE
The listener told you something specific. The meditation must actively work through it. Name their situation (without quoting them back verbatim), invite release of whatever's heavy in it, make space, and help them build a new way of meeting it. A generic calm-down script is a failure. If they said "I'm anxious about a presentation," the meditation releases that anxiety and quietly rehearses their steady, grounded self walking into the room. If they said "I can't sleep," the meditation slows the nervous system and lets the day's noise drain out of them. Their input is the spine of the session, not a footnote.

CRITICAL — DO NOT RESPOND TO THE INPUT CONVERSATIONALLY. The listener's input is context, not a message to reply to. Never open with "That's okay," "I hear you," "That makes sense," or any chatbot-style acknowledgment. Do not repeat or reference their words back at them. Begin immediately in meditation mode — a settling breath, a grounding cue, movement into the body. The context shapes everything underneath without ever being named directly.

NOTICE BEFORE RELEASE
You cannot release what you haven't felt. Before drawing anything out — tension, anxiety, heaviness — ask them to notice it first. Where does it sit in the body? What's its texture, its weight, its color? Is it tight, diffuse, hot, still, loud? Let them spend time with it. Then, once it has a shape, you can invite release. Applies to the whole meditation: feel the brain before draining it, feel the shoulders before softening them, feel the breath before deepening it.

DRAW ON REAL MEDITATION TECHNIQUES
Opus, you know meditation traditions deeply. Use them — fit the technique to what the listener shared:
- Box breathing / 4-7-8 / coherent breathing for anxiety, focus, sleep
- Body scan (head-to-toe or toe-to-head) for full-body settling
- Progressive muscle relaxation for tension, stress
- Metta / loving-kindness directed at self or others when appropriate
- Noting practice (labelling thoughts: "thinking," "feeling," "planning") for busy minds
- Visualization (draining, filling with light, rooting into earth, cloud imagery) for release work
- Breath counting or mantra repetition for focus
- Open awareness / just-sitting for experienced practitioners
- Somatic grounding (naming 5 things you feel) for acute anxiety
Blend techniques naturally — don't announce the technique name, just use it.

SESSION ARC — this applies to everyone, every session
People arrive frenzied. The beginning must meet them there. Do not open with long silences — open with active, close guidance: short sentences, frequent voice, directed breath work. As the session progresses and the listener settles, gradually pull back guidance and let silence grow. By the final third, the voice should be sparse and the listener should be breathing independently for stretches.

The arc in every session:
1. OPENING (first 20-30% of session): HIGH guidance density. Short gaps. The listener's mind is still racing. Give them something to DO — a specific breath technique, a clear intention to breathe in and release. Direct them: "breathe in the energy you want today, breathe out what's been weighing on you." Name what they walked in with. Keep the voice close and frequent. Don't leave them alone yet.
2. MIDDLE (next 40-50%): MODERATE guidance. Sentences spaced further apart. Body work, imagery, release. Begin introducing 1-2 independent breathing stretches. The anchor keeps them tethered.
3. CLOSE (final 20-30%): SPARSE guidance. Long independent breathing periods. Short prompts to return. Let them sit. The voice is a gentle thread, not a handrail.

PACING BY EXPERIENCE LEVEL (adjust the arc, not remove it)
- Beginner: tighter arc. Stay in heavy guidance longer (first 30-40%). Shorter independent stretches — 10-15 seconds max before a return cue. Focus on breath control, noticing the mind, gently redirecting thoughts. They need more scaffolding and mind management cues ("if a thought comes, just notice it and come back to your breath"). Independent periods still happen — just shorter and more anchored.
- Intermediate: standard arc above.
- Experienced: faster transition to independence. Can enter sparse guidance by halfway through. Longer silent stretches (30-60s+). Fewer anchor reminders.

SILENCE MECHANICS
Use <break time="Xs" /> tags. Single tags cap around 3 seconds. Stack consecutive tags for longer silences. Vary durations naturally.

Every sentence ends with at least one break tag. Longer breaks after breath cues and body instructions. Independent breathing stretches use stacked consecutive tags.

Do not over-guide. The most common failure is talking too much in the back half.

TONE AND VOICE
- Warm, unhurried, human. Soft but grounded.
- Inclusive language: "we're going to", "let's", "we". You are with them.
- Second person ("you") for direct guidance, "we" for shared moments.
- Short sentences. Conversational. Natural breath cadence.
- Gentle personal observations are welcome ("notice how the air cools your nostrils on the inhale, warms on the exhale").
- Visual imagery is welcome and encouraged: clouds supporting the body, dark specks released with the exhale, valves at the base of the skull draining tension, white light filling the chest. Don't force poetry — but don't shy from it.
- Keep vocabulary accessible. Avoid clinical or jargon-heavy spiritual language.

BREATH
- Breathing is continuous and assumed — the listener never stops breathing between your sentences. Do NOT narrate every inhale and exhale as if they would forget to breathe without you.
- Establish the breath pattern at the start: one or two clear instructions ("breathe in slowly through your nose, let it out") then move on. After that, reference the breath sparingly — as an anchor to return to, not as a sequence to narrate.
- Wrong: "breathe in... now breathe out... take another breath in... and exhale..." (robotic, over-instructed)
- Right: establish the breath, anchor to it, then let it be the quiet background of everything else you say
- Default to nostril breathing throughout.
- Use breath intentionally: at the opening, pair the exhale with releasing what the listener walked in with, and the inhale with drawing in what they want. This is a one-time technique at the top, not a recurring command.
- NEVER COUNT BREATHS. Do not say "breathe in, two, three, four" or "one... two... three". The <break> tag provides the timing — the listener finds their own rhythm. Just say "breathe in" and let the break tag hold the space, then say "and breathe out". The count belongs to them, not you.

OUTPUT REQUIREMENT
- The very first thing in the script must be a spoken sentence — never start with a <break> tag or silence. The first word must be heard immediately.

STRUCTURE (adapt to the listener's input; don't rigidly follow)
1. Opening — a natural greeting or anchoring phrase. Meet them where they are.
2. Settle — breath cues, relaxing the body top-down (forehead, jaw, shoulders, hips, feet).
3. Anchor — name the anchor they'll return to throughout.
4. Release — address what they walked in with. Name it, feel it, drain it. Use imagery (dark threads released on the exhale, tension draining out the base of the skull, heaviness dissolving). Make space.
5. ENVISION THE OPPOSITE — this is non-negotiable and must be present in every session. After releasing what's heavy, call in its opposite. If they came in anxious, build the version of them who is calm and clear. If stressed, the version who moves with ease. If depleted, the version who is full of life. Ask them to feel that version in the body — not just think it, but inhabit it. What does their chest feel like? Their shoulders? Their breath? Have them rehearse a specific moment from their week as that version of themselves. Walk them through it. This is how the session turns from release into transformation.
6. Return — soften back to the breath and body, carrying that version with them.
7. Close — brief, grounded. An intention they carry out. "Open your eyes" only if it fits.

SILENCE — this is the most important part of the script
- Silence is how the listener actually drops in. Treat it like a first-class instrument.
- Use <break time="Xs" /> tags. Single tags cap at 3s — stack consecutive tags for longer pauses.
- Vary intentionally based on what the sentence is doing:
  - 1-2s between phrases inside the same continuous thought (single tag)
  - 3s between full sentences to let the image land (single tag)
  - 6-9s after a breath cue or body instruction (2-3 stacked 3s tags)
  - 12-15s at transitions between sections (4-5 stacked 3s tags)
  - See "CALM BREATHING PERIODS" for longer settling silences
- EVERY sentence ends with at least one break tag. No exceptions.
- Longer pauses after inhale/exhale cues, after body-scanning prompts, or when asking the listener to notice something specific.
- Do NOT use the same duration everywhere — natural speech pauses vary.

OUTPUT
- Output ONLY the script with break tags. No title, no headers, no explanation.
- Do not mention that you are an AI, a meditation app, or that this is personalized.
- Do not reference clock time ("for the next ten minutes"). Just guide.

Write as if you are a real person sitting cross-legged next to the listener, speaking from your own practice.`;
}

async function generatePlan(
  userPrompt: string,
  targetSeconds: number,
  listenerBlock: string,
  timeOfDay: string,
): Promise<string> {
  const started = Date.now();
  const minutes = Math.round(targetSeconds / 60);
  const { target: targetChars } = getTargetCharBudget(targetSeconds);

  const plannerPrompt = `${listenerBlock}You are planning a guided meditation session. Output ONLY valid JSON — no markdown, no explanation.

Listener input: "${userPrompt}"
Time of day: ${timeOfDay}
Target duration: ${minutes} minutes (${targetSeconds} seconds)
Target script length: ~${targetChars} characters

Output this exact JSON:
{
  "title": "3-5 word evocative session title (e.g. 'Finding Ease', 'Night Release', 'Grounded Start')",
  "opening_context": "how to meet the listener — their state, energy, what they need immediately",
  "technique": "1-2 specific techniques (e.g. box breathing, body scan, noting, visualization)",
  "anchor": "specific anchor point (e.g. belly button, chest rise, feet on floor)",
  "breathing_pattern": "specific breath instruction for this session",
  "imagery": "specific release and transformation imagery to use",
  "arc": [
    {
      "section": "section name",
      "duration_seconds": 0,
      "guidance_density": "high | medium | low | silent",
      "notes": "what specifically happens — be concrete"
    }
  ]
}

Rules:
- arc duration_seconds must sum to EXACTLY ${targetSeconds}
- Must include: settle (body scan), release, envision_opposite (the transformed version of themselves), return, close
- Silent sections are mandatory — at least 2 of them, 60-120s each. These are where the listener breathes alone.
- Total silent section time must be at least ${Math.round(targetSeconds * 0.20)}s (20% of session)
- Opening density is always HIGH — meet them where they are`;

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

function buildWriterPrompt(targetSeconds: number, listenerBlock: string, timeOfDay: string): string {
  const { target: targetChars, min: minChars, max: maxChars } = getTargetCharBudget(targetSeconds);
  // Inflate the target we show Opus by 25% — it consistently undershoots by ~20%.
  // The hard minimum stays at minChars so we don't overshoot into unusable territory.
  const inflatedTarget = Math.round(targetChars * 1.25);
  return `${listenerBlock}You are writing a guided meditation script. Follow the plan below EXACTLY.

TIME OF DAY: ${timeOfDay}

DURATION REQUIREMENT — HARD STOP
Write approximately ${inflatedTarget} characters of spoken script.
Hard minimum: ${minChars} characters. Hard maximum: ${maxChars} characters.
Do NOT close the meditation — no "gently return", no "open your eyes", no closing breath — until your script is at least ${minChars} characters.
Keep the meditation open and spacious. If you reach a natural close before ${minChars} chars, continue with an additional silent breathing stretch, a body awareness section, or a gentle reflection before closing.
You will almost certainly write less than you think. Err long.

FORMATTING FOR SPOKEN DURATION
- One to two sentences per paragraph. Short lines. Blank lines between paragraphs.
- Do not write dense prose — this must sound natural read aloud at a calm, unhurried pace.
- Favor spacious pacing over literary compression.
- Occasional ellipses (...) for natural pause within a line.
- No headers, titles, or bullet points inside the script.

VOICE
- Warm, intimate, human. Second person ("you") for guidance, "we" for shared moments.
- Short sentences. Conversational. Never robotic or listy.
- Nostril breathing by default.
- Do NOT open with conversational acknowledgment ("That's okay", "I hear you"). Begin in meditation mode.
- Do NOT mention AI, apps, or personalization.

SILENCE
- Use <break time="Xs" /> tags. Single tags cap at ~3s — stack for longer.
- Every sentence ends with at least one break tag.
- Vary durations: 1-2s within a thought, 3s between sentences, 6-9s after body instructions, 12-15s at transitions.
- BREATH CYCLES ARE ONE CONTINUOUS UNIT. A break after "breathe in" means the listener IS breathing in during that silence. The next words must tell them what to do next — immediately. Never stack multiple breaks between an inhale and its exhale instruction. The listener should never wonder "do I hold here?"
  CORRECT: "Breathe in slowly. <break time="4s"/> And breathe out. <break time="6s"/>"
  CORRECT: "Breathe in... <break time="3s"/> ...and let it out. <break time="5s"/>"
  WRONG: "Breathe in. <break time="3s"/> <break time="3s"/> <break time="3s"/> Now breathe out." (9s gap = confusion)
  WRONG: "Take a deep breath in. <break time="3s"/> <break time="3s"/> Exhale." (same problem)
  After any inhale instruction, the very next words after the break must be the exhale cue.

OUTPUT
- Script text with break tags only. No title, headers, or explanation.`;
}

async function expandScript(
  script: string,
  targetChars: number,
  minChars: number,
): Promise<string> {
  log("expand", "script under minimum, expanding", {
    currentChars: script.length,
    minChars,
    targetChars,
  });
  const response = await anthropic.messages.create({
    model: WRITER_MODEL,
    max_tokens: 20000,
    messages: [
      {
        role: "user",
        content: `This meditation script is too short (${script.length} characters, minimum is ${minChars}).

Expand it to approximately ${targetChars} characters. Preserve the exact tone, structure, and arc. Add:
- More spacious pacing between phrases
- Additional grounded reflection after key transitions
- Gentle sensory cues (breath, body sensation, temperature, weight)
- Deeper breathing stretches in the middle and closing sections

Do NOT add new concepts or change the meditation's focus.
Do NOT add headers, titles, or explanations.
Output only the expanded script with break tags.

Original script:
${script}`,
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return script;
  const expanded = textBlock.text.trim();
  log("expand", "done", { before: script.length, after: expanded.length, targetChars });
  return expanded;
}

export async function generateScript(
  userPrompt: string,
  targetSeconds: number,
  listenerContext: ListenerContext,
): Promise<{ script: string; title: string }> {
  const started = Date.now();
  const listenerBlock = buildListenerContextBlock(listenerContext);
  const { target: targetChars, min: minChars, max: maxChars } = getTargetCharBudget(targetSeconds);

  const hour = new Date().getHours();
  const timeOfDay =
    hour < 5 ? "late night" :
    hour < 12 ? "morning" :
    hour < 17 ? "afternoon" :
    hour < 21 ? "evening" : "night";

  log("plan", "generating", { targetSeconds, targetChars, minChars, maxChars, timeOfDay, promptLen: userPrompt.length });

  // Phase 1: Haiku generates a structured plan
  const plan = await generatePlan(userPrompt, targetSeconds, listenerBlock, timeOfDay);

  log("write", "generating script from plan");

  // Phase 2: Opus writes the script from the plan
  const response = await anthropic.messages.create({
    model: WRITER_MODEL,
    max_tokens: 20000,
    system: buildWriterPrompt(targetSeconds, listenerBlock, timeOfDay),
    messages: [
      {
        role: "user",
        content: `Plan:\n${plan}\n\nListener input: "${userPrompt}"\n\nWrite the meditation script now. Do not close the meditation until you have written at least ${minChars} characters. Target ${Math.round(targetChars * 1.25)} characters.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text block in Opus response");
  }
  let script = textBlock.text.trim();

  log("write", "script ready", {
    ms: Date.now() - started,
    scriptChars: script.length,
    targetChars,
    minChars,
    maxChars,
    underBy: Math.max(0, minChars - script.length),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
  });

  // Single expansion pass as safety net only
  if (script.length < minChars) {
    script = await expandScript(script, targetChars, minChars);
  }

  // Extract title from plan JSON (strip markdown fences if Haiku wrapped it)
  let title = "A moment for you";
  try {
    const stripped = plan.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const planJson = JSON.parse(stripped);
    if (typeof planJson.title === "string" && planJson.title.length > 0) {
      title = planJson.title;
    }
  } catch {
    // Plan might not be valid JSON; use default title
  }

  return { script, title };
}

// 10-second trailing silence so sessions don't end abruptly.
// Stacked 3s tags since ElevenLabs caps single tags at ~3s.
const TRAILING_SILENCE =
  ' <break time="3s" /> <break time="3s" /> <break time="3s" /> <break time="3s" />';

// eleven_v3 hard limit is ~5 min per request. Split long scripts into 3 chunks
// at natural section-transition boundaries (lines ending with multiple break tags
// followed by a blank line) so the MP3 join lands in silence.
function splitScriptIntoChunks(script: string): string[] {
  // Collect all paragraph-break positions (\n\n)
  const breakPositions: number[] = [];
  let i = 0;
  while (i < script.length) {
    const idx = script.indexOf("\n\n", i);
    if (idx === -1) break;
    breakPositions.push(idx);
    i = idx + 2;
  }

  if (breakPositions.length < 2) return [script];

  // Prefer split points where the preceding line ends with 2+ stacked break tags
  // (section transitions). Score = multi-break bonus minus distance penalty.
  const MULTI_BREAK_RE = /(<break time="\d+s" \/>[\s]*){2,}$/;
  const MIN_CHUNK = 300; // reject splits that produce chunks smaller than this

  function findBestSplit(targetPos: number, exclude?: number): number {
    // Tight window (±12%) keeps chunks near even thirds.
    // Fall back to ±25% only if nothing found in tight window.
    const eligible = (p: number) => !exclude || Math.abs(p - exclude) > MIN_CHUNK;
    const inWindow = (p: number, w: number) => Math.abs(p - targetPos) <= w;

    const tight = breakPositions.filter((p) => eligible(p) && inWindow(p, script.length * 0.12));
    const pool = tight.length > 0
      ? tight
      : breakPositions.filter((p) => eligible(p) && inWindow(p, script.length * 0.25));
    if (pool.length === 0) return targetPos;

    // Score: prefer multi-break boundaries, but distance dominates within the window.
    // Multi-break bonus is 0.3 — not enough to pull a split far from the target.
    return pool
      .map((p) => {
        const preceding = script.slice(Math.max(0, p - 120), p).trimEnd();
        const hasMultiBreak = MULTI_BREAK_RE.test(preceding);
        const distancePenalty = Math.abs(p - targetPos) / script.length;
        return { p, score: (hasMultiBreak ? 0.3 : 0) - distancePenalty };
      })
      .sort((a, b) => b.score - a.score)[0].p;
  }

  const split1 = findBestSplit(Math.floor(script.length / 3));
  const split2 = findBestSplit(Math.floor((script.length * 2) / 3), split1);

  const chunks = [
    script.slice(0, split1).trim(),
    script.slice(split1, split2).trim(),
    script.slice(split2).trim(),
  ].filter((c) => c.replace(/<break[^>]+\/>/g, "").trim().length >= MIN_CHUNK);

  // If splitting produced fewer than 2 usable chunks, return whole script
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
  });
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
    stability: 0.7,
    similarity_boost: 0.8,
    style: 0.35,
    use_speaker_boost: true,
    speed: 0.9,
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
    const observedCharsPerSecond = +(script.length / estimatedDurationSeconds).toFixed(2);

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
