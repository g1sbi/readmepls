# Phase 5 — X/YouTube Extractors + Paywall Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route capture jobs by source type to per-source extractors, adding public X/Twitter thread extraction (syndication endpoint), YouTube transcript extraction (yt-dlp), and best-effort paywalled-article recovery from the web archive.

**Architecture:** Today `processJob` fetches HTML itself and runs one hardcoded `ArticleExtractor`. We refactor the `Extractor` interface to be **async and own its own fetching** via an injected `ExtractIO` seam (`fetchHtml` / `fetchJson` / `runYtDlp`), and add an `ExtractorRegistry` that dispatches by `SourceType`. Each new source = a thin async IO shell in the worker wrapping a **pure parse function** in `@readmepls/core`, tested against saved fixtures (no live network).

**Tech Stack:** TypeScript (strict, ESM), Vitest, Zod, jsdom + @mozilla/readability (article), X public syndication JSON endpoint, `yt-dlp` subprocess, PocketBase. Worker bundles with esbuild.

## Global Constraints

- **TDD always** — failing test first, then implementation. No production code without a driving test.
- **TypeScript strict** — no `any` without a written reason.
- **Validate at boundaries with Zod** — extractor input (syndication JSON, yt-dlp output, Wayback response) parsed before use; never trust external shapes.
- **Model states as unions** — `ExtractResult.status: 'pending'|'ok'|'partial'|'failed'`. Graceful-degrade paths are type-checked.
- **Pure core, thin IO shell** — parse logic is pure and in `@readmepls/core`; HTTP / subprocess live behind injected interfaces at the worker edge.
- **Extractor tests use saved fixtures** — deterministic, offline. Never live network.
- **Never globally cache gated content** — X/YouTube public extractions and public archive snapshots are cacheable; per-user session capture is out of scope.
- **Conventional Commits**, one logical change per commit. Do not push or open a PR.
- **Workspace packages ship TS source** (`@readmepls/core`, `@readmepls/types` have `main: src/index.ts`). Do not repoint at `dist`. The worker bundles `main.ts` with esbuild.
- Default AI model `claude-haiku-4-5` (unchanged this phase).

---

## File Structure

**`@readmepls/core` (pure, fixture-tested):**
- Create `packages/core/src/source/extract-result.ts` — `failedResult(source, reason)` + `escapeHtml(s)` shared builders.
- Create `packages/core/src/source/x/tweet-id.ts` — `parseTweetId`, `syndicationToken`.
- Create `packages/core/src/source/x/syndication.ts` — `parseSyndicationThread(raw): ExtractResult` (pure).
- Create `packages/core/src/source/youtube/video-id.ts` — `parseVideoId`.
- Create `packages/core/src/source/youtube/transcript.ts` — `YtMeta`/`YtCaptions`/`YtDlpOutput` types, `parseJson3Captions`, `parseYtTranscript` (pure).
- Modify `packages/core/src/index.ts` — export the new modules.

**`@readmepls/worker` (thin IO shells):**
- Modify `apps/worker/src/extract/extractor.ts` — async `Extractor` + `ExtractIO` interface.
- Create `apps/worker/src/extract/parse-article.ts` — pure `parseArticleHtml(url, html)` (moved out of the class).
- Modify `apps/worker/src/extract/article-extractor.ts` — async `extract(url, io)`, archive fallback.
- Create `apps/worker/src/extract/registry.ts` — `ExtractorRegistry`.
- Create `apps/worker/src/extract/archive-fallback.ts` — `isThinExtraction`, `recoverFromArchive`.
- Create `apps/worker/src/extract/x-extractor.ts` — `XExtractor`.
- Create `apps/worker/src/extract/youtube-extractor.ts` — `YoutubeExtractor`.
- Create `apps/worker/src/extract/yt-dlp.ts` — `createRunYtDlp` subprocess adapter.
- Modify `apps/worker/src/worker.ts` — `ProcessDeps` → `{ io, registry, ai, classify }`; route via registry.
- Modify `apps/worker/src/main.ts` — build `io` + registry, wire `fetchJson`, `runYtDlp`.
- Modify `apps/worker/src/run-loop.test.ts`, `apps/worker/src/worker.integration.test.ts`, `apps/worker/src/extract/article-extractor.test.ts` — new deps shape.
- Modify `apps/worker/Dockerfile` — add `yt-dlp` + `python3` to runtime image.

**Fixtures (offline):**
- `packages/core/src/source/x/fixtures/single-tweet.json`, `thread-with-quote.json`, `unavailable.json`
- `packages/core/src/source/youtube/fixtures/captions.json3.json`, `meta.json`

---

## Task 1: Router refactor — async Extractor + ExtractIO + registry

Foundation. The interface, `ProcessDeps`, and all call sites change together (they will not compile independently). Behavior stays identical: only `ArticleExtractor` is registered, routing is a no-op pass-through. The integration tests prove parity.

**Files:**
- Modify: `apps/worker/src/extract/extractor.ts`
- Create: `apps/worker/src/extract/parse-article.ts`
- Modify: `apps/worker/src/extract/article-extractor.ts`
- Create: `apps/worker/src/extract/registry.ts`
- Modify: `apps/worker/src/worker.ts`
- Modify: `apps/worker/src/main.ts`
- Test: `apps/worker/src/extract/registry.test.ts` (create), `apps/worker/src/extract/article-extractor.test.ts`, `apps/worker/src/run-loop.test.ts`, `apps/worker/src/worker.integration.test.ts`

**Interfaces:**
- Produces:
  - `interface ExtractIO { fetchHtml(url: string): Promise<string>; fetchJson(url: string): Promise<unknown>; runYtDlp(videoId: string): Promise<YtDlpOutput> }`
  - `interface Extractor { source: SourceType; extract(url: string, io: ExtractIO): Promise<ExtractResult> }`
  - `parseArticleHtml(url: string, html: string): ExtractResult` (pure)
  - `class ExtractorRegistry { constructor(extractors: Extractor[]); for(source: SourceType): Extractor }`
  - `interface ProcessDeps { io: ExtractIO; registry: ExtractorRegistry; ai: AIProvider; classify(url: string): SourceType }`
- Consumes: `YtDlpOutput` is defined in Task 4. **For this task**, declare it as a local placeholder in `extractor.ts` and Task 4 will move it to core and re-import. Use exactly: `export interface YtDlpOutput { meta: unknown; captions: unknown }` — Task 4 replaces `unknown` with the real types.

- [ ] **Step 1: Write the failing registry test**

Create `apps/worker/src/extract/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ExtractorRegistry } from "./registry.js";
import type { Extractor, ExtractIO } from "./extractor.js";
import type { ExtractResult, SourceType } from "@readmepls/types";

function stub(source: SourceType): Extractor {
  return {
    source,
    extract: async () => ({ sourceType: source }) as unknown as ExtractResult,
  };
}

describe("ExtractorRegistry", () => {
  it("returns the extractor registered for a source", () => {
    const x = stub("x");
    const reg = new ExtractorRegistry([stub("article"), x]);
    expect(reg.for("x")).toBe(x);
  });

  it("falls back to the article extractor for 'other'", () => {
    const article = stub("article");
    const reg = new ExtractorRegistry([article]);
    expect(reg.for("other")).toBe(article);
  });

  it("throws if no article extractor is registered and source is unknown", () => {
    const reg = new ExtractorRegistry([stub("x")]);
    expect(() => reg.for("other")).toThrow(/article extractor/);
  });
});

// Touch ExtractIO so the import is exercised by the type-checker.
const _io: ExtractIO | null = null;
void _io;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @readmepls/worker exec vitest run src/extract/registry.test.ts`
Expected: FAIL — cannot find `./registry.js` / `ExtractorRegistry`.

- [ ] **Step 3: Rewrite the Extractor interface (async + IO seam)**

Replace the entire contents of `apps/worker/src/extract/extractor.ts`:

