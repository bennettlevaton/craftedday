import { and, eq, gt, max, sql } from "drizzle-orm";
import { db } from "./db";
import { meditationSessions, userProfiles } from "@/db/schema";
import { log } from "./log";

const PT_TZ = "America/Los_Angeles";

export type UserStats = {
  streak: number;
  totalSessions: number;
  minutes: number;
  favoriteTime: string;
};

// Cheap read of the denormalized counters on user_profiles. The heavy compute
// runs in recomputeUserStats() during /listen.
export async function computeUserStats(userId: string): Promise<UserStats> {
  const t0 = Date.now();
  const [row] = await db
    .select({
      currentStreak: userProfiles.currentStreak,
      totalSessions: userProfiles.totalSessions,
      totalSeconds: userProfiles.totalSeconds,
      favoriteTimeBucket: userProfiles.favoriteTimeBucket,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  log("stats", "read", { ms: Date.now() - t0, hit: Boolean(row) });

  if (!row) {
    return { streak: 0, totalSessions: 0, minutes: 0, favoriteTime: "—" };
  }
  return {
    streak: row.currentStreak,
    totalSessions: row.totalSessions,
    minutes: Math.round(row.totalSeconds / 60),
    favoriteTime: row.favoriteTimeBucket ?? "—",
  };
}

// Recompute counters from meditation_sessions and write them back to
// user_profiles. Idempotent — safe to call repeatedly. Self-healing because
// each call replaces (not increments) the stored values.
export async function recomputeUserStats(userId: string): Promise<void> {
  const t0 = Date.now();

  const [agg] = await db
    .select({
      totalSeconds: sql<number>`COALESCE(SUM(${meditationSessions.listenedSeconds}), 0)::int`,
      totalSessions: sql<number>`COUNT(*) FILTER (WHERE ${meditationSessions.completed})::int`,
      lastSessionAt: max(meditationSessions.createdAt),
    })
    .from(meditationSessions)
    .where(eq(meditationSessions.userId, userId));

  // Streak: only days with at least one completed session count, and only
  // recent ones can extend a current streak. 90 days is well past any active
  // run.
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const recent = await db
    .select({ createdAt: meditationSessions.createdAt })
    .from(meditationSessions)
    .where(
      and(
        eq(meditationSessions.userId, userId),
        eq(meditationSessions.completed, true),
        gt(meditationSessions.createdAt, cutoff),
      ),
    );

  const streak = computeStreak(recent.map((r) => r.createdAt));

  // Favorite-time bucket. Pulled separately because it includes incomplete
  // listens too — the question is "when does this user actually open the app
  // to listen", regardless of whether they finished.
  const allCreated = await db
    .select({ createdAt: meditationSessions.createdAt })
    .from(meditationSessions)
    .where(eq(meditationSessions.userId, userId));
  const favoriteTimeBucket = computeFavoriteTime(
    allCreated.map((r) => r.createdAt),
  );

  await db
    .update(userProfiles)
    .set({
      currentStreak: streak,
      totalSessions: agg?.totalSessions ?? 0,
      totalSeconds: agg?.totalSeconds ?? 0,
      favoriteTimeBucket,
      lastSessionAt: agg?.lastSessionAt ?? null,
    })
    .where(eq(userProfiles.userId, userId));

  log("stats", "recomputed", {
    ms: Date.now() - t0,
    streak,
    sessions: agg?.totalSessions ?? 0,
    seconds: agg?.totalSeconds ?? 0,
  });
}

function ptDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function prevDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
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

function computeFavoriteTime(dates: Date[]): string | null {
  if (dates.length === 0) return null;
  const buckets = { Morning: 0, Afternoon: 0, Evening: 0 };
  for (const d of dates) {
    const h = ptHour(d);
    if (h < 12) buckets.Morning++;
    else if (h < 18) buckets.Afternoon++;
    else buckets.Evening++;
  }
  return Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0];
}

function computeStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const dayKeys = new Set(dates.map(ptDateKey));

  let streak = 0;
  let cursor = ptDateKey(new Date());

  // Today hasn't been logged yet — start from yesterday so the streak still
  // shows during the day before the user has meditated. (Once the day rolls
  // over without a session, this same logic correctly breaks the streak.)
  if (!dayKeys.has(cursor)) {
    cursor = prevDayKey(cursor);
  }

  while (dayKeys.has(cursor)) {
    streak++;
    cursor = prevDayKey(cursor);
  }
  return streak;
}
