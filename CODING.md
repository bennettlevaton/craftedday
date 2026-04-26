# Coding Standards

Conventions for this project. Read `CLAUDE.md` first for product context.

---

## General principles

- **Simplicity over cleverness.** Three similar lines beats a premature abstraction.
- **No dead code, no speculative flexibility.** Don't build for hypothetical future requirements.
- **Don't add error handling or validation for things that can't happen.** Trust internal code; only validate at system boundaries (user input, external APIs).
- **Default to no comments.** Names carry meaning. Only comment when the _why_ is non-obvious — hidden constraints, subtle invariants, workarounds.
- **Never reference the current task or caller in a comment** ("added for X flow", "used by Y") — that belongs in the commit/PR, not the code.

---

## Schema design (Drizzle + PlanetScale Postgres)

**Keep `users` light.** Identity only — id, clerk_id, email, created_at. Behavioral data belongs in dedicated tables.

**One-to-one extension pattern for users:**
```
users             // identity core
user_profiles     // preferences, onboarding, personalization
user_stats        // computed/cached aggregates (if needed)
```

Lazy-create the extension row on first access; don't require it to exist at signup.

**Column conventions:**
- `id` — varchar(128), UUIDs. Primary key.
- Foreign keys — `user_id` format, match the parent type.
- Timestamps — `timestamp("created_at").defaultNow().notNull()` for always-present, nullable for optional.
- Strings — pick reasonable varchar limits. Use `text` only when length is genuinely unbounded (scripts, feedback).
- Enums — use varchar + code-level constants, not Postgres enum types (easier to evolve).

**Push schema with `npm run db:push`.** Use the admin PlanetScale credential for DDL; the app runtime uses a restricted role.

---

## API conventions (Next.js App Router)

**Route files:**
```ts
// api/app/api/<resource>/route.ts
export const runtime = "nodejs";
export const maxDuration = 60;  // only if needed beyond default

export async function POST(req: NextRequest) {
  const reqId = randomUUID().slice(0, 8);
  try {
    // ... logic
    log(`scope:${reqId}`, "start", { ... });
    return NextResponse.json({ ... });
  } catch (err) {
    logError(`scope:${reqId}`, err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
```

**Logging:**
- Use `log(scope, msg, extra?)` and `logError(scope, err)` from `@/lib/log`.
- Scopes are short labels (`gen`, `rate`, `history`). Use request IDs for traceability on multi-step flows.
- Log timing (`ms: Date.now() - started`) and key metrics (token counts, byte sizes, DB rows).

**Error shape:** `{ error: string, reqId?: string }`. Always JSON.

**No orphaned DB rows.** For multi-step writes (upload audio → insert row), only commit the DB row after dependencies succeed. Fail loud on external API failures, don't swallow.

**Fire-and-forget async work** (background refreshes, non-critical side effects):
```ts
void refreshPreferenceSummary(userId).catch((err) => logError("scope", err));
```
Don't await; don't block the user response.

**Env vars:**
- Real keys live in `api/.env.local` (gitignored).
- Read with `process.env.X ?? "fallback"` for dev defaults. Only throw on missing secrets at module load if the secret is strictly required.

---

## Mobile compatibility — never break existing app versions

**The API serves a shipped iOS binary that we don't control.** Once a version is in the App Store, it's running against production for weeks or months. We can't atomically update server + client. Treat every API change as a public contract.

