import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { R2_BUCKET, R2_PUBLIC_URL, r2 } from "./r2";
import { log } from "./log";

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min
const PREFIX = "stock_music/";

let cachedUrls: string[] | null = null;
let cachedAt = 0;

export async function getStockMusicUrls(): Promise<string[]> {
  if (cachedUrls && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedUrls;
  }

  const res = await r2.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: PREFIX,
    }),
  );

  const urls = (res.Contents ?? [])
    .filter((o) => o.Key?.endsWith(".mp3"))
    .map((o) => `${R2_PUBLIC_URL}/${o.Key}`);

  cachedUrls = urls;
  cachedAt = Date.now();

  log("music-cache", "refreshed", { count: urls.length });
  return urls;
}

export function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}
