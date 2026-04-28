// Local prompt-tuning loop for reel quotes. Calls the live concept prompt
// (system + user) N times in parallel, prints results, no video / no DB.
//
// Run from api/:
//   cd api && npm run quotes:brainstorm           # 10 quotes, random themes
//   cd api && npm run quotes:brainstorm -- 20     # 20 quotes
//   cd api && npm run quotes:brainstorm -- 10 rest  # all on theme "rest"
//
// Iterate on CONCEPT_SYSTEM / conceptUserPrompt in api/lib/reel.ts, re-run.

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { generateConcept, pickTheme } = await import("../api/lib/reel");

  const n = Number(process.argv[2] ?? 10);
  const fixedTheme = process.argv[3];

  console.log(`\nBrainstorming ${n} quotes${fixedTheme ? ` on theme "${fixedTheme}"` : " across random themes"}...\n`);

  const t0 = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: n }, async () => {
      const theme = fixedTheme ?? pickTheme();
      const post = await generateConcept({
        theme,
        history: { quotes: [], visualPrompts: [] },
      });
      return { theme, post };
    }),
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  results.forEach((r, i) => {
    console.log(`\n${"─".repeat(72)}`);
    if (r.status === "rejected") {
      console.log(`#${i + 1} FAILED: ${r.reason}`);
      return;
    }
    const { theme, post } = r.value;
    console.log(`#${i + 1}  theme: ${theme}`);
    console.log(`\n  "${post.quote}"\n`);
    console.log(`  ${post.caption.replace(/\n/g, "\n  ")}`);
    console.log(`\n  ${post.hashtags.join(" ")}`);
  });

  const ok = results.filter((r) => r.status === "fulfilled").length;
  console.log(`\n${"─".repeat(72)}\n${ok}/${n} succeeded in ${elapsed}s\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
