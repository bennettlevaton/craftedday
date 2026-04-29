import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { meditations, meditationSessions } from "@/db/schema";
import { getUserId, isAuthError } from "@/lib/auth";
import { logError } from "@/lib/log";
import { recomputeUserStats } from "@/lib/stats";

export const runtime = "nodejs";

type Body = {
  listenedSeconds?: number;
  completed?: boolean;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getUserId(req);
    const body = (await req.json().catch(() => ({}))) as Body;

    const listenedSeconds = Math.max(0, Math.round(body.listenedSeconds ?? 0));
    const completed = body.completed === true;

    // Confirm the meditation belongs to this user before logging.
    const owns = await db
      .select({ id: meditations.id })
      .from(meditations)
      .where(and(eq(meditations.id, id), eq(meditations.userId, userId)))
      .limit(1);
    if (owns.length === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    await db.insert(meditationSessions).values({
      id: randomUUID(),
      userId,
      meditationId: id,
      listenedSeconds,
      completed,
    });

    // /listen fires once per session (completion or early-exit), not per
    // tick, so always recomputing is cheap. Partial listens still credit
    // total_seconds; only completed=true extends the streak.
    try {
      await recomputeUserStats(userId);
    } catch (err) {
      logError("listen:recompute", err);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("listen", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
