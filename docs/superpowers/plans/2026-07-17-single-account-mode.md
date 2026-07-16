# Single-account self-host mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `SINGLE_ACCOUNT=true|false` env var that, on a self-hosted instance, locks signup to the first account created — enforced in PocketBase, reflected in the `/login` UI.

**Architecture:** A new PocketBase hook file blocks `users` create requests once one exists (when `SELF_HOSTED=true` and `SINGLE_ACCOUNT=true`) and exposes a public `GET /api/single-account/status` route. The web app's `/login` route fetches that status server-side and hides the sign-up toggle (showing a note instead) when locked.

**Tech Stack:** PocketBase JSVM hooks (Goja), raw SQL via `DynamicModel`, SvelteKit (Svelte 5 runes) server load + component, Zod, Vitest + @testing-library/svelte.

## Global Constraints

- Only takes effect when **both** `SELF_HOSTED=true` and `SINGLE_ACCOUNT=true` — never on the shared hosted SaaS.
- Lock condition: `users` collection has ≥1 record. Blocks all further creates regardless of how many already exist; existing accounts are untouched.
- Enforcement lives in PocketBase (the security boundary), never only in the client.
- TDD always — failing test before implementation, per repo working agreement.
- Small commits, Conventional Commits (`feat:`, `test:`, `docs:`).
- Never push or open a PR unless asked.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/core/src/pb/test-harness.ts` | Modify | `startEphemeralPb` accepts an `env` option so tests can boot PocketBase with custom env vars |
| `pocketbase/pb_hooks/single_account_lib.js` | Create | Shared `isLocked(app)` check, `require()`d by both handlers below — see Task 1 Step 4 note on why a plain top-level function doesn't work |
| `pocketbase/pb_hooks/single_account.pb.js` | Create | Blocks `users` creates past the first when locked; exposes `GET /api/single-account/status` |
| `packages/core/src/pb/single-account.test.ts` | Create | Integration tests against a real ephemeral PocketBase |
| `.env.example` | Modify | Documents `SINGLE_ACCOUNT=false` next to `SELF_HOSTED` |
| `apps/web/src/routes/login/+page.server.ts` | Create | Fetches lock status from PocketBase, returns `{ locked: boolean }` |
| `apps/web/src/routes/login/page.server.test.ts` | Create | Tests for the load function |
| `apps/web/src/routes/login/+page.svelte` | Modify | Hides sign-up toggle and shows a note when `data.locked` |
| `apps/web/src/routes/login/page.test.ts` | Create | Tests for the page's locked/unlocked rendering |

---

## Task 1: PocketBase enforcement — hook, status route, harness support, integration tests

**Files:**
- Modify: `packages/core/src/pb/test-harness.ts`
- Create: `pocketbase/pb_hooks/single_account_lib.js`
- Create: `pocketbase/pb_hooks/single_account.pb.js`
- Create: `packages/core/src/pb/single-account.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `startEphemeralPb(opts?: { dir?: string; migrationsDir?: string; env?: Record<string, string> }): Promise<PbHandle>` (adds `env` to the existing options). Produces the PocketBase route `GET /api/single-account/status` → `{ locked: boolean }`, and blocks `POST /api/collections/users/records` with a 403 when locked. Later tasks (web app) consume the status route.

- [ ] **Step 1: Add the `env` option to `startEphemeralPb`**

Read `packages/core/src/pb/test-harness.ts` first. Change the options type and the `spawn` call:

```typescript
export async function startEphemeralPb(
  opts: { dir?: string; migrationsDir?: string; env?: Record<string, string> } = {}
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
    { stdio: "ignore", env: { ...process.env, ...opts.env } }
  );

  await waitForHealth(url);
  const pb = new PocketBase(url);
  await pb.collection("_superusers").authWithPassword(SU_EMAIL, SU_PASS);

  return {
    url,
    pb,
    stop: () =>
      new Promise<void>((resolve) => {
        if (proc.exitCode !== null || proc.signalCode !== null) {
          resolve();
          return;
        }
        proc.once("exit", () => resolve());
        proc.kill("SIGKILL");
      }),
  };
}
```

Only the function signature and the `spawn(...)` call's third argument change — everything else in the file stays as-is.

- [ ] **Step 2: Write the failing integration test**

