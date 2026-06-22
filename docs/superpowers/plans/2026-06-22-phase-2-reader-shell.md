# Phase 2 — Reader Shell + Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first usable end-to-end app — sign in, capture URLs, watch them go ready in a live library, and read them with typography controls — plus close three Phase-1 loop gaps.

**Architecture:** Backend gap closures first (sanitize HTML at write time, link the worker's `content` row back to the capturing user's `articles`, add a real worker poll loop). Then the SvelteKit frontend: per-request auth wiring in `hooks.server.ts`, the PocketBase JS SDK used directly from the browser (master design Approach C), and three routes (`/login`, `/` library, `/read/[id]` reader) built from reusable `$lib/components/ui/` primitives. Pure logic is unit-tested; thin IO/wiring is verified by build + component tests.

**Tech Stack:** pnpm workspaces, TypeScript strict, Vitest, Zod, SvelteKit + Svelte 5 (runes), PocketBase v0.39 (JS migrations), `sanitize-html`, `@testing-library/svelte`.

## Global Constraints

Copied verbatim from the spec and CLAUDE.md. Every task implicitly includes these.

- **TypeScript strict.** No `any` without a written reason. Shared types live in `@readmepls/types`, consumed by both apps.
- **Validate at boundaries with Zod.** API input, extractor output, AI output, PB reads are parsed before use.
- **Model states as unions, not booleans** (e.g. card state `processing|ready|partial|failed`).
- **Pure core, thin IO shell.** Pure functions (sanitize, prefs defaults, card-state, css-vars, route-guard) are unit-tested in isolation; side effects sit behind interfaces.
- **Single token source.** Colors, fonts, radii, shadows live only in `apps/web/src/lib/styles/tokens.css`. **No literal hex or font names in components.**
- **Reusable components.** UI primitives in `$lib/components/ui/`; feature components compose them. No duplicated markup or CSS.
- **PocketBase API rules are the security boundary.** Every per-user collection is scoped `user = @request.auth.id`. Never rely on the client to enforce access.
- **Sanitize HTML before storage.** `content.content_html` must be sanitized in the worker before it reaches PocketBase.
- **TDD always.** Failing test first, then implementation. **Conventional Commits.** One logical change per commit. Never push or open a PR unless asked.
- **Default AI model:** `claude-haiku-4-5`. **PocketBase ≥ v0.22** (host has v0.39.4). Phase 2 is **structural only — no visual design** (Phase 3).

---

## File Structure

```
pocketbase/pb_migrations/
  1719000000_phase2_reader.js        # + articles.canonical_url, + users.reader_prefs

packages/types/src/
  reader.ts                          # ReaderPrefs Zod schema  (NEW)
  index.ts                           # + export reader        (MODIFY)

packages/core/src/
  reader/prefs.ts                    # withReaderDefaults (pure)  (NEW)
  capture/handle-capture.ts          # set canonical_url on articles (MODIFY)
  index.ts                           # + export reader/prefs   (MODIFY)
  pb/migration-phase2.test.ts        # migration field smoke (NEW)

apps/worker/src/
  extract/sanitize.ts                # sanitizeContentHtml (pure)  (NEW)
  extract/article-extractor.ts       # sanitize content_html  (MODIFY)
  worker.ts                          # link articles -> content (MODIFY)
  run.ts                             # runWorkerOnce (testable)  (NEW)
  main.ts                            # poll-loop entrypoint    (NEW)

apps/web/
  package.json                       # + web deps, scripts     (MODIFY)
  vitest.config.ts                   # svelte + jsdom          (MODIFY)
  vitest-setup.ts                    # jest-dom matchers       (NEW)
  src/app.html                       # SK template             (NEW)
  src/app.d.ts                       # App.Locals types        (NEW)
  src/hooks.server.ts                # auth wiring + guard     (NEW)
  src/lib/pb.ts                      # browser PB singleton    (NEW)
  src/lib/server/pb.ts              # + servicePb (superuser)  (MODIFY)
  src/lib/server/auth.ts             # routeGuard (pure)       (NEW)
  src/lib/styles/tokens.css          # design tokens (single source) (NEW)
  src/lib/reader/css-vars.ts         # readerCssVars (pure)    (NEW)
  src/lib/article/card-state.ts      # deriveCardState (pure)  (NEW)
  src/lib/auth/validate.ts           # validateCredentials (pure) (NEW)
  src/lib/components/ui/             # Button Card Input Tag Spinner (NEW)
  src/lib/components/CaptureBar.svelte   (NEW)
  src/lib/components/ArticleCard.svelte  (NEW)
  src/lib/components/ReaderControls.svelte (NEW)
  src/routes/+layout.svelte          # imports tokens.css      (NEW)
  src/routes/+page.svelte            # library                 (NEW)
  src/routes/login/+page.svelte      # auth                    (NEW)
  src/routes/read/[id]/+page.svelte  # reader                  (NEW)
  src/routes/api/capture/+server.ts  # use locals.pb           (MODIFY)
  src/routes/api/retry/+server.ts    # reset failed job        (NEW)
```

---

## Task 1: Migration — `articles.canonical_url` + `users.reader_prefs`

**Files:**
- Create: `pocketbase/pb_migrations/1719000000_phase2_reader.js`
- Test: `packages/core/src/pb/migration-phase2.test.ts`

**Interfaces:**
- Consumes: Phase-1 `startEphemeralPb`, `makeTestUser` from `@readmepls/core/src/pb/test-harness.js`.
- Produces: `articles.canonical_url` (text, indexed), `users.reader_prefs` (json) for Tasks 3, 4, 13.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/pb/migration-phase2.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, makeTestUser, type PbHandle } from "./test-harness.js";

let h: PbHandle;
let userId: string;
beforeAll(async () => {
  h = await startEphemeralPb();
  userId = await makeTestUser(h.pb);
}, 30000);
afterAll(() => h?.stop());

