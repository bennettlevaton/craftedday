// Quick diagnostic: post a video URL to Buffer/IG and print the actual error.
//
// Run from api/ so it picks up api/.env.local:
//   cd api && tsx ../scripts/test-buffer-post.ts <video_url> [reel|post]
//
// Examples:
//   tsx ../scripts/test-buffer-post.ts https://pub-xxx.r2.dev/reels/2026-04-26.mp4
//   tsx ../scripts/test-buffer-post.ts https://pub-xxx.r2.dev/reels/2026-04-26.mp4 post

import { config } from "dotenv";
config({ path: ".env.local", override: true });

const VIDEO_URL = process.argv[2];
const POST_TYPE = (process.argv[3] ?? "reel") as "reel" | "post" | "story";

if (!VIDEO_URL) {
  console.error("Usage: tsx test-buffer-post.ts <video_url> [reel|post|story]");
  process.exit(1);
}

const TOKEN = process.env.BUFFER_ACCESS_TOKEN!;
const CHANNEL_ID = process.env.BUFFER_CHANNEL_ID!;
if (!TOKEN || !CHANNEL_ID) throw new Error("Missing BUFFER_ACCESS_TOKEN / BUFFER_CHANNEL_ID");

const ENDPOINT = "https://api.buffer.com/graphql";

async function gql(query: string, variables: Record<string, unknown>) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function main() {
  const text = `Diagnostic post — ${new Date().toISOString()}`;

  console.log(`  channelId: ${CHANNEL_ID}`);
  console.log(`  token:     ${TOKEN.slice(0, 8)}...${TOKEN.slice(-4)}`);
  console.log(`  Compare channelId against the URL at publish.buffer.com/channels/<id>/settings`);
  console.log("");

  console.log(`→ Creating ${POST_TYPE} post via Buffer for URL:\n  ${VIDEO_URL}`);

  const create = await gql(
    `mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess { post { id } }
        ... on MutationError { message }
      }
    }`,
    {
      input: {
        text,
        channelId: CHANNEL_ID,
        schedulingType: "automatic",
        mode: "shareNow",
        metadata: {
          instagram: { type: POST_TYPE, shouldShareToFeed: true },
        },
        assets: { videos: [{ url: VIDEO_URL, thumbnailUrl: VIDEO_URL }] },
      },
    },
  );

  const id = create?.data?.createPost?.post?.id;
  if (!id) {
    console.error("✗ Buffer create failed:", JSON.stringify(create, null, 2));
    process.exit(1);
  }
  console.log(`  Submitted. Post id: ${id}`);

  // Poll until terminal status, up to ~90s.
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const status = await gql(
      `query($input: PostInput!){ post(input:$input){ status sentAt error { message rawError } } }`,
      { input: { id } },
    );
    const post = status?.data?.post;
    if (!post) {
      console.error("✗ Could not query post:", JSON.stringify(status));
      return;
    }
    process.stdout.write(`.`);
    if (post.status === "sent") {
      console.log(`\n✓ Posted to Instagram at ${post.sentAt}`);
      return;
    }
    if (post.status === "error") {
      console.log("\n✗ IG rejected the post.");
      console.log(`  message:  ${post.error.message}`);
      console.log(`  rawError: ${post.error.rawError}`);
      return;
    }
  }
  console.log("\n… still pending after 90s. Check publish.buffer.com manually.");
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