```ts
import type { ExtractResult, SourceType } from "@readmepls/types";

// Placeholder until Task 4 defines the real yt-dlp shapes in @readmepls/core.
export interface YtDlpOutput {
  meta: unknown;
  captions: unknown;
}

/** Injected IO seams. Extractors own their fetching; tests pass fakes. */
export interface ExtractIO {
  /** SSRF-guarded HTML fetch (existing safe-fetch). */
  fetchHtml(url: string): Promise<string>;
  /** SSRF-guarded JSON fetch (syndication / Wayback availability). */
  fetchJson(url: string): Promise<unknown>;
  /** yt-dlp subprocess seam: metadata + captions for a video id. */
  runYtDlp(videoId: string): Promise<YtDlpOutput>;
}

export interface Extractor {
  /** Source this extractor handles. */
  source: SourceType;
  /** Fetch (via io) and parse a URL into a normalized result. */
  extract(url: string, io: ExtractIO): Promise<ExtractResult>;
}
```

- [ ] **Step 4: Extract the pure article parser**

Create `apps/worker/src/extract/parse-article.ts` by moving the current parse body out of the class. Full file:

```ts
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { ExtractResult } from "@readmepls/types";
import { sanitizeContentHtml } from "./sanitize.js";

const WORDS_PER_MIN = 220;

/** Pure: parse already-fetched HTML into a normalized article result. */
export function parseArticleHtml(url: string, html: string): ExtractResult {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const author =
    doc.querySelector('meta[name="author"]')?.getAttribute("content") ?? null;
  const siteName =
    doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ??
    null;
  const lang = doc.documentElement.getAttribute("lang") || null;
  const hero =
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null;

  const parsed = new Readability(doc).parse();

  if (!parsed || !parsed.textContent.trim()) {
    return {
      status: "failed",
      sourceType: "article",
      title: doc.title || url,
      author,
      siteName,
      lang,
      contentHtml: "",
      contentText: "",
      excerpt: "",
      wordCount: 0,
      readTime: 0,
      heroImage: hero,
      failureReason: "no readable content",
    };
  }

  const text = parsed.textContent.trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return {
    status: "ok",
    sourceType: "article",
    title: parsed.title || doc.title || url,
    author: parsed.byline || author,
    siteName: parsed.siteName || siteName,
    lang: parsed.lang || lang,
    contentHtml: sanitizeContentHtml(parsed.content ?? ""),
    contentText: text,
    excerpt: parsed.excerpt || text.slice(0, 280),
    wordCount,
    readTime: Math.max(1, Math.round(wordCount / WORDS_PER_MIN)),
    heroImage: hero,
    failureReason: null,
  };
}
```

- [ ] **Step 5: Make ArticleExtractor async and IO-driven**

Replace the contents of `apps/worker/src/extract/article-extractor.ts`. (Archive fallback is added in Task 6; for now it just fetches + parses.) Keep the existing reference comment:

```ts
import type { ExtractResult, SourceType } from "@readmepls/types";
import type { Extractor, ExtractIO } from "./extractor.js";
import { parseArticleHtml } from "./parse-article.js";

// Generic article path for everything that isn't X/YouTube: blogs, Substack,
// Medium, news sites. Readability parses server-rendered HTML, so SSR pages work.
// Limitation: purely client-rendered SPA blogs (content injected by JS, no SSR)
// won't extract — safe-fetch pulls static HTML, there's no headless browser.
// Rare for blogs (Substack/Medium SSR their content), so headless rendering is
// deliberately out of scope. Paywalled/preview-only posts read as thin and fall
// through to the archive fallback (see phase-5 extractors design §4.4).
export class ArticleExtractor implements Extractor {
  readonly source: SourceType = "article";

  async extract(url: string, io: ExtractIO): Promise<ExtractResult> {
    const html = await io.fetchHtml(url);
    return parseArticleHtml(url, html);
  }
}
```

- [ ] **Step 6: Implement the registry**

Create `apps/worker/src/extract/registry.ts`:

```ts
import type { SourceType } from "@readmepls/types";
import type { Extractor } from "./extractor.js";

/** Dispatches a URL's source type to its extractor. 'other' → article. */
export class ExtractorRegistry {
  private readonly map = new Map<SourceType, Extractor>();

  constructor(extractors: Extractor[]) {
    for (const e of extractors) this.map.set(e.source, e);
  }

  for(source: SourceType): Extractor {
    const direct = this.map.get(source);
    if (direct) return direct;
    const article = this.map.get("article");
    if (!article) {
      throw new Error(`no article extractor registered to handle source '${source}'`);
    }
    return article;
  }
}
```

- [ ] **Step 7: Run the registry test — expect PASS**

Run: `pnpm --filter @readmepls/worker exec vitest run src/extract/registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Rewire `processJob` to route via the registry**

In `apps/worker/src/worker.ts`, replace the `ProcessDeps` interface and the fetch+extract lines. New top of file:

```ts
import { createHash } from "node:crypto";
import type PocketBase from "pocketbase";
import type { ExtractIO } from "./extract/extractor.js";
import type { ExtractorRegistry } from "./extract/registry.js";
import type { AIProvider } from "./ai/provider.js";
import type { SourceType } from "@readmepls/types";

export interface ProcessDeps {
  io: ExtractIO;
  registry: ExtractorRegistry;
  ai: AIProvider;
  classify: (url: string) => SourceType;
}
```

Inside `processJob`, replace these two lines:

```ts
    const html = await deps.fetchHtml(job.canonical_url);
    const result = deps.extractor.extract(job.canonical_url, html);
```

with:

```ts
    const source = deps.classify(job.canonical_url);
    const extractor = deps.registry.for(source);
    const result = await extractor.extract(job.canonical_url, deps.io);
```

Also change the content-create line `failure_reason: null,` to `failure_reason: result.failureReason,` (so `partial` results carry their note; `ok` results already have `null`).

- [ ] **Step 9: Update the worker integration test to the new deps shape**

In `apps/worker/src/worker.integration.test.ts`, add an import and a shared `io`/`registry`, and replace both `processJob(...)` deps objects. Add near the top imports:

```ts
import { ExtractorRegistry } from "./extract/registry.js";
import type { ExtractIO } from "./extract/extractor.js";
```

Add a helper above the `describe`:

```ts
const registry = new ExtractorRegistry([new ArticleExtractor()]);
function ioWith(htmlBody: string): ExtractIO {
  return {
    fetchHtml: async () => htmlBody,
    fetchJson: async () => { throw new Error("fetchJson not used in this test"); },
    runYtDlp: async () => { throw new Error("runYtDlp not used in this test"); },
  };
}
```

Replace the first `processJob` deps object with:

```ts
    await processJob(h.pb, job.id, {
      io: ioWith(html),
      registry,
      ai: new MockAIProvider({ tags: ["hello"], summary: "A test." }),
      classify: classifySource,
    });
```

Replace the second (failure case) with:

```ts
    await processJob(h.pb, job.id, {
      io: ioWith("<html></html>"),
      registry,
      ai: new MockAIProvider(),
      classify: classifySource,
    });
```

- [ ] **Step 10: Update the run-loop test deps**

In `apps/worker/src/run-loop.test.ts`, add imports:

```ts
import { ExtractorRegistry } from "./extract/registry.js";
import type { ExtractIO } from "./extract/extractor.js";
```

Replace the `const deps = {...}` block with:

```ts
const io: ExtractIO = {
  fetchHtml: async () => html,
  fetchJson: async () => { throw new Error("unused"); },
  runYtDlp: async () => { throw new Error("unused"); },
};
const deps = {
  io,
  registry: new ExtractorRegistry([new ArticleExtractor()]),
  ai: new MockAIProvider({ tags: ["hello"], summary: "A test." }),
  classify: classifySource,
};
```

- [ ] **Step 11: Update the article-extractor unit test (async + mock io)**

Replace `apps/worker/src/extract/article-extractor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ArticleExtractor } from "./article-extractor.js";
import { parseArticleHtml } from "./parse-article.js";
import type { ExtractIO } from "./extractor.js";
import { ExtractResult } from "@readmepls/types";

const html = readFileSync(
  fileURLToPath(new URL("./fixtures/simple-article.html", import.meta.url)),
  "utf8"
);

function ioWith(body: string): ExtractIO {
  return {
    fetchHtml: async () => body,
    fetchJson: async () => { throw new Error("unused"); },
    runYtDlp: async () => { throw new Error("unused"); },
  };
}

