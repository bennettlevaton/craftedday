import Groq from "groq-sdk";
import { log, logError } from "./log";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = "llama-3.1-8b-instant";
const TIMEOUT_MS = 800;

const SYSTEM = `You write the closing line of a meditation app's post-session celebration. ONE short sentence. Max 15 words. Warm, observational, specific. No "welcome", no emojis, no spa cliches, no questions, no em-dashes stacking clauses. Don't reference data points by name (don't say "your streak" — say "five days running"). Sound like a person who noticed something, not a system reciting stats. Land it in one breath. Never reference time of day (no "morning", "nights", "evening", "today" as a time-of-day cue) — sessions can happen anytime.`;

export type CelebrationInputs = {
  feeling: "calmer" | "same" | "tense";
  whatHelped: string[] | null;
  totalSessions: number;
  streak: number;
  preferenceSummary: string | null;
  prompt: string | null;
};

export async function generateCelebration(inputs: CelebrationInputs): Promise<string> {
  try {
    const text = await Promise.race([
      callHaiku(inputs),
      timeout(TIMEOUT_MS),
    ]);
    if (!text) {
      log("celebration", "empty or timeout, using fallback");
      return fallback(inputs);
    }
    return text;
  } catch (err) {
    logError("celebration", err);
    return fallback(inputs);
  }
}

async function callHaiku(inputs: CelebrationInputs): Promise<string | null> {
  const started = Date.now();
  const userMsg = buildUserMessage(inputs);
  const res = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 60,
    temperature: 0.8,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userMsg },
    ],
  });
  const elapsed = Date.now() - started;
  const text = res.choices[0]?.message?.content?.trim() ?? null;
  log("celebration", "groq ok", { elapsed, len: text?.length ?? 0 });
  return text;
}

function buildUserMessage(i: CelebrationInputs): string {
  const lines = [
    `Total sessions ever: ${i.totalSessions}.`,
    `Current streak: ${i.streak} day${i.streak === 1 ? "" : "s"}.`,
    `Felt: ${feelingLabel(i.feeling)}.`,
    i.whatHelped && i.whatHelped.length > 0 ? `What helped most: ${i.whatHelped.join(", ")}.` : `What helped: not specified.`,
    i.prompt ? `What they said before the session: "${i.prompt}".` : null,
    i.preferenceSummary ? `Pattern from past sessions: ${i.preferenceSummary}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function feelingLabel(f: CelebrationInputs["feeling"]): string {
  return f === "calmer" ? "calmer" : f === "tense" ? "more tense" : "about the same";
}

const FALLBACK_FIRST = [
  "First one in. The next one will be even more yours.",
  "That was your first. We're just getting started.",
  "One down. The next one already knows you a little better.",
];

const FALLBACK_TENSE = [
  "Some days don't land. Tomorrow's a fresh one.",
  "Not every session does the work. Coming back is what matters.",
  "Today wasn't smooth. That's part of it.",
];

const FALLBACK_STREAK = [
  "days running. You're becoming someone who shows up.",
  "days in a row. That's the practice, not the sessions.",
  "days deep. The kind of streak that quietly changes things.",
];

const FALLBACK_CALMER_BREATH = [
  "Breath did its work today. Noted.",
  "The breath knew what to do. So did you.",
  "Slower in, slower out. That's the whole craft.",
];

const FALLBACK_CALMER = [
  "Lighter than you came in. Worth coming back for.",
  "Something settled. That's the only metric that matters.",
  "You walked in heavier than you're walking out.",
];

const FALLBACK_DEFAULT = [
  "You showed up. That's the whole thing.",
  "Another one in the bank. Quietly, that's how this works.",
  "Sat with yourself. Few things matter more.",
];

function pick(list: readonly string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

// Template fallback — never fails. Keyed on the strongest signals.
export function fallback(i: CelebrationInputs): string {
  if (i.totalSessions === 1) return pick(FALLBACK_FIRST);
  if (i.feeling === "tense") return pick(FALLBACK_TENSE);
  if (i.streak >= 7) return `${i.streak} ${pick(FALLBACK_STREAK)}`;
  if (i.feeling === "calmer" && i.whatHelped?.includes("breath")) return pick(FALLBACK_CALMER_BREATH);
  if (i.feeling === "calmer") return pick(FALLBACK_CALMER);
  return pick(FALLBACK_DEFAULT);
}

function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}
