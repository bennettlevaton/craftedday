import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { meditations } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = process.env.TEST_USER_ID ?? "test-user-1";

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
    logError("favorites", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
