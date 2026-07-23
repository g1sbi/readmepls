# E2E Core Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Playwright e2e suite guarding the six core user flows, and gate image publishing on it.

**Architecture:** Specs live in root `e2e/`, excluded from vitest automatically because `vitest.workspace.ts` globs only `packages/*` and `apps/*`. Three tiers split by setup cost: a setup project that authenticates once and saves `storageState`; one serial spec running the real capture pipeline; and parallel specs operating on directly-seeded articles. The worker's outbound HTTP is swapped for a fixture fetcher via an env-selected seam mirroring the existing `selectAiProvider`/`selectEmbedder` pattern, so the SSRF guard is never weakened. CI builds images without pushing, runs the suite against them, and pushes only on green.

**Tech Stack:** Playwright, TypeScript, PocketBase, SvelteKit, Vitest (for the fetcher unit tests), Docker Compose, GitHub Actions.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-21-e2e-core-flows-design.md`
- TypeScript strict. No `any` without a written reason.
- TDD: failing test first, then implementation. Applies to the fetcher seam (Task 2); the e2e specs themselves are the tests.
- Conventional Commits, one logical change per commit. Pre-1.0: `feat:`/`fix:` bump patch. Do not use `!` or `BREAKING CHANGE:`.
- Worker e2e env: `AI_PROVIDER=mock`, `EMBED_PROVIDER=fake`, `FETCH_PROVIDER=fixture`.
- Web e2e env: `SELF_HOSTED=true` (skips the `/verify` email gate).
- Never hardcode a color or font in a component — reference a token in `apps/web/src/lib/styles/tokens.css`. (Relevant only if instrumentation touches markup styling; it should not.)
- Do not repoint `@readmepls/core` or `@readmepls/types` `main` at `dist`.
- Never push or open a PR unless asked. Local commits only.

---

### Task 1: Playwright harness and local stack orchestration

Installs Playwright, adds config with the three-project structure, and a script that boots PocketBase + web + worker locally. Deliverable: `pnpm e2e` boots the stack and passes a trivial spec.

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/support/stack.ts`
- Create: `e2e/support/global-setup.ts`
- Create: `e2e/support/global-teardown.ts`
- Create: `e2e/smoke.spec.ts`
- Modify: `package.json` (add `e2e` script + devDependency)
- Modify: `.gitignore` (ignore Playwright output)

**Interfaces:**
- Consumes: `startEphemeralPb` from `@readmepls/core/src/pb/test-harness.js` — `startEphemeralPb(opts?: { dir?, migrationsDir?, env? }): Promise<PbHandle>` where `PbHandle = { url: string; pb: PocketBase; stop: () => Promise<void> }`. Note the `/src/` segment and the `.js` extension: core's export map is `{"./*": "./*"}`, so the specifier maps literally to the on-disk path. This is the form every existing consumer uses (see `apps/worker/src/run-loop.test.ts:4`).
- Produces: `E2E_BASE_URL` convention (defaults to `http://127.0.0.1:4173`); `e2e/support/stack.ts` exporting `startStack(): Promise<StackHandle>` and `StackHandle = { baseUrl: string; pbUrl: string; stop: () => Promise<void> }`.
- Produces: `globalSetup`/`globalTeardown` wiring so `pnpm e2e` is self-contained locally, and a no-op when `E2E_BASE_URL` is set (CI drives its own stack).

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -Dw @playwright/test@^1.48.0
pnpm exec playwright install chromium
```

- [ ] **Step 2: Add the `e2e` script to `package.json`**

Add to the `scripts` block in `package.json`:

```json
"e2e": "playwright test",
"e2e:ui": "playwright test --ui"
```

- [ ] **Step 3: Ignore Playwright output**

Append to `.gitignore`:

```
# Playwright
/test-results/
/playwright-report/
/e2e/.auth/
```

- [ ] **Step 4: Write the stack orchestrator**

Create `e2e/support/stack.ts`:

```ts
import { spawn, type ChildProcess } from "node:child_process";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";

export interface StackHandle {
  baseUrl: string;
  pbUrl: string;
  stop: () => Promise<void>;
}

const WEB_PORT = 4173;
const WORKER_SEARCH_PORT = 8091;
const SEARCH_SECRET = "e2e-search-secret";

/**
 * Boot PocketBase + web preview + worker for a local e2e run. CI does not call
 * this — it sets E2E_BASE_URL at an already-running compose stack instead.
 */
export async function startStack(): Promise<StackHandle> {
  const pb: PbHandle = await startEphemeralPb();

  const worker = spawn("node", ["apps/worker/dist/main.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      PB_URL: pb.url,
      PB_WORKER_EMAIL: "worker@test.local",
      PB_WORKER_PASSWORD: "password12345",
      AI_PROVIDER: "mock",
      EMBED_PROVIDER: "fake",
      FETCH_PROVIDER: "fixture",
      FIXTURE_DIR: "e2e/fixtures",
      WORKER_POLL_MS: "500",
      WORKER_SEARCH_SECRET: SEARCH_SECRET,
      WORKER_HTTP_PORT: String(WORKER_SEARCH_PORT),
    },
  });

  const web = spawn("pnpm", ["--filter", "@readmepls/web", "preview", "--port", String(WEB_PORT)], {
    stdio: "inherit",
    env: {
      ...process.env,
      PUBLIC_PB_URL: pb.url,
      PB_URL: pb.url,
      SELF_HOSTED: "true",
      WORKER_SEARCH_SECRET: SEARCH_SECRET,
      WORKER_SEARCH_URL: `http://127.0.0.1:${WORKER_SEARCH_PORT}`,
    },
  });

  const baseUrl = `http://127.0.0.1:${WEB_PORT}`;
  await waitForHttp(baseUrl);

  return {
    baseUrl,
    pbUrl: pb.url,
    stop: async () => {
      await Promise.all([kill(worker), kill(web)]);
      await pb.stop();
    },
  };
}