describe("parseArticleHtml", () => {
  it("returns a schema-valid ok result", () => {
    const res = parseArticleHtml("https://example.com/post", html);
    expect(() => ExtractResult.parse(res)).not.toThrow();
    expect(res.status).toBe("ok");
    expect(res.sourceType).toBe("article");
    expect(res.contentHtml).not.toContain("<script");
  });

  it("extracts title, author, and readable text", () => {
    const res = parseArticleHtml("https://example.com/post", html);
    expect(res.title).toBe("Hello World Article");
    expect(res.author).toBe("Jane Doe");
    expect(res.contentText).toContain("first paragraph");
    expect(res.wordCount).toBeGreaterThan(10);
    expect(res.readTime).toBeGreaterThanOrEqual(1);
  });

  it("returns failed status when no article content is found", () => {
    const res = parseArticleHtml("https://example.com/x", "<html></html>");
    expect(res.status).toBe("failed");
    expect(res.failureReason).not.toBeNull();
  });
});

describe("ArticleExtractor", () => {
  it("fetches via io and parses", async () => {
    const res = await new ArticleExtractor().extract("https://example.com/post", ioWith(html));
    expect(res.status).toBe("ok");
    expect(res.title).toBe("Hello World Article");
  });
});
```

- [ ] **Step 12: Rewire `main.ts`**

In `apps/worker/src/main.ts`, add imports:

```ts
import { ExtractorRegistry } from "./extract/registry.js";
import type { ExtractIO } from "./extract/extractor.js";
```

After `fetchHtml` is built, add a `fetchJson` and a placeholder `runYtDlp` (real one lands in Task 5), and replace the `deps` object:

```ts
  const fetchJson = async (url: string): Promise<unknown> =>
    JSON.parse(await fetchHtml(url));

  const io: ExtractIO = {
    fetchHtml,
    fetchJson,
    runYtDlp: async () => {
      throw new Error("yt-dlp not wired yet");
    },
  };

  const registry = new ExtractorRegistry([new ArticleExtractor()]);

  const deps: ProcessDeps = {
    io,
    registry,
    ai,
    classify: classifySource,
  };
```

- [ ] **Step 13: Run the full worker suite — expect PASS**

Run: `pnpm --filter @readmepls/worker exec vitest run`
Expected: PASS. Article, registry, run-loop, and worker integration tests green; behavior unchanged from before the refactor.

- [ ] **Step 14: Typecheck**

Run: `pnpm --filter @readmepls/worker exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 15: Commit**

```bash
git add apps/worker/src/extract apps/worker/src/worker.ts apps/worker/src/main.ts \
  apps/worker/src/run-loop.test.ts apps/worker/src/worker.integration.test.ts
git commit -m "refactor(worker): async extractor interface + source->extractor router"
```

---

## Task 2: X parsers (pure, in core)

Pure tweet-id parsing, syndication token derivation, and syndication-JSON → `ExtractResult`. Plus two shared helpers (`failedResult`, `escapeHtml`) reused by the YouTube parser in Task 4.

**Files:**
- Create: `packages/core/src/source/extract-result.ts`
- Create: `packages/core/src/source/x/tweet-id.ts`
- Create: `packages/core/src/source/x/syndication.ts`
- Modify: `packages/core/src/index.ts`
- Fixtures: `packages/core/src/source/x/fixtures/single-tweet.json`, `thread-with-quote.json`, `unavailable.json`
- Test: `packages/core/src/source/x/tweet-id.test.ts`, `packages/core/src/source/x/syndication.test.ts`

**Interfaces:**
- Produces:
  - `failedResult(source: SourceType, reason: string): ExtractResult`
  - `escapeHtml(s: string): string`
  - `parseTweetId(url: string): string | null`
  - `syndicationToken(id: string): string`
  - `parseSyndicationThread(raw: unknown): ExtractResult`

- [ ] **Step 1: Write the failing tweet-id test**

Create `packages/core/src/source/x/tweet-id.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseTweetId, syndicationToken } from "./tweet-id.js";

describe("parseTweetId", () => {
  it("extracts the id from an x.com status url", () => {
    expect(parseTweetId("https://x.com/jack/status/20")).toBe("20");
  });
  it("extracts from twitter.com and ignores query/fragment", () => {
    expect(parseTweetId("https://twitter.com/u/status/1788?s=20")).toBe("1788");
  });
  it("returns null for non-status x urls", () => {
    expect(parseTweetId("https://x.com/jack")).toBeNull();
  });
  it("returns null for non-x hosts", () => {
    expect(parseTweetId("https://example.com/status/20")).toBeNull();
  });
});

describe("syndicationToken", () => {
  it("is deterministic and url-safe for a given id", () => {
    const t = syndicationToken("20");
    expect(t).toMatch(/^[a-z0-9]+$/);
    expect(syndicationToken("20")).toBe(t);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @readmepls/core exec vitest run src/source/x/tweet-id.test.ts`
Expected: FAIL — cannot find `./tweet-id.js`.

- [ ] **Step 3: Implement tweet-id + token**

Create `packages/core/src/source/x/tweet-id.ts`:

```ts
/** Tweet id from an x.com / twitter.com status URL, else null. */
export function parseTweetId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "x.com" && host !== "twitter.com") return null;
  const m = u.pathname.match(/\/status(?:es)?\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Token the public syndication endpoint expects. Derived deterministically from
 * the tweet id (community-known formula used by X's own embeds) — no secret.
 */
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, "");
}
```

- [ ] **Step 4: Run the tweet-id test — expect PASS**

Run: `pnpm --filter @readmepls/core exec vitest run src/source/x/tweet-id.test.ts`
Expected: PASS.

- [ ] **Step 5: Add shared result helpers**

Create `packages/core/src/source/extract-result.ts`:

```ts
import type { ExtractResult, SourceType } from "@readmepls/types";

/** Minimal-escape plain text for safe interpolation into generated HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A schema-valid failed result for a graceful, non-blocking extraction failure. */
export function failedResult(source: SourceType, reason: string): ExtractResult {
  return {
    status: "failed",
    sourceType: source,
    title: "",
    author: null,
    siteName: null,
    lang: null,
    contentHtml: "",
    contentText: "",
    excerpt: "",
    wordCount: 0,
    readTime: 0,
    heroImage: null,
    failureReason: reason,
  };
}
```

- [ ] **Step 6: Create X fixtures**

Create `packages/core/src/source/x/fixtures/single-tweet.json`:

```json
{
  "__typename": "Tweet",
  "text": "just setting up my twttr",
  "user": { "name": "jack", "screen_name": "jack" },
  "photos": [{ "url": "https://pbs.twimg.com/media/abc.jpg" }]
}
```

Create `packages/core/src/source/x/fixtures/thread-with-quote.json`:

```json
{
  "__typename": "Tweet",
  "text": "a thought about extraction",
  "user": { "name": "Ada L", "screen_name": "ada" },
  "quoted_tweet": {
    "text": "the original claim",
    "user": { "name": "Babbage", "screen_name": "charles" }
  }
}
```

Create `packages/core/src/source/x/fixtures/unavailable.json`:

```json
{ "__typename": "TweetTombstone", "tombstone": { "text": "This Tweet is unavailable." } }
```

- [ ] **Step 7: Write the failing syndication-parse test**

Create `packages/core/src/source/x/syndication.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSyndicationThread } from "./syndication.js";
import { ExtractResult } from "@readmepls/types";

const load = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8")
  );

describe("parseSyndicationThread", () => {
  it("renders a single tweet as a schema-valid ok result", () => {
    const res = parseSyndicationThread(load("single-tweet.json"));
    expect(() => ExtractResult.parse(res)).not.toThrow();
    expect(res.status).toBe("ok");
    expect(res.sourceType).toBe("x");
    expect(res.author).toContain("@jack");
    expect(res.contentText).toContain("just setting up my twttr");
    expect(res.heroImage).toBe("https://pbs.twimg.com/media/abc.jpg");
    expect(res.contentHtml).not.toContain("<script");
  });

  it("includes the quoted tweet in the rendered content", () => {
    const res = parseSyndicationThread(load("thread-with-quote.json"));
    expect(res.status).toBe("ok");
    expect(res.contentText).toContain("a thought about extraction");
    expect(res.contentText).toContain("the original claim");
  });

  it("returns a failed result for an unavailable/tombstoned tweet", () => {
    const res = parseSyndicationThread(load("unavailable.json"));
    expect(res.status).toBe("failed");
    expect(res.sourceType).toBe("x");
    expect(res.failureReason).toBe("tweet unavailable");
  });

  it("returns a failed result for unexpected shapes", () => {
    expect(parseSyndicationThread({ nope: true }).status).toBe("failed");
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `pnpm --filter @readmepls/core exec vitest run src/source/x/syndication.test.ts`
Expected: FAIL — cannot find `./syndication.js`.

- [ ] **Step 9: Implement the syndication parser**

Create `packages/core/src/source/x/syndication.ts`:

```ts
import { z } from "zod";
import type { ExtractResult } from "@readmepls/types";
import { escapeHtml, failedResult } from "../extract-result.js";

