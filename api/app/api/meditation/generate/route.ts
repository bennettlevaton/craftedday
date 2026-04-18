import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { users, meditations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { R2_BUCKET, R2_PUBLIC_URL, r2 } from "@/lib/r2";
import { generateAudio, generateScript } from "@/lib/meditation";
import type { VoiceGender } from "@/lib/elevenlabs";
import { log, logError } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  prompt?: string;
  voiceGender?: VoiceGender;
};

export async function POST(req: NextRequest) {
  const reqId = randomUUID().slice(0, 8);
  const startTotal = Date.now();

  try {
    const body = (await req.json()) as Body;
    const prompt = body.prompt?.trim();
    const voiceGender: VoiceGender =
      body.voiceGender === "male" ? "male" : "female";

    if (!prompt) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }

    const userId = process.env.TEST_USER_ID ?? "test-user-1";
    const targetSeconds = Number(process.env.MEDITATION_TARGET_SECONDS ?? 30);

    log(`gen:${reqId}`, "start", {
      userId,
      voiceGender,
      targetSeconds,
      promptLen: prompt.length,
    });

    await ensureTestUser(userId);
    log(`gen:${reqId}`, "user ensured");

    const meditationId = randomUUID();

    const script = await generateScript(prompt, targetSeconds);
    const audio = await generateAudio(script, voiceGender);

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
      script,
      audioUrl,
      duration: targetSeconds,
    });
    log(`gen:${reqId}`, "db inserted", { meditationId });

    log(`gen:${reqId}`, "done", { totalMs: Date.now() - startTotal });

    return NextResponse.json({
      id: meditationId,
      audioUrl,
      duration: targetSeconds,
    });
  } catch (err) {
    logError(`gen:${reqId}`, err);
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: message, reqId },
      { status: 500 },
    );
  }
}

async function ensureTestUser(userId: string): Promise<void> {
  const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (existing.length > 0) return;
  await db.insert(users).values({
    id: userId,
    clerkId: userId,
    email: `${userId}@craftedday.local`,
  });
}
