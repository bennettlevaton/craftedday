import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { meditations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = process.env.TEST_USER_ID ?? "test-user-1";

    const rows = await db
      .select({ isFavorite: meditations.isFavorite })
      .from(meditations)
      .where(and(eq(meditations.id, id), eq(meditations.userId, userId)))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const newValue = !rows[0].isFavorite;
    await db
      .update(meditations)
      .set({ isFavorite: newValue })
      .where(and(eq(meditations.id, id), eq(meditations.userId, userId)));

    return NextResponse.json({ isFavorite: newValue });
  } catch (err) {
    logError("favorite", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
