import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { meditations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

export async function GET() {
  try {
    const userId = process.env.TEST_USER_ID ?? "test-user-1";

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
    logError("stats", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

function computeStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const dayKeys = new Set(
    dates.map((d) => new Date(d).toISOString().slice(0, 10)),
  );

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  // If no session today, allow streak from yesterday
  const todayKey = cursor.toISOString().slice(0, 10);
  if (!dayKeys.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (dayKeys.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function computeFavoriteTime(dates: Date[]): string {
  if (dates.length === 0) return "—";
  const buckets = { Morning: 0, Afternoon: 0, Evening: 0 };
  for (const d of dates) {
    const h = new Date(d).getHours();
    if (h < 12) buckets.Morning++;
    else if (h < 18) buckets.Afternoon++;
    else buckets.Evening++;
  }
  return Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0];
}
