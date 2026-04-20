import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailySessions, meditations } from "@/db/schema";
import { getUserId, isAuthError } from "@/lib/auth";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    const date = todayUtc();

    const rows = await db
      .select({
        id: meditations.id,
        prompt: meditations.prompt,
        audioUrl: meditations.audioUrl,
        duration: meditations.duration,
      })
      .from(dailySessions)
      .innerJoin(
        meditations,
        eq(dailySessions.meditationId, meditations.id),
      )
      .where(
        and(
          eq(dailySessions.userId, userId),
          eq(dailySessions.date, date),
        ),
      )
      .limit(1);

    return NextResponse.json({ session: rows[0] ?? null });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("session:daily", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