function kill(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) return resolve();
    proc.once("exit", () => resolve());
    proc.kill("SIGKILL");
  });
}

async function waitForHttp(url: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`web never responded at ${url}`);
}
```

- [ ] **Step 5: Write the global setup and teardown**

These make `pnpm e2e` self-contained locally, and no-ops in CI where the compose stack is already up.

Create `e2e/support/global-setup.ts`:

```ts
import { startStack, type StackHandle } from "./stack.js";

let handle: StackHandle | undefined;

export default async function globalSetup(): Promise<void> {
  // CI points E2E_BASE_URL at an already-running compose stack; only boot
  // a local stack when nobody has provided one.
  if (process.env.E2E_BASE_URL) return;
  handle = await startStack();
  process.env.E2E_BASE_URL = handle.baseUrl;
  // Teardown runs in a separate module instance, so stash the stop handle.
  (globalThis as { __e2eStack?: StackHandle }).__e2eStack = handle;
}
```

Create `e2e/support/global-teardown.ts`:

```ts
import type { StackHandle } from "./stack.js";

export default async function globalTeardown(): Promise<void> {
  const handle = (globalThis as { __e2eStack?: StackHandle }).__e2eStack;
  await handle?.stop();
}
```

- [ ] **Step 6: Write the Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "e2e",
  // support/ holds harness code, not specs.
  testIgnore: "**/support/**",
  globalSetup: "./e2e/support/global-setup.ts",
  globalTeardown: "./e2e/support/global-teardown.ts",
  // The capture spec waits on a real worker extraction; give it room.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
    },
  ],
});
```

- [ ] **Step 7: Write a trivial spec to prove the harness works**

Create `e2e/smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("the app serves a page", async ({ page }) => {
  const res = await page.goto("/login");
  expect(res?.status()).toBeLessThan(400);
});
```

Note: this spec belongs to the `chromium` project, which depends on `setup`. Task 3 creates `auth.setup.ts`. Until then the setup project matches no files, which Playwright treats as an empty (passing) project.

- [ ] **Step 8: Build the worker and web app**

The stack orchestrator runs built artifacts, so build first:

```bash
pnpm --filter @readmepls/worker build && pnpm --filter @readmepls/web build
```

Expected: both builds succeed.

- [ ] **Step 9: Run the suite**

```bash
pnpm e2e
```

Expected: `globalSetup` boots PocketBase, the worker, and the web preview (all three log startup), then `1 passed`, then teardown stops them. No second terminal needed.

If the web preview fails to bind, another process may hold port 4173 — `lsof -i :4173` to check.

- [ ] **Step 10: Commit**

```bash
git add playwright.config.ts e2e/ package.json pnpm-lock.yaml .gitignore
git commit -m "test: add playwright harness and local stack orchestration"
```

---

### Task 2: Fixture fetcher seam

Adds `FixtureFetcher` and `selectFetcher`, mirroring the existing `selectAiProvider`/`selectEmbedder` pattern, and wires it into `main.ts`. The SSRF guard is untouched.

**Why this is safe:** the rejected alternative (`SAFE_FETCH_ALLOW_PRIVATE`) would let a *user-supplied URL* reach internal addresses — a real SSRF hole. `FETCH_PROVIDER=fixture` serves only from a fixture directory and performs no network IO at all. Misconfiguring it in production breaks extraction loudly; it cannot exfiltrate anything.

**Files:**
- Create: `apps/worker/src/fetch/fixture-fetcher.ts`
- Create: `apps/worker/src/fetch/fixture-fetcher.test.ts`
- Create: `apps/worker/src/fetch/select-fetcher.ts`
- Create: `apps/worker/src/fetch/select-fetcher.test.ts`
- Create: `e2e/fixtures/manifest.json`
- Create: `e2e/fixtures/sample-article.html`
- Modify: `apps/worker/src/main.ts:55-60` (fetchHtml construction)
- Modify: `.env.example` (document `FETCH_PROVIDER` / `FIXTURE_DIR`)

**Interfaces:**
- Consumes: `createSafeFetchHtml` from `./safe-fetch.js` (existing).
- Produces:
  - `createFixtureFetchHtml(dir: string): (url: string) => Promise<string>`
  - `selectFetcher(env: { FETCH_PROVIDER?: string; FIXTURE_DIR?: string }, makeSafe: () => (url: string) => Promise<string>): (url: string) => Promise<string>`
  - Fixture manifest format: `{ "<url>": "<filename.html>" }` resolved relative to `FIXTURE_DIR`.
  - Fixture article title: `Deterministic Fixture Article` — Tasks 5 and 6 assert on this string.
  - Fixture search term: `quokka` — a token appearing in the fixture body and nowhere else, so `FakeEmbedder`'s bag-of-words ranking puts this article first.

- [ ] **Step 1: Write the failing test for the fixture fetcher**

