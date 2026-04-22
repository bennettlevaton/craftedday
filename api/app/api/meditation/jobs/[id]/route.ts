import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { meditationJobs } from "@/db/schema";
import { getUserId, isAuthError } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getUserId(req);
    const { id } = await params;

    const [job] = await db
      .select()
      .from(meditationJobs)
      .where(eq(meditationJobs.id, id))
      .limit(1);

    if (!job || job.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (job.status === "done") {
      return NextResponse.json({
        status: "done",
        id: job.id,
        audioUrl: job.audioUrl,
        duration: job.durationSeconds,
        title: job.title,
      });
    }

    return NextResponse.json({ status: job.status });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
