import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailySessions, meditationJobs, meditations } from "@/db/schema";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, R2_PUBLIC_URL, r2 } from "@/lib/r2";
import { generateAudio, generateScript } from "@/lib/meditation";
import { deductCustomMinutes } from "@/lib/subscription";
import { log, logError } from "@/lib/log";
import { triggerWorker } from "@/lib/jobs";
import type { VoiceGender } from "@/lib/elevenlabs";

export const runtime = "nodejs";
export const maxDuration = 800;

function todayEst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Atomic claim: grab the oldest pending job, mark it processing
  const [job] = await db
    .select()
    .from(meditationJobs)
    .where(eq(meditationJobs.status, "pending"))
    .orderBy(meditationJobs.enqueuedAt)
    .limit(1);

  if (!job) {
    log("worker", "queue empty");
    return NextResponse.json({ ok: true });
  }

  const [claimed] = await db
    .update(meditationJobs)
    .set({ status: "processing", startedAt: new Date(), attempts: sql`${meditationJobs.attempts} + 1` })
    .where(and(eq(meditationJobs.id, job.id), eq(meditationJobs.status, "pending")))
    .returning();

  if (!claimed) {
    log("worker", "claim lost");
    return NextResponse.json({ ok: true });
  }

  log("worker", "claimed job", { jobId: job.id, userId: job.userId, source: job.source });

  try {
    const profile = JSON.parse(job.profileSnapshot);

    const { script, title } = await generateScript(job.prompt, job.durationSeconds, {
      name: profile.name,
      experienceLevel: profile.experienceLevel,
      primaryGoals: profile.primaryGoals ?? [],
      primaryGoalCustom: profile.primaryGoalCustom,
      preferenceSummary: profile.preferenceSummary,
    });

    const audio = await generateAudio(script, job.voiceGender as VoiceGender, job.durationSeconds);

    const key = `${job.userId}/${job.id}.mp3`;
    await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: audio, ContentType: "audio/mpeg" }));
    const audioUrl = `${R2_PUBLIC_URL}/${key}`;

    await db.insert(meditations).values({
      id: job.id,
      userId: job.userId,
      prompt: job.prompt,
      title,
      script,
      audioUrl,
      duration: job.durationSeconds,
    });

    if (job.source === "cron") {
      await db
        .insert(dailySessions)
        .values({ userId: job.userId, date: todayEst(), meditationId: job.id })
        .onConflictDoNothing();
    } else {
      const requestedMinutes = Math.round(job.durationSeconds / 60);
      await deductCustomMinutes(job.userId, requestedMinutes);
    }

    await db
      .update(meditationJobs)
      .set({ status: "done", audioUrl, title, script, completedAt: new Date() })
      .where(eq(meditationJobs.id, job.id));

    log("worker", "job done", { jobId: job.id, userId: job.userId });
  } catch (err) {
    logError(`worker:${job.id}`, err);
    await db
      .update(meditationJobs)
      .set({ status: "failed", errorMessage: err instanceof Error ? err.message : String(err), completedAt: new Date() })
      .where(eq(meditationJobs.id, job.id));
  }

  // Self-chain: if more pending jobs exist, kick off next invocation
  after(async () => {
    const [next] = await db
      .select({ id: meditationJobs.id })
      .from(meditationJobs)
      .where(eq(meditationJobs.status, "pending"))
      .limit(1);
    if (next) triggerWorker();
  });

  return NextResponse.json({ ok: true });
}
