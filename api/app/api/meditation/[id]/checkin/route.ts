import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { meditations } from "@/db/schema";
import { getUserId, isAuthError } from "@/lib/auth";
import { logError } from "@/lib/log";
import { refreshPreferenceSummary } from "@/lib/meditation";

export const runtime = "nodejs";

const VALID_FEELINGS = new Set(["calmer", "same", "tense"]);
const VALID_HELPED = new Set(["breath", "body", "silence", "visualization"]);

type Body = {
  feeling?: string;
  whatHelped?: string;
  feedback?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getUserId(req);
    const body = (await req.json()) as Body;

    const feeling = body.feeling;
    const whatHelped = body.whatHelped ?? null;
    const feedback = body.feedback?.trim() ?? null;

    if (!feeling || !VALID_FEELINGS.has(feeling)) {
      return NextResponse.json({ error: "invalid feeling" }, { status: 400 });
    }
    if (whatHelped && !VALID_HELPED.has(whatHelped)) {
      return NextResponse.json({ error: "invalid whatHelped" }, { status: 400 });
    }

    await db
      .update(meditations)
      .set({ feeling, whatHelped, feedback })
      .where(and(eq(meditations.id, id), eq(meditations.userId, userId)));

    void refreshPreferenceSummary(userId).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("checkin", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