const WORDS_PER_MIN = 220;

const User = z.object({ name: z.string(), screen_name: z.string() });
const Photo = z.object({ url: z.string() });
const Quoted = z.object({ text: z.string(), user: User });
const Tweet = z.object({
  text: z.string(),
  user: User,
  photos: z.array(Photo).optional(),
  quoted_tweet: Quoted.optional(),
});

/**
 * Render a public syndication tweet (plus its quoted tweet, when present) into a
 * readable result. Note: the tweet-result endpoint returns a single focal tweet,
 * so downward self-thread expansion is limited to what the payload carries; this
 * is acceptable best-effort (see phase-5 design §9, X fragility risk).
 */
export function parseSyndicationThread(raw: unknown): ExtractResult {
  const parsed = Tweet.safeParse(raw);
  if (!parsed.success) return failedResult("x", "tweet unavailable");
  const t = parsed.data;

  const handle = `@${t.user.screen_name}`;
  const blocks: string[] = [`<p>${escapeHtml(t.text)}</p>`];
  const textParts: string[] = [t.text];

  for (const photo of t.photos ?? []) {
    blocks.push(`<img src="${escapeHtml(photo.url)}" alt="" />`);
  }
  if (t.quoted_tweet) {
    const q = t.quoted_tweet;
    blocks.push(
      `<blockquote><p>${escapeHtml(q.text)}</p><cite>@${escapeHtml(
        q.user.screen_name
      )}</cite></blockquote>`
    );
    textParts.push(`${q.user.name} (@${q.user.screen_name}): ${q.text}`);
  }

  const contentText = textParts.join("\n\n");
  const wordCount = contentText.split(/\s+/).filter(Boolean).length;
  const firstLine = t.text.slice(0, 60).trim();

  return {
    status: "ok",
    sourceType: "x",
    title: `${t.user.name} on X: "${firstLine}${t.text.length > 60 ? "…" : ""}"`,
    author: `${t.user.name} (${handle})`,
    siteName: "X",
    lang: null,
    contentHtml: blocks.join("\n"),
    contentText,
    excerpt: contentText.slice(0, 280),
    wordCount,
    readTime: Math.max(1, Math.round(wordCount / WORDS_PER_MIN)),
    heroImage: t.photos?.[0]?.url ?? null,
    failureReason: null,
  };
}
```

- [ ] **Step 10: Export from core index**

In `packages/core/src/index.ts`, add:

```ts
export * from "./source/extract-result.js";
export * from "./source/x/tweet-id.js";
export * from "./source/x/syndication.js";
```

- [ ] **Step 11: Run the X parser tests — expect PASS**

Run: `pnpm --filter @readmepls/core exec vitest run src/source/x`
Expected: PASS (tweet-id + syndication).

- [ ] **Step 12: Commit**

```bash
git add packages/core/src/source packages/core/src/index.ts
git commit -m "feat(core): pure X syndication parser + tweet-id and result helpers"
```

---

## Task 3: XExtractor (worker)

Thin async shell: parse the tweet id, fetch the syndication JSON via `io.fetchJson`, delegate to the pure parser. Register it and verify routing end-to-end against an ephemeral PocketBase.

**Files:**
- Create: `apps/worker/src/extract/x-extractor.ts`
- Modify: `apps/worker/src/main.ts` (register `XExtractor`)
- Test: `apps/worker/src/extract/x-extractor.test.ts`, `apps/worker/src/x.integration.test.ts`

**Interfaces:**
- Consumes: `parseTweetId`, `syndicationToken`, `parseSyndicationThread` (Task 2); `Extractor`, `ExtractIO` (Task 1).
- Produces: `class XExtractor implements Extractor` with `source = "x"`.

- [ ] **Step 1: Write the failing unit test**

Create `apps/worker/src/extract/x-extractor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { XExtractor } from "./x-extractor.js";
import type { ExtractIO } from "./extractor.js";

const single = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../../packages/core/src/source/x/fixtures/single-tweet.json", import.meta.url)
    ),
    "utf8"
  )
);

function io(over: Partial<ExtractIO> = {}): ExtractIO {
  return {
    fetchHtml: async () => { throw new Error("unused"); },
    fetchJson: async () => single,
    runYtDlp: async () => { throw new Error("unused"); },
    ...over,
  };
}

