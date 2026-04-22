import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { meditations } from "@/db/schema";
import { R2_BUCKET, R2_PUBLIC_URL, r2 } from "@/lib/r2";
import { generateAudio, generateScript } from "@/lib/meditation";
import type { VoiceGender } from "@/lib/elevenlabs";
import { log, logError } from "@/lib/log";
import { getOrCreateProfile } from "@/lib/user";
import { getUserId, isAuthError } from "@/lib/auth";
import { checkSubscriptionAndQuota, deductCustomMinutes } from "@/lib/subscription";

export const runtime = "nodejs";
export const maxDuration = 800;

type Body = {
  prompt?: string;
  duration?: number;
};

const MIN_DURATION = 30;
const MAX_DURATION = 600; // 10 min hard cap
const DEFAULT_DURATION = 600; // 10 min

export async function POST(req: NextRequest) {
  const reqId = randomUUID().slice(0, 8);
  const startTotal = Date.now();

  try {
    const body = (await req.json()) as Body;
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }

    const userId = await getUserId(req);

    const targetSeconds = typeof body.duration === "number"
      ? body.duration
      : DEFAULT_DURATION;

    if (
      !Number.isFinite(targetSeconds) ||
      targetSeconds < MIN_DURATION ||
      targetSeconds > MAX_DURATION
    ) {
      return NextResponse.json(
        { error: `duration must be ${MIN_DURATION}-${MAX_DURATION} seconds` },
        { status: 400 },
      );
    }

    const requestedMinutes = Math.round(targetSeconds / 60);
    const quota = await checkSubscriptionAndQuota(userId, requestedMinutes);
    if (!quota.ok) {
      const body =
        quota.reason === "quota_exceeded"
          ? {
              error: "quota_exceeded",
              minutesUsed: quota.minutesUsed,
              minutesLimit: quota.minutesLimit,
              isTrial: quota.isTrial,
              periodEnd: quota.periodEnd,
            }
          : { error: "not_subscribed" };
      return NextResponse.json(body, { status: 429 });
    }

    const profile = await getOrCreateProfile(userId);
    const voiceGender: VoiceGender =
      profile.voiceGender === "male" ? "male" : "female";

    log(`gen:${reqId}`, "start", {
      userId,
      voiceGender,
      targetSeconds,
      promptLen: prompt.length,
      hasPrefs: !!profile.preferenceSummary,
    });

    const meditationId = randomUUID();

    const { script, title } = await generateScript(prompt, targetSeconds, {
      name: profile.name,
      experienceLevel: profile.experienceLevel,
      primaryGoals: profile.primaryGoals ?? [],
      primaryGoalCustom: profile.primaryGoalCustom,
      preferenceSummary: profile.preferenceSummary,
    });
    const audio = await generateAudio(script, voiceGender, targetSeconds);

    const key = `${userId}/${meditationId}.mp3`;
    const uploadStart = Date.now();
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: audio,
        ContentType: "audio/mpeg",
      }),
    );
    log(`gen:${reqId}`, "r2 uploaded", {
      ms: Date.now() - uploadStart,
      key,
    });

    const audioUrl = `${R2_PUBLIC_URL}/${key}`;

    await db.insert(meditations).values({
      id: meditationId,
      userId,
      prompt,
      title,
      script,
      audioUrl,
      duration: targetSeconds,
    });
    log(`gen:${reqId}`, "db inserted", { meditationId });

    // Deduct only after everything is saved and available.
    await deductCustomMinutes(userId, requestedMinutes);

    log(`gen:${reqId}`, "done", { totalMs: Date.now() - startTotal });

    return NextResponse.json({
      id: meditationId,
      audioUrl,
      duration: targetSeconds,
    });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError(`gen:${reqId}`, err);
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message, reqId }, { status: 500 });
  }
}
