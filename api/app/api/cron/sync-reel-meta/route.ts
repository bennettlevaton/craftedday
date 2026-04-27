// Daily cron that backfills Instagram metadata + engagement stats onto
// reel_posts rows.
//
// Three things happen per run, for every reel from the last 14 days:
//   1. Pull the IG permalink + URL shortcode from Buffer (still useful for
//      click-through and as the canonical "did it actually publish?" signal).
//   2. Match each permalink against the IG account's recent media list to
//      resolve the numeric media_id (Graph API requires this id, not the
//      shortcode, for /insights queries).
//   3. Fetch /insights for each media_id and write engagement counts.
//
// Buffer's GraphQL has no engagement metrics on its public API — those come
// from IG Graph API directly. Requires META_PAGE_ACCESS_TOKEN + META_IG_USER_ID.
//
// Schedule: 0 6 * * * UTC (daily, 10pm PT / 11pm PDT). Late enough that
// both daily reels have finished IG processing.

import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { reelPosts } from "@/db/schema";
import { log, logError } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 800;

const BUFFER_GRAPHQL = "https://api.buffer.com/graphql";
const META_GRAPH = "https://graph.facebook.com/v21.0";

// ----- Buffer ------------------------------------------------------------

async function bufferGetPermalink(id: string): Promise<string | null> {
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
  return json.data?.post?.externalLink ?? null;
}