describe("phase-2 migration", () => {
  it("persists reader_prefs json on users", async () => {
    const prefs = { font: "serif", size: 18, lineHeight: 1.6, width: "normal", theme: "light" };
    const u = await h.pb.collection("users").update(userId, { reader_prefs: prefs });
    expect(u.reader_prefs).toEqual(prefs);
  });

  it("persists canonical_url on articles", async () => {
    const a = await h.pb.collection("articles").create({
      user: userId,
      url: "https://example.com/x",
      canonical_url: "https://example.com/x",
      status: "unread",
      progress: 0,
      is_private: false,
    });
    expect(a.canonical_url).toBe("https://example.com/x");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PB_BIN=pocketbase/pocketbase pnpm vitest run packages/core/src/pb/migration-phase2.test.ts`
Expected: FAIL — unknown field `reader_prefs` / `canonical_url`.

- [ ] **Step 3: Write the migration**

Create `pocketbase/pb_migrations/1719000000_phase2_reader.js`:

```js
/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const articles = app.findCollectionByNameOrId("articles");
    articles.fields.add({ name: "canonical_url", type: "text" });
    articles.indexes.push(
      "CREATE INDEX idx_articles_canonical ON articles (canonical_url)"
    );
    app.save(articles);

    const users = app.findCollectionByNameOrId("users");
    users.fields.add({ name: "reader_prefs", type: "json" });
    app.save(users);
  },
  (app) => {
    const articles = app.findCollectionByNameOrId("articles");
    articles.fields.removeByName("canonical_url");
    articles.indexes = articles.indexes.filter(
      (i) => !i.includes("idx_articles_canonical")
    );
    app.save(articles);

    const users = app.findCollectionByNameOrId("users");
    users.fields.removeByName("reader_prefs");
    app.save(users);
  }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PB_BIN=pocketbase/pocketbase pnpm vitest run packages/core/src/pb/migration-phase2.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add pocketbase/pb_migrations/1719000000_phase2_reader.js packages/core/src/pb/migration-phase2.test.ts
git commit -m "feat(pb): add articles.canonical_url and users.reader_prefs"
```

---

## Task 2: Sanitize `content_html` at write time

**Files:**
- Modify: `apps/worker/package.json` (add `sanitize-html`, `@types/sanitize-html`)
- Create: `apps/worker/src/extract/sanitize.ts`
- Test: `apps/worker/src/extract/sanitize.test.ts`
- Modify: `apps/worker/src/extract/article-extractor.ts:51`
- Modify: `apps/worker/src/extract/article-extractor.test.ts` (assert sanitized)

**Interfaces:**
- Produces: `sanitizeContentHtml(html: string): string` — strips scripts/handlers/unsafe URLs, keeps article markup.

- [ ] **Step 1: Add the dependency**

Edit `apps/worker/package.json` — add to `dependencies`: `"sanitize-html": "^2.13.0"` and to `devDependencies`: `"@types/sanitize-html": "^2.13.0"`. Then run `pnpm install`.

- [ ] **Step 2: Write the failing test**

Create `apps/worker/src/extract/sanitize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sanitizeContentHtml } from "./sanitize.js";

describe("sanitizeContentHtml", () => {
  it("removes script tags and their content", () => {
    const out = sanitizeContentHtml("<p>hi</p><script>alert(1)</script>");
    expect(out).toContain("<p>hi</p>");
    expect(out).not.toContain("script");
  });

  it("strips event-handler attributes", () => {
    const out = sanitizeContentHtml('<p onclick="evil()">x</p>');
    expect(out).not.toContain("onclick");
  });

  it("drops javascript: hrefs but keeps http links", () => {
    expect(sanitizeContentHtml('<a href="javascript:alert(1)">a</a>')).not.toContain("javascript:");
    expect(sanitizeContentHtml('<a href="https://ok.com">a</a>')).toContain("https://ok.com");
  });

  it("removes iframes", () => {
    expect(sanitizeContentHtml('<iframe src="https://evil.com"></iframe>')).not.toContain("iframe");
  });

  it("keeps safe article tags", () => {
    const html = '<h2>T</h2><p>p</p><img src="https://x/i.png" alt="i"><blockquote>q</blockquote><pre><code>c</code></pre>';
    const out = sanitizeContentHtml(html);
    for (const tag of ["<h2>", "<p>", "<img", "<blockquote>", "<pre>", "<code>"]) {
      expect(out).toContain(tag);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run apps/worker/src/extract/sanitize.test.ts`
Expected: FAIL — cannot find module `./sanitize.js`.

- [ ] **Step 4: Implement**

Create `apps/worker/src/extract/sanitize.ts`:

```ts
import sanitizeHtml from "sanitize-html";

// Allowlist for reader content: article markup only. No scripts, styles,
// iframes, forms, or event handlers. This runs in the worker so the global
// `content` cache is safe for every consumer that renders it.
export function sanitizeContentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "a", "img", "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "pre", "code", "em",
      "strong", "b", "i", "figure", "figcaption", "hr", "br", "span",
    ],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run apps/worker/src/extract/sanitize.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Wire sanitize into the extractor**

In `apps/worker/src/extract/article-extractor.ts`, add the import at the top:

```ts
import { sanitizeContentHtml } from "./sanitize.js";
```

Change the success-path `contentHtml` (currently line 51) from:

```ts
      contentHtml: parsed.content ?? "",
```

to:

```ts
      contentHtml: sanitizeContentHtml(parsed.content ?? ""),
```

- [ ] **Step 7: Add an assertion to the extractor test**

In `apps/worker/src/extract/article-extractor.test.ts`, inside the existing
`"returns a schema-valid ok result"` test, add after the existing assertions:

```ts
    expect(res.contentHtml).not.toContain("<script");
```

- [ ] **Step 8: Run the extractor tests**

Run: `pnpm vitest run apps/worker/src/extract/`
Expected: PASS (sanitize + article-extractor suites green).

- [ ] **Step 9: Commit**

```bash
git add apps/worker/package.json apps/worker/src/extract pnpm-lock.yaml
git commit -m "fix(worker): sanitize content_html before storage"
```

---

## Task 3: `handleCapture` sets `canonical_url` on articles

**Files:**
- Modify: `packages/core/src/capture/handle-capture.ts`
- Modify: `packages/core/src/capture/handle-capture.test.ts`

**Interfaces:**
- Consumes: `articles.canonical_url` (Task 1).
- Produces: every article created by capture carries its `canonical_url` (so Task 4 can link by it).

- [ ] **Step 1: Add a failing assertion**

In `packages/core/src/capture/handle-capture.test.ts`, extend the
`"enqueues a job and creates an article on cache miss"` test with:

```ts
    const article = await h.pb.collection("articles").getOne(r.body.articleId!);
    expect(article.canonical_url).toBe("https://example.com/fresh");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PB_BIN=pocketbase/pocketbase pnpm vitest run packages/core/src/capture/handle-capture.test.ts`
Expected: FAIL — `article.canonical_url` is undefined/empty.

- [ ] **Step 3: Implement**

In `packages/core/src/capture/handle-capture.ts`, add `canonical_url: canonical`
to **both** `articles.create({...})` calls — the cache-HIT branch and the
cache-MISS branch. Example (MISS branch):

```ts
  const article = await pb.collection("articles").create({
    user: userId,
    url: rawUrl,
    canonical_url: canonical,
    status: "unread",
    progress: 0,
    is_private: false,
  });
```

And the HIT branch:

```ts
    const article = await pb.collection("articles").create({
      user: userId,
      content: existing.id,
      url: rawUrl,
      canonical_url: canonical,
      status: "unread",
      progress: 0,
      is_private: false,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PB_BIN=pocketbase/pocketbase pnpm vitest run packages/core/src/capture/handle-capture.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/capture
git commit -m "feat(core): record canonical_url on captured articles"
```

---

## Task 4: Worker links articles → content on completion

**Files:**
- Modify: `apps/worker/src/worker.ts`
- Test: `apps/worker/src/link.integration.test.ts`

**Interfaces:**
- Consumes: `articles.canonical_url` (Task 1), `processJob` (Phase 1).
- Produces: after a job writes `content`, all matching content-less articles are linked (`content` ref set, `is_private=false`).

- [ ] **Step 1: Write the failing integration test**

Create `apps/worker/src/link.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startEphemeralPb, makeTestUser, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { classifySource } from "@readmepls/core";
import { processJob } from "./worker.js";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { MockAIProvider } from "./ai/mock-provider.js";

const html = readFileSync(
  fileURLToPath(new URL("./extract/fixtures/simple-article.html", import.meta.url)),
  "utf8"
);

let h: PbHandle;
beforeAll(async () => {
  h = await startEphemeralPb();
}, 30000);
afterAll(() => h?.stop());

describe("processJob article linking", () => {
  it("links every content-less article that shares the job's canonical_url", async () => {
    const u1 = await makeTestUser(h.pb);
    const u2 = await makeTestUser(h.pb);
    const url = "https://example.com/post";

    const mk = (user: string) =>
      h.pb.collection("articles").create({
        user, url, canonical_url: url, status: "unread", progress: 0, is_private: true,
      });
    const a1 = await mk(u1);
    const a2 = await mk(u2);

    const job = await h.pb.collection("jobs").create({
      user: u1, canonical_url: url, type: "extract", status: "running", attempts: 0,
    });

    await processJob(h.pb, job.id, {
      fetchHtml: async () => html,
      extractor: new ArticleExtractor(),
      ai: new MockAIProvider({ tags: ["t"], summary: "s" }),
      classify: classifySource,
    });

    const done = await h.pb.collection("jobs").getOne(job.id);
    const got1 = await h.pb.collection("articles").getOne(a1.id);
    const got2 = await h.pb.collection("articles").getOne(a2.id);
    expect(got1.content).toBe(done.content);
    expect(got2.content).toBe(done.content);
    expect(got1.is_private).toBe(false);
    expect(got2.is_private).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PB_BIN=pocketbase/pocketbase pnpm vitest run apps/worker/src/link.integration.test.ts`
Expected: FAIL — articles' `content` stays empty.

- [ ] **Step 3: Implement**

In `apps/worker/src/worker.ts`, after the `content` row is created and **before**
the `jobs.update(... status: "done" ...)` call, add the linking loop:

```ts
    const toLink = await pb.collection("articles").getFullList({
      filter: `canonical_url = "${job.canonical_url}" && content = ""`,
    });
    for (const a of toLink) {
      await pb.collection("articles").update(a.id, {
        content: content.id,
        is_private: false,
      });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PB_BIN=pocketbase/pocketbase pnpm vitest run apps/worker/src/link.integration.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Run the worker suite to confirm no regression**

Run: `PB_BIN=pocketbase/pocketbase pnpm vitest run apps/worker/src/worker.integration.test.ts apps/worker/src/loop.e2e.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/worker.ts apps/worker/src/link.integration.test.ts
git commit -m "feat(worker): link captured articles to extracted content"
```

---

## Task 5: Worker poll loop entrypoint

**Files:**
- Create: `apps/worker/src/run.ts`
- Test: `apps/worker/src/run.integration.test.ts`
- Create: `apps/worker/src/main.ts`
- Modify: `apps/worker/package.json` (add `start` script)

**Interfaces:**
- Consumes: `claimNextJob` (Phase 1), `processJob` (Task 4), `ProcessDeps`.
- Produces: `runWorkerOnce(pb, workerId, deps): Promise<boolean>` — claims+processes one job, returns `false` when the queue is empty.

- [ ] **Step 1: Write the failing integration test**

Create `apps/worker/src/run.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startEphemeralPb, makeTestUser, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { handleCapture, classifySource } from "@readmepls/core";
import { runWorkerOnce } from "./run.js";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { MockAIProvider } from "./ai/mock-provider.js";

const html = readFileSync(
  fileURLToPath(new URL("./extract/fixtures/simple-article.html", import.meta.url)),
  "utf8"
);

let h: PbHandle;
let userId: string;
beforeAll(async () => {
  h = await startEphemeralPb();
  userId = await makeTestUser(h.pb);
}, 30000);
afterAll(() => h?.stop());

const deps = () => ({
  fetchHtml: async () => html,
  extractor: new ArticleExtractor(),
  ai: new MockAIProvider({ tags: ["t"], summary: "s" }),
  classify: classifySource,
});

describe("runWorkerOnce", () => {
  it("returns false when the queue is empty", async () => {
    expect(await runWorkerOnce(h.pb, "w1", deps())).toBe(false);
  });

  it("claims and processes one queued job, returning true", async () => {
    await handleCapture(h.pb, userId, "https://example.com/post");
    expect(await runWorkerOnce(h.pb, "w1", deps())).toBe(true);
    const job = await h.pb.collection("jobs").getFirstListItem(`canonical_url = "https://example.com/post"`);
    expect(job.status).toBe("done");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PB_BIN=pocketbase/pocketbase pnpm vitest run apps/worker/src/run.integration.test.ts`
Expected: FAIL — cannot find module `./run.js`.

- [ ] **Step 3: Implement `run.ts`**

Create `apps/worker/src/run.ts`:

```ts
import type PocketBase from "pocketbase";
import { claimNextJob } from "./jobs/claim.js";
import { processJob, type ProcessDeps } from "./worker.js";

/** Claim and process at most one job. Returns false if nothing was claimable. */
export async function runWorkerOnce(
  pb: PocketBase,
  workerId: string,
  deps: ProcessDeps
): Promise<boolean> {
  const job = await claimNextJob(pb, workerId);
  if (!job) return false;
  await processJob(pb, job.id, deps);
  return true;
}
```

> Note: `ProcessDeps` is already exported from `worker.ts` (Phase 1). If it is not
> exported, add `export` to its `interface ProcessDeps` declaration.

- [ ] **Step 4: Run test to verify it passes**

Run: `PB_BIN=pocketbase/pocketbase pnpm vitest run apps/worker/src/run.integration.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the entrypoint `main.ts` (wiring; not unit-tested)**

Create `apps/worker/src/main.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { makeClient, authAsSuperuser, classifySource } from "@readmepls/core";
import { defaultSafeFetchHtml } from "./fetch/safe-fetch.js";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { ClaudeProvider } from "./ai/claude-provider.js";
import { MockAIProvider } from "./ai/mock-provider.js";
import type { AIProvider } from "./ai/provider.js";
import { runWorkerOnce } from "./run.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function resolveProvider(): AIProvider {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.warn("[worker] ANTHROPIC_API_KEY unset — using MockAIProvider");
    return new MockAIProvider();
  }
  const model = process.env.AI_MODEL ?? "claude-haiku-4-5";
  return new ClaudeProvider(new Anthropic({ apiKey: key }), model);
}

async function main(): Promise<void> {
  const pb = makeClient(process.env.PB_URL ?? "http://127.0.0.1:8090");
  await authAsSuperuser(
    pb,
    process.env.PB_ADMIN_EMAIL ?? "worker@local",
    process.env.PB_ADMIN_PASSWORD ?? ""
  );

  const workerId = `worker-${process.pid}`;
  const deps = {
    fetchHtml: defaultSafeFetchHtml(),
    extractor: new ArticleExtractor(),
    ai: resolveProvider(),
    classify: classifySource,
  };

  console.log(`[worker] ${workerId} polling ${pb.baseURL}`);
  for (;;) {
    let did = false;
    try {
      did = await runWorkerOnce(pb, workerId, deps);
    } catch (err) {
      console.error("[worker] loop error:", err);
    }
    if (!did) await sleep(2000);
  }
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
```

> `makeClient`, `authAsSuperuser`, and `classifySource` are re-exported from
> `@readmepls/core` (Phase 1 `pb/client.ts`, `source/classify.ts`). If `makeClient`/
> `authAsSuperuser` are not in `core/src/index.ts`, add
> `export * from "./pb/client.js";` (it is already present).

- [ ] **Step 6: Add the `start` script**

In `apps/worker/package.json`, add to `scripts`:

```json
  "scripts": { "start": "vite-node src/main.ts" }
```

> `vite-node` ships with `vitest` (already a root devDependency) and runs the TS
> entrypoint with workspace resolution. Run via `pnpm --filter @readmepls/worker start`.

- [ ] **Step 7: Verify the entrypoint type-checks and the suite passes**

Run: `PB_BIN=pocketbase/pocketbase pnpm vitest run apps/worker/src/`
Expected: PASS (all worker suites green).

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/run.ts apps/worker/src/run.integration.test.ts apps/worker/src/main.ts apps/worker/package.json
git commit -m "feat(worker): add poll-loop entrypoint and runWorkerOnce"
```

---

## Task 6: `ReaderPrefs` schema + `withReaderDefaults`

**Files:**
- Create: `packages/types/src/reader.ts`
- Modify: `packages/types/src/index.ts`
- Create: `packages/core/src/reader/prefs.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/reader/prefs.test.ts`

**Interfaces:**
- Produces: `ReaderPrefs` (Zod schema + type) from `@readmepls/types`; `withReaderDefaults(partial?: Partial<ReaderPrefs>): ReaderPrefs` from `@readmepls/core`.

- [ ] **Step 1: Implement the schema**

Create `packages/types/src/reader.ts`:

```ts
import { z } from "zod";

export const ReaderPrefs = z.object({
  font: z.enum(["serif", "sans"]),
  size: z.number().int().min(14).max(24),
  lineHeight: z.number().min(1.3).max(2.0),
  width: z.enum(["narrow", "normal", "wide"]),
  theme: z.enum(["light", "dark", "sepia"]),
});
export type ReaderPrefs = z.infer<typeof ReaderPrefs>;
```

Add to `packages/types/src/index.ts`:

```ts
export * from "./reader.js";
```

- [ ] **Step 2: Write the failing test**

Create `packages/core/src/reader/prefs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { withReaderDefaults } from "./prefs.js";

describe("withReaderDefaults", () => {
  it("returns full defaults for empty input", () => {
    expect(withReaderDefaults()).toEqual({
      font: "sans", size: 18, lineHeight: 1.6, width: "normal", theme: "light",
    });
  });

  it("overrides only provided fields", () => {
    expect(withReaderDefaults({ theme: "dark", size: 20 })).toMatchObject({
      theme: "dark", size: 20, font: "sans",
    });
  });

  it("clamps out-of-range numeric values", () => {
    const p = withReaderDefaults({ size: 99, lineHeight: 0.5 });
    expect(p.size).toBe(24);
    expect(p.lineHeight).toBe(1.3);
  });

  it("ignores unknown/invalid enum values and falls back to default", () => {
    const p = withReaderDefaults({ font: "comic" as never });
    expect(p.font).toBe("sans");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/core/src/reader/prefs.test.ts`
Expected: FAIL — cannot find module `./prefs.js`.

- [ ] **Step 4: Implement**

Create `packages/core/src/reader/prefs.ts`:

```ts
import { ReaderPrefs } from "@readmepls/types";

const DEFAULTS: ReaderPrefs = {
  font: "sans",
  size: 18,
  lineHeight: 1.6,
  width: "normal",
  theme: "light",
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Merge a partial (e.g. from users.reader_prefs) onto safe defaults, clamping
 *  numerics and discarding values that fail schema validation. */
export function withReaderDefaults(partial?: Partial<ReaderPrefs>): ReaderPrefs {
  const merged = { ...DEFAULTS, ...(partial ?? {}) };
  merged.size = clamp(Math.round(Number(merged.size)), 14, 24);
  merged.lineHeight = clamp(Number(merged.lineHeight), 1.3, 2.0);
  const parsed = ReaderPrefs.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULTS;
}
```

> Note: invalid enum values make `safeParse` fail, which returns full `DEFAULTS`.
> The clamp test passes because `size`/`lineHeight` are clamped before parsing and
> the other fields are valid defaults. The "invalid enum" test expects only `font`
> to reset — verify by running; if a single bad enum should preserve other valid
> overrides, replace the final return with a per-field validated rebuild:

```ts
  // per-field fallback variant (use if the all-or-nothing behavior is wrong):
  const out = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS) as (keyof ReaderPrefs)[]) {
    const probe = ReaderPrefs.shape[k].safeParse(merged[k]);
    if (probe.success) (out[k] as unknown) = probe.data;
  }
  return out;
```

Use the per-field variant so the `"ignores unknown enum"` test (which also relies
on other fields keeping defaults) passes deterministically.

Add to `packages/core/src/index.ts`:

```ts
export * from "./reader/prefs.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm install && pnpm vitest run packages/core/src/reader/prefs.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/reader.ts packages/types/src/index.ts packages/core/src/reader packages/core/src/index.ts
git commit -m "feat: add ReaderPrefs schema and withReaderDefaults"
```

---

## Task 7: Web scaffold + design tokens + component-test harness

**Files:**
- Modify: `apps/web/package.json` (deps + scripts)
- Modify: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest-setup.ts`
- Create: `apps/web/src/app.html`
- Create: `apps/web/src/app.d.ts`
- Create: `apps/web/src/lib/styles/tokens.css`
- Create: `apps/web/src/routes/+layout.svelte`

**Interfaces:**
- Produces: `App.Locals { pb: PocketBase; userId: string | null }`; the `tokens.css` custom properties; a jsdom + Svelte vitest environment for `*.test.ts` under `apps/web/src`.

- [ ] **Step 1: Add web dependencies + scripts**

Edit `apps/web/package.json`:
- Add to `devDependencies`:
  `"@sveltejs/vite-plugin-svelte": "^4.0.0"`, `"@testing-library/svelte": "^5.2.0"`,
  `"@testing-library/jest-dom": "^6.5.0"`, `"jsdom": "^25.0.0"`,
  `"svelte-check": "^4.0.0"`, `"@sveltejs/adapter-node": "^5.2.0"` (already present).
- Add to `scripts`: `"check": "svelte-check --tsconfig ./tsconfig.json"`.

Run `pnpm install`.

- [ ] **Step 2: Configure vitest for components**

Replace `apps/web/vitest.config.ts` with:

```ts
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";

export default defineConfig({
  plugins: [svelte({ hot: false }), svelteTesting()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{js,ts}"],
    setupFiles: ["./vitest-setup.ts"],
  },
});
```

Create `apps/web/vitest-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Create the SvelteKit shell files**

Create `apps/web/src/app.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

Create `apps/web/src/app.d.ts`:

```ts
import type PocketBase from "pocketbase";

declare global {
  namespace App {
    interface Locals {
      pb: PocketBase;
      userId: string | null;
    }
  }
}

export {};
```

- [ ] **Step 4: Create the single token source**

Create `apps/web/src/lib/styles/tokens.css`:

```css
/* Single source of truth for design tokens. Derived from assets/_banner.html.
   Phase 2 defines these; Phase 3 expands and applies them. No component may
   hardcode a color or font name — reference a token. */
:root {
  --paper-1: #f7f3ea;
  --paper-2: #f1ecdf;
  --paper-3: #eae3d2;
  --ink: #211e17;
  --accent: #c24a38;
  --muted: #6e6453;
  --faint: #ac9f86;
  --fold: #e4dcc8;

  --font-display: "Fredoka", system-ui, sans-serif;
  --font-ui: system-ui, -apple-system, sans-serif;
  --font-reader-serif: Georgia, "Times New Roman", serif;
  --font-reader-sans: system-ui, -apple-system, sans-serif;

  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 24px;
  --shadow-card: 0 2px 8px rgba(54, 44, 22, 0.12);

  --bg: var(--paper-1);
  --fg: var(--ink);
}

[data-theme="dark"] {
  --bg: #1a1814;
  --fg: #ece6da;
  --muted: #9a9384;
}

[data-theme="sepia"] {
  --bg: var(--paper-2);
  --fg: #3b352a;
}
```

- [ ] **Step 5: Create the root layout**

Create `apps/web/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import "$lib/styles/tokens.css";
  let { children } = $props();
</script>

{@render children?.()}
```

- [ ] **Step 6: Verify the build and the (empty) test run**

Run: `pnpm --filter @readmepls/web exec vitest run`
Expected: PASS — "no test files" or 0 tests is acceptable; the run must not error on config.

Run: `pnpm --filter @readmepls/web build`
Expected: SvelteKit build completes (the existing `/api/capture` route + layout compile).

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/vitest-setup.ts apps/web/src/app.html apps/web/src/app.d.ts apps/web/src/lib/styles/tokens.css apps/web/src/routes/+layout.svelte pnpm-lock.yaml
git commit -m "chore(web): scaffold app shell, design tokens, component-test harness"
```

---

## Task 8: Auth wiring — route guard, hooks, PB clients

**Files:**
- Create: `apps/web/src/lib/server/auth.ts`
- Test: `apps/web/src/lib/server/auth.test.ts`
- Create: `apps/web/src/hooks.server.ts`
- Create: `apps/web/src/lib/pb.ts`
- Modify: `apps/web/src/lib/server/pb.ts`
- Modify: `apps/web/src/routes/api/capture/+server.ts`

**Interfaces:**
- Produces: `routeGuard(pathname: string, userId: string | null): string | null` (redirect target or null); `browserPb()` singleton; `servicePb(): Promise<PocketBase>` (superuser, server-only); `event.locals.pb`/`event.locals.userId` populated per request.

- [ ] **Step 1: Write the failing route-guard test**

Create `apps/web/src/lib/server/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { routeGuard } from "./auth.js";

describe("routeGuard", () => {
  it("redirects unauthenticated users away from protected pages", () => {
    expect(routeGuard("/", null)).toBe("/login");
    expect(routeGuard("/read/abc", null)).toBe("/login");
  });
  it("allows authenticated users through", () => {
    expect(routeGuard("/", "u1")).toBeNull();
    expect(routeGuard("/read/abc", "u1")).toBeNull();
  });
  it("never redirects the login page or api routes", () => {
    expect(routeGuard("/login", null)).toBeNull();
    expect(routeGuard("/api/capture", null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/server/auth.test.ts`
Expected: FAIL — cannot find module `./auth.js`.

- [ ] **Step 3: Implement the guard**

Create `apps/web/src/lib/server/auth.ts`:

```ts
/** Returns a redirect target for a protected page when unauthenticated, else null.
 *  `/login` and `/api/*` are always public (API routes enforce their own auth). */
export function routeGuard(pathname: string, userId: string | null): string | null {
  if (pathname === "/login" || pathname.startsWith("/api/")) return null;
  return userId ? null : "/login";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/server/auth.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the server hooks (wiring)**

Create `apps/web/src/hooks.server.ts`:

```ts
import PocketBase from "pocketbase";
import { redirect, type Handle } from "@sveltejs/kit";
import { routeGuard } from "$lib/server/auth.js";

const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";

export const handle: Handle = async ({ event, resolve }) => {
  const pb = new PocketBase(PB_URL);
  pb.authStore.loadFromCookie(event.request.headers.get("cookie") ?? "");
  try {
    if (pb.authStore.isValid) await pb.collection("users").authRefresh();
  } catch {
    pb.authStore.clear();
  }

  event.locals.pb = pb;
  event.locals.userId = pb.authStore.record?.id ?? null;

  const target = routeGuard(event.url.pathname, event.locals.userId);
  if (target) throw redirect(303, target);

  const response = await resolve(event);
  // httpOnly:false so the browser SDK shares the same auth cookie.
  response.headers.append(
    "set-cookie",
    pb.authStore.exportToCookie({ httpOnly: false })
  );
  return response;
};
```

- [ ] **Step 6: Implement the browser PB singleton + service client**

Create `apps/web/src/lib/pb.ts`:

```ts
import PocketBase from "pocketbase";

let _pb: PocketBase | null = null;

/** Browser-side PocketBase singleton. Shares the auth cookie written by hooks. */
export function browserPb(): PocketBase {
  if (!_pb) {
    _pb = new PocketBase(import.meta.env.VITE_PB_URL ?? "http://127.0.0.1:8090");
    _pb.authStore.loadFromCookie(document.cookie);
    _pb.authStore.onChange(() => {
      document.cookie = _pb!.authStore.exportToCookie({ httpOnly: false });
    });
  }
  return _pb;
}
```

Append to `apps/web/src/lib/server/pb.ts` (keep the existing `serverPb`):

```ts
/** Server-only superuser client for privileged actions (e.g. job retry). */
export async function servicePb(): Promise<PocketBase> {
  const pb = serverPb();
  await pb
    .collection("_superusers")
    .authWithPassword(
      process.env.PB_ADMIN_EMAIL ?? "worker@local",
      process.env.PB_ADMIN_PASSWORD ?? ""
    );
  return pb;
}
```

- [ ] **Step 7: Route capture through the authenticated request client**

Replace the body of `apps/web/src/routes/api/capture/+server.ts` with:

```ts
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { handleCapture } from "@readmepls/core";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.userId) throw error(401, "unauthenticated");
  const { url } = (await request.json()) as { url?: string };
  if (!url) throw error(400, "missing url");

  const outcome = await handleCapture(locals.pb, locals.userId, url);
  return json(outcome.body, { status: outcome.status });
};
```

- [ ] **Step 8: Verify**

Run: `pnpm --filter @readmepls/web exec vitest run && pnpm --filter @readmepls/web build`
Expected: tests PASS; build completes.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/server/auth.ts apps/web/src/lib/server/auth.test.ts apps/web/src/hooks.server.ts apps/web/src/lib/pb.ts apps/web/src/lib/server/pb.ts apps/web/src/routes/api/capture/+server.ts
git commit -m "feat(web): wire PocketBase auth into hooks, route guard, capture"
```

---

## Task 9: Reusable UI primitives

**Files:**
- Create: `apps/web/src/lib/components/ui/Button.svelte`, `Card.svelte`, `Input.svelte`, `Tag.svelte`, `Spinner.svelte`
- Test: `apps/web/src/lib/components/ui/primitives.test.ts`

**Interfaces:**
- Produces: `Button` (`children`, `onclick`, `type`, `disabled`, `variant`), `Card` (`children`), `Input` (`value` bindable, `placeholder`, `type`, `oninput`), `Tag` (`children`), `Spinner` (`label?`). All unstyled beyond token references.

- [ ] **Step 1: Write the failing component tests**

Create `apps/web/src/lib/components/ui/primitives.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Button from "./Button.svelte";
import Tag from "./Tag.svelte";
import Spinner from "./Spinner.svelte";

const text = (s: string) => createRawSnippet(() => ({ render: () => `<span>${s}</span>` }));

describe("ui primitives", () => {
  it("Button renders children and fires onclick", async () => {
    const onclick = vi.fn();
    render(Button, { children: text("Save"), onclick });
    const btn = screen.getByRole("button", { name: "Save" });
    await fireEvent.click(btn);
    expect(onclick).toHaveBeenCalledOnce();
  });

  it("Button respects disabled", () => {
    render(Button, { children: text("X"), disabled: true });
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("Tag renders its label", () => {
    render(Tag, { children: text("ai") });
    expect(screen.getByText("ai")).toBeInTheDocument();
  });

  it("Spinner exposes an accessible label", () => {
    render(Spinner, { label: "Loading" });
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/components/ui/primitives.test.ts`
Expected: FAIL — cannot find `./Button.svelte`.

- [ ] **Step 3: Implement the primitives**

Create `apps/web/src/lib/components/ui/Button.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  let {
    children,
    onclick,
    type = "button",
    disabled = false,
    variant = "default",
  }: {
    children?: Snippet;
    onclick?: (e: MouseEvent) => void;
    type?: "button" | "submit";
    disabled?: boolean;
    variant?: "default" | "accent";
  } = $props();
</script>

<button {type} {disabled} {onclick} data-variant={variant}>
  {@render children?.()}
</button>
```

Create `apps/web/src/lib/components/ui/Card.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  let { children }: { children?: Snippet } = $props();
</script>

<div class="card">{@render children?.()}</div>

<style>
  .card {
    background: var(--paper-2);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    padding: 1rem;
  }
</style>
```

Create `apps/web/src/lib/components/ui/Input.svelte`:

```svelte
<script lang="ts">
  let {
    value = $bindable(""),
    placeholder = "",
    type = "text",
    oninput,
  }: {
    value?: string;
    placeholder?: string;
    type?: string;
    oninput?: (e: Event) => void;
  } = $props();
</script>

<input {type} {placeholder} bind:value {oninput} />
```

Create `apps/web/src/lib/components/ui/Tag.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  let { children }: { children?: Snippet } = $props();
</script>

<span class="tag">{@render children?.()}</span>

<style>
  .tag {
    display: inline-block;
    font-family: var(--font-ui);
    color: var(--muted);
    border: 1px solid var(--fold);
    border-radius: var(--radius-sm);
    padding: 0.1rem 0.4rem;
  }
</style>
```

Create `apps/web/src/lib/components/ui/Spinner.svelte`:

```svelte
<script lang="ts">
  let { label = "Loading" }: { label?: string } = $props();
</script>

<span role="status" aria-label={label} class="spinner"></span>

<style>
  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--fold);
    border-top-color: var(--accent);
    border-radius: 50%;
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/components/ui/primitives.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/ui
git commit -m "feat(web): add reusable UI primitives"
```

---

## Task 10: Card-state derivation + `ArticleCard`

**Files:**
- Create: `apps/web/src/lib/article/card-state.ts`
- Test: `apps/web/src/lib/article/card-state.test.ts`
- Create: `apps/web/src/lib/components/ArticleCard.svelte`
- Test: `apps/web/src/lib/components/ArticleCard.test.ts`

**Interfaces:**
- Consumes: `Card`, `Tag`, `Button` (Task 9).
- Produces: `CardState = "processing"|"ready"|"partial"|"failed"`; `deriveCardState(content): CardState`; `ArticleCard` (`article`, `onRetry?`, `onOpen?`).

- [ ] **Step 1: Write the failing card-state test**

Create `apps/web/src/lib/article/card-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveCardState } from "./card-state.js";

describe("deriveCardState", () => {
  it("is processing when no content is linked yet", () => {
    expect(deriveCardState(null)).toBe("processing");
    expect(deriveCardState(undefined)).toBe("processing");
  });
  it("maps extract_status to a card state", () => {
    expect(deriveCardState({ extract_status: "ok" })).toBe("ready");
    expect(deriveCardState({ extract_status: "partial" })).toBe("partial");
    expect(deriveCardState({ extract_status: "failed" })).toBe("failed");
    expect(deriveCardState({ extract_status: "pending" })).toBe("processing");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/article/card-state.test.ts`
Expected: FAIL — cannot find module `./card-state.js`.

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/article/card-state.ts`:

```ts
export type CardState = "processing" | "ready" | "partial" | "failed";

interface ContentLike {
  extract_status?: string;
}

export function deriveCardState(content: ContentLike | null | undefined): CardState {
  if (!content) return "processing";
  switch (content.extract_status) {
    case "ok":
      return "ready";
    case "partial":
      return "partial";
    case "failed":
      return "failed";
    default:
      return "processing";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/article/card-state.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing ArticleCard test**

Create `apps/web/src/lib/components/ArticleCard.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ArticleCard from "./ArticleCard.svelte";

const article = (content: unknown) => ({
  id: "a1",
  url: "https://example.com/p",
  expand: content ? { content } : undefined,
});

describe("ArticleCard", () => {
  it("shows the title and tags when ready", () => {
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: ["ai", "ml"] }),
    });
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("ai")).toBeInTheDocument();
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
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/components/ArticleCard.test.ts`
Expected: FAIL — cannot find `./ArticleCard.svelte`.

- [ ] **Step 7: Implement**

Create `apps/web/src/lib/components/ArticleCard.svelte`:

```svelte
<script lang="ts">
  import Card from "./ui/Card.svelte";
  import Tag from "./ui/Tag.svelte";
  import Button from "./ui/Button.svelte";
  import Spinner from "./ui/Spinner.svelte";
  import { deriveCardState } from "$lib/article/card-state.js";

  let {
    article,
    onRetry,
    onOpen,
  }: {
    article: { id: string; url: string; expand?: { content?: any } };
    onRetry?: (id: string) => void;
    onOpen?: (id: string) => void;
  } = $props();

  const content = $derived(article.expand?.content ?? null);
  const state = $derived(deriveCardState(content));
  const tags = $derived<string[]>(content?.ai_tags_json ?? []);
</script>

<Card>
  {#if state === "processing"}
    <Spinner label="Processing" />
    <span>{article.url}</span>
  {:else}
    <h3>{content?.title ?? article.url}</h3>
    {#if state === "failed" || state === "partial"}
      <p data-state={state}>{content?.failure_reason ?? "extraction problem"}</p>
      <Button variant="accent" onclick={() => onRetry?.(article.id)}>Retry</Button>
    {:else}
      <div class="tags">
        {#each tags as t}<Tag>{t}</Tag>{/each}
      </div>
      <Button onclick={() => onOpen?.(article.id)}>Read</Button>
    {/if}
  {/if}
</Card>
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/components/ArticleCard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/article apps/web/src/lib/components/ArticleCard.svelte apps/web/src/lib/components/ArticleCard.test.ts
git commit -m "feat(web): add card-state derivation and ArticleCard"
```

---

## Task 11: Library route — capture bar, live list, retry

**Files:**
- Create: `apps/web/src/lib/components/CaptureBar.svelte`
- Create: `apps/web/src/routes/+page.svelte`
- Create: `apps/web/src/routes/api/retry/+server.ts`

**Interfaces:**
- Consumes: `browserPb` (Task 8), `ArticleCard` (Task 10), `Input`/`Button` (Task 9), `servicePb` (Task 8).
- Produces: the `/` library page (capture → optimistic card → realtime ready/failed) and `POST /api/retry { articleId }`.

- [ ] **Step 1: Implement the retry server route**

Create `apps/web/src/routes/api/retry/+server.ts`:

```ts
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { servicePb } from "$lib/server/pb.js";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.userId) throw error(401, "unauthenticated");
  const { articleId } = (await request.json()) as { articleId?: string };
  if (!articleId) throw error(400, "missing articleId");

  // Authorize: the article must belong to the requesting user (API rule enforces).
  const article = await locals.pb.collection("articles").getOne(articleId).catch(() => null);
  if (!article) throw error(404, "not found");

  // Reset the (worker-owned) job with a superuser client.
  const svc = await servicePb();
  const job = await svc
    .collection("jobs")
    .getFirstListItem(`canonical_url = "${article.canonical_url}"`)
    .catch(() => null);
  if (job) {
    await svc.collection("jobs").update(job.id, {
      status: "queued",
      attempts: 0,
      last_error: "",
      locked_at: "",
      locked_by: "",
    });
  }
  return json({ ok: true });
};
```

- [ ] **Step 2: Implement the capture bar**

Create `apps/web/src/lib/components/CaptureBar.svelte`:

```svelte
<script lang="ts">
  import Input from "./ui/Input.svelte";
  import Button from "./ui/Button.svelte";

  let { onCaptured }: { onCaptured?: () => void } = $props();
  let url = $state("");
  let busy = $state(false);
  let err = $state("");

  async function submit() {
    if (!url.trim()) return;
    busy = true;
    err = "";
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.status === 402) {
        err = "Quota exceeded — upgrade to capture more.";
        return;
      }
      if (!res.ok) {
        err = "Could not capture that link.";
        return;
      }
      url = "";
      onCaptured?.();
    } finally {
      busy = false;
    }
  }
</script>

<form onsubmit={(e) => { e.preventDefault(); submit(); }}>
  <Input bind:value={url} placeholder="Paste a link…" type="url" />
  <Button type="submit" disabled={busy}>Save</Button>
  {#if err}<p role="alert">{err}</p>{/if}
</form>
```

- [ ] **Step 3: Implement the library page**

Create `apps/web/src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import CaptureBar from "$lib/components/CaptureBar.svelte";
  import ArticleCard from "$lib/components/ArticleCard.svelte";

  const pb = browserPb();
  let articles = $state<any[]>([]);
  let unsub: (() => void) | undefined;

  async function load() {
    const list = await pb.collection("articles").getList(1, 50, {
      sort: "-created",
      expand: "content",
    });
    articles = list.items;
  }

  async function retry(id: string) {
    await fetch("/api/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ articleId: id }),
    });
  }

  onMount(async () => {
    await load();
    // Realtime: PB list rule (user = auth.id) scopes events to this user.
    unsub = await pb.collection("articles").subscribe("*", () => load(), {
      expand: "content",
    });
  });
  onDestroy(() => unsub?.());
</script>

<main>
  <CaptureBar onCaptured={load} />
  <section class="grid">
    {#each articles as a (a.id)}
      <ArticleCard article={a} onRetry={retry} onOpen={(id) => goto(`/read/${id}`)} />
    {/each}
  </section>
</main>
```

- [ ] **Step 4: Verify build + existing tests still pass**

Run: `pnpm --filter @readmepls/web exec vitest run && pnpm --filter @readmepls/web build`
Expected: tests PASS; build completes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/CaptureBar.svelte apps/web/src/routes/+page.svelte apps/web/src/routes/api/retry/+server.ts
git commit -m "feat(web): library route with capture bar, live list, retry"
```

---

## Task 12: Login route

**Files:**
- Create: `apps/web/src/lib/auth/validate.ts`
- Test: `apps/web/src/lib/auth/validate.test.ts`
- Create: `apps/web/src/routes/login/+page.svelte`

**Interfaces:**
- Consumes: `browserPb` (Task 8), `Input`/`Button` (Task 9).
- Produces: `validateCredentials(email, password): string | null` (error message or null); the `/login` page (sign in + sign up).

- [ ] **Step 1: Write the failing validation test**

Create `apps/web/src/lib/auth/validate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateCredentials } from "./validate.js";

describe("validateCredentials", () => {
  it("rejects an invalid email", () => {
    expect(validateCredentials("nope", "password12")).toMatch(/email/i);
  });
  it("rejects a short password", () => {
    expect(validateCredentials("a@b.com", "short")).toMatch(/password/i);
  });
  it("accepts valid credentials", () => {
    expect(validateCredentials("a@b.com", "password12")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/auth/validate.test.ts`
Expected: FAIL — cannot find module `./validate.js`.

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/auth/validate.ts`:

```ts
/** Returns an error message for invalid sign-in credentials, or null if valid. */
export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "Enter a valid email.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/auth/validate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the login page**

Create `apps/web/src/routes/login/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import { validateCredentials } from "$lib/auth/validate.js";
  import Input from "$lib/components/ui/Input.svelte";
  import Button from "$lib/components/ui/Button.svelte";

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
          email, password, passwordConfirm: password, tier: "free", monthly_quota_used: 0,
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
  <h1>readmepls</h1>
  <form onsubmit={(e) => { e.preventDefault(); submit(); }}>
    <Input bind:value={email} type="email" placeholder="email" />
    <Input bind:value={password} type="password" placeholder="password" />
    <Button type="submit">{mode === "signin" ? "Sign in" : "Sign up"}</Button>
    {#if err}<p role="alert">{err}</p>{/if}
  </form>
  <Button onclick={() => (mode = mode === "signin" ? "signup" : "signin")}>
    {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
  </Button>
</main>
```

- [ ] **Step 6: Verify build + tests**

Run: `pnpm --filter @readmepls/web exec vitest run && pnpm --filter @readmepls/web build`
Expected: tests PASS; build completes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/auth apps/web/src/routes/login
git commit -m "feat(web): add login/signup route"
```

---

## Task 13: Reader route — typography + reading state

**Files:**
- Create: `apps/web/src/lib/reader/css-vars.ts`
- Test: `apps/web/src/lib/reader/css-vars.test.ts`
- Create: `apps/web/src/lib/components/ReaderControls.svelte`
- Test: `apps/web/src/lib/components/ReaderControls.test.ts`
- Create: `apps/web/src/routes/read/[id]/+page.svelte`

**Interfaces:**
- Consumes: `withReaderDefaults` + `ReaderPrefs` (Task 6), `browserPb` (Task 8), `Button` (Task 9).
- Produces: `readerCssVars(prefs: ReaderPrefs): string`; `ReaderControls` (`prefs`, `onChange(prefs)`); the `/read/[id]` page (render sanitized HTML, apply prefs, persist prefs, track reading state).

- [ ] **Step 1: Write the failing css-vars test**

Create `apps/web/src/lib/reader/css-vars.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readerCssVars } from "./css-vars.js";

describe("readerCssVars", () => {
  it("maps prefs to reader custom properties", () => {
    const css = readerCssVars({ font: "serif", size: 20, lineHeight: 1.7, width: "wide", theme: "dark" });
    expect(css).toContain("--reader-font: var(--font-reader-serif)");
    expect(css).toContain("--reader-size: 20px");
    expect(css).toContain("--reader-line-height: 1.7");
    expect(css).toContain("--reader-width: 80ch");
  });
  it("uses sans + narrow mappings", () => {
    const css = readerCssVars({ font: "sans", size: 16, lineHeight: 1.5, width: "narrow", theme: "light" });
    expect(css).toContain("--reader-font: var(--font-reader-sans)");
    expect(css).toContain("--reader-width: 55ch");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/reader/css-vars.test.ts`
Expected: FAIL — cannot find module `./css-vars.js`.

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/reader/css-vars.ts`:

```ts
import type { ReaderPrefs } from "@readmepls/types";

const WIDTHS: Record<ReaderPrefs["width"], string> = {
  narrow: "55ch",
  normal: "68ch",
  wide: "80ch",
};

/** Inline custom properties for the reader container, layered over tokens.css. */
export function readerCssVars(prefs: ReaderPrefs): string {
  const font = prefs.font === "serif" ? "var(--font-reader-serif)" : "var(--font-reader-sans)";
  return [
    `--reader-font: ${font}`,
    `--reader-size: ${prefs.size}px`,
    `--reader-line-height: ${prefs.lineHeight}`,
    `--reader-width: ${WIDTHS[prefs.width]}`,
  ].join("; ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/reader/css-vars.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing ReaderControls test**

Create `apps/web/src/lib/components/ReaderControls.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ReaderControls from "./ReaderControls.svelte";

const prefs = { font: "sans", size: 18, lineHeight: 1.6, width: "normal", theme: "light" } as const;

describe("ReaderControls", () => {
  it("emits an updated prefs object when the theme changes", async () => {
    const onChange = vi.fn();
    render(ReaderControls, { prefs, onChange });
    await fireEvent.click(screen.getByRole("button", { name: /dark/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" }));
  });

  it("emits a larger size when increasing font size", async () => {
    const onChange = vi.fn();
    render(ReaderControls, { prefs, onChange });
    await fireEvent.click(screen.getByRole("button", { name: /A\+|increase/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ size: 19 }));
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/components/ReaderControls.test.ts`
Expected: FAIL — cannot find `./ReaderControls.svelte`.

- [ ] **Step 7: Implement**

Create `apps/web/src/lib/components/ReaderControls.svelte`:

```svelte
<script lang="ts">
  import type { ReaderPrefs } from "@readmepls/types";
  import Button from "./ui/Button.svelte";

  let { prefs, onChange }: { prefs: ReaderPrefs; onChange?: (p: ReaderPrefs) => void } = $props();

  const emit = (patch: Partial<ReaderPrefs>) => onChange?.({ ...prefs, ...patch });
  const clampSize = (n: number) => Math.min(24, Math.max(14, n));
</script>

<div class="controls">
  <Button onclick={() => emit({ size: clampSize(prefs.size - 1) })}>A−</Button>
  <Button onclick={() => emit({ size: clampSize(prefs.size + 1) })}>A+</Button>
  <Button onclick={() => emit({ font: prefs.font === "serif" ? "sans" : "serif" })}>
    {prefs.font === "serif" ? "Sans" : "Serif"}
  </Button>
  <Button onclick={() => emit({ theme: "light" })}>Light</Button>
  <Button onclick={() => emit({ theme: "dark" })}>Dark</Button>
  <Button onclick={() => emit({ theme: "sepia" })}>Sepia</Button>
</div>
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/components/ReaderControls.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Implement the reader page**

Create `apps/web/src/routes/read/[id]/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { browserPb } from "$lib/pb.js";
  import { withReaderDefaults } from "@readmepls/core";
  import type { ReaderPrefs } from "@readmepls/types";
  import { readerCssVars } from "$lib/reader/css-vars.js";
  import ReaderControls from "$lib/components/ReaderControls.svelte";
  import Spinner from "$lib/components/ui/Spinner.svelte";

  const pb = browserPb();
  let article = $state<any>(null);
  let content = $state<any>(null);
  let prefs = $state<ReaderPrefs>(withReaderDefaults());

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function savePrefs(next: ReaderPrefs) {
    prefs = next;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const uid = pb.authStore.record?.id;
      if (uid) pb.collection("users").update(uid, { reader_prefs: next });
    }, 500);
  }

  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  function onScroll() {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      const max = document.body.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      if (article) pb.collection("articles").update(article.id, { progress: p });
    }, 400);
  }

  onMount(async () => {
    const id = $page.params.id;
    article = await pb.collection("articles").getOne(id, { expand: "content" });
    content = article.expand?.content ?? null;

    const uid = pb.authStore.record?.id;
    if (uid) {
      const me = await pb.collection("users").getOne(uid);
      prefs = withReaderDefaults(me.reader_prefs ?? undefined);
    }
    if (article.status === "unread") {
      await pb.collection("articles").update(article.id, { status: "reading" });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  });

  async function archive() {
    if (article) await pb.collection("articles").update(article.id, { status: "archived" });
  }
</script>

<ReaderControls {prefs} onChange={savePrefs} />
<Button onclick={archive}>Archive</Button>

{#if !content}
  <Spinner label="Loading article" />
{:else}
  <article data-theme={prefs.theme} style={readerCssVars(prefs)} class="reader">
    <h1>{content.title}</h1>
    <!-- content_html is sanitized in the worker (Task 2) before storage -->
    {@html content.content_html}
  </article>
{/if}

<style>
  .reader {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--reader-font);
    font-size: var(--reader-size);
    line-height: var(--reader-line-height);
    max-width: var(--reader-width);
    margin: 0 auto;
  }
</style>
```

> The `Button` for Archive needs an import — add
> `import Button from "$lib/components/ui/Button.svelte";` to the `<script>`.

- [ ] **Step 10: Verify build + full web test run**

Run: `pnpm --filter @readmepls/web exec vitest run && pnpm --filter @readmepls/web build`
Expected: tests PASS; build completes.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/lib/reader apps/web/src/lib/components/ReaderControls.svelte apps/web/src/lib/components/ReaderControls.test.ts apps/web/src/routes/read
git commit -m "feat(web): reader route with typography controls and reading state"
```

---

## Task 14: Full verification + run docs

**Files:**
- Modify: `README.md` (add a "Running locally" section)

**Interfaces:** none (verification + docs).

- [ ] **Step 1: Run the full test suite**

Run: `PB_BIN=pocketbase/pocketbase pnpm test`
Expected: all workspace suites PASS (types, core, worker, web).

- [ ] **Step 2: Type-check everything**

Run: `pnpm typecheck && pnpm --filter @readmepls/web check`
Expected: `tsc` clean; `svelte-check` reports 0 errors.

- [ ] **Step 3: Add run instructions**

Add to `README.md` a section:

````markdown
## Running locally

Three processes. Set a shared superuser for the worker + web service client.

```bash
# 1. PocketBase (applies migrations on start)
cd pocketbase && ./pocketbase superuser upsert worker@local password12345
./pocketbase serve --http=127.0.0.1:8090

# 2. Worker (new terminal, from repo root)
PB_URL=http://127.0.0.1:8090 \
PB_ADMIN_EMAIL=worker@local PB_ADMIN_PASSWORD=password12345 \
ANTHROPIC_API_KEY=sk-... \
pnpm --filter @readmepls/worker start

# 3. Web (new terminal, from repo root)
PB_URL=http://127.0.0.1:8090 \
PB_ADMIN_EMAIL=worker@local PB_ADMIN_PASSWORD=password12345 \
pnpm --filter @readmepls/web dev
```

Open http://localhost:5173, sign up, paste a link, watch it go ready, and read it.
Without `ANTHROPIC_API_KEY` the worker uses a mock tagger (dev only).
````

- [ ] **Step 4: Manual smoke (optional but recommended)**

Start all three processes as above. Sign up, capture `https://example.com`,
confirm the card flips to ready via realtime, open the reader, change typography,
reload to confirm prefs persisted.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add local run instructions for Phase 2"
```

---

## Self-Review Notes (coverage vs spec)

- §3A sanitize → Task 2. §3B linking → Tasks 1, 3, 4. §3C poll loop → Task 5.
- §4 auth wiring → Task 8; routes → Tasks 11 (library), 12 (login), 13 (reader).
- §4 reusable components → Tasks 9, 10, 13; single token source → Task 7.
- §5 typography + PB prefs → Tasks 1, 6, 13. §6 tokens → Task 7.
- §7 data model → Task 1. §8 error/state unions → Tasks 10, 11. §9 testing → throughout; §9 E2E deferred.
- Deferred per spec: visual polish (Phase 3), editable per-user tags/collections/highlights/search (Phase 4).
```
