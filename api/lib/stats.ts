import { and, desc, eq } from "drizzle-orm";
import { db } from "./db";
import { meditations, meditationSessions } from "@/db/schema";
import { log } from "./log";

const PT_TZ = "America/Los_Angeles";

export type UserStats = {
  streak: number;
  totalSessions: number;
  hours: number;
  favoriteTime: string;
};

export async function computeUserStats(userId: string): Promise<UserStats> {
  const t0 = Date.now();

  const [rows, listenRows] = await Promise.all([
    db
      .select({
        duration: meditations.duration,
        createdAt: meditations.createdAt,
      })
      .from(meditations)
      .where(eq(meditations.userId, userId))
      .orderBy(desc(meditations.createdAt)),
    db
      .select({ createdAt: meditationSessions.createdAt })
      .from(meditationSessions)
      .where(
        and(
          eq(meditationSessions.userId, userId),
          eq(meditationSessions.completed, true),
        ),
      )
      .orderBy(desc(meditationSessions.createdAt)),
  ]);

  const queryMs = Date.now() - t0;

  const totalSessions = rows.length;
  const totalSeconds = rows.reduce((sum, r) => sum + (r.duration ?? 0), 0);
  const hours = +(totalSeconds / 3600).toFixed(1);

  const streak = computeStreak(listenRows.map((r) => r.createdAt));
  const favoriteTime = computeFavoriteTime(rows.map((r) => r.createdAt));

  log("stats", "computed", {
    ms: Date.now() - t0,
    query_ms: queryMs,
    rows: rows.length,
    listenRows: listenRows.length,
  });

  return { streak, totalSessions, hours, favoriteTime };
}

function ptDateKey(d: Date): string {
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
