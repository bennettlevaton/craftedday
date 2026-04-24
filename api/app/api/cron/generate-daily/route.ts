import { NextRequest, NextResponse, after } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailySessions, userProfiles } from "@/db/schema";
import { enqueueJob, triggerWorker } from "@/lib/jobs";
import { getOrCreateProfile } from "@/lib/user";
import { log, logError } from "@/lib/log";
import type { VoiceGender } from "@/lib/elevenlabs";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_DURATION = 600;

// Pacific Time — cron fires at 8am UTC which is midnight PT, so "today PT" at that
// moment is the day about to start. Must match /api/session/daily lookup timezone.
function todayPacific(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function dailyPrompt(profile: { primaryGoals: string[] | null; experienceLevel: string | null }): string {
  const goals = profile.primaryGoals?.filter((g) => g !== "other") ?? [];
  const focus = goals.length > 0 ? goals.join(" and ") : "general wellbeing";
  const level = profile.experienceLevel ?? "intermediate";
  return `A grounding meditation for a ${level} practitioner focused on ${focus}`;
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = todayPacific();
  log("cron:daily", "start", { date });

  const allUsers = await db
    .select({
      userId: userProfiles.userId,
      experienceLevel: userProfiles.experienceLevel,
      primaryGoals: userProfiles.primaryGoals,
      voiceGender: userProfiles.voiceGender,
    })
    .from(userProfiles)
    .where(isNotNull(userProfiles.onboardedAt));

  log("cron:daily", "users to process", { count: allUsers.length });

  const counts = { enqueued: 0, skipped: 0, errors: 0 };

  await Promise.all(
    allUsers.map(async (user) => {
      try {
        const existing = await db
          .select({ id: dailySessions.meditationId })
          .from(dailySessions)
          .where(and(eq(dailySessions.userId, user.userId), eq(dailySessions.date, date)))
          .limit(1);
        if (existing.length > 0) { counts.skipped++; return; }

        const profile = await getOrCreateProfile(user.userId);
        const voiceGender: VoiceGender = user.voiceGender === "male" ? "male" : "female";
        const prompt = dailyPrompt(user);

        await enqueueJob({
          userId: user.userId,
          prompt,
          durationSeconds: DEFAULT_DURATION,
          voiceGender,
          profile: {
            name: profile.name,
            experienceLevel: profile.experienceLevel,
            primaryGoals: profile.primaryGoals ?? [],
            primaryGoalCustom: profile.primaryGoalCustom,
            preferenceSummary: profile.preferenceSummary,
          },
          source: "cron",
        });

        counts.enqueued++;
      } catch (err) {
        counts.errors++;
        logError(`cron:daily:${user.userId}`, err);
      }
    }),
  );

  log("cron:daily", "enqueued", counts);

  // Kick off the worker chain
  after(() => triggerWorker());

  return NextResponse.json(counts);
}
