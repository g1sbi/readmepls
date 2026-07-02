# Phase 8 — Tiering & Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a Standard/Pro tier split with a single pure `resolveTier` seam, gate the existing AI tag/summary feature behind Pro at *display* time (not capture time — see rationale below), and ship a minimal self-serve `/profile` page.

**Architecture:** A pure `resolveTier(user, config)` function in `@readmepls/core` is the single source of truth for tier resolution. Hosted SaaS reads `user.tier` (self-serve, user-editable). Self-hosted ignores `user.tier` entirely and derives tier uniformly from whether an AI provider is configured (`SELF_HOSTED=true` env). The worker's extraction path is *unaffected* by per-user tier (it already runs once per unique URL against a shared cache); the only new worker behavior is a `NullAIProvider` for self-host-without-a-key. Web-side gating hides `content.ai_tags_json`/AI-derived excerpt from Standard-tier *viewers* at render time.

**Tech Stack:** SvelteKit (adapter-node) + PocketBase (JS migrations) + Node/TS worker, Vitest across all three, Zod at boundaries, pnpm workspaces.

## Global Constraints

- **TDD always** — failing test first, then implementation, for every step below.
- **TypeScript strict** — no `any` without a written reason.
- **Pure core, thin IO shell** — `resolveTier` lives in `@readmepls/core`, takes plain data, no env/IO access.
- **Zod at boundaries** — `Tier` is a `z.enum` in `@readmepls/types`, not a bare string.
- **Migrations tracked in git** — the tier-value rename is a PocketBase migration file, never a manual admin-UI edit.
- **Small commits, Conventional Commits** — one commit per task (`feat:`, `fix:`, `test:`, `refactor:` as appropriate).
- **Tests offline** — worker/AI tests use mocks, never live network; PB integration tests use the ephemeral harness (`startEphemeralPb`), never a shared instance.
- Run every test command from the repo root: `pnpm exec vitest run <path>`.
- The vendored PocketBase binary (`pocketbase/pocketbase`, v0.39.4) must exist locally for integration tests (Tasks 5, 7, 9, 13). It's gitignored; if missing, download and verify against the pinned Dockerfile hash:
  ```bash
  cd pocketbase && curl -sSL -o pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v0.39.4/pocketbase_0.39.4_linux_amd64.zip" && echo "06a3ec70205b3eaf8343e226ab74c132013f7b1e9102e898dbca034bdd622d62  pb.zip" | sha256sum -c - && unzip -o pb.zip pocketbase && chmod +x pocketbase && rm pb.zip
  ```

---

## Why the AI gate lives at read time, not capture time

`content` is a global cache deduped by `canonical_url` (`packages/core/src/capture/handle-capture.ts:40-55`): the first capture of a URL runs extraction + AI tagging once; every later capture of the same URL (any user, any tier) is a cache hit reusing that row. The worker never re-runs AI for it. So gating "does this capture call AI" by the *capturing* user's tier would mean whichever user (Standard or Pro) happens to capture a URL first decides, forever, whether every other viewer ever sees AI tags for it. Tier is a property of the *viewer*, not the content, so gating happens where content is *displayed*, per viewing user — not in the worker.

The worker's only new behavior in this phase is deploy-config-driven, not tier-driven: self-hosted operators with no AI key configured must not crash on the AI call (today they would — `ClaudeProvider`'s key is required and there's no "no provider" path).

**`TagEditor` needs no changes.** The spec's "Standard users keep full manual tagging" goal is already true today — `TagEditor.svelte` (used on the reader page, `apps/web/src/routes/read/[id]/+page.svelte:266`) renders and edits `manualTags` from the `tags`/`article_tags` collections, which were never derived from `content.ai_tags_json` in the first place. No task below touches it.

---

## Task 1: `Tier` type

**Files:**
- Create: `packages/types/src/tier.ts`
- Test: `packages/types/src/tier.test.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Produces: `Tier` (zod enum `"standard" | "pro"`) and its inferred TS type, exported from `@readmepls/types`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/types/src/tier.test.ts
import { describe, it, expect } from "vitest";
import { Tier } from "./tier.js";

describe("Tier", () => {
  it("accepts standard and pro", () => {
    expect(Tier.parse("standard")).toBe("standard");
    expect(Tier.parse("pro")).toBe("pro");
  });
  it("rejects the old free value and anything else", () => {
    expect(() => Tier.parse("free")).toThrow();
    expect(() => Tier.parse("enterprise")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/types/src/tier.test.ts`
Expected: FAIL — cannot find module `./tier.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/types/src/tier.ts
import { z } from "zod";
export const Tier = z.enum(["standard", "pro"]);
export type Tier = z.infer<typeof Tier>;
```

- [ ] **Step 4: Export it from the package index**

```ts
// packages/types/src/index.ts
// add this line among the existing export * from "./..." lines:
export * from "./tier.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/types/src/tier.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/tier.ts packages/types/src/tier.test.ts packages/types/src/index.ts
git commit -m "feat(types): add Tier enum (standard/pro)"
```

---

## Task 2: `resolveTier` pure function

**Files:**
- Create: `packages/core/src/tier/resolve-tier.ts`
- Test: `packages/core/src/tier/resolve-tier.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Tier` from `@readmepls/types` (Task 1).
- Produces: `resolveTier(user: { tier: Tier }, config: TierConfig): Tier` and the `TierConfig` interface (`{ selfHosted: boolean; aiProviderConfigured: boolean }`), both exported from `@readmepls/core`. Every later task that needs a viewer's tier calls this — do not re-derive tier logic elsewhere.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/tier/resolve-tier.test.ts
import { describe, it, expect } from "vitest";
import { resolveTier } from "./resolve-tier.js";

