import { NextRequest, NextResponse } from "next/server";
import { isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { userProfiles } from "@/db/schema";
import { isSubscribed } from "@/lib/subscription";
import { enqueueDailyForUser, todayPacific } from "@/lib/daily";
import { log, logError } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = todayPacific();
  log("cron:daily", "start", { date });

  const allUsers = await db
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(isNotNull(userProfiles.onboardedAt));

  log("cron:daily", "users to process", { count: allUsers.length });

  const counts = { enqueued: 0, reused: 0, skipped: 0, unsubscribed: 0, errors: 0 };

  await Promise.all(
    allUsers.map(async (user) => {
      try {
        // Daily session is a subscriber perk. SKIP_SUBSCRIPTION_CHECK=true bypasses
        // this so all users get enqueued during testing.
        if (!(await isSubscribed(user.userId))) { counts.unsubscribed++; return; }

        const result = await enqueueDailyForUser(user.userId);
        if (result.enqueued) counts.enqueued++;
        else if (result.reason === "reused_yesterday") counts.reused++;
        else counts.skipped++;
      } catch (err) {
        counts.errors++;
        logError(`cron:daily:${user.userId}`, err);
      }
    }),
  );

  log("cron:daily", "enqueued", counts);

  return NextResponse.json(counts);
}