**Never:**
- Rename a JSON field in a response (`hours` → `minutes`). Old clients parse `json['hours']` and crash.
- Change a field's type (`int` → `string`, scalar → object).
- Remove a field a client reads.
- Tighten a request validator (e.g. start requiring a field that older builds don't send).
- Change a route path or method.
- Change error response shape — `{ error: "..." }` is part of the contract.

**Safe changes:**
- Add new optional fields to a response. Old clients ignore them.
- Add new optional fields to a request. New clients send them; backend defaults them when absent.
- Add new endpoints.
- Add new enum values for fields the client only displays (not switches on).
- Loosen a validator (accept what was previously rejected).

**When you genuinely need a breaking change:**
1. **Add the new field alongside the old one.** Return both. Old clients keep working, new clients use the new field.
2. **Ship the new mobile build** that uses the new field, wait for adoption.
3. **Eventually drop the old field** — but only after you can confirm the older builds are gone (App Store analytics, or a grace period of 60+ days).

**Validators:** when adding a required field server-side, make it optional first (with a server default) until the new mobile build that always sends it has shipped and propagated.

**Response shape diffs are part of code review.** If a PR touches a route handler's `NextResponse.json({...})`, ask: would the current App Store build still parse this?

---

## Flutter / Dart conventions

**Screen structure:**
```dart
class FooScreen extends StatefulWidget {
  const FooScreen({super.key});
  @override
  State<FooScreen> createState() => _FooScreenState();
}

class _FooScreenState extends State<FooScreen> {
  // state
  @override
  void initState() { super.initState(); _load(); }
  @override
  void dispose() { _controller.dispose(); super.dispose(); }
}
```

**Always check `mounted` after async before `setState` or using `context`:**
```dart
final result = await apiService.doThing();
if (!mounted) return;
setState(() => _data = result);
```

**Dispose everything.** Controllers, streams, animation controllers. In `dispose()`.

**Design tokens — always use `AppColors` and theme.** Never hardcode hex values in screens.

**Spacing conventions:**
- Horizontal page padding: 28
- Card/input radius: 20
- Pill button radius: 100
- Generous vertical spacing — 32-48 between sections

**Loading/error/empty states** for async UI:
```dart
FutureBuilder<T>(
  future: _future,
  builder: (_, snap) {
    if (snap.connectionState == ConnectionState.waiting) return _LoadingSpinner();
    if (snap.hasError) return _ErrorState(...);
    final data = snap.data;
    if (data == null || data.isEmpty) return _EmptyState(...);
    return _Content(data: data);
  },
);
```

**Navigation:** go_router only. Pass IDs in URL params; fetch data in the screen. Avoid shoving objects through router state unless performance demands it.

**Optimistic updates** for toggles (voice, rating in-place, etc): set local state first, call API, revert on failure.

---

## Error handling & user feedback

**Server:** try/catch → log → return JSON error. Never leak stack traces to clients.

**Client:** try/catch → show `SnackBar` with a human message. Don't expose raw error strings in production, but okay during dev.

```dart
try {
  await apiService.doThing();
} catch (e) {
  if (!mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text('Couldn\'t do the thing. ${e.toString()}')),
  );
}
```

---

## Claude API usage

**Model selection:**
- Opus 4.7 (`claude-opus-4-7`) for primary meditation script generation — quality matters.
- Sonnet 4.6 (`claude-sonnet-4-6`) for background/summarization tasks — cheaper, quality sufficient.
- Haiku only for trivial classification.

**Prompt caching:**
- Wrap static system prompts in cache-controlled blocks:
  ```ts
  system: [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }]
  ```
- Note: Opus 4.7 minimum cacheable prefix is 4096 tokens. Shorter prompts won't cache, but the marker is harmless.
- Log `cache_creation_input_tokens` and `cache_read_input_tokens` to verify hits.

**Structured output from Claude:** parse `response.content[0].text` after asserting `type === "text"`. Don't assume.

---

## ElevenLabs usage

**Model tiers:**
- `eleven_flash_v2_5` — default (half the cost of multilingual, good quality)
- `eleven_multilingual_v2` — most expressive, 2x cost. Use only when quality gap is noticeable.
- `eleven_turbo_v2_5` — similar cost/latency to flash, older.

**Voice settings for meditation:**
```ts
{ stability: 1.0, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true, speed: 0.7 }
```

**Voice IDs are internal.** Always reference via `VOICES.female` / `VOICES.male` — never surface raw IDs to clients.

---

## Git conventions

- **Create new commits, never amend.** Amending hides work and can destroy the previous commit.
- Multi-line commit messages via HEREDOC:
  ```bash
  git commit -m "$(cat <<'EOF'
  Title under 70 chars
  
  Body explaining the what and why.
  
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```
- **No backwards-compat shims** — if unused, delete it. Don't leave `// removed` comments or renamed `_unused` vars.

---

## Before marking anything done

- **Typecheck** — `cd api && npx tsc --noEmit`
- **Analyze** — `cd mobile && flutter analyze`
- Restart `bin/dev` after changing any backend file that's imported by a route (Next.js hot-reload doesn't always catch these).
- Manually test the UI flow end-to-end before committing.

---

## Anti-patterns (do not do)

- Hardcoded magic numbers in UI — use theme tokens.
- `try { ... } catch {}` — swallows failures silently. Always log.
- Passing stale client state to server (e.g. voice pref). Server should be source of truth for user preferences.
- Using `--no-verify` to skip hooks — fix the underlying issue instead.
- Adding `_` prefix to mark a var as "unused but keeping" — just delete it.
- Comments explaining what the code does — names should do that.