Create `packages/core/src/pb/single-account.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "./test-harness.js";
import PocketBase from "pocketbase";

async function statusOf(url: string): Promise<{ locked: boolean }> {
  const res = await fetch(`${url}/api/single-account/status`);
  return res.json();
}

function signup(url: string, email: string) {
  return new PocketBase(url).collection("users").create({
    email,
    password: "password12345",
    passwordConfirm: "password12345",
    tier: "standard",
    monthly_quota_used: 0,
  });
}

describe("single-account mode enabled", () => {
  let h: PbHandle;
  beforeAll(async () => {
    h = await startEphemeralPb({ env: { SELF_HOSTED: "true", SINGLE_ACCOUNT: "true" } });
  }, 30000);
  afterAll(() => h?.stop());

  it("locks signup after the first account, unlocked before", async () => {
    expect(await statusOf(h.url)).toEqual({ locked: false });

    await signup(h.url, `first-${Date.now()}@test.local`);

    expect(await statusOf(h.url)).toEqual({ locked: true });

    await expect(signup(h.url, `second-${Date.now()}@test.local`)).rejects.toThrow();
  });
});

describe("single-account mode disabled (control)", () => {
  let h: PbHandle;
  beforeAll(async () => {
    h = await startEphemeralPb({ env: { SELF_HOSTED: "true", SINGLE_ACCOUNT: "false" } });
  }, 30000);
  afterAll(() => h?.stop());

  it("allows a second signup when SINGLE_ACCOUNT is false", async () => {
    await signup(h.url, `a-${Date.now()}@test.local`);
    await expect(signup(h.url, `b-${Date.now()}@test.local`)).resolves.toBeDefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/pb/single-account.test.ts`