describe("resolveTier", () => {
  it("self-hosted with an AI provider configured: everyone is pro, regardless of user.tier", () => {
    expect(
      resolveTier({ tier: "standard" }, { selfHosted: true, aiProviderConfigured: true })
    ).toBe("pro");
  });

  it("self-hosted with no AI provider configured: everyone is standard, regardless of user.tier", () => {
    expect(
      resolveTier({ tier: "pro" }, { selfHosted: true, aiProviderConfigured: false })
    ).toBe("standard");
  });

  it("hosted SaaS: reads the user's own tier when standard", () => {
    expect(
      resolveTier({ tier: "standard" }, { selfHosted: false, aiProviderConfigured: true })
    ).toBe("standard");
  });

  it("hosted SaaS: reads the user's own tier when pro", () => {
    expect(
      resolveTier({ tier: "pro" }, { selfHosted: false, aiProviderConfigured: true })
    ).toBe("pro");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/tier/resolve-tier.test.ts`
Expected: FAIL — cannot find module `./resolve-tier.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/tier/resolve-tier.ts
import type { Tier } from "@readmepls/types";

export interface TierConfig {
  selfHosted: boolean;
  aiProviderConfigured: boolean;
}

export function resolveTier(user: { tier: Tier }, config: TierConfig): Tier {
  if (config.selfHosted) {
    return config.aiProviderConfigured ? "pro" : "standard";
  }
  return user.tier;
}
```

- [ ] **Step 4: Export it from the package index**

```ts
// packages/core/src/index.ts
// add this line among the existing export * from "./..." lines:
export * from "./tier/resolve-tier.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/core/src/tier/resolve-tier.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/tier/resolve-tier.ts packages/core/src/tier/resolve-tier.test.ts packages/core/src/index.ts
git commit -m "feat(core): add resolveTier — single seam for tier resolution"
```

---

## Task 3: Rename quota's `free` tier key to `standard`

**Files:**
- Modify: `packages/core/src/quota/quota.ts`
- Modify: `packages/core/src/quota/quota.test.ts`

**Interfaces:**
- Consumes: `Tier` from `@readmepls/types` (Task 1).
- Produces: `checkQuota(state: QuotaState, byoKey: boolean)` unchanged in shape; `QuotaState.tier` is now typed `Tier` instead of `string`.

- [ ] **Step 1: Update the test to use the new tier name (still red until Step 3)**

```ts
// packages/core/src/quota/quota.test.ts
import { describe, it, expect } from "vitest";
import { checkQuota } from "./quota.js";

describe("checkQuota", () => {
  it("allows when under tier limit", () => {
    expect(checkQuota({ tier: "standard", used: 5 }, false)).toEqual({ ok: true });
  });
  it("blocks when at/over standard limit", () => {
    const r = checkQuota({ tier: "standard", used: 50 }, false);
    expect(r.ok).toBe(false);
  });
  it("always allows when user brings own key", () => {
    expect(checkQuota({ tier: "standard", used: 9999 }, true)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run test to verify it still passes (LIMITS still has `free`, but the fallback covers the unknown `"standard"` key at the same numeric value — this step is a checkpoint, not a red step)**

Run: `pnpm exec vitest run packages/core/src/quota/quota.test.ts`
Expected: PASS (3 tests) — the `?? FREE_LIMIT` fallback already makes this pass even before Step 3. Proceed anyway: the implementation must be correct, not just accidentally passing.

- [ ] **Step 3: Rename the LIMITS key and type the tier field**

```ts
// packages/core/src/quota/quota.ts
import type { Tier } from "@readmepls/types";

const STANDARD_LIMIT = 50;
const LIMITS: Record<Tier, number> = { standard: STANDARD_LIMIT, pro: 1000 };

export interface QuotaState {
  tier: Tier;
  used: number;
}

export function checkQuota(
  state: QuotaState,
  byoKey: boolean
): { ok: true } | { ok: false; limit: number } {
  if (byoKey) return { ok: true };
  const limit = LIMITS[state.tier] ?? STANDARD_LIMIT;
  return state.used < limit ? { ok: true } : { ok: false, limit };
}
```

- [ ] **Step 4: Run test to verify it passes on the real implementation**

Run: `pnpm exec vitest run packages/core/src/quota/quota.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/quota/quota.ts packages/core/src/quota/quota.test.ts
git commit -m "refactor(core): rename quota's free tier key to standard, type QuotaState.tier as Tier"
```

---

## Task 4: Rename `free` → `standard` everywhere it's assigned in app code

**Files:**
- Modify: `packages/core/src/capture/handle-capture.ts:61`
- Modify: `packages/core/src/pb/test-harness.ts:72`
- Modify: `apps/web/src/routes/login/+page.svelte:20`
- Modify: `packages/core/src/capture/handle-capture-userauth.test.ts`
- Modify: `packages/core/src/capture/handle-capture-enqueue-error.test.ts`
- Create: `packages/core/src/capture/handle-capture-tier-fallback.test.ts`

**Interfaces:**
- Consumes: nothing new — this is a mechanical rename of every remaining `"free"` literal in production/helper code (verified via `grep -rn '"free"' apps/ packages/ pocketbase/` — only these three non-test sites plus the two capture test fixtures remain after Task 3).

- [ ] **Step 1: Write the failing test for the fallback path**

No test currently exercises `user.tier ?? "free"` when `tier` is missing from the user record. Add one:

```ts
// packages/core/src/capture/handle-capture-tier-fallback.test.ts
import { describe, it, expect } from "vitest";
import type PocketBase from "pocketbase";
import { handleCapture } from "./handle-capture.js";

// When a user record has no tier field at all, handleCapture must fall back to
// the standard quota limit (50), not silently allow unlimited captures.
function fakePb(): PocketBase {
  const pb = {
    collection(name: string) {
      if (name === "content") {
        return { getFirstListItem: async () => Promise.reject(new Error("not found")) };
      }
      if (name === "users") {
        // no `tier` field — simulates a pre-migration or malformed row
        return { getOne: async () => ({ monthly_quota_used: 51 }) };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
  return pb as unknown as PocketBase;
}

describe("handleCapture tier fallback", () => {
  it("falls back to the standard quota limit when tier is missing", async () => {
    const r = await handleCapture(fakePb(), "user1", "https://example.com/no-tier");
    expect(r.status).toBe(402);
    expect(r.body.error).toBe("quota exceeded");
  });
});
```

- [ ] **Step 2: Run test to verify it already passes (checkpoint, not a red step)**

Run: `pnpm exec vitest run packages/core/src/capture/handle-capture-tier-fallback.test.ts`
Expected: PASS — today's code still passes this by coincidence, since both `"free"` and `"standard"` resolve to the same limit (50) via quota's fallback (Task 3). That's fine: this test's job is to lock in the fallback value going forward, so it must survive Step 3's rename unchanged. Proceed to Step 3 regardless.

- [ ] **Step 3: Rename the fallback and every other `"free"` literal**

```ts
// packages/core/src/capture/handle-capture.ts:58-64 — change the fallback default
  // quota check (worker uses our key; BYO bypasses)
  const user = await pb.collection("users").getOne(userId);
  const quota = checkQuota(
    { tier: user.tier ?? "standard", used: user.monthly_quota_used ?? 0 },
    Boolean(user.ai_key_enc)
  );
  if (!quota.ok) return { status: 402, body: { error: "quota exceeded" } };
```

```ts
// packages/core/src/pb/test-harness.ts:67-76 — makeTestUser default
export async function makeTestUser(pb: PocketBase): Promise<string> {
  const user = await pb.collection("users").create({
    email: `u${Date.now()}@test.local`,
    password: "password12345",
    passwordConfirm: "password12345",
    tier: "standard",
    monthly_quota_used: 0,
  });
  return user.id;
}
```

```svelte
<!-- apps/web/src/routes/login/+page.svelte:18-21 — signup default -->
      if (mode === "signup") {
        await pb.collection("users").create({
          email, password, passwordConfirm: password, tier: "standard", monthly_quota_used: 0,
        });
      }
```

Also update the two existing capture test fixtures for consistency with the new default (both currently create/fake a user with `tier: "free"`):

```ts
// packages/core/src/capture/handle-capture-userauth.test.ts:17-23 — change tier to "standard"
  const u = await h.pb.collection("users").create({
    email,
    password: "password12345",
    passwordConfirm: "password12345",
    tier: "standard",
    monthly_quota_used: 0,
  });
```

```ts
// packages/core/src/capture/handle-capture-enqueue-error.test.ts:17-19 — change tier to "standard"
      if (name === "users") {
        return { getOne: async () => ({ tier: "standard", monthly_quota_used: 0 }) };
      }
```

- [ ] **Step 4: Run the full affected test set**

Run: `pnpm exec vitest run packages/core/src/capture packages/core/src/pb/test-harness.smoke.test.ts`
Expected: PASS — all capture tests green, including the new fallback test.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/capture/handle-capture.ts packages/core/src/pb/test-harness.ts apps/web/src/routes/login/+page.svelte packages/core/src/capture/handle-capture-userauth.test.ts packages/core/src/capture/handle-capture-enqueue-error.test.ts packages/core/src/capture/handle-capture-tier-fallback.test.ts
git commit -m "refactor: rename remaining free tier literals to standard"
```

---

## Task 5: PocketBase migration — rename existing `free` rows to `standard`

**Files:**
- Create: `pocketbase/pb_migrations/1719400000_tier_standard_rename.js`
- Create: `packages/core/src/pb/migration-tier-standard-rename.test.ts`
- Modify: `packages/core/src/pb/test-harness.ts`

**Interfaces:**
- Consumes: the vendored `pocketbase/pocketbase` binary (v0.39.4).
- Produces: `startEphemeralPb` gains an optional `{ dir?: string; migrationsDir?: string }` parameter (both default to today's behavior — a fresh temp dir and `pocketbase/pb_migrations` — so all ~20 existing no-arg call sites are unaffected). This lets a test boot PocketBase twice against the *same* data directory with a *growing* migrations directory, to exercise a real pre-migration → post-migration transition — this repo's other migrations are schema-only and testable by checking post-migration behavior, but a data migration needs to prove the actual rewrite happens, not just that the end-state schema is sane.

This is a **data** migration (rewriting existing row values), not a schema change — `tier` stays a plain `text` field. The exact JS APIs used below (`app.findRecordsByFilter`, `record.set`, `app.save`) were manually verified against the pinned v0.39.4 binary before writing this plan.

- [ ] **Step 1: Add the `dir`/`migrationsDir` override to `startEphemeralPb`**

```ts
// packages/core/src/pb/test-harness.ts
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import PocketBase from "pocketbase";

const PB_BIN = process.env.PB_BIN ?? "pocketbase/pocketbase";
const SU_EMAIL = "worker@test.local";
const SU_PASS = "password12345";

export interface PbHandle {
  url: string;
  pb: PocketBase;
  stop: () => void;
}

export async function startEphemeralPb(
  opts: { dir?: string; migrationsDir?: string } = {}
): Promise<PbHandle> {
  const dir = opts.dir ?? mktempPbDir();
  const migrationsDir = opts.migrationsDir ?? "pocketbase/pb_migrations";
  const port = 8090 + Math.floor(Math.random() * 1000);
  const url = `http://127.0.0.1:${port}`;

  // create superuser before serving — idempotent, safe to call again on a
  // second boot against the same dir (e.g. Task 5's before/after migration test).
  await runOnce([
    "superuser",
    "upsert",
    SU_EMAIL,
    SU_PASS,
    `--dir=${dir}`,
    `--migrationsDir=${migrationsDir}`,
  ]);

  const proc = spawn(
    PB_BIN,
    ["serve", `--http=127.0.0.1:${port}`, `--dir=${dir}`, `--migrationsDir=${migrationsDir}`, "--hooksDir=pocketbase/pb_hooks"],
    { stdio: "ignore" }
  );

  await waitForHealth(url);
  const pb = new PocketBase(url);
  await pb.collection("_superusers").authWithPassword(SU_EMAIL, SU_PASS);

  return { url, pb, stop: () => proc.kill("SIGKILL") };
}

function mktempPbDir(): string {
  return mkdtempSync(join(tmpdir(), "pb-test-"));
}

function runOnce(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p: ChildProcess = spawn(PB_BIN, args, { stdio: "ignore" });
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`pb exited ${code}`))
    );
  });
}

async function waitForHealth(url: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("PocketBase did not become healthy");
}

export async function makeTestUser(pb: PocketBase): Promise<string> {
  const user = await pb.collection("users").create({
    email: `u${Date.now()}@test.local`,
    password: "password12345",
    passwordConfirm: "password12345",
    tier: "standard",
    monthly_quota_used: 0,
  });
  return user.id;
}
```

(This is the full file — Task 4 already changed `makeTestUser`'s `tier` to `"standard"`; this step's only *new* change is the `opts` parameter, the `dir`/`migrationsDir` locals, and extracting the fresh-dir default into `mktempPbDir()`.)

- [ ] **Step 2: Run the existing harness smoke test to confirm the no-arg path still works**

Run: `pnpm exec vitest run packages/core/src/pb/test-harness.smoke.test.ts`
Expected: PASS — confirms the default-parameter path is unchanged before building on top of it.

- [ ] **Step 3: Write the failing migration test**

```ts
// packages/core/src/pb/migration-tier-standard-rename.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startEphemeralPb } from "./test-harness.js";

const MIGRATIONS_SRC = "pocketbase/pb_migrations";
const RENAME_FILE = "1719400000_tier_standard_rename.js";
const ALL_MIGRATIONS = readdirSync(MIGRATIONS_SRC).filter((f) => f.endsWith(".js")).sort();

describe("tier standard-rename migration", () => {
  it("renames an existing free-tier user to standard once the migration is applied", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "pb-tier-data-"));
    const migrationsDir = mkdtempSync(join(tmpdir(), "pb-tier-migrations-"));
    // Boot 1: every migration up to (not including) the rename.
    for (const f of ALL_MIGRATIONS.filter((f) => f < RENAME_FILE)) {
      copyFileSync(join(MIGRATIONS_SRC, f), join(migrationsDir, f));
    }
    const h1 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const user = await h1.pb.collection("users").create({
      email: `pre-rename-${Date.now()}@test.local`,
      password: "password12345",
      passwordConfirm: "password12345",
      tier: "free",
      monthly_quota_used: 0,
    });
    h1.stop();

    // Boot 2: same data dir, rename migration now present — PocketBase applies
    // it automatically on this boot, exactly as it would on a real deploy update.
    copyFileSync(join(MIGRATIONS_SRC, RENAME_FILE), join(migrationsDir, RENAME_FILE));
    const h2 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const reread = await h2.pb.collection("users").getOne(user.id);
    expect(reread.tier).toBe("standard");
    h2.stop();
  }, 30000);

  it("does not touch a pro-tier user", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "pb-tier-data-"));
    const migrationsDir = mkdtempSync(join(tmpdir(), "pb-tier-migrations-"));
    for (const f of ALL_MIGRATIONS.filter((f) => f < RENAME_FILE)) {
      copyFileSync(join(MIGRATIONS_SRC, f), join(migrationsDir, f));
    }
    const h1 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const user = await h1.pb.collection("users").create({
      email: `pre-rename-pro-${Date.now()}@test.local`,
      password: "password12345",
      passwordConfirm: "password12345",
      tier: "pro",
      monthly_quota_used: 0,
    });
    h1.stop();

    copyFileSync(join(MIGRATIONS_SRC, RENAME_FILE), join(migrationsDir, RENAME_FILE));
    const h2 = await startEphemeralPb({ dir: dataDir, migrationsDir });
    const reread = await h2.pb.collection("users").getOne(user.id);
    expect(reread.tier).toBe("pro");
    h2.stop();
  }, 30000);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/pb/migration-tier-standard-rename.test.ts`
Expected: FAIL — `copyFileSync(join(MIGRATIONS_SRC, RENAME_FILE), ...)` throws (`ENOENT`) because `1719400000_tier_standard_rename.js` doesn't exist yet.

- [ ] **Step 5: Write the migration**

```js
// pocketbase/pb_migrations/1719400000_tier_standard_rename.js
/// <reference path="../pb_data/types.d.ts" />
// Product rename: the free tier is now called "standard". This is a data-only
// migration — the `tier` field stays a plain text column, only existing row
// values change. Empty string is included alongside "free" because `tier` has
// never been required, so pre-existing rows may have no value set.
migrate(
  (app) => {
    const rows = app.findRecordsByFilter("users", "tier = 'free' || tier = ''", "", 0, 0);
    for (const row of rows) {
      row.set("tier", "standard");
      app.save(row);
    }
  },
  (app) => {
    const rows = app.findRecordsByFilter("users", "tier = 'standard'", "", 0, 0);
    for (const row of rows) {
      row.set("tier", "free");
      app.save(row);
    }
  }
);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run packages/core/src/pb/migration-tier-standard-rename.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Run the full existing PB integration suite to confirm no regression**

