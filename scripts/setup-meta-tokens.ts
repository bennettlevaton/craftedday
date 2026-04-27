// One-shot Meta token extraction. Handles both direct Page admin AND Business
// Portfolio-owned Pages (Meta Business Suite). Outputs the env vars you need.
//
// Setup: temporarily add to api/.env.local:
//   META_APP_ID=...
//   META_APP_SECRET=...
//   META_SHORT_TOKEN=...      from developers.facebook.com → Tools → Graph API Explorer
//                             SCOPES REQUIRED:
//                               instagram_basic
//                               instagram_manage_insights
//                               pages_show_list
//                               pages_read_engagement
//                               business_management   ← needed for portfolio-owned Pages
//
// Run from api/:
//   NODE_PATH=./node_modules npx tsx ../scripts/setup-meta-tokens.ts
//
// Delete META_APP_SECRET + META_SHORT_TOKEN from .env.local after — only the
// page token + IG user id matter for steady state. Page token never expires.

import { config } from "dotenv";
config({ path: ".env.local", override: true });

const APP_ID = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;
const SHORT_TOKEN = process.env.META_SHORT_TOKEN;

if (!APP_ID || !APP_SECRET || !SHORT_TOKEN) {
  console.error("Missing META_APP_ID, META_APP_SECRET, or META_SHORT_TOKEN in api/.env.local");
  process.exit(1);
}

const GRAPH = "https://graph.facebook.com/v21.0";

async function get<T = unknown>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}${path}?${qs}`);
  const json = await res.json();
  if (!res.ok || (json as { error?: unknown }).error) {
    throw new Error(`Meta API ${path} → ${JSON.stringify(json)}`);
  }
  return json as T;
}

type Page = { id: string; name: string; access_token: string };

async function findPages(longToken: string): Promise<Page[]> {
  // Path 1: directly admin'd Pages.
  const direct = await get<{ data: Page[] }>("/me/accounts", { access_token: longToken });
  if (direct.data?.length) {
    console.log(`  via /me/accounts: ${direct.data.length} page(s)`);
    return direct.data;
  }

  // Path 2: Pages owned by Business Portfolios this account has access to.
  console.log(`  /me/accounts empty — checking Business Portfolios...`);
  const bizs = await get<{ data: { id: string; name: string }[] }>("/me/businesses", {
    access_token: longToken,
  });
  if (!bizs.data?.length) {
    throw new Error(
      "No Pages found via /me/accounts AND no Business Portfolios via /me/businesses. " +
      "Confirm your FB account is either (a) a direct admin of the Page, or (b) has " +
      "access to a Portfolio that owns the Page. Also confirm the token has the " +
      "business_management scope.",
    );
  }
  console.log(`  found ${bizs.data.length} portfolio(s):`);
  bizs.data.forEach((b) => console.log(`    - ${b.name} (${b.id})`));

  const allPages: Page[] = [];
  for (const biz of bizs.data) {
    const owned = await get<{ data: Page[] }>(`/${biz.id}/owned_pages`, {
      fields: "id,name,access_token",
      access_token: longToken,
    });
    if (owned.data?.length) {
      console.log(`    [${biz.name}] owns ${owned.data.length} page(s)`);
      allPages.push(...owned.data);
    }
  }
  if (!allPages.length) {
    throw new Error(
      "Portfolios found but none own any Pages. Create the CraftedDay Page inside " +
      "your portfolio at business.facebook.com → Pages → Add → Create new Page.",
    );
  }
  return allPages;
}

async function main() {
  console.log("→ Step 1/4: exchanging short → long-lived user token (60 days)...");
  const exch = await get<{ access_token: string }>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: APP_ID!,
    client_secret: APP_SECRET!,
    fb_exchange_token: SHORT_TOKEN!,
  });
  const longToken = exch.access_token;
  console.log(`  ✓ ${longToken.slice(0, 12)}...${longToken.slice(-6)}`);

  console.log(`\n→ Step 2/4: finding Pages...`);
  const pages = await findPages(longToken);
  console.log(`  pages:`);
  pages.forEach((p, i) => console.log(`    [${i}] ${p.name} (id: ${p.id})`));

  // Heuristic: prefer a Page with "craftedday" in the name; otherwise [0].
  const idx = pages.findIndex((p) =>
    p.name.toLowerCase().replace(/\s+/g, "").includes("craftedday"),
  );
  const page = idx >= 0 ? pages[idx] : pages[0];
  console.log(`  → using: ${page.name}`);

  console.log(`\n→ Step 3/4: getting Instagram Business Account from the Page...`);
  const ig = await get<{ instagram_business_account?: { id: string } }>(`/${page.id}`, {
    fields: "instagram_business_account",
    access_token: page.access_token,
  });
  if (!ig.instagram_business_account?.id) {
    throw new Error(
      "No Instagram Business Account linked to this Page.\n" +
      "  Open the IG mobile app → Settings → Account Center → Accounts → Add account → Facebook Page.",
    );
  }
  const igUserId = ig.instagram_business_account.id;
  console.log(`  ✓ IG Business Account id: ${igUserId}`);

  console.log(`\n→ Step 4/4: smoke test — fetching @username + followers_count...`);
  const me = await get<{ username: string; followers_count: number }>(`/${igUserId}`, {
    fields: "username,followers_count",
    access_token: page.access_token,
  });
  console.log(`  ✓ @${me.username} — ${me.followers_count} followers`);

  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`  Add to Vercel prod (Project → Settings → Env Vars):`);
  console.log(`══════════════════════════════════════════════════════════`);
  console.log(`META_PAGE_ACCESS_TOKEN=${page.access_token}`);
  console.log(`META_IG_USER_ID=${igUserId}`);
  console.log(`══════════════════════════════════════════════════════════`);
  console.log(`\nPage access token never expires. Delete META_APP_SECRET +`);
  console.log(`META_SHORT_TOKEN from .env.local — they're done.`);
}

main().catch((err) => {
  console.error("\n✗", err.message);
  process.exit(1);
});
