import { NextRequest, NextResponse, after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { meditations, userProfiles } from "@/db/schema";
import { getUserId, isAuthError } from "@/lib/auth";
import { logError } from "@/lib/log";
import { refreshPreferenceSummary } from "@/lib/meditation";
import { generateCelebration, fallback } from "@/lib/celebration";
import { computeUserStats } from "@/lib/stats";
import { log } from "@/lib/log";

export const runtime = "nodejs";

const VALID_FEELINGS = new Set(["calmer", "same", "tense"]);
const VALID_HELPED = new Set([
  "breath",
  "body",
  "belly_anchor",
  "release",
  "silence",
  "visualization",
  "voice",
  "pacing",
]);

type Body = {
  feeling?: string;
  whatHelped?: string[] | string | null;
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
    // Accept array (new clients) or single string (legacy clients) — normalize to array.
    const rawHelped = body.whatHelped;
    const helpedTags: string[] = Array.isArray(rawHelped)
      ? rawHelped
      : typeof rawHelped === "string" && rawHelped
        ? [rawHelped]
        : [];
    const dedupedHelped = Array.from(new Set(helpedTags));
    const whatHelped = dedupedHelped.length > 0 ? dedupedHelped : null;
    const feedback = body.feedback?.trim() ?? null;

    if (!feeling || !VALID_FEELINGS.has(feeling)) {
      return NextResponse.json({ error: "invalid feeling" }, { status: 400 });
    }
    if (whatHelped && whatHelped.some((t) => !VALID_HELPED.has(t))) {
      return NextResponse.json({ error: "invalid whatHelped" }, { status: 400 });
    }

    const t0 = Date.now();
    const since = () => Date.now() - t0;

    // Kick off everything in parallel:
    //   1. DB write (save check-in)
    //   2. Stats compute (returns to client and feeds celebration totals)
    //   3. Profile + session lookup (feeds celebration context)
    // Then:
    //   4. Celebration call awaits stats + context, runs ~1s with 1.5s timeout.
    const savePromise = db
      .update(meditations)
      .set({ feeling, whatHelped, feedback })
      .where(and(eq(meditations.id, id), eq(meditations.userId, userId)))
      .then(() => log("checkin", "save_done", { ms: since() }));

    const statsPromise = computeUserStats(userId).then((s) => {
      log("checkin", "stats_done", { ms: since() });
      return s;
    });

    const contextPromise = Promise.all([
      db
        .select({ preferenceSummary: userProfiles.preferenceSummary })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1),
      db
        .select({ prompt: meditations.prompt })
        .from(meditations)
        .where(and(eq(meditations.id, id), eq(meditations.userId, userId)))
        .limit(1),
    ]).then((r) => {
      log("checkin", "context_done", { ms: since() });
      return r;
    });

    const celebrationPromise = (async () => {
      const [stats, [profileRows, sessionRows]] = await Promise.all([
        statsPromise,
        contextPromise,
      ]);
      const inputs = {
        feeling: feeling as "calmer" | "same" | "tense",
        whatHelped,
        totalSessions: stats.totalSessions,
        streak: stats.streak,
        preferenceSummary: profileRows[0]?.preferenceSummary ?? null,
        prompt: sessionRows[0]?.prompt ?? null,
      };
      const cStart = Date.now();
      try {
        const text = await generateCelebration(inputs);
        log("checkin", "celebration_done", { ms: since(), haiku_ms: Date.now() - cStart });
        return text;
      } catch {
        log("checkin", "celebration_err", { ms: since() });
        return fallback(inputs);
      }
    })();

    const [, stats, celebration] = await Promise.all([
      savePromise,
      statsPromise,
      celebrationPromise,
    ]);

    log("checkin", "total", { ms: since() });

    // after() keeps the function alive past the response so this Sonnet call
    // (2-5s) actually completes. Plain fire-and-forget would get killed when
    // the runtime freezes after sending the response.
    after(() => refreshPreferenceSummary(userId).catch((err) => {
      logError("checkin:refreshSummary", err);
    }));

    return NextResponse.json({
      ok: true,
      celebration,
      stats,
    });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("checkin", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
