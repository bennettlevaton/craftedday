import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { meditations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { logError } from "@/lib/log";
import { getUserId, isAuthError } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId(req);

    const rows = await db
      .select({
        duration: meditations.duration,
        createdAt: meditations.createdAt,
      })
      .from(meditations)
      .where(eq(meditations.userId, userId))
      .orderBy(desc(meditations.createdAt));

    const totalSessions = rows.length;
    const totalSeconds = rows.reduce((sum, r) => sum + (r.duration ?? 0), 0);
    const hours = +(totalSeconds / 3600).toFixed(1);
    const streak = computeStreak(rows.map((r) => r.createdAt));
    const favoriteTime = computeFavoriteTime(rows.map((r) => r.createdAt));

    return NextResponse.json({
      streak,
      totalSessions,
      hours,
      favoriteTime,
    });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("stats", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

const PT_TZ = "America/Los_Angeles";

function ptDateKey(d: Date): string {
  // en-CA locale → YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function ptHour(d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PT_TZ,
      hour: "2-digit",
      hour12: false,
    }).format(d),
    10,
  );
}

function prevDayKey(key: string): string {
  // key is YYYY-MM-DD at PT midnight; subtract one day in UTC space is safe here
  // because we're just iterating calendar dates, not wall clocks.
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

function computeStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const dayKeys = new Set(dates.map(ptDateKey));

  let streak = 0;
  let cursor = ptDateKey(new Date());

  // If no session today (PT), allow streak from yesterday
  if (!dayKeys.has(cursor)) {
    cursor = prevDayKey(cursor);
  }

  while (dayKeys.has(cursor)) {
    streak++;
    cursor = prevDayKey(cursor);
  }
  return streak;
}

function computeFavoriteTime(dates: Date[]): string {
  if (dates.length === 0) return "—";
  const buckets = { Morning: 0, Afternoon: 0, Evening: 0 };
  for (const d of dates) {
    const h = ptHour(d);
    if (h < 12) buckets.Morning++;
    else if (h < 18) buckets.Afternoon++;
    else buckets.Evening++;
  }
  return Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0];
}
