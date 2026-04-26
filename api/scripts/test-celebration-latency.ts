import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

config({ path: ".env.local" });

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You write the closing line of a meditation app's post-session celebration. ONE short sentence. Max 15 words. Warm, observational, specific. No "welcome", no emojis, no spa cliches, no questions, no em-dashes stacking clauses. Don't reference data points by name (don't say "your streak" — say "five days running"). Sound like a person who noticed something, not a system reciting stats. Land it in one breath.`;

type Scenario = {
  label: string;
  user: string;
};

const scenarios: Scenario[] = [
  {
    label: "first session, calmer, breath helped",
    user: `Session 1 of all time. They felt calmer afterward. Breath work helped most. They wrote on the home screen: "anxious about a presentation tomorrow". No history yet.`,
  },
  {
    label: "5-day streak, calmer, body scan",
    user: `Session 12 total, 5-day streak. They felt calmer. Body scan helped most. Pattern from past sessions: "Rates body-focused sessions highest. Mentions tightness in shoulders often. Mornings work best for them."`,
  },
  {
    label: "more tense, broke pattern",
    user: `Session 23, 8-day streak. They felt more tense afterward. Said nothing in particular helped. Pattern: "Usually finds breath work calming. Rated 5 stars on last 3 sessions."`,
  },
  {
    label: "milestone, 25th session",
    user: `Session 25, 12-day streak. Felt calmer. Breath helped. Pattern: "Consistent evening practice. Lean toward shorter sessions."`,
  },
  {
    label: "minimal context",
    user: `Session 3, 2-day streak. Felt the same. No what_helped reported. No preference summary yet.`,
  },
];

async function runOne(scenario: Scenario): Promise<{ ms: number; text: string }> {
  const t0 = Date.now();
  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 100,
    system: SYSTEM,
    messages: [{ role: "user", content: scenario.user }],
  });
  const ms = Date.now() - t0;
  const text = res.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();
  return { ms, text };
}

async function main() {
  console.log("Warming up...");
  await runOne(scenarios[0]);

  console.log("\nRunning 3 trials per scenario:\n");
  const allLatencies: number[] = [];

  for (const scenario of scenarios) {
    console.log(`--- ${scenario.label} ---`);
    for (let i = 0; i < 3; i++) {
      const { ms, text } = await runOne(scenario);
      allLatencies.push(ms);
      console.log(`  [${ms}ms] ${text}`);
    }
    console.log();
  }

  allLatencies.sort((a, b) => a - b);
  const p50 = allLatencies[Math.floor(allLatencies.length * 0.5)];
  const p90 = allLatencies[Math.floor(allLatencies.length * 0.9)];
  const p99 = allLatencies[Math.floor(allLatencies.length * 0.99)];
  const max = allLatencies[allLatencies.length - 1];
  const avg = Math.round(allLatencies.reduce((s, x) => s + x, 0) / allLatencies.length);

  console.log("=== Latency stats ===");
  console.log(`  n=${allLatencies.length}`);
  console.log(`  avg=${avg}ms  p50=${p50}ms  p90=${p90}ms  p99=${p99}ms  max=${max}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
