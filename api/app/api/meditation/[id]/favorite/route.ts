import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { meditations } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { logError } from "@/lib/log";
import { getUserId, isAuthError } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getUserId(req);

    // Atomic flip: single statement, no read-then-write gap. Two rapid taps
    // (or two devices) can no longer cancel each other out.
    const updated = await db
      .update(meditations)
      .set({ isFavorite: sql`NOT ${meditations.isFavorite}` })
      .where(and(eq(meditations.id, id), eq(meditations.userId, userId)))
      .returning({ isFavorite: meditations.isFavorite });

    if (updated.length === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ isFavorite: updated[0].isFavorite });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("favorite", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
