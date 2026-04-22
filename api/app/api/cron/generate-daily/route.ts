import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { dailySessions, meditations, userProfiles } from "@/db/schema";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, R2_PUBLIC_URL, r2 } from "@/lib/r2";
import { generateAudio, generateScript } from "@/lib/meditation";
import type { VoiceGender } from "@/lib/elevenlabs";
import { log, logError } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 800;

const DEFAULT_DURATION = 600; // 10 min

function todayEst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function dailyPrompt(
  profile: { primaryGoals: string[] | null; experienceLevel: string | null },
): string {
  const goals = profile.primaryGoals?.filter((g) => g !== "other") ?? [];
  const focus = goals.length > 0 ? goals.join(" and ") : "general wellbeing";
  const level = profile.experienceLevel ?? "intermediate";
  return `A grounding meditation for a ${level} practitioner focused on ${focus}`;
}

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const secret = req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = todayEst();
  log("cron:daily", "start", { date });

  // All onboarded users from user_profiles
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

  const counts = { generated: 0, skipped: 0, errors: 0 };

  async function generateForUser(profile: typeof allUsers[0]) {
    const { userId } = profile;
    try {
      const existing = await db
        .select({ id: dailySessions.meditationId })
        .from(dailySessions)
        .where(and(eq(dailySessions.userId, userId), eq(dailySessions.date, date)))
        .limit(1);
      if (existing.length > 0) { counts.skipped++; return; }

      const voiceGender: VoiceGender = profile.voiceGender === "male" ? "male" : "female";
      const prompt = dailyPrompt(profile);

      const targetSeconds = DEFAULT_DURATION;

      const meditationId = randomUUID();
      const { script, title } = await generateScript(prompt, targetSeconds, {
        name: null,
        experienceLevel: profile.experienceLevel,
        primaryGoals: (profile.primaryGoals as string[]) ?? [],
        primaryGoalCustom: null,
        preferenceSummary: null,
      });
      const audio = await generateAudio(script, voiceGender, targetSeconds);

      const key = `${userId}/${meditationId}.mp3`;
      await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: audio, ContentType: "audio/mpeg" }));
      const audioUrl = `${R2_PUBLIC_URL}/${key}`;

      await db.insert(meditations).values({ id: meditationId, userId, prompt, title, script, audioUrl, duration: targetSeconds });
      await db.insert(dailySessions).values({ userId, date, meditationId }).onConflictDoNothing();

      counts.generated++;
      log("cron:daily", "generated", { userId, meditationId });
    } catch (err) {
      counts.errors++;
      logError(`cron:daily:${userId}`, err);
    }
  }

  for (const user of allUsers) {
    await generateForUser(user);
  }

  log("cron:daily", "done", counts);
  return NextResponse.json(counts);
}
