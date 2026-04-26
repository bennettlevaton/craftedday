import { count, eq } from "drizzle-orm";
import { handleCallback } from "@vercel/queue";
import { db } from "@/lib/db";
import { dailySessions, meditationJobs, meditations } from "@/db/schema";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, R2_PUBLIC_URL, r2 } from "@/lib/r2";
import { generateAudio, generateScript } from "@/lib/meditation";
import { deductCustomMinutes } from "@/lib/subscription";
import { log, logError } from "@/lib/log";
import type { QueueJobMessage } from "@/lib/jobs";
import type { VoiceGender } from "@/lib/inworld";

export const runtime = "nodejs";
export const maxDuration = 800;

const MAX_DELIVERIES = 3;

function todayEst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export const POST = handleCallback<QueueJobMessage>(
  async (message, metadata) => {
    const jobId = message.jobId;
    log("worker", "received", { jobId, deliveryCount: metadata.deliveryCount });

    const [job] = await db.select().from(meditationJobs).where(eq(meditationJobs.id, jobId)).limit(1);
    if (!job) {
      log("worker", "job row missing — dropping", { jobId });
      return;
    }
    if (job.status === "done") {
      log("worker", "job already done — skipping", { jobId });
      return;
    }

    await db
      .update(meditationJobs)
      .set({ status: "processing", startedAt: new Date(), attempts: metadata.deliveryCount })
      .where(eq(meditationJobs.id, jobId));

    try {
      const t = { jobStart: Date.now(), scriptMs: 0, audioMs: 0, uploadMs: 0, dbMs: 0 };
      const profile = JSON.parse(job.profileSnapshot);

      // sessionNumber = the listener's Nth meditation generation (1-indexed). Drives
      // beginner scaffolding in the planner. Counted at generation time so retries
      // of the same job don't re-increment.
      const [{ value: priorCount } = { value: 0 }] = await db
        .select({ value: count() })
        .from(meditations)
        .where(eq(meditations.userId, job.userId));
      const sessionNumber = priorCount + 1;

      let ts = Date.now();
      const { script, title } = await generateScript(
        job.prompt,
        job.durationSeconds,
        {
          name: profile.name,
          experienceLevel: profile.experienceLevel,
          primaryGoals: profile.primaryGoals ?? [],
          primaryGoalCustom: profile.primaryGoalCustom,
          preferenceSummary: profile.preferenceSummary,
        },
        {
          timeOfDay:
            job.source === "cron"
              ? null
              : typeof profile.timeOfDay === "string"
                ? profile.timeOfDay
                : undefined,
          sessionNumber,
        },
      );
      t.scriptMs = Date.now() - ts;

      ts = Date.now();
      const audio = await generateAudio(script, job.voiceGender as VoiceGender, job.durationSeconds);
      t.audioMs = Date.now() - ts;

      ts = Date.now();
      const key = `${job.userId}/${job.id}.mp3`;
      await r2.send(
        new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: audio, ContentType: "audio/mpeg" }),
      );
      t.uploadMs = Date.now() - ts;
      const audioUrl = `${R2_PUBLIC_URL}/${key}`;

      ts = Date.now();
      await db.insert(meditations).values({
        id: job.id,
        userId: job.userId,
        prompt: job.prompt,
        title,
        script,
        audioUrl,
        duration: job.durationSeconds,
        archetype: typeof profile.archetype === "string" ? profile.archetype : null,
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
      t.dbMs = Date.now() - ts;

      log("worker", "job done", {
        jobId: job.id,
        totalMs: Date.now() - t.jobStart,
        steps: { scriptMs: t.scriptMs, audioMs: t.audioMs, uploadMs: t.uploadMs, dbMs: t.dbMs },
      });
    } catch (err) {
      logError(`worker:${jobId}`, err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Final attempt: mark failed and ack (return) so queue stops retrying.
      // Earlier attempts: rethrow so queue retries with default backoff.
      if (metadata.deliveryCount >= MAX_DELIVERIES) {
        await db
          .update(meditationJobs)
          .set({ status: "failed", errorMessage, completedAt: new Date() })
          .where(eq(meditationJobs.id, jobId));
        log("worker", "job failed permanently", { jobId, deliveryCount: metadata.deliveryCount });
        return;
      }

      // Roll status back to pending so the next delivery picks it up cleanly.
      await db
        .update(meditationJobs)
        .set({ status: "pending", errorMessage })
        .where(eq(meditationJobs.id, jobId));
      throw err;
    }
  },
  { visibilityTimeoutSeconds: 600 },
);
