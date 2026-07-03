# Surface Failed Extractions to Articles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When extraction fails, the worker must write a `content` row (mirroring the success path) and link any waiting article to it, so the article reaches the UI's existing "failed" state instead of spinning as "processing" forever.

**Architecture:** `processJob` currently early-returns on a failed extraction, only touching the `jobs` row — no `content` row is ever created, so `ArticleCard`'s `deriveCardState()` (which returns `"processing"` whenever `content` is absent) can never show "failed". The fix makes the content write and article-linking steps run for every outcome (ok/partial/failed), and switches the content write from a blind `create()` to an upsert (look up by `canonical_url` first, `update()` if found, else `create()`) — required because `content.canonical_url` has a unique index, and a retried job (via the existing `/api/retry` route, which resets a job to `queued` without touching `content`) would otherwise collide with the failed content row left by the first attempt.

**Tech Stack:** Node/TypeScript worker package (`apps/worker`), PocketBase, Vitest.

## Global Constraints

- **TDD always** — failing test first, then implementation, per this repo's working agreements.
- **No schema changes.** Every field this plan writes (`extract_status`, `failure_reason`, etc.) already exists on the `content` collection (`pocketbase/pb_migrations/1718900000_init.js`). This is application-logic only.
- **Worker jobs are idempotent and safe to re-run** (existing repo convention) — this plan's upsert is exactly what makes a retried job idempotent with respect to `content`, where today it is not.
- **Small commits, Conventional Commits** — one commit per task.
- **Tests offline** — the worker's existing integration tests use the ephemeral PocketBase harness (`packages/core/src/pb/test-harness.ts`), never a shared instance. Unit tests use fakes/mocks, never live network.
- Run tests from the repo root: `pnpm exec vitest run <path>`.

---

## Root cause (for context — do not re-investigate)

