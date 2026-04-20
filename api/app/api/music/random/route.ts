import { NextRequest, NextResponse } from "next/server";
import { getStockMusicUrls, pickRandom } from "@/lib/music-cache";
import { getUserId, isAuthError } from "@/lib/auth";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await getUserId(req);
    const urls = await getStockMusicUrls();
    const url = pickRandom(urls);
    return NextResponse.json({ url });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("music:random", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
