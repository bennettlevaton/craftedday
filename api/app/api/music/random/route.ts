import { NextResponse } from "next/server";
import { getStockMusicUrls, pickRandom } from "@/lib/music-cache";
import { logError } from "@/lib/log";

export const runtime = "nodejs";

export async function GET() {
  try {
    const urls = await getStockMusicUrls();
    const url = pickRandom(urls);
    return NextResponse.json({ url });
  } catch (err) {
    logError("music:random", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