describe("XExtractor", () => {
  it("declares source 'x'", () => {
    expect(new XExtractor().source).toBe("x");
  });

  it("fetches the syndication endpoint and parses the tweet", async () => {
    let requested = "";
    const res = await new XExtractor().extract(
      "https://x.com/jack/status/20",
      io({ fetchJson: async (url) => { requested = url; return single; } })
    );
    expect(requested).toContain("cdn.syndication.twimg.com");
    expect(requested).toContain("id=20");
    expect(res.status).toBe("ok");
    expect(res.sourceType).toBe("x");
  });

  it("fails gracefully when the url has no tweet id", async () => {
    const res = await new XExtractor().extract("https://x.com/jack", io());
    expect(res.status).toBe("failed");
    expect(res.failureReason).toBe("not a tweet url");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @readmepls/worker exec vitest run src/extract/x-extractor.test.ts`
Expected: FAIL — cannot find `./x-extractor.js`.

- [ ] **Step 3: Implement XExtractor**

Create `apps/worker/src/extract/x-extractor.ts`:

```ts
import type { ExtractResult, SourceType } from "@readmepls/types";
import {
  parseTweetId,
  syndicationToken,
  parseSyndicationThread,
  failedResult,
} from "@readmepls/core";
import type { Extractor, ExtractIO } from "./extractor.js";

export class XExtractor implements Extractor {
  readonly source: SourceType = "x";

  async extract(url: string, io: ExtractIO): Promise<ExtractResult> {
    const id = parseTweetId(url);
    if (!id) return failedResult("x", "not a tweet url");
    const endpoint =
      `https://cdn.syndication.twimg.com/tweet-result` +
      `?id=${id}&token=${syndicationToken(id)}&lang=en`;
    try {
      const raw = await io.fetchJson(endpoint);
      return parseSyndicationThread(raw);
    } catch {
      return failedResult("x", "tweet unavailable");
    }
  }
}
```

- [ ] **Step 4: Run the unit test — expect PASS**

Run: `pnpm --filter @readmepls/worker exec vitest run src/extract/x-extractor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing integration test (routing → content row)**

Create `apps/worker/src/x.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { classifySource } from "@readmepls/core";
import { processJob } from "./worker.js";
import { ExtractorRegistry } from "./extract/registry.js";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { XExtractor } from "./extract/x-extractor.js";
import type { ExtractIO } from "./extract/extractor.js";
import { MockAIProvider } from "./ai/mock-provider.js";

const tweet = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../packages/core/src/source/x/fixtures/single-tweet.json", import.meta.url)
    ),
    "utf8"
  )
);

let h: PbHandle;
beforeAll(async () => { h = await startEphemeralPb(); }, 30000);
afterAll(() => h?.stop());

describe("processJob routes X urls to the X extractor", () => {
  it("writes an x content row from the syndication fixture", async () => {
    const job = await h.pb.collection("jobs").create({
      user: "u1",
      canonical_url: "https://x.com/jack/status/20",
      type: "extract",
      status: "running",
      attempts: 0,
    });

    const io: ExtractIO = {
      fetchHtml: async () => { throw new Error("unused"); },
      fetchJson: async () => tweet,
      runYtDlp: async () => { throw new Error("unused"); },
    };

    await processJob(h.pb, job.id, {
      io,
      registry: new ExtractorRegistry([new ArticleExtractor(), new XExtractor()]),
      ai: new MockAIProvider({ tags: ["x"], summary: "tweet." }),
      classify: classifySource,
    });

    const done = await h.pb.collection("jobs").getOne(job.id);
    expect(done.status).toBe("done");
    const content = await h.pb.collection("content").getOne(done.content);
    expect(content.source_type).toBe("x");
    expect(content.content_text).toContain("just setting up my twttr");
  });
});
```

- [ ] **Step 6: Run it — expect PASS**

Run: `pnpm --filter @readmepls/worker exec vitest run src/x.integration.test.ts`
Expected: PASS.

- [ ] **Step 7: Register XExtractor in main.ts**

In `apps/worker/src/main.ts`, add `import { XExtractor } from "./extract/x-extractor.js";` and change the registry construction to:

```ts
  const registry = new ExtractorRegistry([new ArticleExtractor(), new XExtractor()]);
```

- [ ] **Step 8: Commit**

```bash
git add apps/worker/src/extract/x-extractor.ts apps/worker/src/extract/x-extractor.test.ts \
  apps/worker/src/x.integration.test.ts apps/worker/src/main.ts
git commit -m "feat(worker): X/Twitter extractor via public syndication endpoint"
```

---

## Task 4: YouTube parsers (pure, in core)

Pure video-id parsing, json3 caption parsing, and metadata+captions → `ExtractResult`. Defines the `YtDlpOutput` shape consumed by the worker.

**Files:**
- Create: `packages/core/src/source/youtube/video-id.ts`
- Create: `packages/core/src/source/youtube/transcript.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/worker/src/extract/extractor.ts` (re-import the real `YtDlpOutput`)
- Fixtures: `packages/core/src/source/youtube/fixtures/captions.json3.json`, `meta.json`
- Test: `packages/core/src/source/youtube/video-id.test.ts`, `packages/core/src/source/youtube/transcript.test.ts`

**Interfaces:**
- Produces:
  - `parseVideoId(url: string): string | null`
  - `interface YtMeta { videoId: string; title: string; channel: string | null; thumbnail: string | null; description: string | null }`
  - `interface YtCue { startSec: number; text: string }`
  - `interface YtCaptions { cues: YtCue[] }`
  - `interface YtDlpOutput { meta: YtMeta; captions: YtCaptions | null }`
  - `parseJson3Captions(text: string): YtCaptions | null`
  - `parseYtTranscript(meta: YtMeta, captions: YtCaptions | null): ExtractResult`

- [ ] **Step 1: Write the failing video-id test**

Create `packages/core/src/source/youtube/video-id.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseVideoId } from "./video-id.js";

describe("parseVideoId", () => {
  it("parses watch?v= urls", () => {
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("parses youtu.be short urls", () => {
    expect(parseVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
  });
  it("returns null for non-video youtube urls", () => {
    expect(parseVideoId("https://www.youtube.com/feed/subscriptions")).toBeNull();
  });
  it("returns null for non-youtube hosts", () => {
    expect(parseVideoId("https://example.com/watch?v=abc")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @readmepls/core exec vitest run src/source/youtube/video-id.test.ts`
Expected: FAIL — cannot find `./video-id.js`.

- [ ] **Step 3: Implement parseVideoId**

Create `packages/core/src/source/youtube/video-id.ts`:

```ts
/** Video id from a youtube.com/watch or youtu.be URL, else null. */
export function parseVideoId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v");
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }
  return null;
}
```

- [ ] **Step 4: Run the video-id test — expect PASS**

Run: `pnpm --filter @readmepls/core exec vitest run src/source/youtube/video-id.test.ts`
Expected: PASS.

- [ ] **Step 5: Create YouTube fixtures**

Create `packages/core/src/source/youtube/fixtures/captions.json3.json`:

```json
{
  "events": [
    { "tStartMs": 0, "segs": [{ "utf8": "hello and " }, { "utf8": "welcome" }] },
    { "tStartMs": 3200, "segs": [{ "utf8": "today we talk about extraction" }] },
    { "tStartMs": 7000, "segs": [{ "utf8": "\n" }] },
    { "tStartMs": 7400, "segs": [{ "utf8": "let's begin" }] }
  ]
}
```

Create `packages/core/src/source/youtube/fixtures/meta.json`:

```json
{
  "id": "dQw4w9WgXcQ",
  "title": "A Talk About Extraction",
  "channel": "Reader Channel",
  "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "description": "An overview of content extraction."
}
```

- [ ] **Step 6: Write the failing transcript-parse test**

Create `packages/core/src/source/youtube/transcript.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseJson3Captions, parseYtTranscript } from "./transcript.js";
import type { YtMeta } from "./transcript.js";
import { ExtractResult } from "@readmepls/types";

const json3 = readFileSync(
  fileURLToPath(new URL("./fixtures/captions.json3.json", import.meta.url)),
  "utf8"
);

const meta: YtMeta = {
  videoId: "dQw4w9WgXcQ",
  title: "A Talk About Extraction",
  channel: "Reader Channel",
  thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  description: "An overview of content extraction.",
};

describe("parseJson3Captions", () => {
  it("collapses segs into timestamped cues, dropping blank events", () => {
    const caps = parseJson3Captions(json3);
    expect(caps).not.toBeNull();
    expect(caps!.cues).toHaveLength(3);
    expect(caps!.cues[0]).toEqual({ startSec: 0, text: "hello and welcome" });
  });
  it("returns null for non-json3 input", () => {
    expect(parseJson3Captions("not json")).toBeNull();
    expect(parseJson3Captions('{"events":[]}')).toBeNull();
  });
});

describe("parseYtTranscript", () => {
  it("produces a schema-valid ok result with transcript text", () => {
    const res = parseYtTranscript(meta, parseJson3Captions(json3));
    expect(() => ExtractResult.parse(res)).not.toThrow();
    expect(res.status).toBe("ok");
    expect(res.sourceType).toBe("youtube");
    expect(res.title).toBe("A Talk About Extraction");
    expect(res.author).toBe("Reader Channel");
    expect(res.heroImage).toContain("hqdefault.jpg");
    expect(res.contentText).toContain("hello and welcome");
    expect(res.contentText).toContain("let's begin");
  });

  it("degrades to partial with the description when no captions exist", () => {
    const res = parseYtTranscript(meta, null);
    expect(res.status).toBe("partial");
    expect(res.failureReason).toBe("no transcript");
    expect(res.contentText).toContain("overview of content extraction");
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm --filter @readmepls/core exec vitest run src/source/youtube/transcript.test.ts`
Expected: FAIL — cannot find `./transcript.js`.

- [ ] **Step 8: Implement the transcript parser**

Create `packages/core/src/source/youtube/transcript.ts`:

```ts
import type { ExtractResult } from "@readmepls/types";
import { escapeHtml } from "../extract-result.js";

const WORDS_PER_MIN = 220;
const CUES_PER_PARAGRAPH = 5;

export interface YtMeta {
  videoId: string;
  title: string;
  channel: string | null;
  thumbnail: string | null;
  description: string | null;
}

export interface YtCue {
  startSec: number;
  text: string;
}

export interface YtCaptions {
  cues: YtCue[];
}

export interface YtDlpOutput {
  meta: YtMeta;
  captions: YtCaptions | null;
}

/** Parse YouTube json3 caption text into timestamped cues. */
export function parseJson3Captions(text: string): YtCaptions | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const events = (data as { events?: unknown }).events;
  if (!Array.isArray(events)) return null;

  const cues: YtCue[] = [];
  for (const e of events) {
    const segs = (e as { segs?: unknown }).segs;
    if (!Array.isArray(segs)) continue;
    const joined = segs
      .map((s) => (s as { utf8?: string }).utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!joined) continue;
    const startSec = Math.floor(((e as { tStartMs?: number }).tStartMs ?? 0) / 1000);
    cues.push({ startSec, text: joined });
  }
  return cues.length ? { cues } : null;
}

function stamp(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `[${m}:${String(s).padStart(2, "0")}]`;
}

/** Fold metadata + captions into a readable result; partial when no captions. */
export function parseYtTranscript(
  meta: YtMeta,
  captions: YtCaptions | null
): ExtractResult {
  const base = {
    sourceType: "youtube" as const,
    title: meta.title,
    author: meta.channel,
    siteName: "YouTube",
    lang: null,
    heroImage: meta.thumbnail,
  };

  if (!captions || captions.cues.length === 0) {
    const text = meta.description ?? "";
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return {
      ...base,
      status: "partial",
      contentHtml: text ? `<p>${escapeHtml(text)}</p>` : "",
      contentText: text,
      excerpt: text.slice(0, 280),
      wordCount,
      readTime: Math.max(1, Math.round(wordCount / WORDS_PER_MIN)),
      failureReason: "no transcript",
    };
  }

  const paragraphs: { start: number; text: string }[] = [];
  for (let i = 0; i < captions.cues.length; i += CUES_PER_PARAGRAPH) {
    const group = captions.cues.slice(i, i + CUES_PER_PARAGRAPH);
    paragraphs.push({
      start: group[0].startSec,
      text: group.map((c) => c.text).join(" "),
    });
  }

  const contentHtml = paragraphs
    .map((p) => `<p>${stamp(p.start)} ${escapeHtml(p.text)}</p>`)
    .join("\n");
  const contentText = paragraphs.map((p) => `${stamp(p.start)} ${p.text}`).join("\n\n");
  const wordCount = contentText.split(/\s+/).filter(Boolean).length;

  return {
    ...base,
    status: "ok",
    contentHtml,
    contentText,
    excerpt: (meta.description ?? contentText).slice(0, 280),
    wordCount,
    readTime: Math.max(1, Math.round(wordCount / WORDS_PER_MIN)),
    failureReason: null,
  };
}
```

- [ ] **Step 9: Export from core index**

In `packages/core/src/index.ts`, add:

```ts
export * from "./source/youtube/video-id.js";
export * from "./source/youtube/transcript.js";
```

- [ ] **Step 10: Re-import the real `YtDlpOutput` in the worker interface**

In `apps/worker/src/extract/extractor.ts`, delete the placeholder `YtDlpOutput` interface and import it instead. Change the top of the file:

```ts
import type { ExtractResult, SourceType } from "@readmepls/types";
import type { YtDlpOutput } from "@readmepls/core";

export type { YtDlpOutput };
```

(Leave the rest of `extractor.ts` unchanged — `ExtractIO.runYtDlp` already returns `YtDlpOutput`.)

- [ ] **Step 11: Run YouTube parser tests + worker typecheck — expect PASS**

Run: `pnpm --filter @readmepls/core exec vitest run src/source/youtube`
Expected: PASS.
Run: `pnpm --filter @readmepls/worker exec tsc --noEmit`
Expected: no errors (the placeholder→real `YtDlpOutput` swap still type-checks).

- [ ] **Step 12: Commit**

```bash
git add packages/core/src/source/youtube packages/core/src/index.ts apps/worker/src/extract/extractor.ts
git commit -m "feat(core): pure YouTube transcript parser (json3 captions + metadata)"
```

---

## Task 5: YoutubeExtractor + yt-dlp adapter (worker)

The subprocess adapter (`createRunYtDlp`) and the extractor that calls `io.runYtDlp`. The adapter is a thin IO shell (like `defaultSafeFetchHtml`) with injected `exec`/`fetchText` so it is tested offline.

**Files:**
- Create: `apps/worker/src/extract/yt-dlp.ts`
- Create: `apps/worker/src/extract/youtube-extractor.ts`
- Modify: `apps/worker/src/main.ts` (wire real `runYtDlp`, register `YoutubeExtractor`)
- Test: `apps/worker/src/extract/yt-dlp.test.ts`, `apps/worker/src/extract/youtube-extractor.test.ts`

**Interfaces:**
- Consumes: `parseVideoId`, `parseJson3Captions`, `parseYtTranscript`, `YtMeta`, `YtDlpOutput` (Task 4); `Extractor`, `ExtractIO` (Task 1).
- Produces:
  - `createRunYtDlp(deps: { exec(args: string[]): Promise<string>; fetchText(url: string): Promise<string> }): (videoId: string) => Promise<YtDlpOutput>`
  - `class YoutubeExtractor implements Extractor` with `source = "youtube"`.

- [ ] **Step 1: Write the failing extractor unit test**

Create `apps/worker/src/extract/youtube-extractor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { YoutubeExtractor } from "./youtube-extractor.js";
import { parseJson3Captions } from "@readmepls/core";
import type { ExtractIO } from "./extractor.js";
import type { YtDlpOutput } from "@readmepls/core";

const json3 = readFileSync(
  fileURLToPath(
    new URL("../../../../packages/core/src/source/youtube/fixtures/captions.json3.json", import.meta.url)
  ),
  "utf8"
);

const out: YtDlpOutput = {
  meta: {
    videoId: "dQw4w9WgXcQ",
    title: "A Talk About Extraction",
    channel: "Reader Channel",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    description: "An overview.",
  },
  captions: parseJson3Captions(json3),
};

function io(over: Partial<ExtractIO> = {}): ExtractIO {
  return {
    fetchHtml: async () => { throw new Error("unused"); },
    fetchJson: async () => { throw new Error("unused"); },
    runYtDlp: async () => out,
    ...over,
  };
}

describe("YoutubeExtractor", () => {
  it("declares source 'youtube'", () => {
    expect(new YoutubeExtractor().source).toBe("youtube");
  });

  it("runs yt-dlp for the video id and parses the transcript", async () => {
    let askedId = "";
    const res = await new YoutubeExtractor().extract(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      io({ runYtDlp: async (id) => { askedId = id; return out; } })
    );
    expect(askedId).toBe("dQw4w9WgXcQ");
    expect(res.status).toBe("ok");
    expect(res.sourceType).toBe("youtube");
    expect(res.contentText).toContain("hello and welcome");
  });

  it("fails gracefully for non-video urls", async () => {
    const res = await new YoutubeExtractor().extract("https://www.youtube.com/feed", io());
    expect(res.status).toBe("failed");
    expect(res.failureReason).toBe("not a youtube video url");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @readmepls/worker exec vitest run src/extract/youtube-extractor.test.ts`
Expected: FAIL — cannot find `./youtube-extractor.js`.

- [ ] **Step 3: Implement YoutubeExtractor**

Create `apps/worker/src/extract/youtube-extractor.ts`:

```ts
import type { ExtractResult, SourceType } from "@readmepls/types";
import { parseVideoId, parseYtTranscript, failedResult } from "@readmepls/core";
import type { Extractor, ExtractIO } from "./extractor.js";

export class YoutubeExtractor implements Extractor {
  readonly source: SourceType = "youtube";

  async extract(url: string, io: ExtractIO): Promise<ExtractResult> {
    const id = parseVideoId(url);
    if (!id) return failedResult("youtube", "not a youtube video url");
    try {
      const out = await io.runYtDlp(id);
      return parseYtTranscript(out.meta, out.captions);
    } catch {
      return failedResult("youtube", "yt-dlp failed");
    }
  }
}
```

- [ ] **Step 4: Run the extractor unit test — expect PASS**

Run: `pnpm --filter @readmepls/worker exec vitest run src/extract/youtube-extractor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing yt-dlp adapter test**

Create `apps/worker/src/extract/yt-dlp.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRunYtDlp } from "./yt-dlp.js";

const json3 = readFileSync(
  fileURLToPath(
    new URL("../../../../packages/core/src/source/youtube/fixtures/captions.json3.json", import.meta.url)
  ),
  "utf8"
);

// yt-dlp -j output: metadata with an automatic_captions json3 track url.
const ytDlpJson = JSON.stringify({
  id: "dQw4w9WgXcQ",
  title: "A Talk About Extraction",
  channel: "Reader Channel",
  thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  description: "An overview.",
  automatic_captions: {
    en: [{ ext: "json3", url: "https://youtube.com/api/timedtext?fmt=json3" }],
  },
});

describe("createRunYtDlp", () => {
  it("invokes yt-dlp, fetches the json3 caption track, returns parsed output", async () => {
    let execArgs: string[] = [];
    const run = createRunYtDlp({
      exec: async (args) => { execArgs = args; return ytDlpJson; },
      fetchText: async () => json3,
    });

    const out = await run("dQw4w9WgXcQ");
    expect(execArgs).toContain("-j");
    expect(execArgs.some((a) => a.includes("dQw4w9WgXcQ"))).toBe(true);
    expect(out.meta.title).toBe("A Talk About Extraction");
    expect(out.meta.channel).toBe("Reader Channel");
    expect(out.captions).not.toBeNull();
    expect(out.captions!.cues[0].text).toBe("hello and welcome");
  });

  it("returns null captions when no english track is present", async () => {
    const run = createRunYtDlp({
      exec: async () => JSON.stringify({ id: "x", title: "t", channel: null }),
      fetchText: async () => { throw new Error("should not fetch"); },
    });
    const out = await run("x");
    expect(out.captions).toBeNull();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @readmepls/worker exec vitest run src/extract/yt-dlp.test.ts`
Expected: FAIL — cannot find `./yt-dlp.js`.

- [ ] **Step 7: Implement the yt-dlp adapter**

Create `apps/worker/src/extract/yt-dlp.ts`:

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseJson3Captions } from "@readmepls/core";
import type { YtDlpOutput, YtMeta } from "@readmepls/core";

const execFileAsync = promisify(execFile);

export interface RunYtDlpDeps {
  /** Run yt-dlp with args, resolve its stdout. */
  exec(args: string[]): Promise<string>;
  /** Fetch a caption-track URL as text (SSRF-guarded in production). */
  fetchText(url: string): Promise<string>;
}

interface YtDlpJson {
  id?: string;
  title?: string;
  channel?: string | null;
  thumbnail?: string | null;
  description?: string | null;
  automatic_captions?: Record<string, { ext?: string; url?: string }[]>;
  subtitles?: Record<string, { ext?: string; url?: string }[]>;
}

function pickJson3Url(meta: YtDlpJson): string | null {
  const manual = meta.subtitles?.en?.find((t) => t.ext === "json3")?.url;
  const auto = meta.automatic_captions?.en?.find((t) => t.ext === "json3")?.url;
  return manual ?? auto ?? null;
}

/** Build a runYtDlp seam from injected exec + fetch. */
export function createRunYtDlp(
  deps: RunYtDlpDeps
): (videoId: string) => Promise<YtDlpOutput> {
  return async function runYtDlp(videoId: string): Promise<YtDlpOutput> {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const raw = await deps.exec(["-j", "--skip-download", url]);
    const json = JSON.parse(raw) as YtDlpJson;

    const meta: YtMeta = {
      videoId,
      title: json.title ?? videoId,
      channel: json.channel ?? null,
      thumbnail: json.thumbnail ?? null,
      description: json.description ?? null,
    };

    const trackUrl = pickJson3Url(json);
    const captions = trackUrl ? parseJson3Captions(await deps.fetchText(trackUrl)) : null;
    return { meta, captions };
  };
}

/** Production wiring: real yt-dlp binary. Thin IO adapter (untested seam). */
export function defaultRunYtDlp(
  fetchText: (url: string) => Promise<string>
): (videoId: string) => Promise<YtDlpOutput> {
  return createRunYtDlp({
    exec: async (args) => {
      const { stdout } = await execFileAsync("yt-dlp", args, { maxBuffer: 32 * 1024 * 1024 });
      return stdout;
    },
    fetchText,
  });
}
```

- [ ] **Step 8: Run the adapter test — expect PASS**

Run: `pnpm --filter @readmepls/worker exec vitest run src/extract/yt-dlp.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Wire the real runYtDlp + register YoutubeExtractor in main.ts**

In `apps/worker/src/main.ts`:
- Add imports:

```ts
import { YoutubeExtractor } from "./extract/youtube-extractor.js";
import { defaultRunYtDlp } from "./extract/yt-dlp.js";
```

- Replace the `runYtDlp` placeholder in the `io` object with `runYtDlp: defaultRunYtDlp(fetchHtml),` (the json3 track is text; `fetchHtml` is the SSRF-guarded text fetch).
- Extend the registry:

```ts
  const registry = new ExtractorRegistry([
    new ArticleExtractor(),
    new XExtractor(),
    new YoutubeExtractor(),
  ]);
```

- [ ] **Step 10: Typecheck + full worker suite — expect PASS**

Run: `pnpm --filter @readmepls/worker exec tsc --noEmit && pnpm --filter @readmepls/worker exec vitest run`
Expected: no type errors; all worker tests pass.

- [ ] **Step 11: Commit**

```bash
git add apps/worker/src/extract/yt-dlp.ts apps/worker/src/extract/yt-dlp.test.ts \
  apps/worker/src/extract/youtube-extractor.ts apps/worker/src/extract/youtube-extractor.test.ts \
  apps/worker/src/main.ts
git commit -m "feat(worker): YouTube transcript extractor via yt-dlp subprocess"
```

---

## Task 6: Paywall / archive fallback

Detect thin/gated article extractions and attempt recovery from a public Wayback snapshot. Composed inside `ArticleExtractor` (it already owns fetching). Recovered content is public (a public archive snapshot, not the user's session) → cacheable as `content`.

**Files:**
- Create: `apps/worker/src/extract/archive-fallback.ts`
- Modify: `apps/worker/src/extract/article-extractor.ts` (run fallback when thin)
- Test: `apps/worker/src/extract/archive-fallback.test.ts`

**Interfaces:**
- Consumes: `parseArticleHtml` (Task 1), `ExtractIO` (Task 1).
- Produces:
  - `isThinExtraction(result: ExtractResult): boolean`
  - `recoverFromArchive(url: string, io: ExtractIO): Promise<ExtractResult | null>`

- [ ] **Step 1: Write the failing fallback test**

Create `apps/worker/src/extract/archive-fallback.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isThinExtraction, recoverFromArchive } from "./archive-fallback.js";
import { parseArticleHtml } from "./parse-article.js";
import type { ExtractIO } from "./extractor.js";
import type { ExtractResult } from "@readmepls/types";

function result(over: Partial<ExtractResult>): ExtractResult {
  return {
    status: "ok", sourceType: "article", title: "t", author: null, siteName: null,
    lang: null, contentHtml: "", contentText: "", excerpt: "", wordCount: 1000,
    readTime: 5, heroImage: null, failureReason: null, ...over,
  };
}

const RICH = `<html><head><title>Recovered</title></head><body><article>
<p>${"This is the full archived body. ".repeat(60)}</p></article></body></html>`;

function io(over: Partial<ExtractIO>): ExtractIO {
  return {
    fetchHtml: async () => { throw new Error("unused"); },
    fetchJson: async () => { throw new Error("unused"); },
    runYtDlp: async () => { throw new Error("unused"); },
    ...over,
  };
}

describe("isThinExtraction", () => {
  it("is true for failed results", () => {
    expect(isThinExtraction(result({ status: "failed" }))).toBe(true);
  });
  it("is true below the word-count floor", () => {
    expect(isThinExtraction(result({ wordCount: 40 }))).toBe(true);
  });
  it("is true for short content with a paywall phrase", () => {
    expect(
      isThinExtraction(result({ wordCount: 200, contentText: "Subscribe to continue reading this story." }))
    ).toBe(true);
  });
  it("is false for a normal full article", () => {
    expect(isThinExtraction(result({ wordCount: 1200 }))).toBe(false);
  });
});

describe("recoverFromArchive", () => {
  it("re-parses the closest snapshot and marks it recovered", async () => {
    const res = await recoverFromArchive("https://paywalled.example/post", io({
      fetchJson: async () => ({
        archived_snapshots: { closest: { available: true, url: "https://web.archive.org/web/123/https://paywalled.example/post" } },
      }),
      fetchHtml: async () => RICH,
    }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe("partial");
    expect(res!.failureReason).toBe("recovered from web archive");
    expect(res!.contentText).toContain("full archived body");
  });

  it("returns null when no snapshot is available", async () => {
    const res = await recoverFromArchive("https://x.example/p", io({
      fetchJson: async () => ({ archived_snapshots: {} }),
    }));
    expect(res).toBeNull();
  });

  it("returns null when the snapshot itself is thin", async () => {
    const res = await recoverFromArchive("https://x.example/p", io({
      fetchJson: async () => ({ archived_snapshots: { closest: { available: true, url: "https://web.archive.org/web/1/x" } } }),
      fetchHtml: async () => "<html></html>",
    }));
    expect(res).toBeNull();
  });
});

// keep parseArticleHtml import exercised (snapshot re-parse path)
void parseArticleHtml;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @readmepls/worker exec vitest run src/extract/archive-fallback.test.ts`
Expected: FAIL — cannot find `./archive-fallback.js`.

- [ ] **Step 3: Implement the fallback**

Create `apps/worker/src/extract/archive-fallback.ts`:

```ts
import { z } from "zod";
import type { ExtractResult } from "@readmepls/types";
import type { ExtractIO } from "./extractor.js";
import { parseArticleHtml } from "./parse-article.js";

const MIN_WORDS = 120;
const PAYWALL_SOFT_LIMIT = 500;
const PAYWALL_HINTS = [
  /subscribe to (continue|read)/i,
  /this (article|content|story) is for subscribers/i,
  /create a free account/i,
  /already a (subscriber|member)/i,
];

/** A result too thin or gated to be useful — a fallback candidate. */
export function isThinExtraction(result: ExtractResult): boolean {
  if (result.status === "failed") return true;
  if (result.wordCount < MIN_WORDS) return true;
  if (
    result.wordCount < PAYWALL_SOFT_LIMIT &&
    PAYWALL_HINTS.some((re) => re.test(result.contentText))
  ) {
    return true;
  }
  return false;
}

const WaybackResponse = z.object({
  archived_snapshots: z
    .object({
      closest: z
        .object({ available: z.boolean(), url: z.string() })
        .optional(),
    })
    .default({}),
});

/**
 * Best-effort recovery of a thin/paywalled article from the public web archive.
 * The snapshot is a public archive copy (not the user's session), so the result
 * is safe to cache globally. Returns null on any miss — caller keeps the original
 * graceful-failure result.
 */
export async function recoverFromArchive(
  url: string,
  io: ExtractIO
): Promise<ExtractResult | null> {
  const availUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
  let snapshot: { available: boolean; url: string } | undefined;
  try {
    const parsed = WaybackResponse.safeParse(await io.fetchJson(availUrl));
    if (!parsed.success) return null;
    snapshot = parsed.data.archived_snapshots.closest;
  } catch {
    return null;
  }
  if (!snapshot?.available || !snapshot.url) return null;

  try {
    const html = await io.fetchHtml(snapshot.url);
    const reparsed = parseArticleHtml(url, html);
    if (isThinExtraction(reparsed)) return null;
    return { ...reparsed, status: "partial", failureReason: "recovered from web archive" };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the fallback test — expect PASS**

Run: `pnpm --filter @readmepls/worker exec vitest run src/extract/archive-fallback.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the fallback into ArticleExtractor**

Replace the `extract` method in `apps/worker/src/extract/article-extractor.ts` (keep the imports + class shell; add the new imports):

```ts
import type { ExtractResult, SourceType } from "@readmepls/types";
import type { Extractor, ExtractIO } from "./extractor.js";
import { parseArticleHtml } from "./parse-article.js";
import { isThinExtraction, recoverFromArchive } from "./archive-fallback.js";
```

```ts
  async extract(url: string, io: ExtractIO): Promise<ExtractResult> {
    const html = await io.fetchHtml(url);
    const primary = parseArticleHtml(url, html);
    if (!isThinExtraction(primary)) return primary;
    const recovered = await recoverFromArchive(url, io);
    return recovered ?? primary;
  }
```

- [ ] **Step 6: Write the failing ArticleExtractor fallback integration test**

Append to `apps/worker/src/extract/article-extractor.test.ts` (inside the existing file, after the `ArticleExtractor` describe — add a new describe). First add the rich-archive constant and a multi-seam io helper at the top of the file (below the existing `ioWith`):

```ts
const THIN = "<html><head><title>Gated</title></head><body><p>Subscribe to continue reading this story.</p></body></html>";
const ARCHIVED = `<html><head><title>Recovered</title></head><body><article><p>${"Recovered body text. ".repeat(80)}</p></article></body></html>`;
```

Then add:

```ts
describe("ArticleExtractor archive fallback", () => {
  it("recovers a paywalled article from the web archive", async () => {
    const io: ExtractIO = {
      fetchHtml: async (u) => (u.includes("web.archive.org") ? ARCHIVED : THIN),
      fetchJson: async () => ({
        archived_snapshots: { closest: { available: true, url: "https://web.archive.org/web/1/x" } },
      }),
      runYtDlp: async () => { throw new Error("unused"); },
    };
    const res = await new ArticleExtractor().extract("https://paywalled.example/post", io);
    expect(res.status).toBe("partial");
    expect(res.failureReason).toBe("recovered from web archive");
    expect(res.contentText).toContain("Recovered body text");
  });

  it("keeps the thin primary result when no snapshot exists", async () => {
    const io: ExtractIO = {
      fetchHtml: async () => THIN,
      fetchJson: async () => ({ archived_snapshots: {} }),
      runYtDlp: async () => { throw new Error("unused"); },
    };
    const res = await new ArticleExtractor().extract("https://paywalled.example/post", io);
    expect(["failed", "ok", "partial"]).toContain(res.status);
    expect(res.failureReason).not.toBe("recovered from web archive");
  });
});
```

- [ ] **Step 7: Run the article suite — expect PASS**

Run: `pnpm --filter @readmepls/worker exec vitest run src/extract/article-extractor.test.ts`
Expected: PASS (parse tests + fetch test + 2 fallback tests).

- [ ] **Step 8: Full worker + core suites + typecheck**

Run: `pnpm --filter @readmepls/core exec vitest run && pnpm --filter @readmepls/worker exec vitest run && pnpm --filter @readmepls/worker exec tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/worker/src/extract/archive-fallback.ts apps/worker/src/extract/archive-fallback.test.ts \
  apps/worker/src/extract/article-extractor.ts apps/worker/src/extract/article-extractor.test.ts
git commit -m "feat(worker): best-effort paywall recovery from the web archive"
```

---

## Task 7: Docker — yt-dlp in the worker image

The runtime image must contain the `yt-dlp` binary (Alpine community package) plus its Python runtime.

**Files:**
- Modify: `apps/worker/Dockerfile`

- [ ] **Step 1: Add yt-dlp to the runtime stage**

In `apps/worker/Dockerfile`, in the `runtime` stage, after the `WORKDIR /app` line and before `COPY --from=build`, add:

```dockerfile
# yt-dlp (+ python runtime) for the YouTube transcript extractor.
RUN apk add --no-cache python3 yt-dlp
```

- [ ] **Step 2: Verify the image builds and yt-dlp is present**

Run: `docker build -f apps/worker/Dockerfile -t readmepls-worker:phase5 .`
Expected: build succeeds.
Run: `docker run --rm --entrypoint yt-dlp readmepls-worker:phase5 --version`
Expected: prints a yt-dlp version string (e.g. `2024.xx.xx`).

> If the build environment has no Docker available, skip the two runs, confirm the Dockerfile edit is correct by inspection, and note in the commit body that the image build was not executed locally.

- [ ] **Step 3: Commit**

```bash
git add apps/worker/Dockerfile
git commit -m "build(worker): install yt-dlp in the worker runtime image"
```

---

## Self-Review

**1. Spec coverage:**
- §4.1 router refactor → Task 1. ✓
- §4.2 X extractor (parseTweetId, syndication, thread/quote, graceful fail, cache) → Tasks 2–3. ✓ (downward self-thread limitation documented in `syndication.ts` + spec §9.)
- §4.3 YouTube (parseVideoId, yt-dlp seam, transcript paragraphs+timestamps, no-caption→partial, cache) → Tasks 4–5. ✓
- §4.4 paywall (thin detection, Wayback recovery, graceful miss, cache rationale) → Task 6. ✓
- §6 error handling (typed failures, never crash `processJob`) → `failedResult`/try-catch in X/YT extractors, `result.failureReason` written in Task 1 Step 8. ✓
- §7 testing (offline fixtures, pure-parse units, router test, integration cache path) → fixtures in every parser task; routing integration in Task 3; existing cache-HIT integration unchanged by Task 1. ✓
- §8 deployment (yt-dlp in worker image, flag for Phase 7) → Task 7 + spec note. ✓

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". The Task 1 `YtDlpOutput` placeholder is explicit, intentional, and resolved in Task 4 Step 10. ✓

**3. Type consistency:** `ExtractIO`/`Extractor`/`ProcessDeps` defined Task 1, consumed unchanged in Tasks 3/5/6. `YtDlpOutput`/`YtMeta`/`YtCaptions` defined Task 4, consumed in Task 5. `failedResult`/`escapeHtml` defined Task 2, consumed Tasks 3/4. `parseArticleHtml` defined Task 1, consumed Task 6. `isThinExtraction`/`recoverFromArchive` defined Task 6. Names match across tasks. ✓
