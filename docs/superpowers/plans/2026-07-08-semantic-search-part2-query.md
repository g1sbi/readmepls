# Semantic Search — Part 2: Query Surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Part 1 (`2026-07-08-semantic-search-part1-indexing.md`) must be complete first** — this plan consumes the `embeddings` index it builds.

**Goal:** A user typing a meaning-based query gets back their own articles ranked by semantic similarity, rendered through the existing library UI, with a graceful fall back to keyword search if the worker is unreachable.

**Architecture:** A pure `rankSemanticHits` core function scopes/ranks. The worker runs a small internal HTTP `/search` endpoint (shared-secret) that embeds the query, resolves the caller's article→content set, ranks over the shared content embeddings, and returns ranked `articleId`s. A SvelteKit BFF resolver proxies to it and feeds the ids into the existing library search-id render path. A `mode` param + toggle switches keyword/semantic.

**Tech Stack:** TypeScript (strict), Zod, Vitest, PocketBase, Node `http`, SvelteKit.

**Design spec:** `docs/superpowers/specs/2026-07-08-semantic-search-design.md`.

## Global Constraints

- **TDD, TS strict, no `any`, Zod at boundaries** (worker `/search` response validated; PB reads validated).
- **Per-user scoping is a security boundary.** A search must return only the caller's own `articleId`s, never a hit for content the caller has not saved — even though `embeddings` are globally shared. This is enforced at query time and has an explicit two-user test.
- **Worker `/search` is internal only:** protected by a shared secret header (`x-worker-secret`), bound to the internal network in deployment, never exposed to the browser.
- **Graceful degrade:** if the worker is unreachable or errors, the library falls back to keyword search — a semantic-search outage never breaks the library.
- **Default search mode is `semantic`** (the flagship); `keyword` is opt-out via a toggle.
- **Commits:** Conventional Commits, one logical change per commit. Do not push or open PRs.

---

## Part 2 Interfaces (defined across the tasks below)

```ts
// @readmepls/types  (Task 9)
type SemanticHit = { articleId: string; contentId: string; chunkIndex: number;
  charStart: number; charEnd: number; score: number; snippet: string };

// @readmepls/core  (Task 9)
interface ArticleRef { articleId: string; contentId: string; }
function rankSemanticHits(queryVec: number[], articles: ArticleRef[],
  rows: EmbeddingRow[], k: number, snippetLen?: number): SemanticHit[];

// @readmepls/core  (Task 11 — refactor of existing fetch.ts)
type SearchIdsResolver = (pb: PocketBase, q: string) => Promise<string[]>;
const keywordSearchIds: SearchIdsResolver;   // the existing /api/search call, extracted
// fetchLibraryPage gains an optional 4th param: resolveSearchIds = keywordSearchIds

// worker  (Task 10)
function createSearchServer(deps: { pb: PocketBase; embedder: EmbeddingProvider; secret: string }): http.Server;

// web  (Task 11)
function semanticSearchIds(query: string, userId: string): Promise<string[]>;
```

---

### Task 9: `SemanticHit` type + core `rankSemanticHits`

**Files:**
- Modify: `packages/types/src/embedding.ts` (add `SemanticHit`)
- Create: `packages/core/src/embedding/search.ts`
- Test: `packages/core/src/embedding/search.test.ts`
- Modify: `packages/core/src/index.ts` (add export)

**Interfaces:**
- Consumes: `dot` (Part 1 Task 2), `EmbeddingRow` (Part 1 Task 3).
- Produces: `SemanticHit`, `ArticleRef`, `rankSemanticHits(...)` — see Part 2 Interfaces.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/embedding/search.test.ts
import { describe, it, expect } from "vitest";
import { rankSemanticHits, type ArticleRef } from "./search.js";
import type { EmbeddingRow } from "@readmepls/types";

function row(content: string, chunk: number, vector: number[], text = "t"): EmbeddingRow {
  return { id: `${content}-${chunk}`, content, chunk_index: chunk, char_start: 0,
    char_end: text.length, text, vector, embed_model: "fake", dim: vector.length };
}

