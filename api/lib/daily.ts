import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "./db";
import { dailySessions, meditations } from "@/db/schema";
import { enqueueJob } from "./jobs";
import { getOrCreateProfile } from "./user";
import { log } from "./log";
import { archetypePrompt, pickDailyArchetype } from "./archetypes";
import welcomeData from "./welcome-data.json";
import type { VoiceGender } from "./inworld";

// Daily cron sessions are 5 minutes — at 10 min, TTS cost per active sub exceeds
// the post-Apple/RC net at our $9.99 price point across all experience levels.
// 5 min keeps margins healthy without dropping voice quality. Custom user-
// initiated generation is unaffected — it has its own duration param.
const DEFAULT_DURATION = 300;

// Pacific Time — must match /api/session/daily lookup and the cron timezone.
export function todayPacific(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

// Idempotent: returns { enqueued: false, reason } if the user already has a
// daily session for today (or a pending job for it). Safe to call from
// onboarding, the cron, or post-purchase hooks without duplicating work.
export async function enqueueDailyForUser(userId: string): Promise<
  | { enqueued: true; jobId: string }
  | { enqueued: false; reason: "already_exists" }
> {
  const date = todayPacific();

  const existing = await db
    .select({ id: dailySessions.meditationId })
    .from(dailySessions)
    .where(and(eq(dailySessions.userId, userId), eq(dailySessions.date, date)))
    .limit(1);
  if (existing.length > 0) return { enqueued: false, reason: "already_exists" };

  const profile = await getOrCreateProfile(userId);
  const voiceGender: VoiceGender = profile.voiceGender === "male" ? "male" : "female";

  const archetype = await pickDailyArchetype({
    userId,
    primaryGoals: (profile.primaryGoals ?? []).filter((g) => g !== "other"),
  });
  log("daily", "archetype picked", { userId, archetype: archetype.id });

  const jobId = await enqueueJob({
    userId,
    prompt: archetypePrompt(archetype, profile.experienceLevel),
    durationSeconds: DEFAULT_DURATION,
    voiceGender,
    profile: {
      name: profile.name,
      experienceLevel: profile.experienceLevel,
      primaryGoals: profile.primaryGoals ?? [],
      primaryGoalCustom: profile.primaryGoalCustom,
      preferenceSummary: profile.preferenceSummary,
      archetype: archetype.id,
    },
    source: "cron",
  });

  return { enqueued: true, jobId };
}

// Grants today's daily session to a newly-onboarded user using the pre-generated
// welcome meditation (no wait, no TTS burn per user — the audio file in R2
// is shared across all users, but each user gets their own `meditations` row so
// history/stats/check-ins work unchanged).
//
// Idempotent: if the user already has today's daily, returns { granted: false }.
// Returns { granted: false, reason: "not_configured" } if welcome-data.json is
// still the placeholder — caller should fall back to enqueueing a job.
export async function grantWelcomeSession(userId: string): Promise<
  | { granted: true; meditationId: string }
  | { granted: false; reason: "already_exists" | "not_configured" }
> {
  const date = todayPacific();

  const existing = await db
    .select({ id: dailySessions.meditationId })
    .from(dailySessions)
    .where(and(eq(dailySessions.userId, userId), eq(dailySessions.date, date)))
    .limit(1);
  if (existing.length > 0) return { granted: false, reason: "already_exists" };

  const profile = await getOrCreateProfile(userId);
  const gender: VoiceGender = profile.voiceGender === "male" ? "male" : "female";
  const audioUrl = welcomeData[gender]?.audioUrl;

  if (!audioUrl || !welcomeData.script) {
    log("welcome", "not configured — run welcome:generate and deploy");
    return { granted: false, reason: "not_configured" };
  }

  const meditationId = randomUUID();
  await db.insert(meditations).values({
    id: meditationId,
    userId,
    prompt: welcomeData.prompt,
    title: welcomeData.title,
    script: welcomeData.script,
    audioUrl,
    duration: welcomeData.duration,
  });

  await db
    .insert(dailySessions)
    .values({ userId, date, meditationId })
    .onConflictDoNothing();

  return { granted: true, meditationId };
}