Expected: FAIL — `statusOf` returns a 404 body (route doesn't exist yet) so the first `toEqual({ locked: false })` assertion fails, and/or the second signup does not reject since nothing blocks it yet.

- [ ] **Step 4: Create the shared lock-check module and the PocketBase hook**

Hook/router callbacks in this PocketBase JSVM (Goja) run in an isolated
scope that cannot see top-level functions or variables defined elsewhere in
the same `.pb.js` file — confirmed empirically (a top-level `function`, and
even a same-statement IIFE closure, both throw `ReferenceError` when
referenced from inside a callback). `require()` of a *separate* file does
work and the required module gets full access to PocketBase's injected
globals (`$os`, `DynamicModel`, etc.) — also confirmed empirically. So the
shared check lives in its own file, `require()`d by both handlers.

Create `pocketbase/pb_hooks/single_account_lib.js` (note: no `.pb.js`
suffix — PocketBase only auto-loads `*.pb.js` files as hooks, so this file
is only loaded via explicit `require()`, never auto-executed):

```javascript
// single_account_lib.js — shared SINGLE_ACCOUNT lock check, required by
// single_account.pb.js. Deliberately NOT named *.pb.js: PocketBase only
// auto-loads that pattern as a hook file, and this one must only run via
// require() from within a callback (see the note in single_account.pb.js
// about why the check can't just be a top-level function in that file).

module.exports = {
  isLocked: function (app) {
    if ($os.getenv("SELF_HOSTED") !== "true" || $os.getenv("SINGLE_ACCOUNT") !== "true") {
      return false;
    }
    const result = new DynamicModel({ count: 0 });
    app.db().newQuery("SELECT COUNT(*) as count FROM users").one(result);
    return result.count > 0;
  }
};
```

Create `pocketbase/pb_hooks/single_account.pb.js`:

```javascript
// single_account.pb.js — SINGLE_ACCOUNT self-host lock. When SELF_HOSTED=true
// and SINGLE_ACCOUNT=true, the users collection accepts at most one record:
// the first signup succeeds, every create request after that is rejected,
// and GET /api/single-account/status reports the lock state so the web app
// can hide the sign-up UI. Enforcement lives here, not the client — see
// CLAUDE.md's "PocketBase API rules are the security boundary".
//
// NOTE: each handler below requires ./single_account_lib.js rather than
// calling a top-level function in this file — Goja does not expose
// top-level hook-file functions (or same-statement closures) to hook/router
// callbacks (the same limitation search.pb.js works around by inlining
// escapeHtml), but require() of a separate module does work.

onRecordCreateRequest((e) => {
  const lib = require(__hooks + "/single_account_lib.js");
  if (lib.isLocked(e.app)) {
    throw new ForbiddenError("This instance is locked to a single account.");
  }
  e.next();
}, "users");

routerAdd("GET", "/api/single-account/status", (e) => {
  const lib = require(__hooks + "/single_account_lib.js");
  return e.json(200, { locked: lib.isLocked(e.app) });
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/pb/single-account.test.ts`
Expected: PASS (2 test files, 2 tests).

- [ ] **Step 6: Document the env var**

In `.env.example`, immediately after the `SELF_HOSTED=false` line (inside the existing `# ---- Deployment mode ----` block), add:

```
# true = only the first account created can sign in; all further signups are
# rejected (both by the API and in the UI). Only takes effect when
# SELF_HOSTED=true. Leave false for a normal multi-user instance.
SINGLE_ACCOUNT=false
```

- [ ] **Step 7: Run the full workspace test suite**

Run: `pnpm test`
Expected: all test files pass, including the two new ones.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/pb/test-harness.ts packages/core/src/pb/single-account.test.ts pocketbase/pb_hooks/single_account_lib.js pocketbase/pb_hooks/single_account.pb.js .env.example
git commit -m "feat(pocketbase): add SINGLE_ACCOUNT self-host signup lock"
```

---

## Task 2: Web app — fetch lock status in `/login`'s server load

**Files:**
- Create: `apps/web/src/routes/login/+page.server.ts`
- Create: `apps/web/src/routes/login/page.server.test.ts`

**Interfaces:**
- Consumes: `GET /api/single-account/status` (Task 1) via `PB_URL` (same env var already read in `apps/web/src/hooks.server.ts`).
- Produces: `load: PageServerLoad` returning `{ locked: boolean }`, consumed by `+page.svelte` (Task 3) via `let { data } = $props()`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/login/page.server.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { load } from "./+page.server.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("login page load", () => {
  it("returns locked: false when the status endpoint reports unlocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ locked: false }) })
    );
    const data = await load({} as never);
    expect(data).toEqual({ locked: false });
  });

  it("returns locked: true when the status endpoint reports locked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ locked: true }) })
    );
    const data = await load({} as never);
    expect(data).toEqual({ locked: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/routes/login/page.server.test.ts`
Expected: FAIL — `./+page.server.js` doesn't exist yet.

- [ ] **Step 3: Create `+page.server.ts`**

```typescript
import PocketBase from "pocketbase";
import { z } from "zod";
import type { PageServerLoad } from "./$types";

const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";
const statusSchema = z.object({ locked: z.boolean() });

export const load: PageServerLoad = async () => {
  const pb = new PocketBase(PB_URL);
  const raw = await pb.send("/api/single-account/status", { method: "GET" });
  const { locked } = statusSchema.parse(raw);
  return { locked };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/routes/login/page.server.test.ts`
Expected: PASS (2 tests).

Note: `pb.send()` internally calls the global `fetch`, so stubbing `globalThis.fetch` in the test intercepts it without needing to mock the `pocketbase` package itself.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/login/+page.server.ts apps/web/src/routes/login/page.server.test.ts
git commit -m "feat(web): fetch single-account lock status on the login page"
```

---

## Task 3: Web app — hide sign-up when locked

**Files:**
- Modify: `apps/web/src/routes/login/+page.svelte`
- Create: `apps/web/src/routes/login/page.test.ts`

**Interfaces:**
- Consumes: `data: { locked: boolean }` (Task 2).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/routes/login/page.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Page from "./+page.svelte";

describe("login page — single-account lock", () => {
  it("shows the sign-up toggle when unlocked", () => {
    render(Page, { props: { data: { locked: false } } });
    expect(
      screen.getByRole("button", { name: /need an account\? sign up/i })
    ).toBeInTheDocument();
  });

  it("hides the sign-up toggle and shows a note when locked", () => {
    render(Page, { props: { data: { locked: true } } });
    expect(
      screen.queryByRole("button", { name: /need an account\? sign up/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/locked to one account/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/web/src/routes/login/page.test.ts`
Expected: FAIL — `+page.svelte` doesn't accept a `data` prop yet, so the toggle renders unconditionally in both cases and the locked-note text doesn't exist.

- [ ] **Step 3: Update `+page.svelte`**

Read `apps/web/src/routes/login/+page.svelte` first. Add the `data` prop and the `PageData` import, and replace the toggle button with a conditional:

```svelte
<script lang="ts">
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import { validateCredentials } from "$lib/auth/validate.js";
  import Input from "$lib/components/ui/Input.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const pb = browserPb();
  let email = $state("");
  let password = $state("");
  let mode = $state<"signin" | "signup">("signin");
  let err = $state("");

  async function submit() {
    err = validateCredentials(email, password) ?? "";
    if (err) return;
    try {
      if (mode === "signup") {
        await pb.collection("users").create({
          email, password, passwordConfirm: password, tier: "standard", monthly_quota_used: 0,
        });
      }
      await pb.collection("users").authWithPassword(email, password);
      await goto("/");
    } catch {
      err = mode === "signup" ? "Could not create account." : "Invalid email or password.";
    }
  }
</script>

<main>
  <div class="card">
    <h1>readme<span>pls</span></h1>
    <p class="tag">save any link. actually read it. pls.</p>
    <form onsubmit={(e) => { e.preventDefault(); submit(); }}>
      <Input bind:value={email} type="email" placeholder="email" />
      <Input bind:value={password} type="password" placeholder="password" />
      <Button type="submit" variant="accent">{mode === "signin" ? "sign in" : "sign up"}</Button>
      {#if err}<p role="alert" class="err">{err}</p>{/if}
    </form>
    {#if !data.locked}
      <button class="toggle" type="button" onclick={() => (mode = mode === "signin" ? "signup" : "signin")}>
        {mode === "signin" ? "need an account? sign up" : "have an account? sign in"}
      </button>
    {:else}
      <p class="locked-note">this instance is locked to one account.</p>
    {/if}
  </div>
</main>

<style>
  main { min-height: 100dvh; display: grid; place-items: center; background: var(--color-bg-gradient); padding: 1.5rem; }
  .card {
    position: relative; width: 100%; max-width: 380px; padding: 2rem 1.75rem;
    background: var(--color-surface); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
  }
  .card::after {
    content: ""; position: absolute; top: 0; right: 0; width: 40px; height: 40px;
    background: var(--color-fold); clip-path: polygon(100% 0, 0 0, 100% 100%);
    border-top-right-radius: var(--radius-xl);
  }
  h1 { font-family: var(--font-ui); font-size: 1.8rem; margin: 0; color: var(--color-text); }
  h1 span { color: var(--color-accent); }
  .tag { font-family: var(--font-ui); color: var(--color-text-muted); margin: 0.25rem 0 1.5rem; }
  form { display: flex; flex-direction: column; gap: 0.75rem; }
  .err { color: var(--color-danger); font-family: var(--font-ui); font-size: 0.9rem; margin: 0; }
  .toggle { margin-top: 1rem; background: none; border: none; color: var(--color-accent); font-family: var(--font-ui); cursor: pointer; padding: 0; }
  .toggle:hover { color: var(--color-accent-hover); }
  .toggle:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  .locked-note { margin-top: 1rem; color: var(--color-text-muted); font-family: var(--font-ui); font-size: 0.85rem; text-align: center; }
</style>
```

- [ ] **Step 4: Sync SvelteKit generated types**

The `PageData` type in `./$types` is generated from `+page.server.ts` — regenerate it before typechecking:

```bash
cd apps/web && pnpm exec svelte-kit sync && cd ../..
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/web/src/routes/login/page.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full web test suite to confirm nothing else broke**

Run: `pnpm test`
Expected: all test files pass.

- [ ] **Step 7: Manually verify in a browser**

Start PocketBase and the web app locally with the flag on:

```bash
SELF_HOSTED=true SINGLE_ACCOUNT=true pocketbase/pocketbase serve --http=127.0.0.1:8090 --migrationsDir=pocketbase/pb_migrations --hooksDir=pocketbase/pb_hooks &
SELF_HOSTED=true SINGLE_ACCOUNT=true PB_URL=http://127.0.0.1:8090 pnpm --filter @readmepls/web dev
```

Visit `/login`: confirm the "need an account? sign up" toggle is visible (no account exists yet). Sign up with a test email. Log out (or open a new incognito window) and revisit `/login`: confirm the toggle is gone and "this instance is locked to one account." is shown. Confirm the layout is usable at a 360px-wide viewport (browser device toolbar). Stop both background processes when done.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/routes/login/+page.svelte apps/web/src/routes/login/page.test.ts
git commit -m "feat(web): hide sign-up on the login page when single-account is locked"
```

---

## Final verification (after all tasks)

- [ ] Run `pnpm test` — all pass.
- [ ] Run `pnpm typecheck` and `pnpm lint` — both clean.
- [ ] Manual browser check from Task 3 Step 7 confirms the golden path: first signup works, toggle disappears afterward, note is shown, 360px layout is clean.
- [ ] Delete this plan and its paired spec (`docs/superpowers/specs/2026-07-17-single-account-mode-design.md`) once merged, per the repo's working agreement on parked/shipped plans.