describe("rankSemanticHits", () => {
  const articles: ArticleRef[] = [
    { articleId: "aA", contentId: "cA" },
    { articleId: "aB", contentId: "cB" },
  ];

  it("ranks the caller's articles by best matching chunk", () => {
    const q = [1, 0];
    const rows = [row("cA", 0, [1, 0]), row("cB", 0, [0, 1])];
    const hits = rankSemanticHits(q, articles, rows, 10);
    expect(hits.map((h) => h.articleId)).toEqual(["aA", "aB"]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it("collapses multiple chunks of one article to its best chunk", () => {
    const q = [1, 0];
    const rows = [row("cA", 0, [0.2, 0.98]), row("cA", 1, [1, 0])];
    const hits = rankSemanticHits(q, articles, rows, 10);
    expect(hits.filter((h) => h.articleId === "aA")).toHaveLength(1);
    expect(hits[0]!.chunkIndex).toBe(1); // the better-matching chunk
  });

  it("drops rows for content the caller has not saved (scoping)", () => {
    const q = [1, 0];
    const rows = [row("cA", 0, [1, 0]), row("cX", 0, [1, 0])]; // cX not in articles
    const hits = rankSemanticHits(q, articles, rows, 10);
    expect(hits.map((h) => h.contentId)).toEqual(["cA"]);
  });

  it("truncates the snippet and respects k", () => {
    const q = [1, 0];
    const rows = [row("cA", 0, [1, 0], "x".repeat(500)), row("cB", 0, [0.9, 0.1], "y")];
    const hits = rankSemanticHits(q, articles, rows, 1, 100);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.snippet.length).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/embedding/search.test.ts`
Expected: FAIL — cannot find module `./search.js`.

- [ ] **Step 3: Add `SemanticHit` to types**

Append to `packages/types/src/embedding.ts`:

```ts
/** A ranked semantic-search hit, scoped to one user's article. */
export const SemanticHit = z.object({
  articleId: z.string(),
  contentId: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
  score: z.number(),
  snippet: z.string(),
});
export type SemanticHit = z.infer<typeof SemanticHit>;
```

- [ ] **Step 4: Write `rankSemanticHits`**

```ts
// packages/core/src/embedding/search.ts
import type { EmbeddingRow, SemanticHit } from "@readmepls/types";
import { dot } from "./cosine.js";

/** One of the caller's articles and the shared content row it points at. */
export interface ArticleRef {
  articleId: string;
  contentId: string;
}

/**
 * Rank a query vector against chunk embeddings, scoped to the caller's own
 * articles. `rows` may contain embeddings for content outside the caller's library
 * (embeddings are globally shared) — those are dropped here, which is the query-time
 * security boundary. Collapses to the single best-matching chunk per article, sorts
 * by score, returns the top `k`.
 */
export function rankSemanticHits(
  queryVec: number[],
  articles: ArticleRef[],
  rows: EmbeddingRow[],
  k: number,
  snippetLen = 240
): SemanticHit[] {
  const contentToArticle = new Map<string, string>();
  for (const a of articles) contentToArticle.set(a.contentId, a.articleId);

  const best = new Map<string, SemanticHit>();
  for (const r of rows) {
    const articleId = contentToArticle.get(r.content);
    if (!articleId) continue; // not in the caller's library — scoping boundary
    const score = dot(queryVec, r.vector);
    const prev = best.get(articleId);
    if (prev && prev.score >= score) continue;
    best.set(articleId, {
      articleId,
      contentId: r.content,
      chunkIndex: r.chunk_index,
      charStart: r.char_start,
      charEnd: r.char_end,
      score,
      snippet: r.text.slice(0, snippetLen),
    });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, k);
}
```

- [ ] **Step 5: Add the export**

In `packages/core/src/index.ts`, add:

```ts
export * from "./embedding/search.js";
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/embedding/search.test.ts packages/types/src/embedding.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/embedding.ts packages/core/src/embedding/search.ts packages/core/src/embedding/search.test.ts packages/core/src/index.ts
git commit -m "feat(core): add rankSemanticHits and SemanticHit type"
```

---

### Task 10: Worker `/search` HTTP endpoint

**Files:**
- Create: `apps/worker/src/http/search-server.ts`
- Test: `apps/worker/src/http/search-server.integration.test.ts`
- Modify: `apps/worker/src/main.ts` (start the server)

**Interfaces:**
- Consumes: `rankSemanticHits`, `ArticleRef` (Task 9), `EmbeddingRow` (Part 1 Task 3), `EmbeddingProvider` (Part 1 Task 5), `indexContent`/`FakeEmbedder` (Part 1) in the test.
- Produces: `createSearchServer({ pb, embedder, secret })` → `http.Server` serving `GET /search?q&user&k` returning `{ results: SemanticHit[] }`.

- [ ] **Step 1: Write the failing integration test**

```ts
// apps/worker/src/http/search-server.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/pb/test-harness";
import { FakeEmbedder } from "../embed/fake-embedder.js";
import { indexContent } from "../embed/index-content.js";
import { createSearchServer } from "./search-server.js";

describe("worker /search", () => {
  let h: PbHandle;
  let base: string;
  let server: ReturnType<typeof createSearchServer>;
  const SECRET = "test-secret";

  async function content(text: string): Promise<string> {
    const c = await h.pb.collection("content").create({
      canonical_url: `https://ex.com/${Math.random().toString(36).slice(2)}`,
      content_hash: "h", source_type: "article", title: "t", excerpt: "e",
      content_html: "<p>x</p>", content_text: text, word_count: 3, read_time: 1,
      ai_tags_json: [], fetched_at: new Date().toISOString(), extract_status: "ok",
    });
    return c.id;
  }
  async function user(email: string): Promise<string> {
    const u = await h.pb.collection("users").create({ email, password: "password12345", passwordConfirm: "password12345" });
    return u.id;
  }
  async function article(userId: string, contentId: string): Promise<string> {
    const a = await h.pb.collection("articles").create({
      user: userId, content: contentId, url: `https://ex.com/${contentId}`,
      status: "unread", progress: 0, is_private: false,
    });
    return a.id;
  }

  beforeAll(async () => {
    h = await startEphemeralPb();
    const embedder = new FakeEmbedder();
    const cSleep = await content("cortisol and sleep quality at night");
    const cTax = await content("quarterly tax accounting spreadsheet totals");
    await indexContent(h.pb, cSleep, "cortisol and sleep quality at night", embedder);
    await indexContent(h.pb, cTax, "quarterly tax accounting spreadsheet totals", embedder);
    const u1 = await user("u1@ex.com");
    const u2 = await user("u2@ex.com");
    (globalThis as Record<string, unknown>).__aSleep = await article(u1, cSleep); // u1 owns sleep
    await article(u2, cTax); // u2 owns tax
    server = createSearchServer({ pb: h.pb, embedder, secret: SECRET });
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await h.stop();
  });

  it("rejects a missing/wrong secret", async () => {
    const res = await fetch(`${base}/search?q=x&user=u1`);
    expect(res.status).toBe(401);
  });

  it("returns only the caller's own articles, ranked", async () => {
    const u1 = (await h.pb.collection("users").getFirstListItem('email = "u1@ex.com"')).id;
    const res = await fetch(`${base}/search?q=${encodeURIComponent("sleep and cortisol")}&user=${u1}`,
      { headers: { "x-worker-secret": SECRET } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { articleId: string; contentId: string }[] };
    // u1 only owns the sleep article; the tax content (u2's) must never appear
    expect(body.results.length).toBe(1);
    expect(body.results[0]!.articleId).toBe((globalThis as Record<string, unknown>).__aSleep);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/worker/src/http/search-server.integration.test.ts`
Expected: FAIL — cannot find module `./search-server.js`.

- [ ] **Step 3: Write the server**

```ts
// apps/worker/src/http/search-server.ts
import http from "node:http";
import type PocketBase from "pocketbase";
import { EmbeddingRow, type SemanticHit } from "@readmepls/types";
import { rankSemanticHits, type ArticleRef } from "@readmepls/core";
import type { EmbeddingProvider } from "../embed/provider.js";

export interface SearchServerDeps {
  pb: PocketBase;
  embedder: EmbeddingProvider;
  secret: string;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

/** OR-filter over a set of content ids, using placeholders (never string-interpolate
 *  ids into a PB filter). */
function contentInFilter(pb: PocketBase, ids: string[]): string {
  const params: Record<string, string> = {};
  const parts = ids.map((id, i) => {
    params[`c${i}`] = id;
    return `content = {:c${i}}`;
  });
  return pb.filter(parts.join(" || "), params);
}

export async function searchForUser(
  pb: PocketBase,
  embedder: EmbeddingProvider,
  userId: string,
  query: string,
  k: number
): Promise<SemanticHit[]> {
  // 1. the caller's own articles → article/content refs (the scoping set)
  const articles = await pb.collection("articles").getFullList({
    filter: pb.filter("user = {:u} && content != ''", { u: userId }),
    fields: "id,content",
    requestKey: null,
  });
  const refs: ArticleRef[] = articles.map((a) => ({ articleId: a.id, contentId: a.content as string }));
  if (refs.length === 0) return [];

  // 2. embeddings for those content rows only
  const contentIds = [...new Set(refs.map((r) => r.contentId))];
  const rowsRaw = await pb.collection("embeddings").getFullList({
    filter: contentInFilter(pb, contentIds),
    requestKey: null,
  });
  const rows = rowsRaw.map((r) => EmbeddingRow.parse(r));

  // 3. embed query + rank (pure)
  const [queryVec] = await embedder.embed([query], "query");
  if (!queryVec) return [];
  return rankSemanticHits(queryVec, refs, rows, k);
}

/**
 * Internal HTTP server for semantic search. Not exposed to the browser — the web
 * BFF calls it server-side with the shared secret. Bind to the internal network in
 * deployment.
 */
export function createSearchServer(deps: SearchServerDeps): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method !== "GET" || url.pathname !== "/search") {
        sendJson(res, 404, { error: "not_found" });
        return;
      }
      if (!deps.secret || req.headers["x-worker-secret"] !== deps.secret) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }
      const q = url.searchParams.get("q") ?? "";
      const user = url.searchParams.get("user") ?? "";
      const k = Math.min(Math.max(Number(url.searchParams.get("k") ?? "50") || 50, 1), 200);
      if (!q.trim() || !user) {
        sendJson(res, 200, { results: [] });
        return;
      }
      const results = await searchForUser(deps.pb, deps.embedder, user, q, k);
      sendJson(res, 200, { results });
    } catch (err) {
      console.error("[worker] /search error:", err);
      sendJson(res, 500, { error: "search_failed" });
    }
  });
}
```

- [ ] **Step 4: Run the integration test**

Run: `pnpm exec vitest run apps/worker/src/http/search-server.integration.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Start the server in `main.ts`**

In `apps/worker/src/main.ts`, add the import:

```ts
import { createSearchServer } from "./http/search-server.js";
```

After `deps` is built and before the polling `while (true)` loop, add:

```ts
  const searchSecret = process.env.WORKER_SEARCH_SECRET ?? "";
  const searchPort = Number(process.env.WORKER_HTTP_PORT ?? "8091");
  if (searchSecret) {
    const server = createSearchServer({ pb, embedder, secret: searchSecret });
    server.listen(searchPort, () => console.log(`[worker ${workerId}] /search on :${searchPort}`));
  } else {
    console.warn(`[worker ${workerId}] WORKER_SEARCH_SECRET unset — semantic /search disabled`);
  }
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add apps/worker/src/http/search-server.ts apps/worker/src/http/search-server.integration.test.ts apps/worker/src/main.ts
git commit -m "feat(worker): serve internal /search semantic endpoint"
```

---

### Task 11: Web BFF resolver + injectable search seam

**Files:**
- Modify: `packages/core/src/library/fetch.ts` (extract `keywordSearchIds`, add injectable resolver param)
- Create: `apps/web/src/lib/server/semantic-search.ts`
- Test: `apps/web/src/lib/server/semantic-search.test.ts`
- Modify: `apps/web/src/routes/library/+page.server.ts` (choose resolver by mode, with fallback)

**Interfaces:**
- Consumes: `SemanticHit` (Task 9), `fetchLibraryPage` (existing).
- Produces: `SearchIdsResolver`, exported `keywordSearchIds`, `fetchLibraryPage`'s optional 4th param; `semanticSearchIds(query, userId)`.

- [ ] **Step 1: Refactor `fetch.ts` to inject the resolver**

In `packages/core/src/library/fetch.ts`, replace the private `searchIds` function with an exported resolver type + default, and add the parameter. Change:

```ts
async function searchIds(pb: PocketBase, q: string): Promise<string[]> {
  const res = await pb.send("/api/search", { method: "GET", query: { q } });
  const results = (res as { results?: { articleId: string }[] }).results ?? [];
  return results.map((r) => r.articleId).slice(0, 200);
}
```

to:

```ts
export type SearchIdsResolver = (pb: PocketBase, q: string) => Promise<string[]>;

/** Default keyword resolver: the FTS `/api/search` PocketBase route. */
export const keywordSearchIds: SearchIdsResolver = async (pb, q) => {
  const res = await pb.send("/api/search", { method: "GET", query: { q } });
  const results = (res as { results?: { articleId: string }[] }).results ?? [];
  return results.map((r) => r.articleId).slice(0, 200);
};
```

Then change the `fetchLibraryPage` signature and the one call site:

```ts
export async function fetchLibraryPage(
  pb: PocketBase, params: LibraryParams, now: Date = new Date(),
  resolveSearchIds: SearchIdsResolver = keywordSearchIds,
): Promise<LibraryPage> {
```

and inside it, replace `const ids = await searchIds(pb, params.q);` with:

```ts
    const ids = await resolveSearchIds(pb, params.q);
```

- [ ] **Step 2: Write the failing test for the web resolver**

```ts
// apps/web/src/lib/server/semantic-search.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("$env/dynamic/private", () => ({
  env: { WORKER_URL: "http://worker:8091", WORKER_SEARCH_SECRET: "s3cret" },
}));

import { semanticSearchIds } from "./semantic-search.js";

describe("semanticSearchIds", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls the worker with the secret and maps hits to article ids", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ results: [{ articleId: "a1" }, { articleId: "a2" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const ids = await semanticSearchIds("sleep", "u1");
    expect(ids).toEqual(["a1", "a2"]);
    const calledUrl = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(calledUrl.pathname).toBe("/search");
    expect(calledUrl.searchParams.get("user")).toBe("u1");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ "x-worker-secret": "s3cret" });
  });

  it("throws on a non-ok worker response (so the caller can fall back)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 502 })));
    await expect(semanticSearchIds("x", "u1")).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/server/semantic-search.test.ts`
Expected: FAIL — cannot find module `./semantic-search.js`.

- [ ] **Step 4: Write `semanticSearchIds`**

```ts
// apps/web/src/lib/server/semantic-search.ts
import { env } from "$env/dynamic/private";
import type { SemanticHit } from "@readmepls/types";

/**
 * Ask the worker's internal /search endpoint for this user's semantically-ranked
 * article ids. Server-only (uses the shared secret). Throws on any failure so the
 * caller can fall back to keyword search.
 */
export async function semanticSearchIds(query: string, userId: string): Promise<string[]> {
  const base = env.WORKER_URL;
  if (!base) throw new Error("WORKER_URL not configured");
  const url = new URL("/search", base);
  url.searchParams.set("q", query);
  url.searchParams.set("user", userId);
  url.searchParams.set("k", "200");
  const res = await fetch(url.toString(), {
    headers: { "x-worker-secret": env.WORKER_SEARCH_SECRET ?? "" },
  });
  if (!res.ok) throw new Error(`worker /search returned ${res.status}`);
  const body = (await res.json()) as { results?: SemanticHit[] };
  return (body.results ?? []).map((r) => r.articleId);
}
```

- [ ] **Step 5: Wire the resolver into the library load**

Replace `apps/web/src/routes/library/+page.server.ts` with:

```ts
import type { PageServerLoad } from "./$types";
import { parseLibraryParams, fetchLibraryPage, fetchFacetOptions, keywordSearchIds } from "@readmepls/core";
import { semanticSearchIds } from "$lib/server/semantic-search";

export const load: PageServerLoad = async ({ url, locals }) => {
  const params = parseLibraryParams(url.searchParams);

  // Semantic search by default; fall back to keyword if the worker is unreachable
  // so a semantic-search outage never breaks the library.
  const useSemantic = params.q.trim() !== "" && params.mode === "semantic";
  const resolver = useSemantic
    ? async (pb: Parameters<typeof keywordSearchIds>[0], q: string) => {
        try {
          return await semanticSearchIds(q, locals.pb.authStore.record?.id ?? "");
        } catch (err) {
          console.error("[web] semantic search failed, falling back to keyword:", err);
          return keywordSearchIds(pb, q);
        }
      }
    : undefined;

  const [page, facets] = await Promise.all([
    fetchLibraryPage(locals.pb, params, new Date(), resolver),
    fetchFacetOptions(locals.pb),
  ]);
  return { params, page, facets, focusSearch: url.searchParams.get("focus") === "search" };
};
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm exec vitest run apps/web/src/lib/server/semantic-search.test.ts packages/core/src/library`
Expected: PASS (resolver tests + existing library tests still green).

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/library/fetch.ts apps/web/src/lib/server/semantic-search.ts apps/web/src/lib/server/semantic-search.test.ts apps/web/src/routes/library/+page.server.ts
git commit -m "feat(web): route library search through worker semantic endpoint"
```

---

### Task 12: `mode` param + search-mode toggle

**Files:**
- Modify: `packages/types/src/library.ts` (add `mode`)
- Modify: `packages/core/src/library/params.ts` (parse/serialize `mode`)
- Modify: `packages/core/src/library/params.test.ts` (update default assertions — see Step 3)
- Create: `apps/web/src/lib/components/library/SearchModeToggle.svelte`
- Modify: `apps/web/src/routes/library/+page.svelte` (mount the toggle near the search input)

**Interfaces:**
- Consumes: `LibraryParams`, `serializeLibraryParams` (existing).
- Produces: `LibraryParams.mode: "keyword" | "semantic"` (default `"semantic"`), round-tripped through the URL.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/library/params.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseLibraryParams, serializeLibraryParams } from "./params.js";

describe("library params — mode", () => {
  it("defaults mode to semantic", () => {
    expect(parseLibraryParams(new URLSearchParams()).mode).toBe("semantic");
  });
  it("parses mode=keyword", () => {
    expect(parseLibraryParams(new URLSearchParams("mode=keyword")).mode).toBe("keyword");
  });
  it("ignores an invalid mode, falling back to semantic", () => {
    expect(parseLibraryParams(new URLSearchParams("mode=bogus")).mode).toBe("semantic");
  });
  it("serializes keyword but omits the semantic default", () => {
    const semantic = parseLibraryParams(new URLSearchParams());
    expect(serializeLibraryParams(semantic).has("mode")).toBe(false);
    const keyword = parseLibraryParams(new URLSearchParams("mode=keyword"));
    expect(serializeLibraryParams(keyword).get("mode")).toBe("keyword");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/library/params.test.ts`
Expected: FAIL — `mode` is undefined / not serialized.

- [ ] **Step 3: Add `mode` to the type and parser**

In `packages/types/src/library.ts`, add to the `LibraryParams` object (after `q`):

```ts
  mode: z.enum(["keyword", "semantic"]).default("semantic"),
```

In `packages/core/src/library/params.ts`:

Inside `parseLibraryParams`, add to the parsed object (after `q`):

```ts
    mode: sp.get("mode") === "keyword" ? "keyword" : "semantic",
```

Inside `serializeLibraryParams`, add (after the `q` line):

```ts
  if (p.mode !== "semantic") sp.set("mode", p.mode);
```

> If any existing assertion in `params.test.ts` deep-equals a full parsed params object, add `mode: "semantic"` to that expected object.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/library/params.test.ts packages/types`
Expected: PASS.

- [ ] **Step 5: Write the toggle component**

```svelte
<!-- apps/web/src/lib/components/library/SearchModeToggle.svelte -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";

  type Mode = "semantic" | "keyword";
  let { mode }: { mode: Mode } = $props();

  function set(next: Mode) {
    const sp = new URLSearchParams($page.url.searchParams);
    if (next === "semantic") sp.delete("mode");
    else sp.set("mode", next);
    sp.delete("page");
    goto(`?${sp.toString()}`, { keepFocus: true, noScroll: true });
  }
</script>

<div class="mode-toggle" role="group" aria-label="search mode">
  <button type="button" aria-pressed={mode === "semantic"} onclick={() => set("semantic")}>
    meaning
  </button>
  <button type="button" aria-pressed={mode === "keyword"} onclick={() => set("keyword")}>
    exact
  </button>
</div>

<style>
  .mode-toggle { display: inline-flex; gap: var(--space-1, 0.25rem); }
  .mode-toggle button {
    padding: 0.25rem 0.6rem; border-radius: var(--radius-sm, 0.375rem);
    font-size: 0.8rem; color: var(--color-ink-soft, inherit);
    background: transparent; border: 1px solid var(--color-line, currentColor);
    cursor: pointer; min-height: 44px;
  }
  .mode-toggle button[aria-pressed="true"] {
    background: var(--color-accent, #C24A38); color: var(--color-paper, #fff);
    border-color: transparent;
  }
</style>
```

> Tokens above reference `tokens.css` variables with fallbacks; adjust names to the exact tokens in `apps/web/src/lib/styles/tokens.css` if they differ. Do not hardcode new colors.

- [ ] **Step 6: Mount the toggle in the library page**

In `apps/web/src/routes/library/+page.svelte`, import and render the toggle beside the search input. The `data.params.mode` value is available from the load. Add near the search field markup:

```svelte
<script lang="ts">
  import SearchModeToggle from "$lib/components/library/SearchModeToggle.svelte";
  // ...existing script; `data` already in scope
</script>

<!-- next to the existing search input, only meaningful when a query is present -->
{#if data.params.q}
  <SearchModeToggle mode={data.params.mode} />
{/if}
```

- [ ] **Step 7: Verify + commit**

Run: `pnpm exec vitest run packages/core/src/library apps/web/src/routes/library`
Expected: PASS (update any snapshot/default-shape assertions flagged in Step 3).

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

```bash
git add packages/types/src/library.ts packages/core/src/library/params.ts packages/core/src/library/params.test.ts apps/web/src/lib/components/library/SearchModeToggle.svelte apps/web/src/routes/library/+page.svelte
git commit -m "feat(web): add semantic/keyword search mode toggle"
```

---

### Task 13: Deployment wiring (Compose, env, model cache)

**Files:**
- Modify: `compose.yml` (worker: expose `/search` on the internal network + model-cache volume + env; web: `WORKER_URL` + `WORKER_SEARCH_SECRET`)
- Modify: `.env.example` (query-side env vars)
- Modify: `README.md` (document the new env vars)

**Interfaces:**
- Consumes: worker `WORKER_HTTP_PORT`/`WORKER_SEARCH_SECRET` (Task 10), web `WORKER_URL`/`WORKER_SEARCH_SECRET` (Task 11), worker `TRANSFORMERS_CACHE` (Part 1 Task 8).

- [ ] **Step 1: Add env vars to `.env.example`**

Append:

```
# --- Semantic search query path ---
# Shared secret protecting the worker's internal /search endpoint. Set the SAME
# value on the worker and the web app. Generate: openssl rand -hex 32
WORKER_SEARCH_SECRET=
# Port the worker serves /search on (internal network only).
WORKER_HTTP_PORT=8091
# How the web app reaches the worker's /search (internal service URL).
WORKER_URL=http://worker:8091
```

- [ ] **Step 2: Wire the worker service in `compose.yml`**

In the `worker` service, add (merge into existing `environment` / add `volumes`):

```yaml
    environment:
      # ...existing worker env...
      WORKER_SEARCH_SECRET: ${WORKER_SEARCH_SECRET}
      WORKER_HTTP_PORT: "8091"
      TRANSFORMERS_CACHE: /data/models
      # EMBED_PROVIDER unset → local ONNX model
    volumes:
      - worker_models:/data/models   # persist the downloaded embedding model
    expose:
      - "8091"   # internal only — do NOT publish to the host
```

And add the named volume at the bottom of `compose.yml`:

```yaml
volumes:
  worker_models:
```

- [ ] **Step 3: Wire the web service in `compose.yml`**

In the `web` service `environment`, add:

```yaml
      WORKER_URL: http://worker:8091
      WORKER_SEARCH_SECRET: ${WORKER_SEARCH_SECRET}
```

- [ ] **Step 4: Document in `README.md`**

Add a short "Semantic search" subsection to the env/config docs noting: local embedding model (no key), `WORKER_SEARCH_SECRET` must match across web+worker, the model downloads once to the `worker_models` volume on first capture, and `BACKFILL_EMBEDDINGS=1` indexes existing content.

- [ ] **Step 5: Manual end-to-end verification**

```bash
cp .env.example .env
# set WORKER_SEARCH_SECRET to `openssl rand -hex 32`
docker compose up -d --build
```

Then: capture a couple of links, wait for the worker to extract + embed (check worker logs for `/search on :8091` and no embedding errors), open `/library`, type a meaning-based query (e.g. a paraphrase not using the article's exact words), confirm results come back and the "meaning/exact" toggle switches behavior. Stop the worker and confirm the library still returns keyword results (graceful fallback).

- [ ] **Step 6: Commit**

```bash
git add compose.yml .env.example README.md
git commit -m "feat(deploy): wire worker /search endpoint and model cache into compose"
```

---

## Part 2 Definition of Done

- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` all pass.
- [ ] Two-user scoping test proves a user never receives another user's articles from semantic search.
- [ ] Manual e2e: a paraphrased query surfaces the right article; the toggle switches keyword/semantic; worker-down falls back to keyword without error.
- [ ] Once shipped and merged, delete both plan files and the paired spec per the repo working agreements (the design spec is not a living reference).
