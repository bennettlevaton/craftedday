import { NextRequest, NextResponse } from "next/server";
import { getUserId, isAuthError } from "@/lib/auth";
import { getMePayload } from "@/lib/user";
import { computeUserStats } from "@/lib/stats";
import { getDailySessionPayload } from "@/lib/daily";
import { isSubscribed } from "@/lib/subscription";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

// Combined home-screen payload. Mobile fetches this once on home load instead
// of three separate round-trips to /me, /stats, /session/daily. Each field is
// produced by the same shared helper that backs the standalone endpoints, so
// shape stays in sync.
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);

    const [me, stats, subscribed] = await Promise.all([
      getMePayload(userId),
      computeUserStats(userId),
      isSubscribed(userId),
    ]);

    const daily = subscribed ? await getDailySessionPayload(userId) : null;

    return NextResponse.json({ me, stats, daily });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("home", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