Run: `pnpm exec vitest run packages/core/src/pb`
Expected: PASS — every existing migration/integration test still boots and passes with the new migration and the `test-harness.ts` signature change present.

- [ ] **Step 8: Commit**

```bash
git add pocketbase/pb_migrations/1719400000_tier_standard_rename.js packages/core/src/pb/migration-tier-standard-rename.test.ts packages/core/src/pb/test-harness.ts
git commit -m "feat(pb): migrate existing free-tier users to standard"
```

---

## Task 6: Worker — `NullAIProvider` for self-host with no AI key

**Files:**
- Create: `apps/worker/src/ai/null-provider.ts`
- Create: `apps/worker/src/ai/null-provider.test.ts`
- Modify: `apps/worker/src/ai/select-provider.ts`
- Modify: `apps/worker/src/ai/select-provider.test.ts`

**Interfaces:**
- Produces: `NullAIProvider` (implements `AIProvider`, returns `{ tags: [], summary: '' }`). `selectAiProvider` gains a third branch: no `ANTHROPIC_API_KEY` and `AI_PROVIDER !== 'mock'` → `NullAIProvider`, instead of lazily building a real client that will crash on first use.

- [ ] **Step 1: Write the failing test for `NullAIProvider`**

```ts
// apps/worker/src/ai/null-provider.test.ts
import { describe, it, expect } from "vitest";
import { NullAIProvider } from "./null-provider.js";

describe("NullAIProvider", () => {
  it("returns empty tags and summary without making any call", async () => {
    const provider = new NullAIProvider();
    const result = await provider.tagAndSummarize("some article text");
    expect(result).toEqual({ tags: [], summary: "" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/worker/src/ai/null-provider.test.ts`
