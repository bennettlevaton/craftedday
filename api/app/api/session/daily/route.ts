import { NextRequest, NextResponse } from "next/server";
import { getUserId, isAuthError } from "@/lib/auth";
import { isSubscribed } from "@/lib/subscription";
import { getDailySessionPayload } from "@/lib/daily";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);

    // Daily session is a subscriber perk. No quota — just gated on sub status.
    if (!(await isSubscribed(userId))) {
      return NextResponse.json({ session: null });
    }

    const session = await getDailySessionPayload(userId);
    return NextResponse.json({ session });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("session:daily", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
