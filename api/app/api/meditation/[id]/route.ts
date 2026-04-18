import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { meditations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = process.env.TEST_USER_ID ?? "test-user-1";

    const rows = await db
      .select({
        id: meditations.id,
        prompt: meditations.prompt,
        audioUrl: meditations.audioUrl,
        duration: meditations.duration,
        rating: meditations.rating,
        feedback: meditations.feedback,
        createdAt: meditations.createdAt,
      })
      .from(meditations)
      .where(and(eq(meditations.id, id), eq(meditations.userId, userId)))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    logError("meditation:get", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
