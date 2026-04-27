import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { reelPosts } from "@/db/schema";
import { generateAndPostReel, pickTheme } from "@/lib/reel";
import { log, logError } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 800;

const HISTORY_LOOKBACK = 60;  // last N posts fed back to Claude as anti-repeat

function todayPacific(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date());
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = todayPacific();
  log("cron:reel", "start", { date });

  try {
    const recent = await db
      .select({ quote: reelPosts.quote, visualPrompt: reelPosts.visualPrompt })
      .from(reelPosts)
      .orderBy(desc(reelPosts.createdAt))
      .limit(HISTORY_LOOKBACK);

    const theme = pickTheme();

    const result = await generateAndPostReel({
      date,
      theme,
      history: {
        quotes: recent.map((r) => r.quote),
        visualPrompts: recent.map((r) => r.visualPrompt),
      },
    });

    await db.insert(reelPosts).values({
      date,
      quote: result.post.quote,
      caption: result.post.caption,
      hashtags: result.post.hashtags,
      visualPrompt: result.post.visualPrompt,
      theme: result.theme,
      videoUrl: result.publicUrl,
      bufferPostId: result.bufferPostId,
    });

    log("cron:reel", "done", { quote: result.post.quote, bufferPostId: result.bufferPostId });
    return NextResponse.json({ ok: true, date, ...result });
  } catch (err) {
    logError("cron:reel", err);
    return NextResponse.json(
      { ok: false, date, error: (err as Error).message },
      { status: 500 },
    );
  }
}
