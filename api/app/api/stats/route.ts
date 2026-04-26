import { NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { getUserId, isAuthError } from "@/lib/auth";
import { computeUserStats } from "@/lib/stats";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    const stats = await computeUserStats(userId);
    return NextResponse.json(stats);
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("stats", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
