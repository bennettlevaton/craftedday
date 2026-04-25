import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { dailySessions, meditations } from "@/db/schema";

export type ArchetypeId =
  | "softening_tension"
  | "returning_to_breath"
  | "inner_dialogue"
  | "body_settling"
  | "presence_now"
  | "letting_go"
  | "noticing_without_fixing"
  | "steadying_mind";

export type Archetype = {
  id: ArchetypeId;
  label: string;
  essence: string;   // fed into the seed prompt
  leans: string[];   // overlap with profile.primaryGoals → goal-match bonus
};

export const ARCHETYPES: Archetype[] = [
  {
    id: "softening_tension",
    label: "Softening tension",
    essence:
      "releasing held tightness in the body — jaw, shoulders, hands — letting the nervous system downshift",
    leans: ["stress", "anxiety", "sleep"],
  },
  {
    id: "returning_to_breath",
    label: "Returning to breath",
    essence:
      "using the breath as a home base, noticing when the mind wanders and gently coming back",
    leans: ["focus", "anxiety", "general"],
  },
  {
    id: "inner_dialogue",
    label: "Working with inner dialogue",
    essence:
      "observing the voice in the head without arguing with it, creating space between thought and self",
    leans: ["anxiety", "stress", "focus"],
  },
  {
    id: "body_settling",
    label: "Body settling",
    essence:
      "moving attention through the body, letting each region drop a layer of holding",
    leans: ["sleep", "stress", "general"],
  },
  {
    id: "presence_now",
    label: "Presence in the now",
    essence:
      "anchoring in current sensation — sound, weight, breath — rather than past or future",
    leans: ["focus", "anxiety", "general"],
  },
  {
    id: "letting_go",
    label: "Letting go",
    essence:
      "practicing release — of an outcome, a held thought, a need to control",
    leans: ["stress", "sleep", "anxiety"],
  },
  {
    id: "noticing_without_fixing",
    label: "Noticing without fixing",
    essence:
      "meeting whatever's here — restlessness, fatigue, tightness — without trying to change it",
    leans: ["anxiety", "general", "stress"],
  },
  {
    id: "steadying_mind",
    label: "Steadying the mind",
    essence:
      "building one-pointed attention on a single anchor when thoughts feel scattered",
    leans: ["focus", "stress", "general"],
  },
];

const RECENT_WINDOW = 3;        // skip archetypes used in last N daily sessions
const GOAL_MATCH_BONUS = 1.5;   // multiplier when archetype.leans intersects user goals

// Pulls every check-in the user has left and returns calmer-rate per archetype with
// a Laplace-smoothed prior of 0.5. Archetypes with no data sit at 0.5; they sharpen
// (toward 1.0 or 0.0) as the user accumulates check-ins on that archetype.
async function computeAffinities(userId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({
      archetype: meditations.archetype,
      feeling: meditations.feeling,
    })
    .from(meditations)
    .where(
      and(
        eq(meditations.userId, userId),
        isNotNull(meditations.archetype),
        isNotNull(meditations.feeling),
      ),
    );

  const counts = new Map<string, { calmer: number; total: number }>();
  for (const r of rows) {
    if (!r.archetype) continue;
    const c = counts.get(r.archetype) ?? { calmer: 0, total: 0 };
    c.total += 1;
    if (r.feeling === "calmer") c.calmer += 1;
    counts.set(r.archetype, c);
  }

  const affinities: Record<string, number> = {};
  for (const a of ARCHETYPES) {
    const c = counts.get(a.id) ?? { calmer: 0, total: 0 };
    affinities[a.id] = (c.calmer + 1) / (c.total + 2);
  }
  return affinities;
}

async function recentArchetypes(userId: string): Promise<ArchetypeId[]> {
  const rows = await db
    .select({ archetype: meditations.archetype })
    .from(dailySessions)
    .innerJoin(meditations, eq(meditations.id, dailySessions.meditationId))
    .where(eq(dailySessions.userId, userId))
    .orderBy(desc(dailySessions.date))
    .limit(RECENT_WINDOW);
  return rows
    .map((r) => r.archetype as ArchetypeId | null)
    .filter((a): a is ArchetypeId => a !== null);
}

function weightedPick(pool: Archetype[], weights: number[]): Archetype {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export async function pickDailyArchetype(opts: {
  userId: string;
  primaryGoals: string[];
}): Promise<Archetype> {
  const [affinities, recent] = await Promise.all([
    computeAffinities(opts.userId),
    recentArchetypes(opts.userId),
  ]);

  const candidates = ARCHETYPES.filter((a) => !recent.includes(a.id));
  const pool = candidates.length > 0 ? candidates : ARCHETYPES;

  const weights = pool.map((a) => {
    const goalMatch = a.leans.some((g) => opts.primaryGoals.includes(g))
      ? GOAL_MATCH_BONUS
      : 1.0;
    const affinity = affinities[a.id] ?? 0.5;
    return goalMatch * affinity;
  });

  return weightedPick(pool, weights);
}

// Seed prompt fed into Claude's planner + writer. Claude generates a unique title
// per session, so two users (or the same user months apart) on `softening_tension`
// get different titles like "Letting the shoulders drop" vs "Unclenching."
export function archetypePrompt(archetype: Archetype, experienceLevel: string | null): string {
  const level = experienceLevel ?? "intermediate";
  return `A meditation for a ${level} practitioner on ${archetype.essence}.`;
}