Expected: FAIL — cannot find module `./null-provider.js`.

- [ ] **Step 3: Implement `NullAIProvider`**

```ts
// apps/worker/src/ai/null-provider.ts
import type { AITagResult } from "@readmepls/types";
import type { AIProvider } from "./provider.js";

/** Used when no AI provider is configured (self-hosted, no key). Returning an
 *  empty result — not throwing — lets extraction complete normally; the
 *  article just has no AI tags/summary, same as if a human hadn't tagged it. */
export class NullAIProvider implements AIProvider {
  async tagAndSummarize(): Promise<AITagResult> {
    return { tags: [], summary: "" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/worker/src/ai/null-provider.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Update `select-provider.test.ts` — the existing "unset AI_PROVIDER" test must now supply a key, plus add the new no-key case (RED first)**

```ts
// apps/worker/src/ai/select-provider.test.ts
import { describe, it, expect, vi } from "vitest";
import { selectAiProvider } from "./select-provider.js";
import { MockAIProvider } from "./mock-provider.js";
import { NullAIProvider } from "./null-provider.js";
import type { AIProvider } from "./provider.js";

describe("selectAiProvider", () => {
  it("returns MockAIProvider for AI_PROVIDER=mock without building the real provider", () => {
    const makeClaude = vi.fn<() => AIProvider>();
    const ai = selectAiProvider({ AI_PROVIDER: "mock" }, makeClaude);
    expect(ai).toBeInstanceOf(MockAIProvider);
    expect(makeClaude).not.toHaveBeenCalled();
  });

  it("builds the real provider lazily when a key is present", () => {
    const fake: AIProvider = { tagAndSummarize: async () => ({ tags: [], summary: "" }) };
    const makeClaude = vi.fn(() => fake);
    const ai = selectAiProvider({ ANTHROPIC_API_KEY: "sk-test" }, makeClaude);
    expect(makeClaude).toHaveBeenCalledOnce();
    expect(ai).toBe(fake);
  });

  it("returns NullAIProvider when no key is configured and AI_PROVIDER is not mock", () => {
    const makeClaude = vi.fn<() => AIProvider>();
    const ai = selectAiProvider({}, makeClaude);
    expect(ai).toBeInstanceOf(NullAIProvider);
    expect(makeClaude).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify the new/changed cases fail**

Run: `pnpm exec vitest run apps/worker/src/ai/select-provider.test.ts`
Expected: FAIL — `selectAiProvider({}, makeClaude)` currently calls `makeClaude()` (old behavior), so the third test fails (`makeClaude` was called, and the result isn't a `NullAIProvider`).

- [ ] **Step 7: Update `selectAiProvider`**

```ts
// apps/worker/src/ai/select-provider.ts
import type { AIProvider } from "./provider.js";
import { MockAIProvider } from "./mock-provider.js";
import { NullAIProvider } from "./null-provider.js";

/**
 * Pick the AI provider from env. `AI_PROVIDER=mock` wires the deterministic
 * MockAIProvider — used by the self-host smoke test so an end-to-end job can
 * complete offline with no Anthropic key or network spend. With no key and no
 * mock flag (typically a self-hosted deploy with AI turned off), NullAIProvider
 * lets extraction complete with empty tags/summary instead of crashing on the
 * first real capture. Otherwise builds the real provider via the injected
 * factory, a thunk so the Anthropic client (and its required key) is only
 * constructed when actually used.
 */
export function selectAiProvider(
  env: { AI_PROVIDER?: string; ANTHROPIC_API_KEY?: string },
  makeClaude: () => AIProvider
): AIProvider {
  if (env.AI_PROVIDER === "mock") {
    return new MockAIProvider({ tags: ["smoke"], summary: "ok" });
  }
  if (!env.ANTHROPIC_API_KEY) {
    return new NullAIProvider();
  }
  return makeClaude();
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm exec vitest run apps/worker/src/ai/select-provider.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
git add apps/worker/src/ai/null-provider.ts apps/worker/src/ai/null-provider.test.ts apps/worker/src/ai/select-provider.ts apps/worker/src/ai/select-provider.test.ts
git commit -m "feat(worker): add NullAIProvider for self-host deploys with no AI key"
```

---

## Task 7: Worker integration — extraction completes with `NullAIProvider`

**Files:**
- Modify: `apps/worker/src/worker.integration.test.ts`

**Interfaces:**
- Consumes: `NullAIProvider` (Task 6), `processJob` (existing, `apps/worker/src/worker.js`).

- [ ] **Step 1: Add the failing test**

Add this `it` block inside the existing `describe("processJob", ...)` in `apps/worker/src/worker.integration.test.ts` (add the import at the top alongside the existing `MockAIProvider` import):

```ts
// apps/worker/src/worker.integration.test.ts — add to the top imports:
import { NullAIProvider } from "./ai/null-provider.js";
```

```ts
  it("completes extraction with empty tags/summary when no AI provider is configured", async () => {
    const job = await h.pb.collection("jobs").create({
      user: "u1",
      canonical_url: "https://example.com/no-ai",
      type: "extract",
      status: "running",
      attempts: 0,
    });

    await processJob(h.pb, job.id, {
      io: ioWith(html),
      registry,
      ai: new NullAIProvider(),
      classify: classifySource,
    });

    const done = await h.pb.collection("jobs").getOne(job.id);
    expect(done.status).toBe("done");

    const content = await h.pb.collection("content").getOne(done.content);
    expect(content.ai_tags_json).toEqual([]);
    // excerpt falls back to the extractor's own excerpt, not an AI summary,
    // since ai.summary is "" (falsy) — worker.ts:44 `ai.summary || result.excerpt`.
    expect(content.excerpt).toBeTruthy();
    expect(content.title).toBe("Hello World Article");
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm exec vitest run apps/worker/src/worker.integration.test.ts`
Expected: PASS (4 tests total in the file) on the first run. This test has no natural red state — `processJob` was already provider-agnostic (Task 6 didn't touch it), so plugging in `NullAIProvider` just exercises an existing seam. It's still real regression coverage: it locks in that the self-host-no-AI path produces a `done` job with empty tags and a non-empty excerpt, end-to-end.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/src/worker.integration.test.ts
git commit -m "test(worker): cover extraction completing with NullAIProvider"
```

---

## Task 8: `SELF_HOSTED` env var + web `PageData` type

**Files:**
- Modify: `.env.example`
- Modify: `apps/web/src/app.d.ts`

**Interfaces:**
- Produces: `App.PageData` (`{ tier: Tier | null; selfHosted: boolean }`), consumed by Task 9's `+layout.server.ts` and Task 10/12's components.

- [ ] **Step 1: Document the new env var**

```bash
# .env.example — add after the "AI provider" section:
# ---- Deployment mode ----
# false (default) = hosted SaaS: tier is per-user, self-serve via /profile.
# true = self-hosted: tier is NOT per-user — everyone on this instance is Pro
# if ANTHROPIC_API_KEY is set (or AI_PROVIDER=mock), else everyone is Standard.
SELF_HOSTED=false
```

- [ ] **Step 2: Add the `App.PageData` interface**

```ts
// apps/web/src/app.d.ts
import type PocketBase from "pocketbase";
import type { Tier } from "@readmepls/types";

declare global {
  namespace App {
    interface Locals {
      pb: PocketBase;
      userId: string | null;
    }
    interface PageData {
      tier: Tier | null;
      selfHosted: boolean;
    }
  }
}

export {};
```

This task has no independent test — it's type-only scaffolding + a documented env default, consumed and exercised by Task 9's tests.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @readmepls/web exec tsc -p tsconfig.json --noEmit --pretty`
Expected: no new errors from this file (pre-existing unrelated errors, if any, are not this task's concern).

- [ ] **Step 4: Commit**

```bash
git add .env.example apps/web/src/app.d.ts
git commit -m "feat(web): declare SELF_HOSTED env var and App.PageData tier shape"
```

---

## Task 9: `+layout.server.ts` — resolve the viewer's tier once, app-wide

**Files:**
- Create: `apps/web/src/routes/+layout.server.ts`
- Create: `apps/web/src/routes/+layout.server.test.ts`

**Interfaces:**
- Consumes: `resolveTier`/`TierConfig` (Task 2), `locals.pb`/`locals.userId` (existing, set in `hooks.server.ts`).
- Produces: `PageData` (`{ tier, selfHosted }`), available to every route via `$page.data` — consumed by Task 10 (`ArticleCard`) and Task 12 (`/profile`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/routes/+layout.server.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { load } from "./+layout.server.js";

afterEach(() => vi.unstubAllEnvs());

function locals(userId: string | null, userRecord?: Record<string, unknown>) {
  return {
    userId,
    pb: { authStore: { model: userRecord ?? null } },
  } as never;
}

describe("root layout load", () => {
  it("returns tier: null and selfHosted: false when logged out", async () => {
    const data = await load({ locals: locals(null) } as never);
    expect(data).toEqual({ tier: null, selfHosted: false });
  });

  it("hosted SaaS: resolves the logged-in user's own tier", async () => {
    vi.stubEnv("SELF_HOSTED", "false");
    const data = await load({ locals: locals("u1", { tier: "pro" }) } as never);
    expect(data).toEqual({ tier: "pro", selfHosted: false });
  });

  it("self-hosted with a key configured: resolves pro regardless of user.tier", async () => {
    vi.stubEnv("SELF_HOSTED", "true");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const data = await load({ locals: locals("u1", { tier: "standard" }) } as never);
    expect(data).toEqual({ tier: "pro", selfHosted: true });
  });

  it("self-hosted with no key configured: resolves standard regardless of user.tier", async () => {
    vi.stubEnv("SELF_HOSTED", "true");
    const data = await load({ locals: locals("u1", { tier: "pro" }) } as never);
    expect(data).toEqual({ tier: "standard", selfHosted: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/routes/+layout.server.test.ts`
Expected: FAIL — cannot find module `./+layout.server.js`.

- [ ] **Step 3: Implement the load function**

```ts
// apps/web/src/routes/+layout.server.ts
import type { LayoutServerLoad } from "./$types";
import { resolveTier, type TierConfig } from "@readmepls/core";
import type { Tier } from "@readmepls/types";

export const load: LayoutServerLoad = async ({ locals }) => {
  const selfHosted = process.env.SELF_HOSTED === "true";
  const config: TierConfig = {
    selfHosted,
    aiProviderConfigured: Boolean(process.env.ANTHROPIC_API_KEY) || process.env.AI_PROVIDER === "mock",
  };

  const userRecord = locals.pb.authStore.model as { tier?: Tier } | null;
  if (!userRecord) return { tier: null, selfHosted };

  const tier = resolveTier({ tier: userRecord.tier ?? "standard" }, config);
  return { tier, selfHosted };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/routes/+layout.server.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/+layout.server.ts apps/web/src/routes/+layout.server.test.ts
git commit -m "feat(web): resolve viewer tier + selfHosted flag in the root layout load"
```

---

## Task 10: Gate `ArticleCard`'s AI tags behind Pro

**Files:**
- Modify: `apps/web/src/__mocks__/app-stores.ts`
- Modify: `apps/web/src/lib/components/ArticleCard.svelte`
- Modify: `apps/web/src/lib/components/ArticleCard.test.ts`

**Interfaces:**
- Consumes: `$page.data.tier` (Task 9, via `$app/stores`).

- [ ] **Step 1: Make the `$app/stores` mock settable (readable → writable)**

```ts
// apps/web/src/__mocks__/app-stores.ts
// Stub for $app/stores in vitest component tests.
// Real implementation is supplied by SvelteKit's Vite plugin at build time.
// `page` is writable so tests can call page.set({...}) to control page.data
// (e.g. viewer tier) before rendering a component that reads $page.
import { writable } from "svelte/store";

export const page = writable({
  params: {} as Record<string, string>,
  url: new URL("http://localhost/"),
  route: { id: null as string | null },
  status: 200,
  error: null,
  data: {} as Record<string, unknown>,
  form: null,
  state: {} as Record<string, unknown>,
});

export const navigating = writable(null);
export const updated = { subscribe: writable(false).subscribe, check: async () => false };
```

- [ ] **Step 2: Update `ArticleCard.test.ts` — reset the store per test, default to pro so unrelated existing assertions keep passing, add the new gating test (RED for the new test)**

```ts
// apps/web/src/lib/components/ArticleCard.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { page } from "$app/stores";
import ArticleCard from "./ArticleCard.svelte";

const article = (content: unknown) => ({
  id: "a1",
  url: "https://example.com/p",
  expand: content ? { content } : undefined,
});

const basePageValue = {
  params: {} as Record<string, string>,
  url: new URL("http://localhost/"),
  route: { id: null as string | null },
  status: 200,
  error: null,
  data: {} as Record<string, unknown>,
  form: null,
  state: {} as Record<string, unknown>,
};

// Most of these tests are about card states/actions unrelated to tiering —
// default to pro so their existing assertions (AI tags visible) don't change.
beforeEach(() => page.set({ ...basePageValue, data: { tier: "pro" } }));

describe("ArticleCard", () => {
  it("links the whole card to the reader when ready", () => {
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: ["ai"] }),
    });
    const link = screen.getByRole("link", { name: /hello/i });
    expect(link).toHaveAttribute("href", "/read/a1");
    expect(screen.getByText("ai")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /read/i })).not.toBeInTheDocument();
  });

  it("shows a processing indicator when not yet extracted", () => {
    render(ArticleCard, { article: article(null) });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the reason and a retry button when failed", async () => {
    const onRetry = vi.fn();
    render(ArticleCard, {
      article: article({ extract_status: "failed", title: "X", failure_reason: "boom" }),
      onRetry,
    });
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledWith("a1");
  });

  it("does not render a delete button without an onDelete handler", () => {
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }),
    });
    expect(screen.queryByRole("button", { name: "delete article" })).not.toBeInTheDocument();
  });

  it("opens a confirm dialog and fires onDelete when confirmed", async () => {
    const onDelete = vi.fn();
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }),
      onDelete,
    });
    await fireEvent.click(screen.getByRole("button", { name: "delete article" }));
    expect(screen.getByText(/can't be undone/i)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "delete" }));
    expect(onDelete).toHaveBeenCalledWith("a1");
  });

  it("shows the hostname (not the full path) while processing", () => {
    render(ArticleCard, {
      article: {
        id: "a2",
        url: "https://example.com/some/very/long/path?x=1",
        expand: undefined,
      },
    });
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.queryByText(/some\/very\/long\/path/)).not.toBeInTheDocument();
  });

  it("hides AI tags for a standard-tier viewer even when content has them", () => {
    page.set({ ...basePageValue, data: { tier: "standard" } });
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: ["ai", "ml"] }),
    });
    expect(screen.queryByText("ai")).not.toBeInTheDocument();
    expect(screen.queryByText("ml")).not.toBeInTheDocument();
  });

  it("shows AI tags for a pro-tier viewer", () => {
    page.set({ ...basePageValue, data: { tier: "pro" } });
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: ["ai"] }),
    });
    expect(screen.getByText("ai")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify the new cases fail**

Run: `pnpm exec vitest run apps/web/src/lib/components/ArticleCard.test.ts`
Expected: FAIL — "hides AI tags for a standard-tier viewer" fails because `ArticleCard` doesn't read tier yet and still renders all `ai_tags_json` entries.

- [ ] **Step 4: Gate the tags in `ArticleCard.svelte`**

```svelte
<!-- apps/web/src/lib/components/ArticleCard.svelte — script section -->
<script lang="ts">
  import Card from "./ui/Card.svelte";
  import Tag from "./ui/Tag.svelte";
  import Button from "./ui/Button.svelte";
  import Spinner from "./ui/Spinner.svelte";
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
  import { RotateCw, Trash2 } from "@lucide/svelte";
  import { deriveCardState } from "$lib/article/card-state.js";
  import { page } from "$app/stores";

  let {
    article,
    onRetry,
    onDelete,
  }: {
    // any: PocketBase SDK returns expand records as loosely-typed RecordModel; narrowing here would duplicate the full content schema.
    article: { id: string; url: string; expand?: { content?: any } };
    onRetry?: (id: string) => void;
    onDelete?: (id: string) => void;
  } = $props();

  let confirming = $state(false);

  const content = $derived(article.expand?.content ?? null);
  const state = $derived(deriveCardState(content));
  // AI tags are a Pro feature — a standard-tier viewer never sees them, even
  // if this shared content row has them (e.g. a different, pro-tier user
  // captured this URL first). See docs/superpowers/specs/2026-07-02-phase-8-tiering-entitlements-design.md §3.
  const isPro = $derived($page.data.tier === "pro");
  const tags = $derived<string[]>(isPro ? (content?.ai_tags_json ?? []) : []);

  // Show a clean hostname while processing; fall back to the raw URL if it
  // can't be parsed (e.g. malformed input mid-capture).
  function hostOf(u: string): string {
    try { return new URL(u).hostname; } catch { return u; }
  }
</script>
```

The rest of the file (markup, styles) is unchanged.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/components/ArticleCard.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Run the full web test suite to catch any other consumer of the now-writable store**

Run: `pnpm exec vitest run apps/web`
Expected: PASS — no other test relies on `page` being a plain `readable` in a way that breaks with `writable`'s superset API.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/__mocks__/app-stores.ts apps/web/src/lib/components/ArticleCard.svelte apps/web/src/lib/components/ArticleCard.test.ts
git commit -m "feat(web): hide AI tags from standard-tier viewers on article cards"
```

---

## Task 11: Gate AI tags/summary in Markdown export

**Files:**
- Modify: `apps/web/src/lib/server/export.ts`
- Modify: `apps/web/src/lib/server/export.test.ts`
- Modify: `apps/web/src/routes/api/export/+server.ts`
- Modify: `apps/web/src/routes/api/export/server.test.ts`

**Interfaces:**
- Consumes: `Tier` (Task 1), `resolveTier`/`TierConfig` (Task 2).
- Produces: `loadArticleExports(pb, ids, tier)` — same return shape as before, gains a required third parameter.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/server/export.test.ts`, inside `describe("loadArticleExports", ...)`:

```ts
  it("hides aiTags and summary for a standard-tier caller", async () => {
    const { pb } = fakePb(
      { highlights: [], article_tags: [] },
      {
        a1: {
          id: "a1", url: "https://x.test/p", status: "unread", created: "2026",
          expand: {
            content: {
              title: "T", ai_tags_json: ["ai", "ml"], content_html: "<p>x</p>",
              excerpt: "an ai summary", fetched_at: "2026",
            },
          },
        },
      }
    );
    const out = await loadArticleExports(pb, ["a1"], "standard");
    expect(out[0]!.aiTags).toEqual([]);
    expect(out[0]!.summary).toBe("");
    // Full body is unaffected — export still includes the complete article.
    expect(out[0]!.contentHtml).toBe("<p>x</p>");
  });

  it("keeps aiTags and summary for a pro-tier caller", async () => {
    const { pb } = fakePb(
      { highlights: [], article_tags: [] },
      {
        a1: {
          id: "a1", url: "https://x.test/p", status: "unread", created: "2026",
          expand: {
            content: {
              title: "T", ai_tags_json: ["ai", "ml"], content_html: "<p>x</p>",
              excerpt: "an ai summary", fetched_at: "2026",
            },
          },
        },
      }
    );
    const out = await loadArticleExports(pb, ["a1"], "pro");
    expect(out[0]!.aiTags).toEqual(["ai", "ml"]);
    expect(out[0]!.summary).toBe("an ai summary");
  });
```

Also update the two pre-existing calls in that same file to pass a tier so they keep compiling and keep their original (pro-equivalent) behavior:

```ts
// apps/web/src/lib/server/export.test.ts — existing "skips ids the user does not own" test
    const out = await loadArticleExports(pb, ["a1", "missing"], "pro");
```

```ts
// apps/web/src/lib/server/export.test.ts — existing "maps snake_case PB fields..." test
    const out = await loadArticleExports(pb, ["a1"], "pro");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/server/export.test.ts`
Expected: FAIL — TS error/runtime mismatch: `loadArticleExports` doesn't accept a third argument yet, and the two new tests get unfiltered `aiTags`/`summary` back.

- [ ] **Step 3: Add the `tier` parameter and gate the fields**

```ts
// apps/web/src/lib/server/export.ts — update the import line to include Tier:
import { Highlight, Content, ArticleStatus, Tier } from "@readmepls/types";
```

```ts
// apps/web/src/lib/server/export.ts — update the function signature and the two gated fields
export async function loadArticleExports(
  pb: PocketBase,
  ids: string[],
  tier: Tier,
): Promise<ArticleExport[]> {
```

(the body stays the same down to the `out.push` call; only these two lines inside it change)

```ts
      aiTags: tier === "pro" && Array.isArray(c?.ai_tags_json) ? (c!.ai_tags_json as string[]) : [],
      summary: tier === "pro" ? ((c?.excerpt as string) ?? "") : "",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/server/export.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Wire the route to resolve and pass the caller's tier — write the failing route test first**

Update `apps/web/src/routes/api/export/server.test.ts`'s `call` helper and add a coverage test:

```ts
// apps/web/src/routes/api/export/server.test.ts — replace the `call` helper
function call(scope: string, userRecord: Record<string, unknown> = { tier: "pro" }) {
  const url = new URL(`http://localhost/api/export?${scope}`);
  const locals = {
    userId: "u1",
    pb: { authStore: { token: "tok", model: userRecord } },
  } as never;
  return GET({ url, locals } as never);
}
```

Add this test:

```ts
  it("resolves the caller's tier and passes it to loadArticleExports", async () => {
    (resolveArticleIds as ReturnType<typeof vi.fn>).mockResolvedValue(["id1"]);
    (loadArticleExports as ReturnType<typeof vi.fn>).mockResolvedValue([article()]);
    await call("scope=single&id=id1", { tier: "standard" });
    expect(loadArticleExports).toHaveBeenCalledWith(expect.anything(), ["id1"], "standard");
  });
```

Every other existing `call(...)` invocation in this file keeps its default (`{ tier: "pro" }`) and needs no change.

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/routes/api/export/server.test.ts`
Expected: FAIL — the route doesn't call `loadArticleExports` with a third argument yet, and `locals.pb.authStore.model` isn't read at all.

- [ ] **Step 7: Update the route**

```ts
// apps/web/src/routes/api/export/+server.ts
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import JSZip from "jszip";
import { getConnector, resolveTier, type TierConfig } from "@readmepls/core";
import type { Tier } from "@readmepls/types";
import { resolveArticleIds, loadArticleExports, type Scope } from "$lib/server/export.js";

const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";

function must(url: URL, key: string): string {
  const v = url.searchParams.get(key);
  if (!v) throw error(400, `missing ${key}`);
  return v;
}

function parseScope(url: URL): Scope {
  const kind = url.searchParams.get("scope") ?? "library";
  if (kind === "single") return { kind: "single", id: must(url, "id") };
  if (kind === "collection") return { kind: "collection", id: must(url, "id") };
  if (kind === "filter")
    return { kind: "filter", tag: url.searchParams.get("tag"), q: url.searchParams.get("q") };
  return { kind: "library" };
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.userId) throw error(401, "unauthenticated");
  const scope = parseScope(url);

  const ids = await resolveArticleIds(locals.pb, scope, PB_URL, locals.pb.authStore.token);
  if (ids.length === 0) throw error(404, "nothing to export");

  const config: TierConfig = {
    selfHosted: process.env.SELF_HOSTED === "true",
    aiProviderConfigured: Boolean(process.env.ANTHROPIC_API_KEY) || process.env.AI_PROVIDER === "mock",
  };
  const userRecord = locals.pb.authStore.model as { tier?: Tier } | null;
  const tier: Tier = resolveTier({ tier: userRecord?.tier ?? "standard" }, config);

  const articles = await loadArticleExports(locals.pb, ids, tier);
  if (articles.length === 0) throw error(404, "nothing to export");

  const connector = getConnector("markdown");
  if (!connector) throw error(500, "markdown connector unavailable");
  const result = await connector.export(articles);

  if (scope.kind === "single") {
    if (result.files.length === 0 || result.failures.length > 0) {
      throw error(422, result.failures[0]?.reason ?? "export failed");
    }
    const f = result.files[0]!;
    return new Response(f.contents, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${f.filename}"`,
      },
    });
  }

  const zip = new JSZip();
  for (const f of result.files) zip.file(f.filename, f.contents);
  if (result.failures.length > 0) {
    const report =
      ["# Export report", "", "These articles could not be exported:", ""]
        .concat(result.failures.map((x) => `- ${x.title} (${x.url}) — ${x.reason}`))
        .join("\n") + "\n";
    zip.file("_export-report.md", report);
  }
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new Response(bytes, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="readmepls-export.zip"`,
    },
  });
};
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/routes/api/export/server.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/server/export.ts apps/web/src/lib/server/export.test.ts apps/web/src/routes/api/export/+server.ts apps/web/src/routes/api/export/server.test.ts
git commit -m "feat(web): gate AI tags/summary in markdown export behind pro tier"
```

---

## Task 12: `/profile` page — tier badge + self-serve toggle

**Files:**
- Create: `apps/web/src/routes/profile/+page.svelte`
- Create: `apps/web/src/routes/profile/page.test.ts`
- Modify: `apps/web/src/lib/components/TopBar.svelte`
- Modify: `apps/web/src/lib/components/topbar.test.ts`

**Interfaces:**
- Consumes: `$page.data.tier`/`$page.data.selfHosted` (Task 9), `browserPb()` (existing, `$lib/pb.js`).

- [ ] **Step 1: Write the failing page test**

```ts
// apps/web/src/routes/profile/page.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { page } from "$app/stores";
import ProfilePage from "./+page.svelte";

const basePageValue = {
  params: {} as Record<string, string>,
  url: new URL("http://localhost/profile"),
  route: { id: "/profile" as string | null },
  status: 200,
  error: null,
  data: {} as Record<string, unknown>,
  form: null,
  state: {} as Record<string, unknown>,
};

const update = vi.fn(async () => ({}));
vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: { model: { id: "u1", tier: "standard" } },
    collection: () => ({ update }),
  }),
}));
vi.mock("$app/navigation", () => ({ invalidateAll: vi.fn() }));

beforeEach(() => update.mockClear());

describe("/profile", () => {
  it("hosted SaaS, standard tier: shows a Go Pro toggle", () => {
    page.set({ ...basePageValue, data: { tier: "standard", selfHosted: false } });
    render(ProfilePage);
    expect(screen.getByText(/standard/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go pro/i })).toBeInTheDocument();
  });

  it("hosted SaaS: clicking the toggle flips tier and refreshes layout data", async () => {
    page.set({ ...basePageValue, data: { tier: "standard", selfHosted: false } });
    render(ProfilePage);
    await fireEvent.click(screen.getByRole("button", { name: /go pro/i }));
    expect(update).toHaveBeenCalledWith("u1", { tier: "pro" });
  });

  it("hosted SaaS, pro tier: shows a downgrade toggle", () => {
    page.set({ ...basePageValue, data: { tier: "pro", selfHosted: false } });
    render(ProfilePage);
    expect(screen.getByText(/^pro$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to standard/i })).toBeInTheDocument();
  });

  it("self-hosted: shows the operator-set tier with no toggle", () => {
    page.set({ ...basePageValue, data: { tier: "pro", selfHosted: true } });
    render(ProfilePage);
    expect(screen.getByText(/^pro$/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /go pro/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back to standard/i })).not.toBeInTheDocument();
    expect(screen.getByText(/set by this instance's operator/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/routes/profile/page.test.ts`
Expected: FAIL — cannot find module `./+page.svelte`.

- [ ] **Step 3: Implement the profile page**

```svelte
<!-- apps/web/src/routes/profile/+page.svelte -->
<script lang="ts">
  import { page } from "$app/stores";
  import { invalidateAll } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import Button from "$lib/components/ui/Button.svelte";

  const pb = browserPb();

  const tier = $derived(($page.data.tier ?? "standard") as "standard" | "pro");
  const selfHosted = $derived(Boolean($page.data.selfHosted));

  async function setTier(next: "standard" | "pro") {
    const uid = pb.authStore.model?.id;
    if (!uid) return;
    await pb.collection("users").update(uid, { tier: next });
    // Refresh the root layout's data so every $page.data.tier consumer
    // (e.g. ArticleCard's AI tag gate) picks up the change immediately.
    await invalidateAll();
  }
</script>

<svelte:head><title>profile</title></svelte:head>

<section class="profile">
  <h1>profile</h1>

  <div class="tier-row">
    <span class="label">plan</span>
    <span class="badge" data-tier={tier}>{tier}</span>
  </div>

  {#if selfHosted}
    <p class="note">this instance's plan is set by this instance's operator, not by you.</p>
  {:else if tier === "standard"}
    <Button variant="accent" onclick={() => setTier("pro")}>go pro</Button>
  {:else}
    <Button onclick={() => setTier("standard")}>back to standard</Button>
  {/if}
</section>

<style>
  .profile {
    max-width: var(--width-narrow);
    margin: 0 auto;
    padding: var(--space-6) var(--space-5);
  }
  h1 {
    font-family: var(--font-ui);
    font-size: var(--text-xl);
    color: var(--color-text);
    margin: 0 0 var(--space-5);
  }
  .tier-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }
  .label {
    font-family: var(--font-ui);
    color: var(--color-text-muted);
  }
  .badge {
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: 0.2rem 0.7rem;
    border-radius: var(--radius-pill);
    background: var(--color-accent-wash);
    color: var(--color-text);
    text-transform: capitalize;
  }
  .note {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/routes/profile/page.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add a `/profile` link to `TopBar` — write the failing test first**

Add to `apps/web/src/lib/components/topbar.test.ts` (check the existing file's render-prop pattern first; it renders `TopBar` with `{ theme, onTheme, onSignOut }` per the component's existing props):

```ts
  it("links to the profile page", () => {
    render(TopBar, { theme: "light", onTheme: vi.fn(), onSignOut: vi.fn() });
    expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/profile");
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/topbar.test.ts`
Expected: FAIL — no profile link exists yet.

- [ ] **Step 7: Add the link**

```svelte
<!-- apps/web/src/lib/components/TopBar.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { THEMES, type Theme } from "$lib/theme/theme.js";
  import { Search, Library, User, Sun, Moon, Coffee, LogOut } from "@lucide/svelte";
  <!-- (User added to the icon import) -->
```

```svelte
  <nav>
    <a href="/library"><Library class="icon-sm" aria-hidden="true" />library</a>
    <a href="/profile"><User class="icon-sm" aria-hidden="true" />profile</a>
  </nav>
```

(Everything else in the file — script logic, remaining markup, styles — is unchanged.)

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/components/topbar.test.ts`
Expected: PASS

- [ ] **Step 9: Run the full web suite**

Run: `pnpm exec vitest run apps/web`
Expected: PASS — everything green, including Tasks 9-11's tests.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/routes/profile/+page.svelte apps/web/src/routes/profile/page.test.ts apps/web/src/lib/components/TopBar.svelte apps/web/src/lib/components/topbar.test.ts
git commit -m "feat(web): add minimal /profile page with self-serve tier toggle"
```

---

## Task 13: Tenant isolation — a user can only change their own tier

**Files:**
- Create: `packages/core/src/pb/tier-self-update.test.ts`

**Interfaces:**
- Consumes: `startEphemeralPb`, `makeTestUser` (existing, Task 4-updated).

This proves PocketBase's existing default `users` auth-collection rule (`@request.auth.id = id`, unchanged by this phase) actually scopes the write the profile page's `setTier` relies on — the security boundary is PocketBase's rule, not the client (per this repo's security-boundary convention), so it must have an explicit test.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/pb/tier-self-update.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "./test-harness.js";
import PocketBase from "pocketbase";

let h: PbHandle;
beforeAll(async () => {
  h = await startEphemeralPb();
}, 30000);
afterAll(() => h?.stop());

async function makeUser(email: string): Promise<{ id: string; client: PocketBase }> {
  const u = await h.pb.collection("users").create({
    email, password: "password12345", passwordConfirm: "password12345",
    tier: "standard", monthly_quota_used: 0,
  });
  const client = new PocketBase(h.url);
  await client.collection("users").authWithPassword(email, "password12345");
  return { id: u.id, client };
}

describe("tier self-update isolation", () => {
  it("a user can update their own tier", async () => {
    const a = await makeUser(`tiera${Date.now()}@test.local`);
    await a.client.collection("users").update(a.id, { tier: "pro" });
    const reread = await h.pb.collection("users").getOne(a.id);
    expect(reread.tier).toBe("pro");
  });

  it("a user cannot update another user's tier", async () => {
    const owner = await makeUser(`tierb${Date.now()}@test.local`);
    const intruder = await makeUser(`tierc${Date.now()}@test.local`);
    await expect(
      intruder.client.collection("users").update(owner.id, { tier: "pro" })
    ).rejects.toThrow();
    const reread = await h.pb.collection("users").getOne(owner.id);
    expect(reread.tier).toBe("standard");
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `pnpm exec vitest run packages/core/src/pb/tier-self-update.test.ts`
Expected: this exercises PocketBase's **existing, unmodified** default auth-collection rules — no new migration is needed for this task. If both tests PASS immediately, that confirms the default rule already enforces this (consistent with the existing `setTheme` self-update code in `+layout.svelte` already relying on the same rule). If the second test FAILS (intruder's update succeeds), the `users` collection's `updateRule` needs tightening — investigate `pocketbase/pb_migrations/1718900000_init.js` for how `users` rules are set (PocketBase's auth collections default to `id = @request.auth.id` unless overridden) and add a migration to set `updateRule: "id = @request.auth.id"` explicitly if it's missing. Do not assume — run it and read the actual result.

- [ ] **Step 3: If Step 2 revealed a gap, close it with a migration; otherwise skip to Step 4**

(Conditional — only if needed; see Step 2's investigation branch. If needed, follow the existing migration file pattern from `pocketbase/pb_migrations/1719300000_article_tags_cascade.js` to set `users.updateRule = "id = @request.auth.id"` in a new migration, then re-run Step 2's test.)

- [ ] **Step 4: Confirm both tests pass**

Run: `pnpm exec vitest run packages/core/src/pb/tier-self-update.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pb/tier-self-update.test.ts
git commit -m "test(pb): verify tenant isolation on tier self-update"
```

---

## Final verification

- [ ] Run the entire workspace test suite: `pnpm exec vitest run`
- [ ] Typecheck: `pnpm typecheck`
- [ ] Lint: `pnpm lint`
- [ ] Manually sanity-check `/profile` in the browser (`pnpm --filter @readmepls/web dev`, sign in, visit `/profile`, toggle tier, confirm a library card's AI tags appear/disappear accordingly without a full page reload).
