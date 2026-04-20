import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { meditations } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { logError } from "@/lib/log";
import { getUserId, isAuthError } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);

    const rows = await db
      .select({
        id: meditations.id,
        prompt: meditations.prompt,
        audioUrl: meditations.audioUrl,
        duration: meditations.duration,
        rating: meditations.rating,
        isFavorite: meditations.isFavorite,
        createdAt: meditations.createdAt,
      })
      .from(meditations)
      .where(and(eq(meditations.userId, userId), eq(meditations.isFavorite, true)))
      .orderBy(desc(meditations.createdAt));

    return NextResponse.json({ sessions: rows });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("favorites", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
