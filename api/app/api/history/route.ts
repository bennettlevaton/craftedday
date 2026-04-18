import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { meditations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
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
        createdAt: meditations.createdAt,
      })
      .from(meditations)
      .where(eq(meditations.userId, userId))
      .orderBy(desc(meditations.createdAt))
      .limit(50);

    return NextResponse.json({ sessions: rows });
  } catch (err) {
    logError("history", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
