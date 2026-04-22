import { NextRequest, NextResponse, after } from "next/server";
import { getUserId, isAuthError } from "@/lib/auth";
import { getOrCreateProfile } from "@/lib/user";
import { checkSubscriptionAndQuota } from "@/lib/subscription";
import { enqueueJob, triggerWorker } from "@/lib/jobs";
import { log, logError } from "@/lib/log";
import type { VoiceGender } from "@/lib/elevenlabs";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  prompt?: string;
  duration?: number;
};

const MIN_DURATION = 30;
const MAX_DURATION = 600;
const DEFAULT_DURATION = 600;

export async function POST(req: NextRequest) {
  const reqId = randomUUID().slice(0, 8);

  try {
    const body = (await req.json()) as Body;
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }

    const userId = await getUserId(req);

    const targetSeconds = typeof body.duration === "number" ? body.duration : DEFAULT_DURATION;
    if (!Number.isFinite(targetSeconds) || targetSeconds < MIN_DURATION || targetSeconds > MAX_DURATION) {
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
          ? { error: "quota_exceeded", minutesUsed: quota.minutesUsed, minutesLimit: quota.minutesLimit, isTrial: quota.isTrial, periodEnd: quota.periodEnd }
          : { error: "not_subscribed" };
      return NextResponse.json(body, { status: 429 });
    }

    const profile = await getOrCreateProfile(userId);
    const voiceGender: VoiceGender = profile.voiceGender === "male" ? "male" : "female";

    const jobId = await enqueueJob({
      userId,
      prompt,
      durationSeconds: targetSeconds,
      voiceGender,
      profile: {
        name: profile.name,
        experienceLevel: profile.experienceLevel,
        primaryGoals: profile.primaryGoals ?? [],
        primaryGoalCustom: profile.primaryGoalCustom,
        preferenceSummary: profile.preferenceSummary,
      },
      source: "user",
    });

    log(`gen:${reqId}`, "enqueued", { userId, jobId, targetSeconds });

    after(() => triggerWorker());

    return NextResponse.json({ jobId });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError(`gen:${reqId}`, err);
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message, reqId }, { status: 500 });
  }
}
