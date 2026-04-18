import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { meditations } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

type Body = {
  rating?: number;
  feedback?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = process.env.TEST_USER_ID ?? "test-user-1";
    const body = (await req.json()) as Body;

    const rating = body.rating;
    const feedback = body.feedback?.trim() ?? null;

    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "rating must be 1-5" },
        { status: 400 },
      );
    }

    await db
      .update(meditations)
      .set({ rating, feedback })
      .where(and(eq(meditations.id, id), eq(meditations.userId, userId)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("rate", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