Create `apps/worker/src/fetch/fixture-fetcher.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFixtureFetchHtml } from "./fixture-fetcher.js";

function fixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "fixtures-"));
  writeFileSync(join(dir, "a.html"), "<html><body><h1>Hello</h1></body></html>");
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({ "https://example.com/a": "a.html" })
  );
  return dir;
}

describe("createFixtureFetchHtml", () => {
  it("serves the mapped file for a known url", async () => {
    const fetchHtml = createFixtureFetchHtml(fixtureDir());
    await expect(fetchHtml("https://example.com/a")).resolves.toContain("<h1>Hello</h1>");
  });

  it("throws on an unmapped url so tests fail loudly", async () => {
    const fetchHtml = createFixtureFetchHtml(fixtureDir());
    await expect(fetchHtml("https://example.com/missing")).rejects.toThrow(
      /no fixture for/
    );
  });

  it("performs no network io", async () => {
    // A url that would be blocked by the SSRF guard resolves fine here,
    // proving the fixture path never reaches safe-fetch or the network.
    const dir = fixtureDir();
    writeFileSync(join(dir, "local.html"), "<p>local</p>");
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({ "http://127.0.0.1:9/x": "local.html" })
    );
    const fetchHtml = createFixtureFetchHtml(dir);
    await expect(fetchHtml("http://127.0.0.1:9/x")).resolves.toContain("local");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm exec vitest run fixture-fetcher
```

Expected: FAIL — `Failed to resolve import "./fixture-fetcher.js"`.

- [ ] **Step 3: Implement the fixture fetcher**

Create `apps/worker/src/fetch/fixture-fetcher.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Offline fetcher for the e2e suite: resolves a URL through a manifest to a
 * saved HTML file. Performs no network IO, so the SSRF guard needs no test
 * escape hatch — see docs/superpowers/specs/2026-07-21-e2e-core-flows-design.md.
 * An unmapped URL throws rather than returning empty, so a spec that captures
 * the wrong URL fails loudly instead of silently extracting nothing.
 */
export function createFixtureFetchHtml(dir: string): (url: string) => Promise<string> {
  return async (url: string): Promise<string> => {
    const manifest = JSON.parse(
      readFileSync(join(dir, "manifest.json"), "utf8")
    ) as Record<string, string>;
    const file = manifest[url];
    if (!file) throw new Error(`no fixture for ${url}`);
    return readFileSync(join(dir, file), "utf8");
  };
}
```

The manifest is read per call rather than cached so a spec can rewrite it between tests without restarting the worker.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm exec vitest run fixture-fetcher
```

Expected: `3 passed`.

- [ ] **Step 5: Write the failing test for the selector**

Create `apps/worker/src/fetch/select-fetcher.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { selectFetcher } from "./select-fetcher.js";

