import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptions, usagePeriods } from "@/db/schema";
import { CUSTOM_MINUTES_LIMIT } from "@/lib/subscription";
import { getUserId, isAuthError } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.clerkId, userId))
      .limit(1);

    if (!sub) {
      return NextResponse.json({ subscribed: false });
    }

    const [period] = await db
      .select({ customMinutesUsed: usagePeriods.customMinutesUsed })
      .from(usagePeriods)
      .where(and(eq(usagePeriods.clerkId, userId), isNull(usagePeriods.periodEnd)))
      .limit(1);

    const now = new Date();
    const subscribed =
      (sub.status === "active" || sub.status === "cancelled") &&
      (!sub.periodEnd || sub.periodEnd > now);

    return NextResponse.json({
      subscribed,
      status: sub.status,
      isTrial: sub.periodType === "TRIAL",
      minutesUsed: period?.customMinutesUsed ?? 0,
      minutesLimit: CUSTOM_MINUTES_LIMIT,
      periodStart: sub.periodStart,
      periodEnd: sub.periodEnd,
    });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