Traced end-to-end against a real running stack: the worker *does* claim jobs correctly (`packages/jobs/claim.ts`, untouched by this plan). A failed extraction produces a fully-shaped `ExtractResult` (title, empty body, `failureReason` — see `apps/worker/src/extract/parse-article.ts`'s failure branch), but `apps/worker/src/worker.ts:26-33` only updates the `jobs` row on failure and returns — it never writes `content` or links `articles`. `apps/web/src/lib/article/card-state.ts:7-8` has no other signal to read, so the card spins forever. The web app never queries the `jobs` collection at all (confirmed via repo-wide grep) — `content.extract_status`/`content.failure_reason` are the *only* signals the UI has for failure, and today nothing ever writes them for a hard failure.

---

## Task 1: `upsertContent` helper

**Files:**
- Create: `apps/worker/src/content/upsert-content.ts`
- Test: `apps/worker/src/content/upsert-content.test.ts`

**Interfaces:**
- Produces: `ContentFields` (interface — the full set of writable `content` fields except `canonical_url`, which is passed separately) and `upsertContent(pb: PocketBase, canonicalUrl: string, fields: ContentFields): Promise<{ id: string } & Record<string, unknown>>`, both exported. Task 2 imports and calls this directly.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/worker/src/content/upsert-content.test.ts
import { describe, it, expect, vi } from "vitest";
import type PocketBase from "pocketbase";
import { upsertContent, type ContentFields } from "./upsert-content.js";

const fields: ContentFields = {
  content_hash: "hash1",
  source_type: "article",
  title: "T",
  author: null,
  site_name: null,
  lang: null,
  excerpt: "",
  content_html: "",
  content_text: "",
  word_count: 0,
  read_time: 0,
  hero_image: null,
  published_at: null,
  ai_tags_json: [],
  fetched_at: "2026-01-01T00:00:00.000Z",
  extract_status: "failed",
  failure_reason: "no readable content",
};

function fakePb(
  existing: { id: string } | null,
  ops: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
): PocketBase {
  const pb = {
    filter: (s: string) => s,
    collection: () => ({
      getFirstListItem: async () => {
        if (!existing) throw new Error("not found");
        return existing;
      },
      create: ops.create,
      update: ops.update,
    }),
  };
  return pb as unknown as PocketBase;
}

describe("upsertContent", () => {
  it("creates a new content row when none exists for the canonical_url", async () => {
    const create = vi.fn(async (payload: unknown) => ({ id: "c1", ...(payload as object) }));
    const update = vi.fn();
    const pb = fakePb(null, { create, update });

    const result = await upsertContent(pb, "https://example.com/x", fields);

    expect(create).toHaveBeenCalledWith({ canonical_url: "https://example.com/x", ...fields });
    expect(update).not.toHaveBeenCalled();
    expect(result.id).toBe("c1");
  });

  it("updates the existing content row when one already exists for the canonical_url", async () => {
    const create = vi.fn();
    const update = vi.fn(async (id: string, payload: unknown) => ({ id, ...(payload as object) }));
    const pb = fakePb({ id: "existing1" }, { create, update });

    const result = await upsertContent(pb, "https://example.com/x", fields);

    expect(update).toHaveBeenCalledWith("existing1", fields);
    expect(create).not.toHaveBeenCalled();
    expect(result.id).toBe("existing1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run apps/worker/src/content/upsert-content.test.ts`
Expected: FAIL — cannot find module `./upsert-content.js`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/worker/src/content/upsert-content.ts
import type PocketBase from "pocketbase";
import type { SourceType, ExtractStatus } from "@readmepls/types";

export interface ContentFields {
  content_hash: string;
  source_type: SourceType;
  title: string;
  author: string | null;
  site_name: string | null;
  lang: string | null;
  excerpt: string;
  content_html: string;
  content_text: string;
  word_count: number;
  read_time: number;
  hero_image: string | null;
  published_at: string | null;
  ai_tags_json: string[];
  fetched_at: string;
  extract_status: ExtractStatus;
  failure_reason: string | null;
}

/**
 * Write the content row for a canonical_url, updating in place if one
 * already exists (e.g. a retried job re-running extraction after a prior
 * failure) rather than colliding with content's unique index on
 * canonical_url.
 */
export async function upsertContent(
  pb: PocketBase,
  canonicalUrl: string,
  fields: ContentFields
) {
  const existing = await pb
    .collection("content")
    .getFirstListItem(pb.filter("canonical_url = {:url}", { url: canonicalUrl }))
    .catch(() => null);

  if (existing) {
    return pb.collection("content").update(existing.id, fields);
  }
  return pb.collection("content").create({ canonical_url: canonicalUrl, ...fields });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/worker/src/content/upsert-content.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/content/upsert-content.ts apps/worker/src/content/upsert-content.test.ts
git commit -m "feat(worker): add upsertContent helper for canonical_url-safe content writes"
```

---

## Task 2: Write content and link articles on every extraction outcome

**Files:**
- Modify: `apps/worker/src/worker.ts`
- Modify: `apps/worker/src/worker.integration.test.ts`

**Interfaces:**
- Consumes: `upsertContent`/`ContentFields` from Task 1 (`./content/upsert-content.js`).

- [ ] **Step 1: Update the failing-extraction integration test to assert the new behavior**

Replace the existing `"marks job failed and increments attempts when extraction fails"` test in `apps/worker/src/worker.integration.test.ts` with this (same `describe` block, same file):

```ts
  it("marks job failed and increments attempts when extraction fails, and surfaces the failure on any linked article", async () => {
    const url = "https://example.com/empty";
    const article = await h.pb.collection("articles").create({
      user: "u1",
      url,
      canonical_url: url,
      status: "unread",
      progress: 0,
      is_private: false,
    });
    const job = await h.pb.collection("jobs").create({
      user: "u1",
      canonical_url: url,
      type: "extract",
      status: "running",
      attempts: 0,
    });

    await processJob(h.pb, job.id, {
      io: ioWith("<html></html>"),
      registry,
      ai: new MockAIProvider(),
      classify: classifySource,
    });

    const after = await h.pb.collection("jobs").getOne(job.id);
    expect(after.status).toBe("failed");
    expect(after.attempts).toBe(1);
    expect(after.content).toBeTruthy();

    const content = await h.pb.collection("content").getOne(after.content);
    expect(content.extract_status).toBe("failed");
    expect(content.failure_reason).toBeTruthy();

    const linkedArticle = await h.pb.collection("articles").getOne(article.id);
    expect(linkedArticle.content).toBe(content.id);
  });
```

Also replace the `"records the field-level reason when the content write is rejected"` test — its premise (a blind `create()` colliding with a pre-existing `content` row) is exactly the bug this plan fixes, so that collision can no longer happen. Replace it with a test proving the actual new behavior — a retried job recovers cleanly instead of colliding:

```ts
  it("updates existing content in place instead of colliding on canonical_url (retry-after-failure recovers)", async () => {
    const url = "https://example.com/dup-content";
    const pre = await h.pb.collection("content").create({
      canonical_url: url,
      content_hash: "preexisting",
      source_type: "article",
      extract_status: "failed",
      failure_reason: "no readable content",
    });
    const job = await h.pb.collection("jobs").create({
      user: "u1",
      canonical_url: url,
      type: "extract",
      status: "running",
      attempts: 0,
    });

    await processJob(h.pb, job.id, {
      io: ioWith(html),
      registry,
      ai: new MockAIProvider({ tags: ["x"], summary: "s" }),
      classify: classifySource,
    });

    const after = await h.pb.collection("jobs").getOne(job.id);
    expect(after.status).toBe("done");
    expect(after.content).toBe(pre.id);

    const updated = await h.pb.collection("content").getOne(pre.id);
    expect(updated.extract_status).toBe("ok");
    expect(updated.title).toBe("Hello World Article");
  });
```

The first test in the file (`"extracts, tags, writes content, and marks job done"`) needs no changes — the success path's externally observable behavior is unchanged when no prior content exists.

- [ ] **Step 2: Run the test file to verify the two changed tests fail**

Run: `pnpm exec vitest run apps/worker/src/worker.integration.test.ts`
Expected: FAIL — the failing-extraction test fails on `expect(after.content).toBeTruthy()` (currently `undefined`/falsy, since no content is ever written on failure); the collision test fails on `expect(after.status).toBe("done")` (today it's `"failed"`, since the blind `create()` still collides).

- [ ] **Step 3: Restructure `processJob`**

```ts
// apps/worker/src/worker.ts
import { createHash } from "node:crypto";
import type PocketBase from "pocketbase";
import type { ExtractIO } from "./extract/extractor.js";
import type { ExtractorRegistry } from "./extract/registry.js";
import type { AIProvider } from "./ai/provider.js";
import type { SourceType } from "@readmepls/types";
import { upsertContent } from "./content/upsert-content.js";

export interface ProcessDeps {
  io: ExtractIO;
  registry: ExtractorRegistry;
  ai: AIProvider;
  classify: (url: string) => SourceType;
}

export async function processJob(
  pb: PocketBase,
  jobId: string,
  deps: ProcessDeps
): Promise<void> {
  const job = await pb.collection("jobs").getOne(jobId);
  try {
    const source = deps.classify(job.canonical_url);
    const extractor = deps.registry.for(source);
    const result = await extractor.extract(job.canonical_url, deps.io);

    // AI tagging only makes sense for text that was actually extracted —
    // skip the call entirely on a failed extraction (empty contentText).
    const ai =
      result.status === "failed"
        ? { tags: [], summary: "" }
        : await deps.ai.tagAndSummarize(result.contentText);

    // Upsert, not create: a retried job (via /api/retry, which resets a job
    // to queued without touching content) re-runs extraction against a
    // canonical_url that may already have a content row from a prior failed
    // attempt — content.canonical_url has a unique index, so a blind
    // create() would collide. Every outcome (ok/partial/failed) writes the
    // same content row, updated in place on retry.
    const content = await upsertContent(pb, job.canonical_url, {
      content_hash: createHash("sha256").update(result.contentText).digest("hex"),
      source_type: result.sourceType,
      title: result.title,
      author: result.author,
      site_name: result.siteName,
      lang: result.lang,
      excerpt: ai.summary || result.excerpt,
      content_html: result.contentHtml,
      content_text: result.contentText,
      word_count: result.wordCount,
      read_time: result.readTime,
      hero_image: result.heroImage,
      published_at: result.publishedAt,
      ai_tags_json: ai.tags,
      fetched_at: new Date().toISOString(),
      extract_status: result.status,
      failure_reason: result.failureReason,
    });

    // Link every content-less article that captured this URL to the
    // (re)written content — including on failure, so a permanently-spinning
    // "processing" card (apps/web/src/lib/article/card-state.ts) can reach
    // "failed" state and offer a retry, instead of spinning forever.
    const toLink = await pb.collection("articles").getFullList({
      filter: pb.filter("canonical_url = {:url} && content = ''", {
        url: job.canonical_url,
      }),
    });
    for (const a of toLink) {
      await pb.collection("articles").update(a.id, {
        content: content.id,
        is_private: false,
      });
    }

    if (result.status === "failed") {
      await pb.collection("jobs").update(jobId, {
        status: "failed",
        attempts: job.attempts + 1,
        last_error: result.failureReason ?? "extract failed",
        content: content.id,
      });
      return;
    }

    await pb.collection("jobs").update(jobId, {
      status: "done",
      content: content.id,
    });
  } catch (err) {
    // PocketBase validation failures carry field-level detail on
    // err.response.data; err.message alone ("Failed to create record.") hides
    // which field was rejected. Surface the full payload so a stuck job can be
    // diagnosed from last_error without re-running the worker.
    const data = (err as { response?: { data?: unknown } })?.response?.data;
    const detail = data ? ` ${JSON.stringify(data)}` : "";
    const msg = (err instanceof Error ? err.message : String(err)) + detail;
    await pb.collection("jobs").update(jobId, {
      status: "failed",
      attempts: job.attempts + 1,
      last_error: msg,
    });
  }
}
```

- [ ] **Step 4: Run the full worker integration test file to verify it passes**

Run: `pnpm exec vitest run apps/worker/src/worker.integration.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full worker test suite to catch any other regression**

Run: `pnpm exec vitest run apps/worker`
Expected: PASS — no other worker test depends on the old failed-extraction early-return behavior.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/worker.ts apps/worker/src/worker.integration.test.ts
git commit -m "fix(worker): write and link content on failed extractions, not just success"
```

---

## Manual verification (against the currently running local stack)

The bug was originally found against a live stack with one real stuck article (`https://mathstodon.xyz/@iblech/116769502749142438`, job `f0vf4tkj964n2qc`, article `axvdh7whwg7ybt3`). After this plan lands and the worker image is rebuilt:

1. Rebuild and restart the worker: `docker compose up -d --build worker`
2. Hit the retry route as that article's owner (or trigger it from the library UI's retry button once the card reaches "failed" state) — or simplest, reset the job directly for a manual check:
   ```bash
   curl -s -X POST http://localhost:8090/api/collections/_superusers/auth-with-password \
     -H "Content-Type: application/json" \
     -d '{"identity":"admin@example.com","password":"change-me-admin"}' \
     | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" > /tmp/tok
   curl -s -X PATCH http://localhost:8090/api/collections/jobs/records/f0vf4tkj964n2qc \
     -H "Authorization: $(cat /tmp/tok)" -H "Content-Type: application/json" \
     -d '{"status":"queued","attempts":0,"last_error":"","locked_at":"","locked_by":""}'
   ```
3. Watch `docker logs -f readmepls-worker-1` and re-query the `jobs`/`content`/`articles` records — confirm the job reaches `failed` again (mathstodon.xyz genuinely has no readable article body), but this time `articles/axvdh7whwg7ybt3` has a non-empty `content` field pointing at a `content` row with `extract_status: "failed"`.
4. Refresh the library page — the card should now show the "failed" state (title/failure reason, retry button) instead of an infinite spinner.