describe("selectFetcher", () => {
  it("returns the fixture fetcher for FETCH_PROVIDER=fixture without building the real one", () => {
    const makeSafe = vi.fn();
    const f = selectFetcher(
      { FETCH_PROVIDER: "fixture", FIXTURE_DIR: "e2e/fixtures" },
      makeSafe
    );
    expect(makeSafe).not.toHaveBeenCalled();
    expect(typeof f).toBe("function");
  });

  it("builds the safe fetcher by default", () => {
    const safe = async () => "<html></html>";
    const makeSafe = vi.fn(() => safe);
    expect(selectFetcher({}, makeSafe)).toBe(safe);
    expect(makeSafe).toHaveBeenCalledOnce();
  });

  it("throws when fixture mode is requested without a directory", () => {
    expect(() => selectFetcher({ FETCH_PROVIDER: "fixture" }, vi.fn())).toThrow(
      /FIXTURE_DIR/
    );
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
pnpm exec vitest run select-fetcher
```

Expected: FAIL — `Failed to resolve import "./select-fetcher.js"`.

- [ ] **Step 7: Implement the selector**

Create `apps/worker/src/fetch/select-fetcher.ts`:

```ts
import { createFixtureFetchHtml } from "./fixture-fetcher.js";

export type FetchHtml = (url: string) => Promise<string>;

/**
 * Pick the HTML fetcher from env, mirroring selectAiProvider/selectEmbedder.
 * `FETCH_PROVIDER=fixture` wires the offline FixtureFetcher used by the e2e
 * suite. Otherwise builds the real SSRF-guarded fetcher via the injected
 * factory — a thunk so fixture mode constructs no DNS/fetch machinery.
 */
export function selectFetcher(
  env: { FETCH_PROVIDER?: string; FIXTURE_DIR?: string },
  makeSafe: () => FetchHtml
): FetchHtml {
  if (env.FETCH_PROVIDER === "fixture") {
    if (!env.FIXTURE_DIR) {
      throw new Error("FETCH_PROVIDER=fixture requires FIXTURE_DIR");
    }
    return createFixtureFetchHtml(env.FIXTURE_DIR);
  }
  return makeSafe();
}
```

- [ ] **Step 8: Run the test to verify it passes**

```bash
pnpm exec vitest run select-fetcher
```

Expected: `3 passed`.

- [ ] **Step 9: Wire it into the worker entrypoint**

In `apps/worker/src/main.ts`, add the import alongside the existing fetch imports:

```ts
import { selectFetcher } from "./fetch/select-fetcher.js";
```

Then replace the existing `fetchHtml` construction:

```ts
  const fetchHtml = createSafeFetchHtml({
    lookup: async (host) =>
      (await dnsLookup(host, { all: true })).map((a) => a.address),
    fetchFn: (url) => fetch(url, { redirect: "manual" }),
  });
```

with:

```ts
  const fetchHtml = selectFetcher(process.env, () =>
    createSafeFetchHtml({
      lookup: async (host) =>
        (await dnsLookup(host, { all: true })).map((a) => a.address),
      fetchFn: (url) => fetch(url, { redirect: "manual" }),
    }),
  );
```

`fetchBytes` and `fetchRedirectTarget` stay on the real safe-fetch path — the article extractor only needs `fetchHtml`, and leaving the others untouched keeps the swap minimal.

- [ ] **Step 10: Create the fixture article**

Create `e2e/fixtures/sample-article.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <title>Deterministic Fixture Article</title>
    <meta name="author" content="E2E Fixture" />
  </head>
  <body>
    <article>
      <h1>Deterministic Fixture Article</h1>
      <p>
        The quokka is a small macropod native to Western Australia. This
        paragraph exists so the e2e suite has stable prose to highlight, and the
        word quokka appears nowhere else in the corpus so semantic search ranks
        this article first.
      </p>
      <p>
        A second paragraph gives the reader view enough text to render a
        realistic article body and a non-zero word count.
      </p>
    </article>
  </body>
</html>
```

- [ ] **Step 11: Create the fixture manifest**

Create `e2e/fixtures/manifest.json`:

```json
{
  "https://fixtures.e2e.test/sample-article": "sample-article.html"
}
```

This host is never resolved — the fixture fetcher short-circuits before any DNS lookup.

- [ ] **Step 12: Document the env vars**

Add to `.env.example`, near the `EMBED_PROVIDER` block:

```
# ---- e2e test fetcher (never set in production) ----
# FETCH_PROVIDER=fixture swaps the worker's outbound HTML fetch for saved
# fixtures read from FIXTURE_DIR. Used only by the Playwright suite; it performs
# no network IO, so the SSRF guard is unaffected.
FETCH_PROVIDER=
FIXTURE_DIR=
```

- [ ] **Step 13: Verify the whole worker suite still passes**

```bash
pnpm exec vitest run apps/worker && pnpm typecheck
```

Expected: all worker tests pass, typecheck clean.

- [ ] **Step 14: Commit**

```bash
git add apps/worker/src/fetch/ apps/worker/src/main.ts e2e/fixtures/ .env.example
git commit -m "feat(worker): add env-selected fixture fetcher for e2e"
```

---

### Task 3: Auth setup project (Tier 1)

Signs up and logs in once, saving `storageState` for every downstream spec. This is the only place the signup flow is asserted.

**Files:**
- Create: `e2e/auth.setup.ts`
- Create: `e2e/support/user.ts`
- Modify: `apps/web/src/routes/login/+page.svelte` (add testids)

**Interfaces:**
- Consumes: `storageState` path `e2e/.auth/user.json` from Task 1's config.
- Produces: `e2e/support/user.ts` exporting `TEST_USER: { email: string; password: string }` and `uniqueEmail(): string`.

- [ ] **Step 1: Add testids to the login form**

In `apps/web/src/routes/login/+page.svelte`, add `data-testid` attributes. The email/password inputs and the toggle:

```svelte
      <Input bind:value={email} type="email" placeholder="email" data-testid="auth-email" />
      <Input bind:value={password} type="password" placeholder="password" data-testid="auth-password" />
      <Button type="submit" variant="accent" data-testid="auth-submit">{mode === "signin" ? "sign in" : "sign up"}</Button>
```

and on the mode toggle button:

```svelte
      <button class="toggle" type="button" data-testid="auth-toggle" onclick={() => (mode = mode === "signin" ? "signup" : "signin")}>
```

If `Input`/`Button` do not forward unknown props to the underlying element, add `...rest` spreading to those components first — check `apps/web/src/lib/components/ui/Input.svelte` and `Button.svelte`, and if they already spread `$$restProps` (or Svelte 5 `...rest`), no change is needed.

- [ ] **Step 2: Write the test user helper**

Create `e2e/support/user.ts`:

```ts
/**
 * Each e2e run signs up a fresh user. PocketBase enforces a unique email, and
 * the CI stack is torn down per run, but a unique address keeps repeated local
 * runs against a warm PocketBase from colliding.
 */
export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

export const TEST_PASSWORD = "e2e-password-12345";
```

- [ ] **Step 3: Write the auth setup**

Create `e2e/auth.setup.ts`:

```ts
import { expect, test as setup } from "@playwright/test";
import { TEST_PASSWORD, uniqueEmail } from "./support/user.js";

const AUTH_FILE = "e2e/.auth/user.json";

setup("sign up and persist the session", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/login");

  // Default mode is signin; switch to signup.
  await page.getByTestId("auth-toggle").click();

  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(TEST_PASSWORD);
  await page.getByTestId("auth-submit").click();

  // SELF_HOSTED=true routes straight to / instead of gating at /verify.
  await page.waitForURL("/");
  // Anchored on the homepage's existing sr-only h1 rather than a testid, so
  // this task passes its own verification before Task 4 instruments the UI.
  await expect(
    page.getByRole("heading", { name: "save any link and actually read it" })
  ).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
```

- [ ] **Step 4: Run the setup project**

```bash
pnpm e2e --project=setup
```

Expected: `1 passed`, and `e2e/.auth/user.json` exists.

- [ ] **Step 5: Verify the smoke spec now runs authenticated**

```bash
pnpm e2e
```

Expected: setup passes, then `smoke.spec.ts` passes.

- [ ] **Step 6: Commit**

```bash
git add e2e/auth.setup.ts e2e/support/user.ts apps/web/src/routes/login/+page.svelte
git commit -m "test(e2e): add auth setup project with persisted session"
```

---

### Task 4: Instrument the UI with test ids

The app has only two `data-testid` attributes today. Text selectors are brittle against this app's playful lowercase copy, so the flows under test get stable ids. This task adds them; Tasks 5 and 6 consume them.

**Files:**
- Modify: `apps/web/src/lib/components/CaptureBar.svelte`
- Modify: `apps/web/src/lib/components/ArticleCard.svelte`
- Modify: `apps/web/src/lib/components/SearchPalette.svelte`
- Modify: `apps/web/src/lib/components/TagEditor.svelte`
- Modify: `apps/web/src/lib/components/HighlightPopover.svelte`
- Modify: `apps/web/src/routes/read/[id]/+page.svelte`

**Interfaces:**
- Produces, consumed by Tasks 3, 5, and 6:
  - `capture-input`, `capture-submit` — homepage capture bar
  - `article-card` — one per card, with `data-article-id` carrying the record id
  - `article-card-menu` — the card's dropdown trigger
  - `article-delete`, `article-add-to-collection` — menu items
  - `confirm-accept` — the delete confirmation's accept button
  - `search-input` — the search palette input
  - `search-result` — one per palette result
  - `reader-article` — the reader's article body element
  - `tag-input`, `tag-chip` — the reader's tag editor
  - `highlight-save` — the highlight popover's save control
  - `highlight-mark` — a rendered highlight in the article body

- [ ] **Step 1: Instrument the capture bar**

In `apps/web/src/lib/components/CaptureBar.svelte`, add `data-testid="capture-input"` to the URL `<input>` (the one bound to the typewriter placeholder, around line 70) and `data-testid="capture-submit"` to the form's submit button.

- [ ] **Step 2: Instrument the article card**

In `apps/web/src/lib/components/ArticleCard.svelte`:
- On the root `.card` element: `data-testid="article-card"` and `data-article-id={article.id}`.
- On the dropdown trigger inside `.card-menu`: `data-testid="article-card-menu"`.
- On each collection menu item in the `{#each collections as c (c.id)}` loop: `data-testid="article-add-to-collection"` and `data-collection-id={c.id}`.
- On the delete menu item (around line 121, the one containing `<Trash2 …/> delete`): `data-testid="article-delete"`.

- [ ] **Step 3: Instrument the confirm dialog**

In `apps/web/src/lib/components/ui/ConfirmDialog.svelte`, add `data-testid="confirm-accept"` to the confirming button (the one wired to `onConfirm`).

- [ ] **Step 4: Instrument the search palette**

In `apps/web/src/lib/components/SearchPalette.svelte`, add `data-testid="search-input"` to the `<Command.Input>` (line 147) and `data-testid="search-result"` to each rendered result item.

- [ ] **Step 5: Instrument the reader**

In `apps/web/src/routes/read/[id]/+page.svelte`, add `data-testid="reader-article"` to the `<article>` element that renders the extracted HTML (around line 358).

- [ ] **Step 6: Instrument the tag editor and highlight popover**

In `apps/web/src/lib/components/TagEditor.svelte`: `data-testid="tag-input"` on the text input, `data-testid="tag-chip"` on each rendered tag.

In `apps/web/src/lib/components/HighlightPopover.svelte`: `data-testid="highlight-save"` on the control that commits the highlight.

In `apps/web/src/lib/highlight/render.ts`, ensure `markRange` sets `data-testid="highlight-mark"` on the element it inserts, alongside whatever class it already applies.

- [ ] **Step 7: Verify nothing broke**

```bash
pnpm exec vitest run apps/web && pnpm lint && pnpm typecheck
```

Expected: all web tests pass, lint and typecheck clean. `data-testid` is inert markup, so no behavior should change.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "test(web): add data-testid hooks for the e2e suite"
```

---

### Task 5: Capture spec (Tier 2)

The one spec that runs the real pipeline: capture → worker extraction → library → search → reader. Serial, because each stage consumes the prior stage's artifact.

**Files:**
- Create: `e2e/capture.spec.ts`
- Delete: `e2e/smoke.spec.ts` (superseded — this spec covers page loading)

**Interfaces:**
- Consumes: testids from Task 4; fixture URL `https://fixtures.e2e.test/sample-article`, title `Deterministic Fixture Article`, and search term `quokka` from Task 2.

- [ ] **Step 1: Write the capture spec**

Create `e2e/capture.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const FIXTURE_URL = "https://fixtures.e2e.test/sample-article";
const FIXTURE_TITLE = "Deterministic Fixture Article";
const SEARCH_TERM = "quokka";

// Serial: each step consumes the previous step's artifact. test.step gives
// per-stage failure reporting without paying for repeated extraction.
test.describe.serial("capture through read", () => {
  test("captures, extracts, finds, and reads an article", async ({ page }) => {
    await test.step("submit the url from the homepage", async () => {
      await page.goto("/");
      await page.getByTestId("capture-input").fill(FIXTURE_URL);
      await page.getByTestId("capture-submit").click();
    });

    await test.step("the worker extracts it and it lands in the library", async () => {
      await page.goto("/library");
      // The worker polls every 500ms in e2e; extraction plus AI-mock plus
      // fake-embedding indexing lands well inside this window.
      await expect(page.getByText(FIXTURE_TITLE)).toBeVisible({ timeout: 30_000 });
    });

    await test.step("search finds it", async () => {
      await page.keyboard.press("Control+k");
      await page.getByTestId("search-input").fill(SEARCH_TERM);
      await expect(page.getByTestId("search-result").first()).toContainText(
        FIXTURE_TITLE,
        { timeout: 15_000 }
      );
    });

    await test.step("opening it renders the article body", async () => {
      await page.getByTestId("search-result").first().click();
      await expect(page).toHaveURL(/\/read\/[a-z0-9]+/);
      await expect(page.getByTestId("reader-article")).toContainText(SEARCH_TERM);
    });
  });
});
```

If the search palette's keyboard shortcut is not `Control+k`, read `apps/web/src/routes/layout-search-shortcut.test.ts` for the actual binding and use that instead.

- [ ] **Step 2: Remove the superseded smoke spec**

```bash
git rm e2e/smoke.spec.ts
```

- [ ] **Step 3: Run it**

```bash
pnpm e2e capture
```

Expected: `1 passed`, with all four steps reported. If the library step times out, check the worker's stdout — a `no fixture for …` error means the captured URL was canonicalized to something the manifest does not map, and the manifest key needs to match the canonicalized form.

- [ ] **Step 4: Commit**

```bash
git add e2e/capture.spec.ts
git rm --cached e2e/smoke.spec.ts 2>/dev/null || true
git commit -m "test(e2e): cover capture through read"
```

---

### Task 6: Article operations spec (Tier 3)

Tag, collection, highlight, and delete as independent parallel tests, each on a freshly seeded article. No capture, no worker wait.

**Files:**
- Create: `e2e/support/seed.ts`
- Create: `e2e/article-ops.spec.ts`

**Interfaces:**
- Consumes: testids from Task 4; `ContentFields` shape from `apps/worker/src/content/upsert-content.ts:5-23`; the article record shape from `packages/core/src/capture/handle-capture.ts:59-68`.
- Produces: `seedArticle(pbUrl: string, userId: string, opts?: { title?: string }): Promise<{ articleId: string }>`.

- [ ] **Step 1: Write the seeding helper**

Create `e2e/support/seed.ts`:

```ts
import PocketBase from "pocketbase";

const SU_EMAIL = "worker@test.local";
const SU_PASS = "password12345";

/**
 * Insert a fully-extracted article directly, bypassing capture and the worker.
 * Tier-3 specs test UI operations on an existing article; waiting on real
 * extraction for each would multiply the suite's slowest path by N.
 * Field shapes mirror ContentFields (apps/worker/src/content/upsert-content.ts)
 * and the article record written by handle-capture.
 */
export async function seedArticle(
  pbUrl: string,
  userId: string,
  opts: { title?: string } = {}
): Promise<{ articleId: string }> {
  const title = opts.title ?? "Seeded Article";
  const canonicalUrl = `https://fixtures.e2e.test/seed-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const pb = new PocketBase(pbUrl);
  await pb.collection("_superusers").authWithPassword(SU_EMAIL, SU_PASS);

  const content = await pb.collection("content").create({
    canonical_url: canonicalUrl,
    content_hash: `hash-${canonicalUrl}`,
    source_type: "article",
    title,
    author: "E2E Fixture",
    site_name: "fixtures.e2e.test",
    lang: "en",
    excerpt: "A seeded article for e2e operations.",
    content_html:
      "<article><p>Seeded body text that is long enough to select and highlight.</p></article>",
    content_text: "Seeded body text that is long enough to select and highlight.",
    word_count: 11,
    read_time: 1,
    hero_image: null,
    published_at: null,
    ai_tags_json: [],
    fetched_at: new Date().toISOString(),
    extract_status: "ok",
    failure_reason: null,
  });

  const article = await pb.collection("articles").create({
    user: userId,
    content: content.id,
    url: canonicalUrl,
    canonical_url: canonicalUrl,
    status: "unread",
    progress: 0,
    is_private: false,
  });

  return { articleId: article.id };
}

/** Read the authenticated user's id out of the saved storageState. */
export function userIdFromStorageState(state: {
  origins: { localStorage: { name: string; value: string }[] }[];
}): string {
  for (const origin of state.origins) {
    for (const entry of origin.localStorage) {
      if (entry.name !== "pocketbase_auth") continue;
      const parsed = JSON.parse(entry.value) as { record?: { id?: string }; model?: { id?: string } };
      const id = parsed.record?.id ?? parsed.model?.id;
      if (id) return id;
    }
  }
  throw new Error("no pocketbase auth record in storageState");
}
```

- [ ] **Step 2: Write the article-ops spec**

Create `e2e/article-ops.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { seedArticle, userIdFromStorageState } from "./support/seed.js";

const PB_URL = process.env.E2E_PB_URL ?? "http://127.0.0.1:8090";

/** Fresh article per test so these run in parallel without interfering. */
async function freshArticle(page: import("@playwright/test").Page, title: string) {
  const state = await page.context().storageState();
  const userId = userIdFromStorageState(state);
  return seedArticle(PB_URL, userId, { title });
}

test("tags an article from the reader", async ({ page }) => {
  const { articleId } = await freshArticle(page, "Tag Target");
  await page.goto(`/read/${articleId}`);

  await page.getByTestId("tag-input").fill("e2e-tag");
  await page.getByTestId("tag-input").press("Enter");

  await expect(page.getByTestId("tag-chip").filter({ hasText: "e2e-tag" })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("tag-chip").filter({ hasText: "e2e-tag" })).toBeVisible();
});

test("adds an article to a collection", async ({ page }) => {
  const { articleId } = await freshArticle(page, "Collection Target");

  await page.goto("/library");
  const collectionName = `e2e-collection-${Date.now()}`;

  // Create the collection via the library's collections strip.
  await page.getByRole("button", { name: /new collection|create/i }).first().click();
  await page.getByRole("textbox").last().fill(collectionName);
  await page.keyboard.press("Enter");
  await expect(page.getByText(collectionName)).toBeVisible();

  const card = page.getByTestId("article-card").filter({ has: page.locator(`[data-article-id="${articleId}"]`) }).first();
  const target = (await card.count()) ? card : page.locator(`[data-article-id="${articleId}"]`);
  await target.hover();
  await target.getByTestId("article-card-menu").click();
  await page.getByTestId("article-add-to-collection").filter({ hasText: collectionName }).click();

  await page.goto("/library");
  await expect(page.getByText(collectionName)).toBeVisible();
});

test("highlights a passage in the reader", async ({ page }) => {
  const { articleId } = await freshArticle(page, "Highlight Target");
  await page.goto(`/read/${articleId}`);

  const body = page.getByTestId("reader-article");
  await expect(body).toBeVisible();

  // Select the first paragraph's text via the DOM, then dispatch mouseup —
  // the reader commits a selection on mouseup over the article element.
  await body.evaluate((el) => {
    const p = el.querySelector("p");
    if (!p?.firstChild) throw new Error("no paragraph to select");
    const range = document.createRange();
    range.setStart(p.firstChild, 0);
    range.setEnd(p.firstChild, 11);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });

  await page.getByTestId("highlight-save").click();
  await expect(page.getByTestId("highlight-mark").first()).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("highlight-mark").first()).toBeVisible();
});

test("deletes an article", async ({ page }) => {
  const { articleId } = await freshArticle(page, "Delete Target");

  await page.goto("/library");
  const card = page.locator(`[data-article-id="${articleId}"]`);
  await expect(card).toBeVisible();

  await card.hover();
  await card.getByTestId("article-card-menu").click();
  await page.getByTestId("article-delete").click();
  await page.getByTestId("confirm-accept").click();

  await expect(card).toHaveCount(0);

  await page.reload();
  await expect(page.locator(`[data-article-id="${articleId}"]`)).toHaveCount(0);
});
```

- [ ] **Step 3: Export the PocketBase URL from the stack**

The seeding helper needs the ephemeral PocketBase URL, which is random per run. In `e2e/support/stack.ts`, immediately after `const pb: PbHandle = await startEphemeralPb();`, add:

```ts
  // globalSetup runs before Playwright forks its workers, so workers inherit
  // this. Specs read it as E2E_PB_URL.
  process.env.E2E_PB_URL = pb.url;
```

For the CI compose run, `E2E_PB_URL` is set explicitly in the workflow (Task 7).

- [ ] **Step 4: Run the spec**

```bash
pnpm e2e article-ops
```

Expected: `4 passed`. If the collection test's create control is not found, read `apps/web/src/lib/components/LibraryCollections.svelte` for the real control and adjust the selector; add a `data-testid` there if the accessible name is ambiguous.

- [ ] **Step 5: Run the whole suite**

```bash
pnpm e2e
```

Expected: setup + capture + 4 article-ops tests all pass.

- [ ] **Step 6: Commit**

```bash
git add e2e/
git commit -m "test(e2e): cover tag, collection, highlight, and delete"
```

---

### Task 7: Gate image publishing on the e2e suite

Restructure `docker-publish.yml` so images are built, tested, then pushed only on green. Prevents a broken `v*` tag from ever being published.

**Files:**
- Modify: `.github/workflows/docker-publish.yml`

**Interfaces:**
- Consumes: `pnpm e2e` and `E2E_BASE_URL` / `E2E_PB_URL` from Tasks 1 and 6.

- [ ] **Step 1: Split build from push**

In `.github/workflows/docker-publish.yml`, change the `build-push` job's `build-push-action` step to build and export to the local daemon instead of pushing:

```yaml
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          platforms: linux/amd64
          push: false
          load: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

Rename the job from `build-push` to `build`.

- [ ] **Step 2: Add the e2e job**

Add after the `build` job:

```yaml
  e2e:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium

      # Rebuild into the local daemon. cache-from: type=gha makes this a cache
      # hit against the build job, not a second full build.
      - uses: docker/setup-buildx-action@v3
      - name: Build images into the local daemon
        run: |
          for svc in pocketbase web worker; do
            case "$svc" in
              pocketbase) df=pocketbase/Dockerfile ;;
              web) df=apps/web/Dockerfile ;;
              worker) df=apps/worker/Dockerfile ;;
            esac
            docker buildx build --load \
              --cache-from type=gha \
              -f "$df" -t "readmepls-$svc:ci" .
          done

      - name: Boot the stack
        run: |
          cp .env.example .env
          docker compose -f compose.yml -f compose.ci.yml up -d
          for i in $(seq 1 60); do
            curl -fsS http://localhost:8090/api/health >/dev/null 2>&1 && break
            sleep 2
          done

      - name: Run e2e
        env:
          E2E_BASE_URL: http://localhost:3000
          E2E_PB_URL: http://localhost:8090
        run: pnpm e2e

      - name: Dump logs on failure
        if: failure()
        run: docker compose -f compose.yml -f compose.ci.yml logs

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 3: Add the CI compose overlay**

Create `compose.ci.yml`:

```yaml
# Overlay for the CI e2e run: pins services to the locally-built :ci images and
# forces the deterministic offline providers. Never used outside CI.
services:
  pocketbase:
    image: readmepls-pocketbase:ci
  web:
    image: readmepls-web:ci
    environment:
      SELF_HOSTED: "true"
  worker:
    image: readmepls-worker:ci
    environment:
      AI_PROVIDER: mock
      EMBED_PROVIDER: fake
      FETCH_PROVIDER: fixture
      FIXTURE_DIR: /fixtures
      WORKER_POLL_MS: "500"
    volumes:
      - ./e2e/fixtures:/fixtures:ro
```

- [ ] **Step 4: Add the push job**

Add after `e2e`:

```yaml
  push:
    needs: e2e
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - name: pocketbase
            dockerfile: pocketbase/Dockerfile
          - name: web
            dockerfile: apps/web/Dockerfile
          - name: worker
            dockerfile: apps/worker/Dockerfile
          - name: site
            dockerfile: apps/site/Dockerfile
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/readmepls-${{ matrix.name }}
          tags: |
            type=ref,event=tag
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v') }}
            type=raw,value=develop,enable=${{ github.ref == 'refs/heads/develop' }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          platforms: linux/amd64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

`site` is not exercised by the e2e suite (it is the marketing site, not the app), but it is gated alongside the others so a release publishes a consistent set.

- [ ] **Step 5: Rewire the deploy jobs**

Change both deploy jobs' `needs:` from `build-push` to `push`:

```yaml
  deploy:
    needs: push
```

```yaml
  deploy-staging:
    needs: push
```

- [ ] **Step 6: Validate the workflow syntax**

```bash
pnpm dlx action-validator .github/workflows/docker-publish.yml 2>/dev/null \
  || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/docker-publish.yml')); print('yaml ok')"
```

Expected: `yaml ok` (or the validator's pass output).

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/docker-publish.yml compose.ci.yml
git commit -m "ci: gate image publishing on the e2e suite"
```

Note: this workflow cannot be verified without pushing, which this plan does not do. Flag to the user that the first run on `develop` via `workflow_dispatch` is the real verification, and that it may need selector or timing adjustments.

---

### Task 8: Documentation

Records the e2e rule in CLAUDE.md and corrects the stale comment in the smoke test.

**Files:**
- Modify: `CLAUDE.md` (Testing section, Commands section)
- Modify: `scripts/smoke-test.sh` (header comment)

- [ ] **Step 1: Replace the Testing bullet**

In `CLAUDE.md`, replace the final bullet of the **Testing** section — currently `- **E2E (Playwright)** comes later for the reader flow.` — with:

```markdown
- **E2E (Playwright) covers core user flows, not every feature.** A flow is
  **core** if a user who hits it broken is done — the app no longer does the
  thing they came for. Currently: sign-up/login, capture → extract, search,
  read, annotate (tag/collection/highlight), delete. A broken settings page or
  export target is annoying, not catastrophic — not core.

  **New features that meet that bar ship with e2e coverage**, not just unit
  tests; a tier upgrade/checkout flow would qualify on arrival. Changes to an
  existing core flow update its spec. Keep the list above current.

  Everything else stays on unit + integration tests as described above: new
  extractors or AI providers, connectors and export targets, UI components,
  pure logic, settings.

  **Corollary — core flows need a test seam.** A core flow that calls a third
  party must expose an injectable interface so e2e runs offline and
  deterministically, the way the worker's `Fetcher` is swapped for a fixture in
  `e2e/`. For payments: the provider behind an interface with a fake — never
  live calls to a payment sandbox from the suite.
```

- [ ] **Step 2: Add the e2e command**

In `CLAUDE.md`'s **Commands** section, after the Test bullet, add:

```markdown
- E2E: `pnpm e2e` (Playwright, root `e2e/`). Needs built artifacts first:
  `pnpm --filter @readmepls/worker build && pnpm --filter @readmepls/web build`.
  Boots an ephemeral PocketBase + web preview + worker with offline providers
  (`AI_PROVIDER=mock`, `EMBED_PROVIDER=fake`, `FETCH_PROVIDER=fixture`).
```

- [ ] **Step 3: Correct the stale smoke-test comment**

In `scripts/smoke-test.sh`, replace this sentence in the header comment:

```
# Determinism: the worker runs with AI_PROVIDER=mock (no Anthropic key/cost). The
# web app on this branch has no auth yet, so the job is seeded directly via the
# PocketBase superuser REST API rather than POSTed to /api/capture.
```

with:

```
# Determinism: the worker runs with AI_PROVIDER=mock (no Anthropic key/cost).
# This is a container-boot check, not an e2e test — it deliberately seeds the
# job via the PocketBase superuser REST API rather than driving the UI, so it
# stays independent of auth and frontend changes. Browser-level coverage of the
# core user flows lives in the Playwright suite under e2e/.
```

- [ ] **Step 4: Verify the docs render and lint passes**

```bash
pnpm lint
```

Expected: prettier and eslint clean.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md scripts/smoke-test.sh
git commit -m "docs: record the e2e core-flow rule and fix the stale smoke-test comment"
```

- [ ] **Step 6: Delete the spec and this plan once merged**

Per the working agreements in CLAUDE.md, a shipped plan and its paired spec are deleted:

```bash
git rm docs/superpowers/specs/2026-07-21-e2e-core-flows-design.md \
       docs/superpowers/plans/2026-07-21-e2e-core-flows.md
git commit -m "docs: remove shipped e2e core-flows spec and plan"
```

Do this only after the suite is green in CI (Task 7's first real run).

---

## Known risks

- **Task 7 is unverifiable locally.** The workflow only runs on push, which this plan does not do. Expect the first `workflow_dispatch` run on `develop` to need adjustment.
- **Task 4 instruments files that were confirmed to exist but not read in full.** `TagEditor.svelte`, `HighlightPopover.svelte`, `ConfirmDialog.svelte`, and `highlight/render.ts` were located but their internals were not inspected while writing this plan. The described elements (a tag text input, a highlight commit control, a confirm button, the mark element) are inferred from their call sites in `read/[id]/+page.svelte`. Open each file and place the testid on the real element; if the structure differs from the description, follow the file, not the plan.
- **Selector drift in Task 6.** The collection-creation control was read from the library page's props but not exercised; its real accessible name may differ. Task 6 Step 4 says to read the component and adjust — that is expected work, not a failure.
- **Highlight selection via `evaluate` is the least certain step.** The reader commits a selection on `mouseup` over the article element, but the exact popover trigger path was not traced. If the synthetic selection does not open the popover, use Playwright's real mouse (`page.mouse.move`/`down`/`up` across the text's bounding box) instead.
- **Canonicalization of the fixture URL.** `handle-capture` canonicalizes before enqueueing, so the manifest key must match the canonicalized form. Task 5 Step 3 covers diagnosing this.
- **`Input`/`Button` prop forwarding.** Task 3 Step 1 assumes these components forward `data-testid`. If they do not, add rest-prop spreading first.
