import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailySessions, meditations } from "@/db/schema";
import { getUserId, isAuthError } from "@/lib/auth";
import { isSubscribed } from "@/lib/subscription";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

// US-centric app — use Pacific Time so the daily session stays "today" for all
// US users until real midnight PT, rather than vanishing at 4–5pm PT when UTC flips.
// Must match the cron's timezone in /api/cron/generate-daily or the session won't
// be found.
function todayPacific(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);

    // Daily session is a subscriber perk. No quota — just gated on sub status.
    if (!(await isSubscribed(userId))) {
      return NextResponse.json({ session: null });
    }

    const date = todayPacific();

    const rows = await db
      .select({
        id: meditations.id,
        title: meditations.title,
        prompt: meditations.prompt,
        audioUrl: meditations.audioUrl,
        duration: meditations.duration,
        feeling: meditations.feeling,
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
