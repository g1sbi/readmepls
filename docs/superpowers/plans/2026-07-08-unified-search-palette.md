# Unified Search Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three scattered search entry points (desktop header input, library inline input, mobile bottom-nav focus link) with one global ⌘K command palette that live-searches articles, tags, and collections.

**Architecture:** A single `SearchPalette.svelte` (built on `bits-ui` `Command` inside a `bits-ui` `Dialog`, the same pattern as the existing `Sheet`/`ConfirmDialog`) is mounted once in the root layout and driven by a runes store. It calls a new server endpoint `/api/search/live` that runs keyword search per keystroke and full hybrid on a typing pause. The authoritative "all results" view stays the existing `/library?q=` hybrid grid; the library's own text input is removed and the active query becomes an editable/removable chip.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript strict, Zod at boundaries, `bits-ui`, Vitest + `@testing-library/svelte`, PocketBase, `@readmepls/core` + `@readmepls/types` (TS-source workspace packages).

## Global Constraints

- **TDD always** — failing test first, then minimal implementation. One logical change per commit, Conventional Commits.
- **TypeScript strict** — no `any` without a written reason.
- **Validate at boundaries with Zod** — endpoint output and any data read back from PocketBase.
- **Shared types live in `@readmepls/types`; pure logic in `@readmepls/core`** (both ship TS source — no build step, do not repoint `main` at `dist`).
- **PB filters use placeholders** — never string-interpolate ids/queries into a filter (`pb.filter(expr, params)`).
- **Tenant isolation** — every PB read goes through the user's session `locals.pb`; API rules scope records to the owner. Never trust the client.
- **Mobile-first** — palette must be usable at 360px: full-screen on mobile, tap targets ≥44px, no horizontal overflow.
- **Tokens only** — no hardcoded colors/fonts in components; reference `tokens.css` `--color-*` / `--font-*` / `--space-*`.
- **Run tests with:** `pnpm exec vitest run <pattern>` (single vitest workspace — `pnpm --filter <pkg> test` does NOT work). Typecheck: `pnpm typecheck`.

---

### Task 1: Live-search shared types

**Files:**
- Create: `packages/types/src/live-search.ts`
- Modify: `packages/types/src/index.ts`
- Test: `packages/types/src/live-search.test.ts`

**Interfaces:**
- Produces: `LiveSearchMode` (`"keyword" | "hybrid"`), `LiveArticle` (`{id,title,snippet,sourceName}`), `LiveTag` (`{id,name}`), `LiveCollection` (`{id,name,slug}`), `LiveSearchResult` (`{articles,tags,collections}`) — all Zod schemas + inferred types.

- [ ] **Step 1: Write the failing test**

```ts
// packages/types/src/live-search.test.ts
import { describe, it, expect } from "vitest";
import { LiveSearchMode, LiveSearchResult } from "./live-search.js";

describe("live-search types", () => {
  it("accepts a valid mode", () => {
    expect(LiveSearchMode.parse("hybrid")).toBe("hybrid");
    expect(LiveSearchMode.parse("keyword")).toBe("keyword");
  });

  it("rejects an unknown mode", () => {
    expect(() => LiveSearchMode.parse("fuzzy")).toThrow();
  });

  it("defaults every section to an empty array", () => {
    expect(LiveSearchResult.parse({})).toEqual({ articles: [], tags: [], collections: [] });
  });

  it("parses a populated result", () => {
    const r = LiveSearchResult.parse({
      articles: [{ id: "a1", title: "T", snippet: "s", sourceName: "src" }],
      tags: [{ id: "t1", name: "rust" }],
      collections: [{ id: "c1", name: "later", slug: "later" }],
    });
    expect(r.articles[0]!.title).toBe("T");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/types/src/live-search.test.ts`
Expected: FAIL — cannot resolve `./live-search.js`.

- [ ] **Step 3: Write the types**

```ts
// packages/types/src/live-search.ts
import { z } from "zod";

export const LiveSearchMode = z.enum(["keyword", "hybrid"]);
export type LiveSearchMode = z.infer<typeof LiveSearchMode>;

export const LiveArticle = z.object({
  id: z.string(),
  title: z.string(),
  snippet: z.string(),
  sourceName: z.string(),
});
export type LiveArticle = z.infer<typeof LiveArticle>;

export const LiveTag = z.object({ id: z.string(), name: z.string() });
export type LiveTag = z.infer<typeof LiveTag>;

export const LiveCollection = z.object({ id: z.string(), name: z.string(), slug: z.string() });
export type LiveCollection = z.infer<typeof LiveCollection>;

export const LiveSearchResult = z.object({
  articles: z.array(LiveArticle).default([]),
  tags: z.array(LiveTag).default([]),
  collections: z.array(LiveCollection).default([]),
});
export type LiveSearchResult = z.infer<typeof LiveSearchResult>;
```

- [ ] **Step 4: Export from the types barrel**

Add to `packages/types/src/index.ts` (after the existing `export * from "./search.js";` line):

```ts
export * from "./live-search.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/types/src/live-search.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/live-search.ts packages/types/src/live-search.test.ts packages/types/src/index.ts
git commit -m "feat(types): add live-search result and mode schemas"
```

---

### Task 2: Pure result shaper in core

**Files:**
- Create: `packages/core/src/library/live-search.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/library/live-search.test.ts`

**Interfaces:**
- Consumes: `LiveArticle`, `LiveTag`, `LiveCollection`, `LiveSearchResult` from `@readmepls/types` (Task 1).
- Produces: `LiveSearchCaps` (`{articles:number;tags:number;collections:number}`), `DEFAULT_LIVE_CAPS`, and `shapeLiveSearch(rankedIds: string[], articleById: Map<string, LiveArticle>, tags: LiveTag[], collections: LiveCollection[], caps?: LiveSearchCaps): LiveSearchResult`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/library/live-search.test.ts
import { describe, it, expect } from "vitest";
import type { LiveArticle } from "@readmepls/types";
import { shapeLiveSearch, DEFAULT_LIVE_CAPS } from "./live-search.js";

const art = (id: string): LiveArticle => ({ id, title: id.toUpperCase(), snippet: "", sourceName: "" });