function extractShortcode(permalink: string): string | null {
  const match = permalink.match(/instagram\.com\/(?:reel|p|reels|tv)\/([^\/?#]+)/);
  return match?.[1] ?? null;
}

// ----- IG Graph API ------------------------------------------------------

async function metaGet<T = unknown>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${META_GRAPH}${path}?${qs}`);
  const json = await res.json();
  if (!res.ok || (json as { error?: unknown }).error) {
    throw new Error(`Meta API ${path} → ${JSON.stringify(json)}`);
  }
  return json as T;
}

// Build a permalink → numeric_media_id map by listing the IG account's recent
// media. We pull a generous window so 14-day-old reels are still in scope.
async function fetchPermalinkToMediaId(): Promise<Map<string, string>> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const igUserId = process.env.META_IG_USER_ID;
  if (!token || !igUserId) {
    throw new Error("META_PAGE_ACCESS_TOKEN + META_IG_USER_ID required");
  }

  const map = new Map<string, string>();
  let url = `/${igUserId}/media`;
  let params: Record<string, string> = {
    fields: "id,permalink,timestamp,media_product_type",
    limit: "50",
    access_token: token,
  };
  let pages = 0;

  // Paginate up to 5 pages (250 media) — plenty for a 14-day window.
  while (pages < 5) {
    const res = await metaGet<{
      data: { id: string; permalink: string; timestamp: string }[];
      paging?: { next?: string; cursors?: { after?: string } };
    }>(url, params);
    for (const m of res.data ?? []) {
      if (m.permalink) map.set(m.permalink, m.id);
    }
    pages++;
    const after = res.paging?.cursors?.after;
    if (!after) break;
    params = { ...params, after };
  }
  return map;
}

type Insights = {
  likes?: number;
  comments?: number;
  saved?: number;
  shares?: number;
  reach?: number;
  plays?: number;
  views?: number;
  total_interactions?: number;
};

async function fetchInsights(mediaId: string): Promise<Insights> {
  const token = process.env.META_PAGE_ACCESS_TOKEN!;
  // Reels-supported metrics. Some return empty for <1000-follower accounts.
  // Order matters: query each metric separately so one missing doesn't fail
  // the whole call.
  const wanted = ["likes", "comments", "saved", "shares", "reach", "plays", "views", "total_interactions"];
  const result: Insights = {};

  for (const metric of wanted) {
    try {
      const res = await metaGet<{
        data: { name: string; values: { value: number }[] }[];
      }>(`/${mediaId}/insights`, { metric, access_token: token });
      const v = res.data?.[0]?.values?.[0]?.value;
      if (typeof v === "number") (result as Record<string, number>)[metric] = v;
    } catch {
      // Metric not available for this media type or follower count — skip.
    }
  }
  return result;
}

// ----- Cron handler ------------------------------------------------------

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // Pull every reel from the last 14 days. We may update permalink, media id,
  // or stats (or all three) on each row.
  const candidates = await db
    .select()
    .from(reelPosts)
    .where(gte(reelPosts.createdAt, fourteenDaysAgo));

  log("cron:reel:sync-meta", "candidates", { count: candidates.length });

  // Pre-fetch IG media list once if we have any candidate that might need
  // media_id resolution. Saves N*pages API calls.
  const needsIgList = candidates.some(
    (c) => !c.instagramMediaId && (c.instagramPermalink || c.bufferPostId),
  );
  let permalinkToMediaId: Map<string, string> | null = null;
  if (needsIgList && process.env.META_PAGE_ACCESS_TOKEN && process.env.META_IG_USER_ID) {
    try {
      permalinkToMediaId = await fetchPermalinkToMediaId();
      log("cron:reel:sync-meta", "ig-media-list", { count: permalinkToMediaId.size });
    } catch (err) {
      logError("cron:reel:sync-meta:ig-list", err);
    }
  }

  const counts = {
    permalinksFetched: 0,
    mediaIdsResolved: 0,
    statsUpdated: 0,
    skipped: 0,
    errors: 0,
  };

  for (const row of candidates) {
    try {
      const updates: Partial<typeof reelPosts.$inferInsert> = {};

      // 1. Permalink + shortcode from Buffer (only if missing).
      if (!row.instagramPermalink && row.bufferPostId) {
        const permalink = await bufferGetPermalink(row.bufferPostId);
        if (permalink) {
          updates.instagramPermalink = permalink;
          updates.instagramPostId = extractShortcode(permalink);
          updates.metaSyncedAt = sql`now()` as unknown as Date;
          counts.permalinksFetched++;
        }
      }

      // 2. Numeric media id from IG (needed for insights).
      const permalinkForLookup = updates.instagramPermalink ?? row.instagramPermalink;
      if (!row.instagramMediaId && permalinkForLookup && permalinkToMediaId) {
        // IG's permalink may differ in trailing slashes / query strings.
        // Try exact match, then a normalized comparison.
        const normalized = permalinkForLookup.split("?")[0].replace(/\/$/, "");
        const found =
          permalinkToMediaId.get(permalinkForLookup) ??
          [...permalinkToMediaId.entries()].find(
            ([k]) => k.split("?")[0].replace(/\/$/, "") === normalized,
          )?.[1];
        if (found) {
          updates.instagramMediaId = found;
          counts.mediaIdsResolved++;
        }
      }

      // 3. Engagement stats — for any row that now (or already) has a media id.
      const mediaId = updates.instagramMediaId ?? row.instagramMediaId;
      if (mediaId && process.env.META_PAGE_ACCESS_TOKEN) {
        const insights = await fetchInsights(mediaId);
        if (Object.keys(insights).length > 0) {
          if (insights.likes !== undefined) updates.likes = insights.likes;
          if (insights.comments !== undefined) updates.comments = insights.comments;
          if (insights.saved !== undefined) updates.saves = insights.saved;
          if (insights.shares !== undefined) updates.shares = insights.shares;
          if (insights.reach !== undefined) updates.reach = insights.reach;
          if (insights.plays !== undefined) updates.plays = insights.plays;
          if (insights.views !== undefined) updates.views = insights.views;
          if (insights.total_interactions !== undefined) {
            updates.totalInteractions = insights.total_interactions;
          }
          updates.statsSyncedAt = sql`now()` as unknown as Date;
          counts.statsUpdated++;
        }
      }

      if (Object.keys(updates).length === 0) {
        counts.skipped++;
        continue;
      }

      await db.update(reelPosts).set(updates).where(eq(reelPosts.id, row.id));
    } catch (err) {
      logError(`cron:reel:sync-meta:${row.id}`, err);
      counts.errors++;
    }
  }

  log("cron:reel:sync-meta", "done", counts);
  return NextResponse.json({ ok: true, ...counts });
}
