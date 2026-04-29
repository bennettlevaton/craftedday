import { NextRequest, NextResponse } from "next/server";
import { getUserId, isAuthError } from "@/lib/auth";
import { getOrCreateProfile } from "@/lib/user";
import { checkSubscriptionAndQuota } from "@/lib/subscription";
import { enqueueJob } from "@/lib/jobs";
import { log, logError } from "@/lib/log";
import type { VoiceGender } from "@/lib/inworld";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  prompt?: string;
  duration?: number;
  clientNow?: string;
};

// Read the client's wall-clock hour straight from the ISO string (e.g. "2026-04-24T14:30:00.000-07:00").
// Parsing into a Date would collapse to UTC and lose the sender's local view. The "HH" after "T" is
// already the client's local hour regardless of offset.
function hourFromClientIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const m = /T(\d{2}):/.exec(iso);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : null;
}

function hourToTimeOfDay(hour: number): string {
  return hour < 5 ? "late night"
    : hour < 12 ? "morning"
    : hour < 17 ? "afternoon"
    : hour < 21 ? "evening" : "night";
}

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
    if (prompt.length > 200) {
      return NextResponse.json({ error: "prompt too long" }, { status: 400 });
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

    const clientHour = hourFromClientIso(body.clientNow);
    const timeOfDay = clientHour !== null ? hourToTimeOfDay(clientHour) : null;

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
        timeOfDay,
      },
      source: "user",
    });

    log(`gen:${reqId}`, "enqueued", { userId, jobId, targetSeconds });

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