describe("shapeLiveSearch", () => {
  it("orders articles by the ranked id list", () => {
    const map = new Map([["a", art("a")], ["b", art("b")], ["c", art("c")]]);
    const r = shapeLiveSearch(["c", "a", "b"], map, [], []);
    expect(r.articles.map((a) => a.id)).toEqual(["c", "a", "b"]);
  });

  it("drops ranked ids with no matching record", () => {
    const map = new Map([["a", art("a")]]);
    const r = shapeLiveSearch(["a", "ghost"], map, [], []);
    expect(r.articles.map((a) => a.id)).toEqual(["a"]);
  });

  it("caps each section", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const map = new Map(ids.map((id) => [id, art(id)]));
    const tags = ids.map((id) => ({ id, name: id }));
    const cols = ids.map((id) => ({ id, name: id, slug: id }));
    const r = shapeLiveSearch(ids, map, tags, cols, { articles: 2, tags: 3, collections: 1 });
    expect(r.articles).toHaveLength(2);
    expect(r.tags).toHaveLength(3);
    expect(r.collections).toHaveLength(1);
  });

  it("uses default caps when none supplied", () => {
    expect(DEFAULT_LIVE_CAPS.articles).toBeGreaterThan(0);
    const r = shapeLiveSearch([], new Map(), [], []);
    expect(r).toEqual({ articles: [], tags: [], collections: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/library/live-search.test.ts`
Expected: FAIL — cannot resolve `./live-search.js`.

- [ ] **Step 3: Write the shaper**

```ts
// packages/core/src/library/live-search.ts
import type { LiveArticle, LiveTag, LiveCollection, LiveSearchResult } from "@readmepls/types";

export interface LiveSearchCaps {
  articles: number;
  tags: number;
  collections: number;
}

export const DEFAULT_LIVE_CAPS: LiveSearchCaps = { articles: 6, tags: 5, collections: 5 };

/**
 * Order articles by the ranked id list, drop ids we have no record for, and cap
 * each section. Pure: the caller supplies already-fetched records; no IO here so
 * it is trivially unit-tested and reusable server-side.
 */
export function shapeLiveSearch(
  rankedIds: string[],
  articleById: Map<string, LiveArticle>,
  tags: LiveTag[],
  collections: LiveCollection[],
  caps: LiveSearchCaps = DEFAULT_LIVE_CAPS,
): LiveSearchResult {
  const articles: LiveArticle[] = [];
  for (const id of rankedIds) {
    const a = articleById.get(id);
    if (!a) continue;
    articles.push(a);
    if (articles.length >= caps.articles) break;
  }
  return {
    articles,
    tags: tags.slice(0, caps.tags),
    collections: collections.slice(0, caps.collections),
  };
}
```

- [ ] **Step 4: Export from the core barrel**

Add to `packages/core/src/index.ts` (after the existing `export * from "./library/fetch.js";` line):

```ts
export * from "./library/live-search.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/core/src/library/live-search.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/library/live-search.ts packages/core/src/library/live-search.test.ts packages/core/src/index.ts
git commit -m "feat(core): add pure live-search result shaper"
```

---

### Task 3: Recent-searches localStorage helper

**Files:**
- Create: `apps/web/src/lib/search/recent-searches.ts`
- Test: `apps/web/src/lib/search/recent-searches.test.ts`

**Interfaces:**
- Produces: `loadRecentSearches(storage?: Storage): string[]`, `pushRecentSearch(q: string, storage?: Storage): string[]`, `clearRecentSearches(storage?: Storage): void`. Storage defaults to `localStorage`; injectable for tests. Cap 5, most-recent-first, de-duplicated, trimmed.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/search/recent-searches.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadRecentSearches, pushRecentSearch, clearRecentSearches } from "./recent-searches.js";

function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

describe("recent-searches", () => {
  let s: Storage;
  beforeEach(() => { s = memStorage(); });

  it("starts empty", () => {
    expect(loadRecentSearches(s)).toEqual([]);
  });

  it("pushes most-recent-first", () => {
    pushRecentSearch("rust", s);
    pushRecentSearch("svelte", s);
    expect(loadRecentSearches(s)).toEqual(["svelte", "rust"]);
  });

  it("de-duplicates and re-promotes an existing query", () => {
    pushRecentSearch("rust", s);
    pushRecentSearch("svelte", s);
    pushRecentSearch("rust", s);
    expect(loadRecentSearches(s)).toEqual(["rust", "svelte"]);
  });

  it("caps at 5 and trims/ignores blank", () => {
    for (const q of ["a", "b", "c", "d", "e", "f"]) pushRecentSearch(q, s);
    expect(loadRecentSearches(s)).toEqual(["f", "e", "d", "c", "b"]);
    expect(pushRecentSearch("   ", s)).toEqual(["f", "e", "d", "c", "b"]);
  });

  it("clears", () => {
    pushRecentSearch("rust", s);
    clearRecentSearches(s);
    expect(loadRecentSearches(s)).toEqual([]);
  });

  it("returns [] on corrupt stored data", () => {
    s.setItem("readmepls:recent-searches", "{not json");
    expect(loadRecentSearches(s)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/search/recent-searches.test.ts`
Expected: FAIL — cannot resolve `./recent-searches.js`.

- [ ] **Step 3: Write the helper**

```ts
// apps/web/src/lib/search/recent-searches.ts
const KEY = "readmepls:recent-searches";
const MAX = 5;

export function loadRecentSearches(storage: Storage = localStorage): string[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string").slice(0, MAX);
  } catch {
    return [];
  }
}

export function pushRecentSearch(q: string, storage: Storage = localStorage): string[] {
  const query = q.trim();
  if (!query) return loadRecentSearches(storage);
  const next = [query, ...loadRecentSearches(storage).filter((x) => x !== query)].slice(0, MAX);
  try {
    storage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private-mode errors */
  }
  return next;
}

export function clearRecentSearches(storage: Storage = localStorage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/search/recent-searches.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/search/recent-searches.ts apps/web/src/lib/search/recent-searches.test.ts
git commit -m "feat(web): add recent-searches localStorage helper"
```

---

### Task 4: Keyboard-shortcut matcher (pure)

**Files:**
- Create: `apps/web/src/lib/search/shortcut.ts`
- Test: `apps/web/src/lib/search/shortcut.test.ts`

**Interfaces:**
- Produces: `isSearchOpenShortcut(e: KeyboardEvent): boolean` — true for ⌘K / Ctrl-K anywhere, or `/` when focus is NOT in an editable element.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/search/shortcut.test.ts
import { describe, it, expect } from "vitest";
import { isSearchOpenShortcut } from "./shortcut.js";

function ev(init: Partial<KeyboardEvent> & { key: string; target?: EventTarget | null }): KeyboardEvent {
  return { metaKey: false, ctrlKey: false, altKey: false, target: null, ...init } as KeyboardEvent;
}

describe("isSearchOpenShortcut", () => {
  it("matches Cmd+K and Ctrl+K", () => {
    expect(isSearchOpenShortcut(ev({ key: "k", metaKey: true }))).toBe(true);
    expect(isSearchOpenShortcut(ev({ key: "K", ctrlKey: true }))).toBe(true);
  });

  it("matches / with no editable target", () => {
    expect(isSearchOpenShortcut(ev({ key: "/", target: null }))).toBe(true);
  });

  it("ignores / while typing in an input", () => {
    const input = document.createElement("input");
    expect(isSearchOpenShortcut(ev({ key: "/", target: input }))).toBe(false);
  });

  it("ignores / in a textarea and contenteditable", () => {
    const ta = document.createElement("textarea");
    const div = document.createElement("div");
    div.contentEditable = "true";
    expect(isSearchOpenShortcut(ev({ key: "/", target: ta }))).toBe(false);
    expect(isSearchOpenShortcut(ev({ key: "/", target: div }))).toBe(false);
  });

  it("ignores plain keys", () => {
    expect(isSearchOpenShortcut(ev({ key: "a" }))).toBe(false);
    expect(isSearchOpenShortcut(ev({ key: "k" }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/search/shortcut.test.ts`
Expected: FAIL — cannot resolve `./shortcut.js`.

- [ ] **Step 3: Write the matcher**

```ts
// apps/web/src/lib/search/shortcut.ts
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

/** Cmd/Ctrl+K opens from anywhere; "/" opens only when focus is not in a field. */
export function isSearchOpenShortcut(e: KeyboardEvent): boolean {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") return true;
  if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(e.target)) return true;
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/search/shortcut.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/search/shortcut.ts apps/web/src/lib/search/shortcut.test.ts
git commit -m "feat(web): add search keyboard-shortcut matcher"
```

---

### Task 5: Palette open/close store

**Files:**
- Create: `apps/web/src/lib/stores/search-palette.svelte.ts`
- Test: `apps/web/src/lib/stores/search-palette.svelte.test.ts`

**Interfaces:**
- Produces: `searchPalette` singleton with `get isOpen(): boolean`, `get initialQuery(): string`, `open(query?: string): void`, `close(): void`. (File uses the `.svelte.ts` extension so `$state` runes work in a module.)

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/stores/search-palette.svelte.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { searchPalette } from "./search-palette.svelte.js";

describe("searchPalette store", () => {
  beforeEach(() => searchPalette.close());

  it("starts closed", () => {
    expect(searchPalette.isOpen).toBe(false);
  });

  it("opens with an optional initial query", () => {
    searchPalette.open("rust");
    expect(searchPalette.isOpen).toBe(true);
    expect(searchPalette.initialQuery).toBe("rust");
  });

  it("opens empty by default", () => {
    searchPalette.open();
    expect(searchPalette.isOpen).toBe(true);
    expect(searchPalette.initialQuery).toBe("");
  });

  it("closes", () => {
    searchPalette.open("x");
    searchPalette.close();
    expect(searchPalette.isOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/stores/search-palette.svelte.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the store**

```ts
// apps/web/src/lib/stores/search-palette.svelte.ts
let open = $state(false);
let initialQuery = $state("");

export const searchPalette = {
  get isOpen() {
    return open;
  },
  get initialQuery() {
    return initialQuery;
  },
  open(query = "") {
    initialQuery = query;
    open = true;
  },
  close() {
    open = false;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/stores/search-palette.svelte.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/search-palette.svelte.ts apps/web/src/lib/stores/search-palette.svelte.test.ts
git commit -m "feat(web): add search-palette open/close store"
```

---

### Task 6: Live-search server helper

**Files:**
- Create: `apps/web/src/lib/server/live-search.ts`
- Test: `apps/web/src/lib/server/live-search.test.ts`

**Interfaces:**
- Consumes: `keywordSearchIds`, `shapeLiveSearch` from `@readmepls/core`; `hybridSearchIds` from `./semantic-search.js` (Task existing); `LiveSearchMode`, `LiveSearchResult`, `LiveArticle` from `@readmepls/types`.
- Produces: `liveSearch(pb: PocketBase, q: string, mode: LiveSearchMode, userId: string): Promise<LiveSearchResult>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/server/live-search.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type PocketBase from "pocketbase";

vi.mock("$env/dynamic/private", () => ({
  env: { WORKER_URL: "http://worker:8091", WORKER_SEARCH_SECRET: "s" },
}));

vi.mock("@readmepls/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@readmepls/core")>()),
  keywordSearchIds: vi.fn(),
}));

import { keywordSearchIds } from "@readmepls/core";
import { liveSearch } from "./live-search.js";

// A minimal pb stub: getFullList for articles, getList for tags/collections.
function pbStub(over: Partial<Record<string, unknown>> = {}) {
  const articleRow = {
    id: "a1",
    expand: { content: { title: "Tokio", excerpt: "async runtime", expand: { source: { name: "blog", host: "b.io" } } } },
  };
  return {
    filter: (expr: string, params?: Record<string, unknown>) => `FILTER(${expr})`,
    collection: (name: string) => {
      if (name === "articles") return { getFullList: vi.fn(async () => [articleRow]) };
      if (name === "tags") return { getList: vi.fn(async () => ({ items: [{ id: "t1", name: "rust" }] })) };
      if (name === "collections") return { getList: vi.fn(async () => ({ items: [{ id: "c1", name: "later", slug: "later" }] })) };
      throw new Error(`unexpected collection ${name}`);
    },
    ...over,
  } as unknown as PocketBase;
}

describe("liveSearch", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns empty sections for a blank query without hitting pb", async () => {
    const pb = pbStub();
    expect(await liveSearch(pb, "   ", "keyword", "u1")).toEqual({ articles: [], tags: [], collections: [] });
  });

  it("keyword mode: resolves ids, fetches records, shapes result", async () => {
    vi.mocked(keywordSearchIds).mockResolvedValue(["a1"]);
    const pb = pbStub();
    const r = await liveSearch(pb, "tokio", "keyword", "u1");
    expect(keywordSearchIds).toHaveBeenCalled();
    expect(r.articles).toEqual([{ id: "a1", title: "Tokio", snippet: "async runtime", sourceName: "blog" }]);
    expect(r.tags).toEqual([{ id: "t1", name: "rust" }]);
    expect(r.collections).toEqual([{ id: "c1", name: "later", slug: "later" }]);
  });

  it("hybrid mode: uses the worker (RRF) instead of keyword-only", async () => {
    vi.mocked(keywordSearchIds).mockResolvedValue(["a1"]);
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ articleId: "a1" }] }), { status: 200, headers: { "content-type": "application/json" } })));
    const pb = pbStub();
    const r = await liveSearch(pb, "tokio", "hybrid", "u1");
    // hybrid fuses keyword + semantic; a1 survives fusion and is shaped.
    expect(r.articles.map((a) => a.id)).toEqual(["a1"]);
  });

  it("returns no articles when the resolver finds nothing (still queries tags/collections)", async () => {
    vi.mocked(keywordSearchIds).mockResolvedValue([]);
    const pb = pbStub();
    const r = await liveSearch(pb, "zzz", "keyword", "u1");
    expect(r.articles).toEqual([]);
    expect(r.tags).toEqual([{ id: "t1", name: "rust" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/server/live-search.test.ts`
Expected: FAIL — cannot resolve `./live-search.js`.

- [ ] **Step 3: Write the helper**

```ts
// apps/web/src/lib/server/live-search.ts
import type PocketBase from "pocketbase";
import { keywordSearchIds, shapeLiveSearch } from "@readmepls/core";
import type { LiveArticle, LiveSearchMode, LiveSearchResult } from "@readmepls/types";
import { hybridSearchIds } from "./semantic-search.js";

const CANDIDATES = 8;
const SNIPPET_LEN = 160;

/** OR-filter over article ids, using placeholders (never interpolate ids). */
function idFilter(pb: PocketBase, ids: string[]): string {
  const params: Record<string, string> = {};
  const parts = ids.map((id, i) => {
    params[`a${i}`] = id;
    return `id = {:a${i}}`;
  });
  return pb.filter(parts.join(" || "), params);
}

/**
 * Resolve a query into the palette's sectioned result. Article ranking uses the
 * requested mode (keyword = fast PB FTS; hybrid = keyword+semantic RRF). Tags and
 * collections are matched by a name substring. Every read goes through the caller's
 * session `pb`, so PB API rules scope results to the owner — the tenant boundary.
 */
export async function liveSearch(
  pb: PocketBase,
  q: string,
  mode: LiveSearchMode,
  userId: string,
): Promise<LiveSearchResult> {
  const query = q.trim();
  if (!query) return { articles: [], tags: [], collections: [] };

  const ids = mode === "hybrid" ? await hybridSearchIds(pb, query, userId) : await keywordSearchIds(pb, query);
  const topIds = ids.slice(0, CANDIDATES);

  const [articleRows, tagRes, colRes] = await Promise.all([
    topIds.length
      ? pb.collection("articles").getFullList({
          filter: idFilter(pb, topIds),
          expand: "content.source",
          fields:
            "id,expand.content.title,expand.content.excerpt," +
            "expand.content.expand.source.name,expand.content.expand.source.host",
          requestKey: null,
        })
      : Promise.resolve([]),
    pb.collection("tags").getList(1, 5, {
      filter: pb.filter("name ~ {:q}", { q: query }),
      sort: "name",
      requestKey: null,
    }),
    pb.collection("collections").getList(1, 5, {
      filter: pb.filter("name ~ {:q}", { q: query }),
      sort: "name",
      requestKey: null,
    }),
  ]);

  const articleById = new Map<string, LiveArticle>();
  for (const r of articleRows) {
    const content = (r.expand as { content?: Record<string, unknown> } | undefined)?.content;
    const source = (content?.expand as { source?: Record<string, unknown> } | undefined)?.source;
    articleById.set(r.id, {
      id: r.id,
      title: (content?.title as string) ?? "(untitled)",
      snippet: ((content?.excerpt as string) ?? "").slice(0, SNIPPET_LEN),
      sourceName: (source?.name as string) || (source?.host as string) || "",
    });
  }

  const tags = tagRes.items.map((t) => ({ id: t.id, name: t.name as string }));
  const collections = colRes.items.map((c) => ({ id: c.id, name: c.name as string, slug: c.slug as string }));

  return shapeLiveSearch(topIds, articleById, tags, collections);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/server/live-search.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/server/live-search.ts apps/web/src/lib/server/live-search.test.ts
git commit -m "feat(web): add live-search server helper (keyword + hybrid modes)"
```

---

### Task 6b: Live-search endpoint

**Files:**
- Create: `apps/web/src/routes/api/search/live/+server.ts`
- Test: `apps/web/src/routes/api/search/live/server.test.ts`

**Interfaces:**
- Consumes: `liveSearch` (Task 6), `LiveSearchMode` from `@readmepls/types`.
- Produces: `GET` handler. Contract: `GET /api/search/live?q=<str>&mode=keyword|hybrid`. 401 when unauthenticated; blank `q` → `{articles:[],tags:[],collections:[]}`; invalid/absent `mode` defaults to `keyword`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/routes/api/search/live/server.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const liveSearch = vi.fn();
vi.mock("$lib/server/live-search.js", () => ({ liveSearch }));

import { GET } from "./+server.js";

function evt(search: string, userId: string | null) {
  return {
    url: new URL(`http://localhost/api/search/live${search}`),
    locals: { userId, pb: {} },
  } as unknown as Parameters<typeof GET>[0];
}

describe("GET /api/search/live", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s when unauthenticated", async () => {
    await expect(GET(evt("?q=x", null))).rejects.toMatchObject({ status: 401 });
    expect(liveSearch).not.toHaveBeenCalled();
  });

  it("returns empty sections for a blank query without calling liveSearch", async () => {
    const res = await GET(evt("?q=%20", "u1"));
    expect(await res.json()).toEqual({ articles: [], tags: [], collections: [] });
    expect(liveSearch).not.toHaveBeenCalled();
  });

  it("defaults to keyword mode", async () => {
    liveSearch.mockResolvedValue({ articles: [], tags: [], collections: [] });
    await GET(evt("?q=rust", "u1"));
    expect(liveSearch).toHaveBeenCalledWith(expect.anything(), "rust", "keyword", "u1");
  });

  it("passes hybrid mode through", async () => {
    liveSearch.mockResolvedValue({ articles: [{ id: "a1", title: "T", snippet: "", sourceName: "" }], tags: [], collections: [] });
    const res = await GET(evt("?q=rust&mode=hybrid", "u1"));
    expect(liveSearch).toHaveBeenCalledWith(expect.anything(), "rust", "hybrid", "u1");
    expect((await res.json()).articles).toHaveLength(1);
  });

  it("falls back to keyword on an invalid mode", async () => {
    liveSearch.mockResolvedValue({ articles: [], tags: [], collections: [] });
    await GET(evt("?q=rust&mode=bogus", "u1"));
    expect(liveSearch).toHaveBeenCalledWith(expect.anything(), "rust", "keyword", "u1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/routes/api/search/live/server.test.ts`
Expected: FAIL — cannot resolve `./+server.js`.

- [ ] **Step 3: Write the endpoint**

```ts
// apps/web/src/routes/api/search/live/+server.ts
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { LiveSearchMode } from "@readmepls/types";
import { liveSearch } from "$lib/server/live-search.js";

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.userId) throw error(401, "unauthenticated");
  const q = url.searchParams.get("q") ?? "";
  if (!q.trim()) return json({ articles: [], tags: [], collections: [] });
  const parsed = LiveSearchMode.safeParse(url.searchParams.get("mode"));
  const mode = parsed.success ? parsed.data : "keyword";
  return json(await liveSearch(locals.pb, q, mode, locals.userId));
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/routes/api/search/live/server.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/api/search/live/+server.ts apps/web/src/routes/api/search/live/server.test.ts
git commit -m "feat(web): add /api/search/live endpoint"
```

---

### Task 7: Live-search fetch client

**Files:**
- Create: `apps/web/src/lib/search/live-client.ts`
- Test: `apps/web/src/lib/search/live-client.test.ts`

**Interfaces:**
- Consumes: `LiveSearchResult`, `LiveSearchMode` from `@readmepls/types`.
- Produces: `fetchLive(q: string, mode: LiveSearchMode, signal?: AbortSignal): Promise<LiveSearchResult>` — calls the endpoint, Zod-parses the response, returns empty sections on a non-ok response.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/search/live-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchLive } from "./live-client.js";

describe("fetchLive", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requests the endpoint with q and mode and parses the result", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ articles: [{ id: "a1", title: "T", snippet: "s", sourceName: "src" }], tags: [], collections: [] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchLive("rust", "hybrid");
    const calledUrl = new URL(fetchMock.mock.calls[0]![0] as string, "http://localhost");
    expect(calledUrl.pathname).toBe("/api/search/live");
    expect(calledUrl.searchParams.get("q")).toBe("rust");
    expect(calledUrl.searchParams.get("mode")).toBe("hybrid");
    expect(r.articles[0]!.id).toBe("a1");
  });

  it("returns empty sections on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    expect(await fetchLive("x", "keyword")).toEqual({ articles: [], tags: [], collections: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/search/live-client.test.ts`
Expected: FAIL — cannot resolve `./live-client.js`.

- [ ] **Step 3: Write the client**

```ts
// apps/web/src/lib/search/live-client.ts
import { LiveSearchResult, type LiveSearchMode } from "@readmepls/types";

const EMPTY: LiveSearchResult = { articles: [], tags: [], collections: [] };

/** Fetch live palette results. Parses at the boundary; any failure degrades to
 *  empty sections so the palette never throws mid-typing. */
export async function fetchLive(q: string, mode: LiveSearchMode, signal?: AbortSignal): Promise<LiveSearchResult> {
  const url = `/api/search/live?q=${encodeURIComponent(q)}&mode=${mode}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return { ...EMPTY };
  return LiveSearchResult.parse(await res.json());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/search/live-client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/search/live-client.ts apps/web/src/lib/search/live-client.test.ts
git commit -m "feat(web): add live-search fetch client"
```

---

### Task 8: SearchPalette component

**Files:**
- Create: `apps/web/src/lib/components/SearchPalette.svelte`
- Test: `apps/web/src/lib/components/search-palette.test.ts`

**Interfaces:**
- Consumes: `searchPalette` store (Task 5), `fetchLive` (Task 7), `loadRecentSearches`/`pushRecentSearch` (Task 3), `browserPb` (`$lib/pb.js`) for the recently-read empty state, `goto` from `$app/navigation`, `bits-ui` `Command` + `Dialog`.
- Produces: `SearchPalette.svelte` (no props — reads the store). Renders nothing when `searchPalette.isOpen` is false.

**Behavior:**
- Opens when `searchPalette.isOpen` becomes true; seeds the input from `searchPalette.initialQuery`; autofocuses the input.
- Empty query → shows **recent searches** (from localStorage; click re-runs that query) and **recently-read** articles (client `browserPb` `getList(1,5,{sort:"-updated",expand:"content.source"})`).
- Non-empty query → two-phase: on each change debounce 120ms then `fetchLive(q,"keyword")`; on a 250ms idle also `fetchLive(q,"hybrid")` and replace the list when it resolves. Each fetch uses an `AbortController`; a newer keystroke aborts the older request.
- Sections rendered: **articles** (title + snippet + source → selecting navigates to `/read/<id>` and pushes the query to recent), **tags** (→ `/library?tag=<id>`), **collections** (→ `/library?collection=<id>`), plus a **"see all N results"** footer (→ `/library?q=<query>`).
- Selecting anything, or pressing Esc, closes the palette (`searchPalette.close()`).
- Mobile-first CSS: full-screen sheet ≤640px, centered ~40rem panel above; tap targets ≥44px; tokens only.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/components/search-palette.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

const goto = vi.fn();
vi.mock("$app/navigation", () => ({ goto }));

const fetchLive = vi.fn();
vi.mock("$lib/search/live-client.js", () => ({ fetchLive }));

// Recently-read pb query stub.
vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    collection: () => ({ getList: vi.fn(async () => ({ items: [] })) }),
  }),
}));

import SearchPalette from "./SearchPalette.svelte";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";
import { clearRecentSearches, pushRecentSearch } from "$lib/search/recent-searches.js";

describe("SearchPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRecentSearches();
    searchPalette.close();
    fetchLive.mockResolvedValue({ articles: [], tags: [], collections: [] });
  });
  afterEach(() => searchPalette.close());

  it("renders nothing when closed", () => {
    render(SearchPalette);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens from the store and shows recent searches when empty", async () => {
    pushRecentSearch("rust");
    render(SearchPalette);
    searchPalette.open();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByText("rust")).toBeInTheDocument();
  });

  it("fetches live results as the query changes and navigates to a picked article", async () => {
    fetchLive.mockResolvedValue({
      articles: [{ id: "a1", title: "Tokio internals", snippet: "async", sourceName: "blog" }],
      tags: [], collections: [],
    });
    render(SearchPalette);
    searchPalette.open();
    const input = await screen.findByRole("combobox");
    await fireEvent.input(input, { target: { value: "tokio" } });
    const item = await screen.findByText("Tokio internals");
    await fireEvent.click(item);
    expect(goto).toHaveBeenCalledWith("/read/a1");
    expect(searchPalette.isOpen).toBe(false);
  });

  it("navigates to the filtered library on 'see all'", async () => {
    fetchLive.mockResolvedValue({
      articles: [{ id: "a1", title: "Tokio internals", snippet: "async", sourceName: "blog" }],
      tags: [], collections: [],
    });
    render(SearchPalette);
    searchPalette.open();
    const input = await screen.findByRole("combobox");
    await fireEvent.input(input, { target: { value: "tokio" } });
    const seeAll = await screen.findByText(/see all/i);
    await fireEvent.click(seeAll);
    expect(goto).toHaveBeenCalledWith("/library?q=tokio");
  });

  it("navigates to a tag-filtered library when a tag is picked", async () => {
    fetchLive.mockResolvedValue({ articles: [], tags: [{ id: "t1", name: "rust" }], collections: [] });
    render(SearchPalette);
    searchPalette.open();
    const input = await screen.findByRole("combobox");
    await fireEvent.input(input, { target: { value: "rus" } });
    const tag = await screen.findByText("rust");
    await fireEvent.click(tag);
    expect(goto).toHaveBeenCalledWith("/library?tag=t1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/search-palette.test.ts`
Expected: FAIL — cannot resolve `./SearchPalette.svelte`.

- [ ] **Step 3: Write the component**

```svelte
<!-- apps/web/src/lib/components/SearchPalette.svelte -->
<script lang="ts">
  import { Command, Dialog } from "bits-ui";
  import { goto } from "$app/navigation";
  import { Search } from "@lucide/svelte";
  import type { LiveSearchResult } from "@readmepls/types";
  import { searchPalette } from "$lib/stores/search-palette.svelte.js";
  import { fetchLive } from "$lib/search/live-client.js";
  import { loadRecentSearches, pushRecentSearch } from "$lib/search/recent-searches.js";
  import { browserPb } from "$lib/pb.js";
  import type { ArticleRecord } from "$lib/article/record.js";

  const EMPTY: LiveSearchResult = { articles: [], tags: [], collections: [] };
  const DEBOUNCE_KEYWORD = 120;
  const DEBOUNCE_HYBRID = 250;

  let query = $state("");
  let results = $state<LiveSearchResult>(EMPTY);
  let recent = $state<string[]>([]);
  let recentArticles = $state<ArticleRecord[]>([]);

  let kwTimer: ReturnType<typeof setTimeout> | undefined;
  let hyTimer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const pb = browserPb();

  // Seed from the store each time the palette opens.
  $effect(() => {
    if (searchPalette.isOpen) {
      query = searchPalette.initialQuery;
      recent = loadRecentSearches();
      loadRecentlyRead();
      if (query.trim()) runSearch(query);
    } else {
      reset();
    }
  });

  async function loadRecentlyRead() {
    try {
      const list = await pb.collection("articles").getList(1, 5, {
        sort: "-updated",
        expand: "content.source",
        requestKey: null,
      });
      recentArticles = list.items as unknown as ArticleRecord[];
    } catch {
      recentArticles = [];
    }
  }

  function reset() {
    query = "";
    results = EMPTY;
    clearTimeout(kwTimer);
    clearTimeout(hyTimer);
    controller?.abort();
  }

  function onInput(value: string) {
    query = value;
    clearTimeout(kwTimer);
    clearTimeout(hyTimer);
    if (!value.trim()) {
      results = EMPTY;
      return;
    }
    kwTimer = setTimeout(() => runSearch(value, "keyword"), DEBOUNCE_KEYWORD);
    hyTimer = setTimeout(() => runSearch(value, "hybrid"), DEBOUNCE_HYBRID);
  }

  // Phase-1 keyword shows instantly; phase-2 hybrid replaces in place. A newer
  // keystroke aborts the in-flight request so stale results never overwrite fresh.
  async function runSearch(q: string, mode: "keyword" | "hybrid" = "keyword") {
    controller?.abort();
    controller = new AbortController();
    try {
      const r = await fetchLive(q, mode, controller.signal);
      if (q === query) results = r;
    } catch {
      /* aborted or failed — keep the last good results */
    }
  }

  const totalArticles = $derived(results.articles.length);

  function pickArticle(id: string) {
    pushRecentSearch(query);
    close();
    goto(`/read/${id}`);
  }
  function pickTag(id: string) {
    close();
    goto(`/library?tag=${id}`);
  }
  function pickCollection(id: string) {
    close();
    goto(`/library?collection=${id}`);
  }
  function seeAll() {
    const q = query.trim();
    pushRecentSearch(q);
    close();
    goto(`/library?q=${encodeURIComponent(q)}`);
  }
  function reRun(q: string) {
    onInput(q);
  }
  function close() {
    searchPalette.close();
  }
</script>

<Dialog.Root bind:open={() => searchPalette.isOpen, (v) => { if (!v) close(); }}>
  <Dialog.Portal>
    <Dialog.Overlay class="sp-overlay" />
    <Dialog.Content class="sp-content" aria-label="search">
      <Command.Root shouldFilter={false} class="sp-command">
        <div class="sp-input-row">
          <Search class="icon-sm" aria-hidden="true" />
          <Command.Input
            placeholder="search your library…"
            value={query}
            oninput={(e) => onInput(e.currentTarget.value)}
          />
        </div>
        <Command.List class="sp-list">
          {#if !query.trim()}
            {#if recent.length}
              <Command.Group heading="recent searches">
                {#each recent as r (r)}
                  <Command.Item onSelect={() => reRun(r)}>{r}</Command.Item>
                {/each}
              </Command.Group>
            {/if}
            {#if recentArticles.length}
              <Command.Group heading="recently read">
                {#each recentArticles as a (a.id)}
                  <Command.Item onSelect={() => pickArticle(a.id)}>
                    {a.expand?.content?.title ?? a.url}
                  </Command.Item>
                {/each}
              </Command.Group>
            {/if}
          {:else}
            {#if results.articles.length}
              <Command.Group heading="articles">
                {#each results.articles as a (a.id)}
                  <Command.Item onSelect={() => pickArticle(a.id)}>
                    <span class="sp-title">{a.title}</span>
                    {#if a.sourceName}<span class="sp-source">{a.sourceName}</span>{/if}
                    {#if a.snippet}<span class="sp-snippet">{a.snippet}</span>{/if}
                  </Command.Item>
                {/each}
              </Command.Group>
            {/if}
            {#if results.tags.length}
              <Command.Group heading="tags">
                {#each results.tags as t (t.id)}
                  <Command.Item onSelect={() => pickTag(t.id)}># {t.name}</Command.Item>
                {/each}
              </Command.Group>
            {/if}
            {#if results.collections.length}
              <Command.Group heading="collections">
                {#each results.collections as c (c.id)}
                  <Command.Item onSelect={() => pickCollection(c.id)}>{c.name}</Command.Item>
                {/each}
              </Command.Group>
            {/if}
            <Command.Item class="sp-seeall" onSelect={seeAll}>
              ↵ see all {totalArticles ? `${totalArticles}+ ` : ""}results →
            </Command.Item>
          {/if}
        </Command.List>
      </Command.Root>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.sp-overlay) {
    position: fixed; inset: 0; z-index: 40;
    background: color-mix(in srgb, var(--color-ink) 45%, transparent);
  }
  :global(.sp-content) {
    position: fixed; z-index: 41;
    left: 50%; top: 12vh; transform: translateX(-50%);
    width: min(40rem, 92vw); max-height: 70vh; overflow: hidden;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
  }
  .sp-input-row { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-border); color: var(--color-text-subtle); }
  .sp-input-row :global(input) { flex: 1; min-height: 44px; border: none; background: transparent; font-family: var(--font-ui); font-size: var(--text-md); color: var(--color-text); outline: none; }
  .sp-list { overflow-y: auto; max-height: calc(70vh - 4rem); padding: var(--space-2); }
  .sp-list :global([data-command-item]) { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); min-height: 44px; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-family: var(--font-ui); color: var(--color-text); cursor: pointer; }
  .sp-list :global([data-command-item][data-selected]) { background: var(--color-accent-wash); }
  .sp-list :global([data-command-group-heading]) { padding: var(--space-2) var(--space-3) var(--space-1); font-size: var(--text-xs); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .sp-title { font-weight: var(--weight-medium); }
  .sp-source { font-size: var(--text-xs); color: var(--color-text-muted); }
  .sp-snippet { flex-basis: 100%; font-size: var(--text-sm); color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.sp-seeall) { color: var(--color-accent); }

  @media (max-width: 640px) {
    :global(.sp-content) { left: 0; top: 0; transform: none; width: 100vw; max-height: 100dvh; height: 100dvh; border: none; border-radius: 0; }
    .sp-list { max-height: calc(100dvh - 4rem); }
  }
</style>
```

> **Note on the `bind:open` shorthand:** `bits-ui` `Dialog.Root` takes a `bind:open`. Since our source of truth is the store (not local state), bind a get/set pair as shown; if the installed `bits-ui` version rejects the function-pair shorthand, replace with `open={searchPalette.isOpen} onOpenChange={(v) => { if (!v) close(); }}`. Verify against `bits-ui@2.18` `Dialog` docs during implementation.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/components/search-palette.test.ts`
Expected: PASS (5 tests). If the `combobox`/`dialog` roles differ from what `bits-ui` emits, adjust the queries to the actual roles (inspect with `screen.debug()`), keeping the behavioral assertions intact.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/SearchPalette.svelte apps/web/src/lib/components/search-palette.test.ts
git commit -m "feat(web): add global search command palette component"
```

---

### Task 9: Mount palette + wire global keyboard shortcuts

**Files:**
- Modify: `apps/web/src/routes/+layout.svelte`
- Test: `apps/web/src/routes/layout-search-shortcut.test.ts`

**Interfaces:**
- Consumes: `SearchPalette` (Task 8), `searchPalette` store (Task 5), `isSearchOpenShortcut` (Task 4).
- The layout mounts one `<SearchPalette />` (gated on `chrome`, like `TopBar`/`BottomNav`) and adds a `window` `keydown` listener that opens the palette on a matching shortcut.

- [ ] **Step 1: Write the failing test**

This test verifies the wiring helper the layout uses, so the behavior is covered without rendering the whole layout. Create a tiny exported handler and test it.

```ts
// apps/web/src/routes/layout-search-shortcut.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSearchKeydown } from "$lib/search/handle-keydown.js";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";

describe("handleSearchKeydown", () => {
  beforeEach(() => searchPalette.close());

  it("opens the palette and prevents default on Cmd+K", () => {
    const preventDefault = vi.fn();
    handleSearchKeydown({ key: "k", metaKey: true, ctrlKey: false, altKey: false, target: null, preventDefault } as unknown as KeyboardEvent);
    expect(searchPalette.isOpen).toBe(true);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("ignores plain keys", () => {
    const preventDefault = vi.fn();
    handleSearchKeydown({ key: "a", metaKey: false, ctrlKey: false, altKey: false, target: null, preventDefault } as unknown as KeyboardEvent);
    expect(searchPalette.isOpen).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/routes/layout-search-shortcut.test.ts`
Expected: FAIL — cannot resolve `$lib/search/handle-keydown.js`.

- [ ] **Step 3: Write the keydown handler**

```ts
// apps/web/src/lib/search/handle-keydown.ts
import { isSearchOpenShortcut } from "./shortcut.js";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";

export function handleSearchKeydown(e: KeyboardEvent): void {
  if (!isSearchOpenShortcut(e)) return;
  e.preventDefault();
  searchPalette.open();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/routes/layout-search-shortcut.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into the layout**

In `apps/web/src/routes/+layout.svelte`, add to the imports block (near the `TopBar`/`BottomNav` imports):

```ts
  import SearchPalette from "$lib/components/SearchPalette.svelte";
  import { handleSearchKeydown } from "$lib/search/handle-keydown.js";
```

Add a `svelte:window` keydown binding and mount the palette. Change the chrome block so it reads:

```svelte
<svelte:window onkeydown={handleSearchKeydown} />

<div class="app">
  {#if chrome}
    <TopBar {theme} onTheme={setTheme} onSignOut={signOut} />
  {/if}
  {#if $page.url.pathname.startsWith("/read/")}
    <div class="progress" style="--p: {readProgress}" aria-hidden="true"></div>
  {/if}
  <div class="page" class:page--wide={isReader} use:releaseTransformContainingBlock>{@render children()}</div>
  {#if chrome}
    <BottomNav pathname={$page.url.pathname} />
    <SearchPalette />
  {/if}
</div>
```

- [ ] **Step 6: Verify the suite + typecheck still pass**

Run: `pnpm exec vitest run apps/web/src/routes/layout-search-shortcut.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/search/handle-keydown.ts apps/web/src/routes/layout-search-shortcut.test.ts apps/web/src/routes/+layout.svelte
git commit -m "feat(web): mount search palette and wire global ⌘K/slash shortcut"
```

---

### Task 10: Header → fake search bar that opens the palette

**Files:**
- Modify: `apps/web/src/lib/components/TopBar.svelte`
- Test: `apps/web/src/lib/components/topbar.test.ts`

**Interfaces:**
- Consumes: `searchPalette` store (Task 5).
- The real `<form class="search">`/`<input>` is replaced by a `<button class="search-trigger">` that calls `searchPalette.open()`; `goto` and the `q` state are removed.

- [ ] **Step 1: Update the test (write the new expectation first)**

Add to `apps/web/src/lib/components/topbar.test.ts` (inside the `describe`), and mock the store:

```ts
import { searchPalette } from "$lib/stores/search-palette.svelte.js";

it("opens the search palette from the header search trigger", async () => {
  const spy = vi.spyOn(searchPalette, "open");
  render(TopBar, { theme: "light", onTheme: () => {}, onSignOut: () => {} });
  await fireEvent.click(screen.getByRole("button", { name: /search/i }));
  expect(spy).toHaveBeenCalled();
});
```

(Ensure `fireEvent` is imported in this file — it already imports `render`, `screen`; add `fireEvent`, and `vi` is already imported.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/topbar.test.ts`
Expected: FAIL — no button named "search" (the current search is an `<input>` in a `<form>`).

- [ ] **Step 3: Replace the header search with a trigger**

In `apps/web/src/lib/components/TopBar.svelte`:

Remove the `import { goto } from "$app/navigation";` line and the `let q = $state("");` line. Add:

```ts
  import { searchPalette } from "$lib/stores/search-palette.svelte.js";
```

Replace the `<form class="search">…</form>` block (lines 38–41) with:

```svelte
  <button type="button" class="search-trigger" onclick={() => searchPalette.open()}>
    <Search class="icon-sm search-icon" aria-hidden="true" />
    <span class="search-label">search your library…</span>
    <kbd class="search-kbd">⌘K</kbd>
  </button>
```

Replace the `.search` CSS rules (the `.search`, `.search input`, `.search input::placeholder`, `.search input:focus`, and `.search :global(.search-icon)` blocks) with:

```css
  .search-trigger {
    display: flex; flex: 1; max-width: 20rem; align-items: center; gap: var(--space-2);
    min-height: 36px; padding: 0.3rem 0.65rem;
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-text-subtle);
    font-family: var(--font-ui); font-size: var(--text-sm);
    cursor: pointer; text-align: left;
  }
  .search-trigger:hover { border-color: var(--color-ring); }
  .search-trigger:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  .search-label { flex: 1; }
  .search-kbd { font-family: var(--font-ui); font-size: var(--text-xs); padding: 0.1rem 0.35rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
```

In the `@media (max-width: 640px)` block, change `nav, .search, .right { display: none; }` to `nav, .search-trigger, .right { display: none; }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/components/topbar.test.ts`
Expected: PASS (all, including the new test).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/TopBar.svelte apps/web/src/lib/components/topbar.test.ts
git commit -m "feat(web): replace header search input with palette trigger"
```

---

### Task 11: Bottom-nav search tab → opens the palette

**Files:**
- Modify: `apps/web/src/lib/components/BottomNav.svelte`
- Test: `apps/web/src/lib/components/bottomnav.test.ts`

**Interfaces:**
- Consumes: `searchPalette` store (Task 5).
- The "search" tab becomes a `<button>` that opens the palette; "library" and "profile" stay `<a>` links. No more `/library?focus=search`.

- [ ] **Step 1: Update the test**

Replace the search-related assertion in `apps/web/src/lib/components/bottomnav.test.ts`. Change the first test's search line and add a click test:

```ts
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import BottomNav from "./BottomNav.svelte";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";
```

In "renders the three primary tabs", replace the search line with:

```ts
    expect(getByRole("button", { name: /search/i })).toBeInTheDocument();
```

Add:

```ts
it("opens the search palette when the search tab is tapped", async () => {
  const spy = vi.spyOn(searchPalette, "open");
  const { getByRole } = render(BottomNav, { pathname: "/library" });
  await fireEvent.click(getByRole("button", { name: /search/i }));
  expect(spy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/bottomnav.test.ts`
Expected: FAIL — search is still an `<a>` link, not a button.

- [ ] **Step 3: Update BottomNav**

In `apps/web/src/lib/components/BottomNav.svelte`:

Add import:

```ts
  import { searchPalette } from "$lib/stores/search-palette.svelte.js";
```

Change `TABS` so the search entry is no longer a link (drop `href`, add an `action`), and library/profile keep hrefs:

```ts
  const TABS = [
    { kind: "link", href: "/library", label: "library", icon: Library, match: (p: string) => p === "/library" || p.startsWith("/read") },
    { kind: "action", label: "search", icon: Search, action: () => searchPalette.open() },
    { kind: "link", href: "/profile", label: "profile", icon: User, match: (p: string) => p === "/profile" },
  ] as const;
```

Replace the `{#each}` render block so links render `<a>` and actions render `<button>`:

```svelte
<nav class="bottom-nav" data-visible={visible} aria-label="primary">
  {#each TABS as tab (tab.label)}
    {@const Icon = tab.icon}
    {#if tab.kind === "link"}
      <a href={tab.href} aria-current={tab.match(pathname) ? "page" : undefined}>
        <Icon class="icon-sm" aria-hidden="true" />
        <span>{tab.label}</span>
      </a>
    {:else}
      <button type="button" class="tab-btn" onclick={tab.action}>
        <Icon class="icon-sm" aria-hidden="true" />
        <span>{tab.label}</span>
      </button>
    {/if}
  {/each}
</nav>
```

Add button styling that matches the link tabs — append to the `.bottom-nav a` rule selector list so both share layout:

```css
  .bottom-nav a, .bottom-nav .tab-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px; min-height: 56px; padding: 0.4rem 0;
    font-family: var(--font-ui); font-size: 0.7rem;
    color: var(--color-text-muted); text-decoration: none;
    background: none; border: none; cursor: pointer;
  }
```

(Remove the old standalone `.bottom-nav a { … }` rule it replaces.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/components/bottomnav.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/BottomNav.svelte apps/web/src/lib/components/bottomnav.test.ts
git commit -m "feat(web): bottom-nav search tab opens the palette"
```

---

### Task 12: Remove the library inline search input

**Files:**
- Modify: `apps/web/src/lib/components/LibraryToolbar.svelte`
- Modify: `apps/web/src/routes/library/+page.svelte`
- Modify: `apps/web/src/routes/library/+page.server.ts`
- Test: `apps/web/src/lib/components/library-toolbar.test.ts`

**Interfaces:**
- `LibraryToolbar` drops props `focusSearch`, `onSearch`, and its `query`/`searchEl` state. Remaining props: `params`, `total`, `onSort`, `onOpenFilters`.
- The library page stops passing `focusSearch`/`onSearch`; the server load stops returning `focusSearch`.

- [ ] **Step 1: Update the toolbar test**

In `apps/web/src/lib/components/library-toolbar.test.ts`, remove any test that types in / asserts on the search input and its `onSearch`/`focusSearch` behavior. Add:

```ts
it("no longer renders a text search input (search lives in the palette)", () => {
  render(LibraryToolbar, {
    params: baseParams,      // reuse the file's existing params factory/fixture
    total: 3,
    onSort: () => {},
    onOpenFilters: () => {},
  });
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
});
```

(If the file lacks a `baseParams` fixture, build one inline from `LibraryParams.parse({})` imported from `@readmepls/types`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/library-toolbar.test.ts`
Expected: FAIL — the search input still renders / removed props break existing calls.

- [ ] **Step 3: Edit LibraryToolbar**

In `apps/web/src/lib/components/LibraryToolbar.svelte`:

Change the script props/state block (lines 1–15) to:

```svelte
<script lang="ts">
  import type { LibraryParams, Sort } from "@readmepls/types";
  import { SlidersHorizontal } from "@lucide/svelte";

  let { params, total, onSort, onOpenFilters }: {
    params: LibraryParams; total: number;
    onSort: (s: Sort) => void; onOpenFilters: () => void;
  } = $props();
```

(Removes `untrack` import, `focusSearch`, `onSearch`, `query`, the two `$effect`s, and `searchEl`.)

Delete the `<input class="search" …>` element (lines 30–38). Delete the `.search { … }` CSS rule and the `.search { flex-basis: 100%; order: 1; … }` line inside the `@media (max-width: 640px)` block.

- [ ] **Step 4: Edit the library page**

In `apps/web/src/routes/library/+page.svelte`, change the `<LibraryToolbar …>` usage (lines 107–114) to drop `focusSearch` and `onSearch`:

```svelte
<LibraryToolbar
  params={data.params}
  total={data.page.totalItems}
  onSort={(s: Sort) => patch({ sort: s })}
  onOpenFilters={() => (drawerOpen = true)}
/>
```

- [ ] **Step 5: Edit the server load**

In `apps/web/src/routes/library/+page.server.ts`, change the return (line 20) to drop `focusSearch`:

```ts
  return { params, page, facets };
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm exec vitest run apps/web/src/lib/components/library-toolbar.test.ts apps/web/src/routes/library/page.test.ts && pnpm typecheck`
Expected: PASS, no type errors. (If `page.test.ts` asserted `focusSearch`, update it to match the new return.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/components/LibraryToolbar.svelte apps/web/src/routes/library/+page.svelte apps/web/src/routes/library/+page.server.ts apps/web/src/lib/components/library-toolbar.test.ts apps/web/src/routes/library/page.test.ts
git commit -m "refactor(web): remove library inline search input"
```

---

### Task 13: Make the active query chip editable via the palette

**Files:**
- Modify: `apps/web/src/lib/components/ActiveFilters.svelte`
- Modify: `apps/web/src/routes/library/+page.svelte`
- Test: `apps/web/src/lib/components/active-filters.test.ts`

**Interfaces:**
- `ActiveFilters` gains an optional prop `onEditQuery?: () => void`. When set and a `q` is active, the `q` chip renders a clickable label (calls `onEditQuery`) plus a separate `✕` button (removes `q` via the existing `onRemove({ q: "" })`). Other chips are unchanged.
- The library page passes `onEditQuery={() => searchPalette.open(data.params.q)}`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/components/active-filters.test.ts`:

```ts
it("q chip: label edits via onEditQuery, ✕ removes the query", async () => {
  const onRemove = vi.fn();
  const onEditQuery = vi.fn();
  render(ActiveFilters, {
    params: { ...baseParams, q: "rust" },   // reuse the file's params fixture
    labels: { tag: {}, collection: {}, source: {} },
    onRemove,
    onClear: () => {},
    onEditQuery,
  });
  await fireEvent.click(screen.getByRole("button", { name: /edit search “rust”/i }));
  expect(onEditQuery).toHaveBeenCalled();
  await fireEvent.click(screen.getByRole("button", { name: /remove search “rust”/i }));
  expect(onRemove).toHaveBeenCalledWith({ q: "" });
});
```

(Use the file's existing params fixture; if none, `LibraryParams.parse({ q: "rust" })`. Ensure `fireEvent`/`vi` are imported.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/active-filters.test.ts`
Expected: FAIL — no edit/remove-search buttons; the q chip is a single remove button.

- [ ] **Step 3: Edit ActiveFilters**

In `apps/web/src/lib/components/ActiveFilters.svelte`:

Add `onEditQuery` to props:

```svelte
  let { params, labels, onRemove, onClear, onEditQuery }: {
    params: LibraryParams; labels: LabelLookup;
    onRemove: (patch: Patch) => void; onClear: () => void; onEditQuery?: () => void;
  } = $props();
```

Remove the `q` entry from the generic `chips` derived list — delete this line from the `$derived.by`:

```ts
    if (params.q) out.push({ key: "q", label: `"${params.q}"`, patch: { q: "" } });
```

Render a dedicated q chip before the `{#each chips …}` loop, inside the `{#if chips.length || params.q}` container. Update the wrapper condition and add the chip:

```svelte
{#if chips.length || params.q}
  <div class="active" aria-label="active filters">
    {#if params.q}
      <span class="q-chip">
        <button
          type="button"
          class="q-edit"
          aria-label={`edit search “${params.q}”`}
          onclick={() => onEditQuery?.()}
        >
          <Chip selected>{`“${params.q}”`}</Chip>
        </button>
        <button
          type="button"
          class="q-remove"
          aria-label={`remove search “${params.q}”`}
          onclick={() => onRemove({ q: "" })}
        >✕</button>
      </span>
    {/if}
    {#each chips as c (c.key)}
      <button data-testid="active-chip" class="chip-btn" aria-label={`remove ${c.label}`} onclick={() => onRemove(c.patch)}>
        <Chip selected>{c.label} ✕</Chip>
      </button>
    {/each}
    <button class="clear" onclick={onClear}>clear all</button>
  </div>
{/if}
```

Add CSS:

```css
  .q-chip { display: inline-flex; align-items: center; gap: 0.15rem; }
  .q-edit, .q-remove { background: none; border: none; padding: 0; cursor: pointer; font: inherit; color: var(--color-accent); }
  .q-remove { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
```

- [ ] **Step 4: Wire the library page**

In `apps/web/src/routes/library/+page.svelte`, add the import:

```ts
  import { searchPalette } from "$lib/stores/search-palette.svelte.js";
```

Change the `<ActiveFilters …>` usage (line 115) to:

```svelte
<ActiveFilters params={data.params} {labels} onRemove={patch} onClear={clearAll} onEditQuery={() => searchPalette.open(data.params.q)} />
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm exec vitest run apps/web/src/lib/components/active-filters.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/ActiveFilters.svelte apps/web/src/routes/library/+page.svelte apps/web/src/lib/components/active-filters.test.ts
git commit -m "feat(web): make the active query chip editable via the palette"
```

---

### Task 14: Delete the /search redirect route

**Files:**
- Delete: `apps/web/src/routes/search/+page.server.ts` (and the now-empty `apps/web/src/routes/search/` directory)
- Test: `apps/web/src/routes/library/page.test.ts` (regression assertion)

**Interfaces:**
- Nothing consumes `/search` after Task 10 (header) and Task 11 (bottom nav) stopped linking to it. `/library?q=` deep-links remain the canonical search URL and are unchanged.

- [ ] **Step 1: Add a regression test for the canonical search URL**

Confirm `apps/web/src/routes/library/page.test.ts` exercises the load with a `q` param and hybrid resolver. If it does not already, add a test that the load, given `?q=rust`, still returns a `page`/`params` with `params.q === "rust"` (this proves the `/library?q=` path — the surviving search surface — works after the redirect route is gone). Model it on the existing tests in that file (same `locals.pb` mock pattern).

- [ ] **Step 2: Run test to verify current behavior**

Run: `pnpm exec vitest run apps/web/src/routes/library/page.test.ts`
Expected: PASS (baseline before deletion).

- [ ] **Step 3: Delete the route**

```bash
git rm apps/web/src/routes/search/+page.server.ts
```

- [ ] **Step 4: Grep for dangling references**

Run:

```bash
grep -rn "/search?q=\|focus=search\|routes/search" apps/web/src
```

Expected: no matches (the header/bottom-nav/library changes removed them all). If any remain, remove them.

- [ ] **Step 5: Run the full web suite + typecheck**

Run: `pnpm exec vitest run apps/web && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src/routes/search apps/web/src/routes/library/page.test.ts
git commit -m "refactor(web): delete the /search redirect route"
```

---

### Task 15: Full verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Run the entire workspace test suite**

Run: `pnpm test`
Expected: all packages green.

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Manual smoke (dev server)**

Run: `pnpm --filter @readmepls/web dev`, then verify:
- `⌘K` (and `/` when not focused in a field) opens the palette on any page.
- Header fake bar opens it (desktop ≥641px); mobile bottom "search" tab opens it (≤640px).
- Empty state shows recent searches + recently-read.
- Typing shows keyword results fast, then the list updates when hybrid resolves.
- Picking an article → `/read/<id>`; picking a tag → `/library?tag=<id>`; "see all" → `/library?q=<query>`.
- Library page has no text input; an active `?q=` shows an editable/removable chip; the `✕` clears it, clicking the label reopens the palette pre-filled.
- Old `/search?q=` no longer exists; `/library?q=` still returns hybrid results.

- [ ] **Step 4: Delete the shipped spec + plan**

Per the repo working agreement (delete a plan and its paired spec once fully implemented and merged):

```bash
git rm docs/superpowers/specs/2026-07-08-unified-search-palette-design.md docs/superpowers/plans/2026-07-08-unified-search-palette.md
git commit -m "chore(docs): remove shipped unified-search-palette spec and plan"
```

(Do this only after the work is merged, per the agreement — otherwise leave both in place.)

---

## Self-Review Notes

- **Spec coverage:** entry points (Tasks 9–11, 14), palette component + sections + empty state (Task 8), two-phase live search (Tasks 6/7/8), new endpoint + core shaper + types (Tasks 1/2/6/6b/7), library bar removal + query chip (Tasks 12/13), testing (each task), `/search` + `focus=search` removal (Tasks 12/14). All covered.
- **Type consistency:** `LiveSearchResult`/`LiveArticle`/`LiveSearchMode` names identical across Tasks 1→2→6→6b→7→8; `searchPalette.open/close/isOpen/initialQuery` identical across Tasks 5→8→9→10→11→13; `liveSearch(pb,q,mode,userId)` identical Tasks 6→6b; `shapeLiveSearch(...)` identical Tasks 2→6.
- **Open verification points flagged inline (not placeholders):** `bits-ui` `Dialog` `bind:open` shorthand vs `onOpenChange` (Task 8 note), and the exact ARIA roles `bits-ui` `Command` emits for input/items (Task 8 Step 4) — both to be confirmed against the installed `bits-ui@2.18` during implementation, with the fallback stated.
