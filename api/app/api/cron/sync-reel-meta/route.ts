// Backfills instagram_post_id + instagram_permalink onto reel_posts rows by
// querying Buffer for the externalLink (the IG permalink) on each post that
// was published but doesn't yet have its IG metadata stored.
//
// Why a separate cron: Buffer's externalLink isn't populated until IG finishes
// processing the Reel — usually a few minutes after publish, sometimes longer.
// Doing this in the publish flow would mean polling and burning maxDuration.
//
// Schedule: every 30 min. Looks at posts from the last 14 days that are
// missing instagramPostId. Single-shot per run, no retries — if a post is
// still processing, the next run picks it up.

import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { reelPosts } from "@/db/schema";
import { log, logError } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 800;

const BUFFER_GRAPHQL = "https://api.buffer.com/graphql";

async function queryBufferPost(id: string): Promise<{
  status: string;
  externalLink: string | null;
} | null> {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  if (!token) throw new Error("BUFFER_ACCESS_TOKEN required");

  const res = await fetch(BUFFER_GRAPHQL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($input: PostInput!) { post(input: $input) { status externalLink } }`,
      variables: { input: { id } },
    }),
  });

  const json = (await res.json()) as {
    data?: { post?: { status: string; externalLink: string | null } };
    errors?: { message: string }[];
  };
  if (json.errors?.length) throw new Error(`Buffer GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data?.post ?? null;
}

// Buffer's externalLink looks like https://www.instagram.com/reel/<id>/?...
// (or /p/<id>/ for non-Reel posts). Extract the media id.
function extractIgPostId(permalink: string): string | null {
  const match = permalink.match(/instagram\.com\/(?:reel|p|reels|tv)\/([^\/?#]+)/);
  return match?.[1] ?? null;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Posts from the last 14 days that haven't been backfilled yet.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const candidates = await db
    .select()
    .from(reelPosts)
    .where(
      and(
        gte(reelPosts.createdAt, fourteenDaysAgo),
        isNull(reelPosts.instagramPostId),
      ),
    );

  log("cron:reel:sync-meta", "candidates", { count: candidates.length });

  const counts = { synced: 0, stillProcessing: 0, errors: 0 };

  for (const row of candidates) {
    if (!row.bufferPostId) {
      counts.errors++;
      continue;
    }
    try {
      const post = await queryBufferPost(row.bufferPostId);
      if (!post) {
        counts.errors++;
        continue;
      }
      if (!post.externalLink) {
        // IG still processing or post failed silently — try again next run.
        counts.stillProcessing++;
        continue;
      }
      const igId = extractIgPostId(post.externalLink);
      await db
        .update(reelPosts)
        .set({
          instagramPostId: igId,
          instagramPermalink: post.externalLink,
          metaSyncedAt: sql`now()`,
        })
        .where(eq(reelPosts.id, row.id));
      counts.synced++;
    } catch (err) {
      logError(`cron:reel:sync-meta:${row.id}`, err);
      counts.errors++;
    }
  }

  log("cron:reel:sync-meta", "done", counts);
  return NextResponse.json({ ok: true, ...counts });
}
