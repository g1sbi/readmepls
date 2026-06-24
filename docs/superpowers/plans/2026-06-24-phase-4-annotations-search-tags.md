# Phase 4 — Annotations, Search, Tags & Collections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the reader's annotation + organization layer — highlights/notes, full-text search, and manual tags + flat collections UI — over the existing reader shell.

**Architecture:** Browser talks to PocketBase via the JS SDK for all CRUD (highlights, collections, collection_items, article_tags), relying on per-user API rules for isolation. Highlight anchoring is a pure browser-side unit in `@readmepls/core` wrapping `apache-annotator`. Full-text search is a standalone FTS5 table kept in sync by triggers, queried through a PocketBase custom route (`pb_hooks`) scoped to the caller's articles.

**Tech Stack:** SvelteKit 5 + Svelte 5 (web), PocketBase 0.21 (Go, SQLite, JSVM hooks + migrations), TypeScript strict, Zod, Vitest + @testing-library/svelte, `apache-annotator` for DOM text anchoring.

**Spec:** `docs/superpowers/specs/2026-06-24-phase-4-annotations-search-tags-design.md`

## Global Constraints

- **TDD always** — failing test first, then minimal implementation. No production code without a test that drove it.
- **TypeScript strict, no bare `any`** without a written reason.
- **Shared types live in `@readmepls/types`** (Zod schemas + inferred types), consumed by `web`. Validate at every boundary (PB reads, route I/O).
- **Workspace packages ship TS source** (`main: src/index.ts`, no build step). Do not repoint `core`/`types` `main` at `dist`.
- **Never hardcode a color or font in a component** — reference a token in `apps/web/src/lib/styles/tokens.css`.
- **Reusable UI primitives in `$lib/components/ui/`**; feature components compose them.
- **PB API rules are the security boundary** — every per-user collection scoped `user = @request.auth.id` (or relation-scoped `collection.user = @request.auth.id`). Never rely on the client.
- **Migrations tracked in git** under `pocketbase/pb_migrations/`. New migration timestamp: `1719100000`.
- **Conventional Commits**, one logical change per commit.
- **Model states as unions, not booleans.**

---

## File Structure

**Create:**
- `packages/types/src/highlight.ts` — `HighlightColor`, `HighlightSelector`, `Highlight` Zod schemas/types.
- `packages/types/src/collection.ts` — `Collection`, `CollectionItem` schemas/types.
- `packages/types/src/search.ts` — `SearchResult` schema/type.
- `packages/core/src/slug.ts` — pure `slugify`.
- `packages/core/src/slug.test.ts`
- `packages/core/src/highlight/anchor.ts` — `describe`/`anchor` wrapping `apache-annotator`.
- `packages/core/src/highlight/anchor.test.ts` (jsdom env)
- `packages/core/src/search/query.ts` — `toFtsQuery` sanitizer.
- `packages/core/src/search/query.test.ts`
- `packages/core/src/pb/migration-phase4.test.ts` — ephemeral-PB integration tests (collections, FTS, isolation).
- `pocketbase/pb_migrations/1719100000_phase4.js` — new collections + FTS table/triggers.
- `pocketbase/pb_hooks/search.pb.js` — `GET /api/search` custom route.
- `apps/web/src/lib/highlight/render.ts` — wrap a `Range` in a colored `<mark>` + unwrap helper.
- `apps/web/src/lib/components/HighlightPopover.svelte`
- `apps/web/src/lib/components/HighlightsSidebar.svelte`
- `apps/web/src/lib/components/TagEditor.svelte`
- `apps/web/src/lib/components/AddToCollection.svelte`
- `apps/web/src/lib/components/HighlightPopover.test.ts`
- `apps/web/src/lib/components/HighlightsSidebar.test.ts`
- `apps/web/src/lib/components/TagEditor.test.ts`
- `apps/web/src/routes/search/+page.svelte`
- `apps/web/src/routes/collections/[slug]/+page.svelte`

**Modify:**
- `packages/types/src/index.ts` — export new modules.
- `packages/core/src/index.ts` — export `slug`, `highlight/anchor`, `search/query`.
- `packages/core/package.json` — add `@apache-annotator/dom`.
- `apps/web/src/lib/styles/tokens.css` — highlight-color tokens.
- `apps/web/src/routes/read/[id]/+page.svelte` — mount highlight layer, sidebar, tag editor, add-to-collection.
- `apps/web/src/lib/components/TopBar.svelte` — search input.
- `apps/web/src/routes/library/+page.svelte` — tag filter + collections sidebar list.

---

## Task 1: Types — highlight, collection, search

**Files:**
- Create: `packages/types/src/highlight.ts`, `packages/types/src/collection.ts`, `packages/types/src/search.ts`
- Modify: `packages/types/src/index.ts`
- Test: co-located `.test.ts` files

**Interfaces:**
- Produces:
  - `HighlightColor = "terracotta" | "amber" | "sage"`
  - `HighlightSelector { text, prefix, suffix, startOffset, endOffset }`
  - `Highlight { id, user, article, text, prefix, suffix, startOffset, endOffset, color, note, created }`
  - `Collection { id, user, name, slug, parent, order }`
  - `CollectionItem { id, collection, article, order }`
  - `SearchResult { articleId, title, snippet, rank }`
  - All exported as Zod schemas (PascalCase) + inferred types (same name).

- [ ] **Step 1: Write the failing test** — `packages/types/src/highlight.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { HighlightSelector, Highlight, HighlightColor } from "./highlight.js";

describe("highlight types", () => {
  it("parses a selector", () => {
    const sel = HighlightSelector.parse({
      text: "the quick brown fox",
      prefix: "saw ", suffix: " jump",
      startOffset: 10, endOffset: 29,
    });
    expect(sel.text).toBe("the quick brown fox");
  });

  it("rejects an unknown color", () => {
    expect(() => HighlightColor.parse("blue")).toThrow();
  });

  it("parses a full highlight record", () => {
    const h = Highlight.parse({
      id: "abc", user: "u1", article: "a1",
      text: "x", prefix: "", suffix: "",
      startOffset: 0, endOffset: 1,
      color: "amber", note: "", created: "2026-06-24T00:00:00Z",
    });
    expect(h.color).toBe("amber");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @readmepls/types test highlight`
Expected: FAIL — cannot find module `./highlight.js`.

- [ ] **Step 3: Implement** — `packages/types/src/highlight.ts`

```ts
import { z } from "zod";

export const HighlightColor = z.enum(["terracotta", "amber", "sage"]);
export type HighlightColor = z.infer<typeof HighlightColor>;

export const HighlightSelector = z.object({
  text: z.string().min(1),
  prefix: z.string(),
  suffix: z.string(),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
});
export type HighlightSelector = z.infer<typeof HighlightSelector>;

export const Highlight = HighlightSelector.extend({
  id: z.string(),
  user: z.string(),
  article: z.string(),
  color: HighlightColor,
  note: z.string(),
  created: z.string(),
});
export type Highlight = z.infer<typeof Highlight>;
```

- [ ] **Step 4: Implement** — `packages/types/src/collection.ts`

```ts
import { z } from "zod";

export const Collection = z.object({
  id: z.string(),
  user: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  parent: z.string().default(""),
  order: z.number().int().default(0),
});
export type Collection = z.infer<typeof Collection>;

export const CollectionItem = z.object({
  id: z.string(),
  collection: z.string(),
  article: z.string(),
  order: z.number().int().default(0),
});
export type CollectionItem = z.infer<typeof CollectionItem>;
```

- [ ] **Step 5: Implement** — `packages/types/src/search.ts`

```ts
import { z } from "zod";

export const SearchResult = z.object({
  articleId: z.string(),
  title: z.string(),
  snippet: z.string(),
  rank: z.number(),
});
export type SearchResult = z.infer<typeof SearchResult>;
```

- [ ] **Step 6: Export from barrel** — add to `packages/types/src/index.ts`

```ts
export * from "./highlight.js";
export * from "./collection.js";
export * from "./search.js";
```

- [ ] **Step 7: Run tests, verify pass**

Run: `pnpm --filter @readmepls/types test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/types/src
git commit -m "feat(types): add highlight, collection, and search schemas"
```

---

## Task 2: core/slug

**Files:**
- Create: `packages/core/src/slug.ts`, `packages/core/src/slug.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `slugify(name: string): string` — lowercase, spaces/punctuation → single hyphen, trimmed, collapses repeats.

- [ ] **Step 1: Write the failing test** — `packages/core/src/slug.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { slugify } from "./slug.js";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Read Later")).toBe("read-later");
  });
  it("collapses punctuation and repeats", () => {
    expect(slugify("  AI / ML!!  notes ")).toBe("ai-ml-notes");
  });
  it("keeps digits", () => {
    expect(slugify("Top 10")).toBe("top-10");
  });
  it("returns empty for punctuation-only input", () => {
    expect(slugify("!!!")).toBe("");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @readmepls/core test slug`
Expected: FAIL — cannot find module `./slug.js`.

- [ ] **Step 3: Implement** — `packages/core/src/slug.ts`

```ts
/** Lowercase, hyphenated slug. Unicode letters/digits kept; everything else
 *  becomes a single hyphen; leading/trailing hyphens trimmed. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Export** — add to `packages/core/src/index.ts`

```ts
export * from "./slug.js";
```

- [ ] **Step 5: Run tests, verify pass**

Run: `pnpm --filter @readmepls/core test slug`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/slug.ts packages/core/src/slug.test.ts packages/core/src/index.ts
git commit -m "feat(core): add slugify helper"
```

---

## Task 3: Phase 4 migration + migration tests

**Files:**
- Create: `pocketbase/pb_migrations/1719100000_phase4.js`, `packages/core/src/pb/migration-phase4.test.ts`

**Interfaces:**
- Produces (PB collections): `highlights`, `collections`, `collection_items`; SQLite virtual table `content_fts(content_id UNINDEXED, title, body)` + insert/update/delete triggers on `content`.

- [ ] **Step 1: Write the failing test** — `packages/core/src/pb/migration-phase4.test.ts`

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

async function makeArticleWithContent(pb: PbHandle["pb"], user: string, title: string, body: string) {
  const content = await pb.collection("content").create({
    canonical_url: `https://example.com/${title}`,
    content_hash: title, source_type: "article",
    title, content_text: body, extract_status: "ok",
  });
  const article = await pb.collection("articles").create({
    user, content: content.id, url: `https://example.com/${title}`,
    status: "unread", progress: 0, is_private: false,
  });
  return { contentId: content.id, articleId: article.id };
}

describe("phase-4 migration", () => {
  it("creates a highlight scoped to the user", async () => {
    const { articleId } = await makeArticleWithContent(h.pb, userId, "h1", "hello world body");
    const hl = await h.pb.collection("highlights").create({
      user: userId, article: articleId,
      text: "hello", prefix: "", suffix: " world",
      start_offset: 0, end_offset: 5, color: "amber", note: "",
    });
    expect(hl.color).toBe("amber");
  });

  it("creates a collection and an item", async () => {
    const { articleId } = await makeArticleWithContent(h.pb, userId, "c1", "collected body");
    const col = await h.pb.collection("collections").create({
      user: userId, name: "Read Later", slug: "read-later", parent: "", order: 0,
    });
    const item = await h.pb.collection("collection_items").create({
      collection: col.id, article: articleId, order: 0,
    });
    expect(item.collection).toBe(col.id);
  });

});
```

> Note: PocketBase does not expose arbitrary SQL over REST, so the FTS *content* (that `content_fts` actually matches) is asserted end-to-end in Task 8 via the search route. This migration test asserts the new collections + rules exist and accept writes. Cross-user isolation is asserted with per-user authed clients in Tasks 8, 10, and 12 (the superuser client used here bypasses rules by design).

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @readmepls/core test migration-phase4`
Expected: FAIL — `collection "highlights" not found` (migration absent).

- [ ] **Step 3: Implement the migration** — `pocketbase/pb_migrations/1719100000_phase4.js`

```js
/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const articles = app.findCollectionByNameOrId("articles");

    // --- highlights (per-user annotations) ---
    const highlights = new Collection({
      type: "base",
      name: "highlights",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
        { name: "article", type: "relation", required: true, collectionId: articles.id, maxSelect: 1 },
        { name: "text", type: "text", required: true },
        { name: "prefix", type: "text" },
        { name: "suffix", type: "text" },
        { name: "start_offset", type: "number" },
        { name: "end_offset", type: "number" },
        { name: "color", type: "text", required: true },
        { name: "note", type: "text" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_highlights_article ON highlights (article)"],
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
    });
    app.save(highlights);

    // --- collections (flat in v1; parent/order kept for forward-compat) ---
    const collections = new Collection({
      type: "base",
      name: "collections",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
        { name: "name", type: "text", required: true },
        { name: "slug", type: "text", required: true },
        { name: "parent", type: "text" },
        { name: "order", type: "number" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX idx_collections_user_slug ON collections (user, slug)"],
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
    });
    app.save(collections);

    // --- collection_items (M:N; relation-scoped rule like article_tags) ---
    const collectionItems = new Collection({
      type: "base",
      name: "collection_items",
      fields: [
        { name: "collection", type: "relation", required: true, collectionId: collections.id, maxSelect: 1, cascadeDelete: true },
        { name: "article", type: "relation", required: true, collectionId: articles.id, maxSelect: 1 },
        { name: "order", type: "number" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: ["CREATE INDEX idx_collection_items_collection ON collection_items (collection)"],
      listRule: "collection.user = @request.auth.id",
      viewRule: "collection.user = @request.auth.id",
      createRule: "collection.user = @request.auth.id",
      updateRule: "collection.user = @request.auth.id",
      deleteRule: "collection.user = @request.auth.id",
    });
    app.save(collectionItems);

    // --- FTS5 full-text index over content (standalone; PB ids are text) ---
    app.db().newQuery(
      "CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(content_id UNINDEXED, title, body)"
    ).execute();
    app.db().newQuery(
      "CREATE TRIGGER IF NOT EXISTS content_fts_ai AFTER INSERT ON content BEGIN " +
      "INSERT INTO content_fts(content_id, title, body) VALUES (new.id, new.title, new.content_text); END"
    ).execute();
    app.db().newQuery(
      "CREATE TRIGGER IF NOT EXISTS content_fts_ad AFTER DELETE ON content BEGIN " +
      "DELETE FROM content_fts WHERE content_id = old.id; END"
    ).execute();
    app.db().newQuery(
      "CREATE TRIGGER IF NOT EXISTS content_fts_au AFTER UPDATE ON content BEGIN " +
      "DELETE FROM content_fts WHERE content_id = old.id; " +
      "INSERT INTO content_fts(content_id, title, body) VALUES (new.id, new.title, new.content_text); END"
    ).execute();
    // backfill existing rows
    app.db().newQuery(
      "INSERT INTO content_fts(content_id, title, body) SELECT id, title, content_text FROM content"
    ).execute();
  },
  (app) => {
    app.db().newQuery("DROP TRIGGER IF EXISTS content_fts_ai").execute();
    app.db().newQuery("DROP TRIGGER IF EXISTS content_fts_ad").execute();
    app.db().newQuery("DROP TRIGGER IF EXISTS content_fts_au").execute();
    app.db().newQuery("DROP TABLE IF EXISTS content_fts").execute();
    for (const name of ["collection_items", "collections", "highlights"]) {
      const c = app.findCollectionByNameOrId(name);
      if (c) app.delete(c);
    }
  }
);
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm --filter @readmepls/core test migration-phase4`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pocketbase/pb_migrations/1719100000_phase4.js packages/core/src/pb/migration-phase4.test.ts
git commit -m "feat(pb): add highlights, collections, collection_items + content_fts index"
```

---

## Task 4: core/highlight/anchor (apache-annotator wrapper)

**Files:**
- Create: `packages/core/src/highlight/anchor.ts`, `packages/core/src/highlight/anchor.test.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/package.json`

**Interfaces:**
- Consumes: `HighlightSelector` from `@readmepls/types`.
- Produces:
  - `describe(scope: Range, target: Range): Promise<HighlightSelector>`
  - `anchor(scope: Range, sel: HighlightSelector): Promise<Range | null>`
  - `rangeOver(root: Node): Range` — convenience: a Range selecting all of `root`'s contents.

- [ ] **Step 1: Add the dependency** — `packages/core/package.json`, add to `dependencies`:

```json
    "@apache-annotator/dom": "^0.2.0",
```

Run: `pnpm install`
Expected: lockfile updated, package installed.

- [ ] **Step 2: Write the failing test** — `packages/core/src/highlight/anchor.test.ts`

```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { describe as describeRange, anchor, rangeOver } from "./anchor.js";

function selectText(root: HTMLElement, needle: string): Range {
  const text = root.textContent ?? "";
  const start = text.indexOf(needle);
  // walk text nodes to map the flat offset to a DOM Range
  const r = document.createRange();
  let acc = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent!.length;
    if (acc + len > start && r.startContainer === document) {
      r.setStart(node, start - acc);
    }
    if (acc + len >= start + needle.length) {
      r.setEnd(node, start + needle.length - acc);
      break;
    }
    acc += len;
  }
  return r;
}

describe("highlight anchoring", () => {
  it("describes and re-anchors an unchanged DOM", async () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>the quick brown fox jumps over the lazy dog</p>";
    const scope = rangeOver(root);
    const target = selectText(root, "brown fox");

    const sel = await describeRange(scope, target);
    expect(sel.text).toBe("brown fox");

    const back = await anchor(rangeOver(root), sel);
    expect(back).not.toBeNull();
    expect(back!.toString()).toBe("brown fox");
  });

  it("re-anchors after the surrounding markup changes", async () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>the quick brown fox jumps over the lazy dog</p>";
    const sel = await describeRange(rangeOver(root), selectText(root, "lazy dog"));

    // Re-render: wrap a word in <em>, add a leading node. Quote text unchanged.
    const root2 = document.createElement("article");
    root2.innerHTML = "<h2>Title</h2><p>the <em>quick</em> brown fox jumps over the lazy dog</p>";
    const back = await anchor(rangeOver(root2), sel);
    expect(back).not.toBeNull();
    expect(back!.toString()).toBe("lazy dog");
  });

  it("returns null when the quote no longer exists", async () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>the quick brown fox</p>";
    const sel = await describeRange(rangeOver(root), selectText(root, "quick"));

    const root2 = document.createElement("article");
    root2.innerHTML = "<p>entirely different content here</p>";
    expect(await anchor(rangeOver(root2), sel)).toBeNull();
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `pnpm --filter @readmepls/core test anchor`
Expected: FAIL — cannot find module `./anchor.js`.

- [ ] **Step 4: Implement** — `packages/core/src/highlight/anchor.ts`

```ts
import {
  describeTextQuote,
  createTextQuoteSelector,
  describeTextPosition,
} from "@apache-annotator/dom";
import type { HighlightSelector } from "@readmepls/types";

/** A Range selecting all of `root`'s contents — the anchoring scope. */
export function rangeOver(root: Node): Range {
  const r = (root.ownerDocument ?? document).createRange();
  r.selectNodeContents(root);
  return r;
}

/** Build a portable selector (quote + prefix/suffix + char offsets) for `target`. */
export async function describe(scope: Range, target: Range): Promise<HighlightSelector> {
  const quote = await describeTextQuote(target, scope);
  const pos = await describeTextPosition(target, scope);
  return {
    text: quote.exact,
    prefix: quote.prefix ?? "",
    suffix: quote.suffix ?? "",
    startOffset: pos.start,
    endOffset: pos.end,
  };
}

/** Re-locate a selector in `scope`. Returns the first matching Range, or null. */
export async function anchor(scope: Range, sel: HighlightSelector): Promise<Range | null> {
  const match = createTextQuoteSelector({
    type: "TextQuoteSelector",
    exact: sel.text,
    prefix: sel.prefix,
    suffix: sel.suffix,
  });
  for await (const range of match(scope)) {
    return range;
  }
  return null;
}
```

- [ ] **Step 5: Export** — add to `packages/core/src/index.ts`

```ts
export * as anchoring from "./highlight/anchor.js";
export { rangeOver } from "./highlight/anchor.js";
```

> `describe`/`anchor` are namespaced (`anchoring.describe`, `anchoring.anchor`) to avoid clashing with the bare `describe` from test runners. `rangeOver` has no such clash, so it's also re-exported flat — Task 6 imports `{ anchoring, rangeOver }` from `@readmepls/core`.

- [ ] **Step 6: Run tests, verify pass**

Run: `pnpm --filter @readmepls/core test anchor`
Expected: PASS (all three cases).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/highlight packages/core/src/index.ts packages/core/package.json pnpm-lock.yaml
git commit -m "feat(core): add highlight anchoring over apache-annotator"
```

---

## Task 5: Highlight color tokens + render helper + HighlightPopover

**Files:**
- Modify: `apps/web/src/lib/styles/tokens.css`
- Create: `apps/web/src/lib/highlight/render.ts`, `apps/web/src/lib/components/HighlightPopover.svelte`, `apps/web/src/lib/components/HighlightPopover.test.ts`

**Interfaces:**
- Consumes: `HighlightColor` from `@readmepls/types`.
- Produces:
  - `markRange(range: Range, color: HighlightColor, id: string): void` — wraps a Range in `<mark data-hl-id data-hl-color>`.
  - `unmarkAll(root: HTMLElement): void` — removes all `<mark data-hl-id>` wrappers, restoring text.
  - `HighlightPopover.svelte` props: `{ x: number, y: number, onpick: (color: HighlightColor, note: string) => void, oncancel: () => void }`.

- [ ] **Step 1: Add tokens** — append to `apps/web/src/lib/styles/tokens.css` (inside `:root`, near other color tokens):

```css
  /* highlight colors (keys match the highlights.color enum) */
  --hl-terracotta: rgba(194, 74, 56, 0.28);
  --hl-amber: rgba(214, 158, 46, 0.32);
  --hl-sage: rgba(122, 145, 106, 0.30);
```

- [ ] **Step 2: Write the failing test** — `apps/web/src/lib/components/HighlightPopover.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import HighlightPopover from "./HighlightPopover.svelte";

describe("HighlightPopover", () => {
  it("emits the chosen color and note", async () => {
    const onpick = vi.fn();
    render(HighlightPopover, { x: 10, y: 10, onpick, oncancel: vi.fn() });
    await fireEvent.click(screen.getByRole("button", { name: /amber/i }));
    expect(onpick).toHaveBeenCalledWith("amber", "");
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `pnpm --filter @readmepls/web test HighlightPopover`
Expected: FAIL — cannot find `HighlightPopover.svelte`.

- [ ] **Step 4: Implement** — `apps/web/src/lib/components/HighlightPopover.svelte`

```svelte
<script lang="ts">
  import type { HighlightColor } from "@readmepls/types";
  let { x, y, onpick, oncancel }: {
    x: number; y: number;
    onpick: (color: HighlightColor, note: string) => void;
    oncancel: () => void;
  } = $props();

  const colors: HighlightColor[] = ["terracotta", "amber", "sage"];
  let note = $state("");
</script>

<div class="popover" style="left:{x}px; top:{y}px;" role="dialog" aria-label="add highlight">
  <div class="swatches">
    {#each colors as c}
      <button
        class="swatch"
        style="background: var(--hl-{c});"
        aria-label={c}
        onclick={() => onpick(c, note)}
      ></button>
    {/each}
  </div>
  <input class="note" placeholder="note…" bind:value={note} aria-label="note" />
  <button class="cancel" onclick={oncancel} aria-label="cancel">×</button>
</div>

<style>
  .popover {
    position: absolute;
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-2);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: 50;
  }
  .swatches { display: flex; gap: var(--space-1); }
  .swatch {
    width: 1.25rem; height: 1.25rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .note {
    border: none;
    border-bottom: 1px solid var(--border);
    background: transparent;
    font: inherit;
    color: var(--ink);
  }
  .cancel { background: none; border: none; cursor: pointer; color: var(--ink-muted); }
</style>
```

> If any referenced token (`--surface`, `--border`, `--radius-md`, `--shadow-md`, `--space-1/2`, `--ink`, `--ink-muted`) does not exist, check `tokens.css` and use the nearest existing token rather than inventing one. Do not hardcode values.

- [ ] **Step 5: Implement the render helper** — `apps/web/src/lib/highlight/render.ts`

```ts
import type { HighlightColor } from "@readmepls/types";

/** Wrap a Range's contents in a colored <mark>. Safe for single-container ranges
 *  (text-quote anchoring yields a contiguous range within the article body). */
export function markRange(range: Range, color: HighlightColor, id: string): void {
  const mark = document.createElement("mark");
  mark.dataset.hlId = id;
  mark.dataset.hlColor = color;
  mark.style.background = `var(--hl-${color})`;
  mark.style.borderRadius = "2px";
  try {
    range.surroundContents(mark);
  } catch {
    // Range spans multiple block elements — fall back to extract+wrap.
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
  }
}

/** Remove all highlight marks under `root`, restoring the original text nodes. */
export function unmarkAll(root: HTMLElement): void {
  for (const mark of Array.from(root.querySelectorAll("mark[data-hl-id]"))) {
    const parent = mark.parentNode!;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
}
```

- [ ] **Step 6: Run tests, verify pass**

Run: `pnpm --filter @readmepls/web test HighlightPopover`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/styles/tokens.css apps/web/src/lib/highlight apps/web/src/lib/components/HighlightPopover.svelte apps/web/src/lib/components/HighlightPopover.test.ts
git commit -m "feat(web): highlight color tokens, popover, and mark render helpers"
```

---

## Task 6: HighlightsSidebar + reader integration

**Files:**
- Create: `apps/web/src/lib/components/HighlightsSidebar.svelte`, `apps/web/src/lib/components/HighlightsSidebar.test.ts`
- Modify: `apps/web/src/routes/read/[id]/+page.svelte`

**Interfaces:**
- Consumes: `Highlight` from `@readmepls/types`; `markRange`/`unmarkAll` (Task 5); `anchoring.anchor` + `rangeOver` (Task 4); `browserPb()` (`$lib/pb`).
- Produces: `HighlightsSidebar.svelte` props `{ highlights: Highlight[], onjump: (id: string) => void, ondelete: (id: string) => void, orphans: string[] }` — lists highlights with notes; orphan ids render as un-locatable.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/components/HighlightsSidebar.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import HighlightsSidebar from "./HighlightsSidebar.svelte";
import type { Highlight } from "@readmepls/types";

const hls: Highlight[] = [
  { id: "h1", user: "u", article: "a", text: "anchored quote", prefix: "", suffix: "",
    startOffset: 0, endOffset: 14, color: "amber", note: "my note", created: "2026-06-24T00:00:00Z" },
  { id: "h2", user: "u", article: "a", text: "lost quote", prefix: "", suffix: "",
    startOffset: 0, endOffset: 10, color: "sage", note: "", created: "2026-06-24T00:00:00Z" },
];

describe("HighlightsSidebar", () => {
  it("lists highlights and their notes", () => {
    render(HighlightsSidebar, { highlights: hls, orphans: [], onjump: vi.fn(), ondelete: vi.fn() });
    expect(screen.getByText("anchored quote")).toBeTruthy();
    expect(screen.getByText("my note")).toBeTruthy();
  });

  it("flags orphaned highlights as un-locatable", () => {
    render(HighlightsSidebar, { highlights: hls, orphans: ["h2"], onjump: vi.fn(), ondelete: vi.fn() });
    expect(screen.getByText(/can.t locate/i)).toBeTruthy();
  });

  it("emits delete", async () => {
    const ondelete = vi.fn();
    render(HighlightsSidebar, { highlights: hls, orphans: [], onjump: vi.fn(), ondelete });
    await fireEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    expect(ondelete).toHaveBeenCalledWith("h1");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @readmepls/web test HighlightsSidebar`
Expected: FAIL — cannot find component.

- [ ] **Step 3: Implement** — `apps/web/src/lib/components/HighlightsSidebar.svelte`

```svelte
<script lang="ts">
  import type { Highlight } from "@readmepls/types";
  let { highlights, orphans, onjump, ondelete }: {
    highlights: Highlight[];
    orphans: string[];
    onjump: (id: string) => void;
    ondelete: (id: string) => void;
  } = $props();
</script>

<aside class="hl-sidebar" aria-label="highlights">
  <h2>highlights</h2>
  {#if highlights.length === 0}
    <p class="empty">select text to highlight it</p>
  {/if}
  <ul>
    {#each highlights as h (h.id)}
      <li class:orphan={orphans.includes(h.id)}>
        <button class="quote" style="border-color: var(--hl-{h.color});" onclick={() => onjump(h.id)}>
          {h.text}
        </button>
        {#if h.note}<p class="note">{h.note}</p>{/if}
        {#if orphans.includes(h.id)}<p class="warn">can't locate in current text</p>{/if}
        <button class="del" aria-label="delete" onclick={() => ondelete(h.id)}>delete</button>
      </li>
    {/each}
  </ul>
</aside>

<style>
  .hl-sidebar { display: flex; flex-direction: column; gap: var(--space-3); }
  h2 { font-family: var(--font-display); font-size: var(--text-sm); color: var(--ink-muted); }
  .empty { color: var(--ink-muted); font-size: var(--text-sm); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
  .quote {
    text-align: left; background: none; border: none; border-left: 3px solid var(--border);
    padding-left: var(--space-2); cursor: pointer; color: var(--ink); font: inherit;
  }
  .note { color: var(--ink-muted); font-size: var(--text-sm); margin: var(--space-1) 0 0 var(--space-2); }
  .warn { color: var(--accent); font-size: var(--text-xs); margin-left: var(--space-2); }
  .del { background: none; border: none; color: var(--ink-muted); cursor: pointer; font-size: var(--text-xs); }
  .orphan .quote { opacity: 0.6; }
</style>
```

> Use the nearest existing token if any named token is absent. Do not invent color values.

- [ ] **Step 4: Run component tests, verify pass**

Run: `pnpm --filter @readmepls/web test HighlightsSidebar`
Expected: PASS.

- [ ] **Step 5: Wire into the reader** — modify `apps/web/src/routes/read/[id]/+page.svelte`. Read the file first to match its existing structure (article container ref, prefs). Add this script logic (adapt variable names to the file's conventions; the article body container is referenced as `bodyEl`):

```ts
  import { anchoring } from "@readmepls/core";
  import { rangeOver } from "@readmepls/core";
  import { markRange, unmarkAll } from "$lib/highlight/render";
  import HighlightPopover from "$lib/components/HighlightPopover.svelte";
  import HighlightsSidebar from "$lib/components/HighlightsSidebar.svelte";
  import { Highlight, type HighlightColor } from "@readmepls/types";
  import { browserPb } from "$lib/pb";

  let bodyEl: HTMLElement; // bind:this on the rendered article body
  let highlights = $state<Highlight[]>([]);
  let orphans = $state<string[]>([]);
  let popover = $state<{ x: number; y: number; range: Range } | null>(null);

  async function loadHighlights(articleId: string) {
    const raw = await browserPb().collection("highlights").getFullList({
      filter: `article = "${articleId}"`, sort: "created",
    });
    highlights = raw.map((r) => Highlight.parse({
      id: r.id, user: r.user, article: r.article, text: r.text,
      prefix: r.prefix ?? "", suffix: r.suffix ?? "",
      startOffset: r.start_offset ?? 0, endOffset: r.end_offset ?? 0,
      color: r.color, note: r.note ?? "", created: r.created,
    }));
    renderMarks();
  }

  async function renderMarks() {
    unmarkAll(bodyEl);
    const missing: string[] = [];
    for (const h of highlights) {
      const range = await anchoring.anchor(rangeOver(bodyEl), h);
      if (range) markRange(range, h.color, h.id);
      else missing.push(h.id);
    }
    orphans = missing;
  }

  function onMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !bodyEl.contains(sel.anchorNode)) { popover = null; return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    popover = { x: rect.left + window.scrollX, y: rect.bottom + window.scrollY + 4, range };
  }

  async function createHighlight(color: HighlightColor, note: string) {
    if (!popover) return;
    try {
      const sel = await anchoring.describe(rangeOver(bodyEl), popover.range);
      const pb = browserPb();
      await pb.collection("highlights").create({
        user: pb.authStore.record?.id, article: $page.params.id,
        text: sel.text, prefix: sel.prefix, suffix: sel.suffix,
        start_offset: sel.startOffset, end_offset: sel.endOffset,
        color, note,
      });
      popover = null;
      window.getSelection()?.removeAllRanges();
      await loadHighlights($page.params.id);
    } catch {
      popover = null; // bad selection — silently abort (see spec §10)
    }
  }

  function jumpTo(id: string) {
    bodyEl.querySelector(`mark[data-hl-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function deleteHighlight(id: string) {
    await browserPb().collection("highlights").delete(id);
    await loadHighlights($page.params.id);
  }
```

Markup additions (place the body container and sidebar within the existing reader layout):

```svelte
<div class="reader-body" bind:this={bodyEl} onmouseup={onMouseUp}>
  {@html article.content_html}
</div>

{#if popover}
  <HighlightPopover x={popover.x} y={popover.y} onpick={createHighlight} oncancel={() => (popover = null)} />
{/if}

<HighlightsSidebar {highlights} {orphans} onjump={jumpTo} ondelete={deleteHighlight} />
```

Call `loadHighlights($page.params.id)` from the existing `onMount`/load path after the article HTML is in the DOM. `$page` is from `$app/stores`.

- [ ] **Step 6: Verify type + svelte checks pass**

Run: `pnpm --filter @readmepls/web check`
Expected: no new errors.

- [ ] **Step 7: Run the web test suite**

Run: `pnpm --filter @readmepls/web test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/components/HighlightsSidebar.svelte apps/web/src/lib/components/HighlightsSidebar.test.ts apps/web/src/routes/read/[id]/+page.svelte
git commit -m "feat(web): create, render, list, and delete highlights in the reader"
```

---

## Task 7: core/search/query sanitizer

**Files:**
- Create: `packages/core/src/search/query.ts`, `packages/core/src/search/query.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `toFtsQuery(raw: string): string` — converts free text to a safe FTS5 MATCH expression: each alphanumeric term quoted + prefixed (`"term"*`), space-joined. Empty/whitespace/punctuation-only input → `""`.

- [ ] **Step 1: Write the failing test** — `packages/core/src/search/query.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { toFtsQuery } from "./query.js";

describe("toFtsQuery", () => {
  it("quotes and prefix-matches each term", () => {
    expect(toFtsQuery("hello world")).toBe('"hello"* "world"*');
  });
  it("lowercases and strips punctuation", () => {
    expect(toFtsQuery("AI/ML, notes!")).toBe('"ai"* "ml"* "notes"*');
  });
  it("neutralizes FTS operators by quoting", () => {
    expect(toFtsQuery("cats AND dogs")).toBe('"cats"* "and"* "dogs"*');
  });
  it("returns empty for blank or punctuation-only input", () => {
    expect(toFtsQuery("   ")).toBe("");
    expect(toFtsQuery("!!!")).toBe("");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @readmepls/core test query`
Expected: FAIL — cannot find module `./query.js`.

- [ ] **Step 3: Implement** — `packages/core/src/search/query.ts`

```ts
/** Convert free-text into a safe FTS5 MATCH expression. Each term is quoted
 *  (so reserved words like AND/OR/NEAR are treated literally) and prefix-matched. */
export function toFtsQuery(raw: string): string {
  const terms = raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms.map((t) => `"${t}"*`).join(" ");
}
```

- [ ] **Step 4: Export** — add to `packages/core/src/index.ts`

```ts
export * from "./search/query.js";
```

- [ ] **Step 5: Run tests, verify pass**

Run: `pnpm --filter @readmepls/core test query`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/search packages/core/src/index.ts
git commit -m "feat(core): add FTS query sanitizer"
```

---

## Task 8: Search route (pb_hooks) + cross-user isolation test

**Files:**
- Create: `pocketbase/pb_hooks/search.pb.js`
- Modify: `packages/core/src/pb/migration-phase4.test.ts` (add a route-level FTS + isolation test)

**Interfaces:**
- Consumes: `content_fts` table + `articles` collection (Task 3); `toFtsQuery` runs client-side (the route receives the raw `q` and applies the same quoting — see note).
- Produces: `GET /api/search?q=…` → `200 { results: SearchResult[] }`, ordered by relevance, scoped to the caller's articles. Requires auth.

> The route applies the same quote-and-prefix transform server-side (the sanitizer is pure logic duplicated in JSVM, which cannot import the TS module). Keep both in sync; the contract is "each alphanumeric term quoted + `*`".

- [ ] **Step 1: Write the failing test** — append to `packages/core/src/pb/migration-phase4.test.ts`. Add a module-scope helper that auths a fresh client as a given user (reused by Tasks 10 and 12), and a `describe` block hitting the route. Add `import PocketBase from "pocketbase";` to the file's imports.

```ts
async function makeUser(pb: PbHandle["pb"], email: string): Promise<string> {
  const u = await pb.collection("users").create({
    email, password: "password12345", passwordConfirm: "password12345",
    tier: "free", monthly_quota_used: 0,
  });
  return u.id;
}

async function authedClient(url: string, email: string): Promise<PocketBase> {
  const c = new PocketBase(url);
  await c.collection("users").authWithPassword(email, "password12345");
  return c;
}

describe("phase-4 search route", () => {
  const emailA = `a${Date.now()}@test.local`;
  let ca: PocketBase;

  beforeAll(async () => {
    const aId = await makeUser(h.pb, emailA);
    const bId = await makeUser(h.pb, `b${Date.now()}@test.local`);
    await makeArticleWithContent(h.pb, aId, "ka", "a rare kingfisher by the river");
    await makeArticleWithContent(h.pb, bId, "kb", "another kingfisher sighting");
    ca = await authedClient(h.url, emailA);
  });

  it("returns only the caller's matching articles", async () => {
    const res = await ca.send("/api/search?q=kingfisher", { method: "GET" });
    expect(res.results.length).toBe(1);
    expect(res.results[0].snippet).toMatch(/kingfisher/i);
  });

  it("returns empty results for a blank query", async () => {
    const res = await ca.send("/api/search?q=", { method: "GET" });
    expect(res.results).toEqual([]);
  });
});

describe("highlights tenant isolation", () => {
  it("a user cannot list another user's highlights", async () => {
    const ownerEmail = `hg${Date.now()}@test.local`;
    const ownerId = await makeUser(h.pb, ownerEmail);
    const { articleId } = await makeArticleWithContent(h.pb, ownerId, "hgiso", "highlighted body");
    await h.pb.collection("highlights").create({
      user: ownerId, article: articleId, text: "secret", prefix: "", suffix: "",
      start_offset: 0, end_offset: 6, color: "sage", note: "",
    });
    const intruder = await authedClient(h.url, await (async () => {
      const e = `hi${Date.now()}@test.local`; await makeUser(h.pb, e); return e;
    })());
    const list = await intruder.collection("highlights").getFullList();
    expect(list.length).toBe(0);
  });
});
```

> `makeUser` and `authedClient` are module-scope and reused by the isolation tests in Tasks 10 and 12. The `beforeAll` inside the search `describe` runs after the file-level `beforeAll` (which starts PB), so `h` is ready.

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @readmepls/core test migration-phase4`
Expected: FAIL — `/api/search` returns 404 (route not registered).

- [ ] **Step 3: Implement the route** — `pocketbase/pb_hooks/search.pb.js`

```js
// search.pb.js — GET /api/search?q=… : full-text search scoped to the caller's
// articles. Reads the content_fts virtual table (Task 3 migration) and joins to
// the authenticated user's articles so results never leak across tenants.

routerAdd("GET", "/api/search", (e) => {
  const raw = e.request.url.query().get("q") || "";

  // Same transform as @readmepls/core toFtsQuery: lowercase alphanumeric terms,
  // each quoted (operators neutralized) and prefix-matched. Kept in sync by contract.
  const terms = (raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
  const matchExpr = terms.map((t) => '"' + t + '"*').join(" ");
  if (!matchExpr) {
    return e.json(200, { results: [] });
  }

  const uid = e.auth.id;
  const rows = arrayOf(new DynamicModel({ articleId: "", title: "", snippet: "", rank: 0.0 }));

  e.app.db()
    .newQuery(
      "SELECT a.id AS articleId, cf.title AS title, " +
      "snippet(content_fts, 2, '<mark>', '</mark>', '…', 12) AS snippet, " +
      "bm25(content_fts) AS rank " +
      "FROM content_fts cf " +
      "JOIN articles a ON a.content = cf.content_id " +
      "WHERE content_fts MATCH {:q} AND a.user = {:uid} " +
      "ORDER BY rank LIMIT 50"
    )
    .bind({ q: matchExpr, uid: uid })
    .all(rows);

  return e.json(200, { results: rows });
}, $apis.requireAuth());
```

> `snippet(content_fts, 2, …)` targets column index 2 (`body`); column 0 is `content_id` (UNINDEXED), 1 is `title`. `bm25` ascending = most relevant first.

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm --filter @readmepls/core test migration-phase4`
Expected: PASS — caller sees exactly one result; blank query returns `[]`.

- [ ] **Step 5: Commit**

```bash
git add pocketbase/pb_hooks/search.pb.js packages/core/src/pb/migration-phase4.test.ts
git commit -m "feat(pb): add tenant-scoped full-text search route"
```

---

## Task 9: Search UI

**Files:**
- Create: `apps/web/src/routes/search/+page.svelte`
- Modify: `apps/web/src/lib/components/TopBar.svelte`

**Interfaces:**
- Consumes: `GET /api/search` (Task 8); `SearchResult` from `@readmepls/types`; existing `CardGrid`/`Card` primitives.
- Produces: a `/search?q=` route rendering results; a search input in `TopBar` that navigates to `/search?q=`.

- [ ] **Step 1: Add the search input to TopBar** — read `TopBar.svelte` first, then add a form (match existing styling/tokens):

```svelte
<form class="search" onsubmit={(e) => { e.preventDefault(); if (q.trim()) goto(`/search?q=${encodeURIComponent(q)}`); }}>
  <input bind:value={q} placeholder="search…" aria-label="search library" />
</form>
```

with `import { goto } from "$app/navigation";` and `let q = $state("");` in the script.

- [ ] **Step 2: Implement the results route** — `apps/web/src/routes/search/+page.svelte`

```svelte
<script lang="ts">
  import { page } from "$app/stores";
  import { SearchResult } from "@readmepls/types";
  import { z } from "zod";
  import CardGrid from "$lib/components/ui/CardGrid.svelte";

  let results = $state<SearchResult[]>([]);
  let loading = $state(false);
  let q = $derived($page.url.searchParams.get("q") ?? "");

  const Resp = z.object({ results: z.array(SearchResult) });

  $effect(() => {
    const query = q;
    if (!query.trim()) { results = []; return; }
    loading = true;
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((j) => { results = Resp.parse(j).results; })
      .finally(() => { loading = false; });
  });
</script>

<svelte:head><title>search · {q}</title></svelte:head>

<section class="search-results">
  <h1>results for “{q}”</h1>
  {#if loading}
    <p>searching…</p>
  {:else if results.length === 0}
    <p class="empty">nothing found{q ? ` for “${q}”` : ""}.</p>
  {:else}
    <CardGrid>
      {#each results as r (r.articleId)}
        <a class="result" href={`/read/${r.articleId}`}>
          <h2>{r.title}</h2>
          <p class="snippet">{@html r.snippet}</p>
        </a>
      {/each}
    </CardGrid>
  {/if}
</section>

<style>
  h1 { font-family: var(--font-display); }
  .empty { color: var(--ink-muted); }
  .result { display: block; text-decoration: none; color: var(--ink); }
  .snippet :global(mark) { background: var(--hl-amber); }
</style>
```

> `/api/search` is served by PocketBase, not SvelteKit. In dev the web app talks to PB at `VITE_PB_URL`. Fetch the absolute PB URL: `${import.meta.env.VITE_PB_URL ?? "http://127.0.0.1:8090"}/api/search?q=…` and include the auth header from `browserPb().authStore.token` (`Authorization: <token>`). Update the `fetch` call accordingly.

- [ ] **Step 3: Correct the fetch to hit PB with auth** — replace the `fetch(...)` in Step 2 with:

```ts
    import { browserPb } from "$lib/pb";
    const base = import.meta.env.VITE_PB_URL ?? "http://127.0.0.1:8090";
    fetch(`${base}/api/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: browserPb().authStore.token },
    })
```

- [ ] **Step 4: Verify checks pass**

Run: `pnpm --filter @readmepls/web check`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/search apps/web/src/lib/components/TopBar.svelte
git commit -m "feat(web): full-text search input and results page"
```

---

## Task 10: TagEditor + manual tag logic + tenant test

**Files:**
- Create: `apps/web/src/lib/components/TagEditor.svelte`, `apps/web/src/lib/components/TagEditor.test.ts`
- Modify: `apps/web/src/routes/read/[id]/+page.svelte` (mount the editor)
- Modify: `packages/core/src/pb/migration-phase4.test.ts` (article_tags tenant isolation)

**Interfaces:**
- Consumes: `slugify` (Task 2); `browserPb()`; existing `Tag.svelte`.
- Produces: `TagEditor.svelte` props `{ tags: {id:string,name:string}[], onadd: (name: string) => void, onremove: (id: string) => void }`. Pure UI; persistence handled by the reader page.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/components/TagEditor.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import TagEditor from "./TagEditor.svelte";

describe("TagEditor", () => {
  it("emits a new tag name on submit", async () => {
    const onadd = vi.fn();
    render(TagEditor, { tags: [], onadd, onremove: vi.fn() });
    const input = screen.getByLabelText(/add tag/i);
    await fireEvent.input(input, { target: { value: "machine learning" } });
    await fireEvent.submit(input.closest("form")!);
    expect(onadd).toHaveBeenCalledWith("machine learning");
  });

  it("emits remove for an existing tag", async () => {
    const onremove = vi.fn();
    render(TagEditor, { tags: [{ id: "t1", name: "ml" }], onadd: vi.fn(), onremove });
    await fireEvent.click(screen.getByRole("button", { name: /remove ml/i }));
    expect(onremove).toHaveBeenCalledWith("t1");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @readmepls/web test TagEditor`
Expected: FAIL — cannot find component.

- [ ] **Step 3: Implement** — `apps/web/src/lib/components/TagEditor.svelte`

```svelte
<script lang="ts">
  let { tags, onadd, onremove }: {
    tags: { id: string; name: string }[];
    onadd: (name: string) => void;
    onremove: (id: string) => void;
  } = $props();
  let draft = $state("");

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (name) { onadd(name); draft = ""; }
  }
</script>

<div class="tag-editor">
  {#each tags as t (t.id)}
    <span class="chip">
      {t.name}
      <button aria-label={`remove ${t.name}`} onclick={() => onremove(t.id)}>×</button>
    </span>
  {/each}
  <form onsubmit={submit}>
    <input aria-label="add tag" placeholder="add tag…" bind:value={draft} />
  </form>
</div>

<style>
  .tag-editor { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
  .chip {
    display: inline-flex; align-items: center; gap: var(--space-1);
    background: var(--surface-sunken); border-radius: var(--radius-pill);
    padding: 0 var(--space-2); font-size: var(--text-sm); color: var(--ink);
  }
  .chip button { background: none; border: none; cursor: pointer; color: var(--ink-muted); }
  input { border: none; border-bottom: 1px solid var(--border); background: transparent; font: inherit; color: var(--ink); }
</style>
```

> Swap any missing token for the nearest existing one in `tokens.css`.

- [ ] **Step 4: Run component tests, verify pass**

Run: `pnpm --filter @readmepls/web test TagEditor`
Expected: PASS.

- [ ] **Step 5: Wire persistence into the reader** — in `read/[id]/+page.svelte`, add manual-tag handlers:

```ts
  import { slugify } from "@readmepls/core";

  let manualTags = $state<{ id: string; name: string; linkId: string }[]>([]);

  async function loadTags(articleId: string) {
    const pb = browserPb();
    const links = await pb.collection("article_tags").getFullList({
      filter: `article = "${articleId}" && source = "manual"`, expand: "tag",
    });
    manualTags = links.map((l) => ({ id: l.expand!.tag.id, name: l.expand!.tag.name, linkId: l.id }));
  }

  async function addTag(name: string) {
    const pb = browserPb();
    const uid = pb.authStore.record!.id;
    const slug = slugify(name);
    if (!slug) return;
    let tag;
    try {
      tag = await pb.collection("tags").getFirstListItem(`slug = "${slug}"`);
    } catch {
      tag = await pb.collection("tags").create({ user: uid, name, slug });
    }
    await pb.collection("article_tags").create({
      article: $page.params.id, tag: tag.id, source: "manual", confidence: 1,
    });
    await loadTags($page.params.id);
  }

  async function removeTag(tagId: string) {
    const link = manualTags.find((t) => t.id === tagId);
    if (link) await browserPb().collection("article_tags").delete(link.linkId);
    await loadTags($page.params.id);
  }
```

Markup: `<TagEditor tags={manualTags.map(t => ({id:t.id,name:t.name}))} onadd={addTag} onremove={removeTag} />`. Call `loadTags($page.params.id)` in the same place as `loadHighlights`.

- [ ] **Step 6: Add an article_tags tenant-isolation test** — append to `migration-phase4.test.ts`:

```ts
describe("article_tags isolation", () => {
  it("a user cannot list another user's manual tags", async () => {
    const emailC = `c${Date.now()}@test.local`;
    const uc = await h.pb.collection("users").create({
      email: emailC, password: "password12345", passwordConfirm: "password12345",
      tier: "free", monthly_quota_used: 0,
    });
    const { articleId } = await makeArticleWithContent(h.pb, uc.id, "tagiso", "tagged body");
    const tag = await h.pb.collection("tags").create({ user: uc.id, name: "secret", slug: "secret" });
    await h.pb.collection("article_tags").create({ article: articleId, tag: tag.id, source: "manual", confidence: 1 });

    // a different authed user must see none of C's article_tags
    const emailD = `d${Date.now()}@test.local`;
    await h.pb.collection("users").create({
      email: emailD, password: "password12345", passwordConfirm: "password12345",
      tier: "free", monthly_quota_used: 0,
    });
    const cd = await authedClient(h.url, emailD);
    const list = await cd.collection("article_tags").getFullList();
    expect(list.length).toBe(0);
  });
});
```

- [ ] **Step 7: Run tests, verify pass**

Run: `pnpm --filter @readmepls/web test TagEditor && pnpm --filter @readmepls/core test migration-phase4`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/components/TagEditor.svelte apps/web/src/lib/components/TagEditor.test.ts apps/web/src/routes/read/[id]/+page.svelte packages/core/src/pb/migration-phase4.test.ts
git commit -m "feat(web): manual tag editing on articles with tenant-isolation test"
```

---

## Task 11: Library tag filter

**Files:**
- Create: `apps/web/src/routes/library/tag-filter.test.ts`
- Modify: `apps/web/src/routes/library/+page.svelte`

**Interfaces:**
- Consumes: `browserPb()`; existing `Tag.svelte`, `CardGrid`, `ArticleCard`.
- Produces: a tag list in the library; clicking a tag filters the grid to articles carrying that tag.

> The existing `page.test.ts` has a hoisted `vi.mock` returning empty lists (its empty-state test depends on that). A `vi.mock` is one-per-module-per-file, so this test needs its **own file** with a branching mock — do not edit `page.test.ts`'s mock.

- [ ] **Step 1: Write the failing test** — `apps/web/src/routes/library/tag-filter.test.ts`. First read `$lib/article/record` to get the `ArticleRecord` view-model field names and replace the `/* …ArticleRecord fields… */` comments with the real required fields (title is the field asserted here).

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

// Two articles; tag "ml" (t1) links only to a1 via article_tags.
const items = [
  { id: "a1", title: "Machine learning intro" /* …other ArticleRecord fields… */ },
  { id: "a2", title: "Cooking pasta" /* …other ArticleRecord fields… */ },
];

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: { record: { id: "u1" }, token: "tok" },
    collection: (name: string) => {
      if (name === "tags") {
        return { getFullList: vi.fn().mockResolvedValue([{ id: "t1", name: "ml" }]) };
      }
      if (name === "article_tags") {
        return { getFullList: vi.fn().mockResolvedValue([{ id: "l1", article: "a1", tag: "t1" }]) };
      }
      // articles + collections fall through here
      return {
        getList: vi.fn().mockResolvedValue({ items }),
        getFullList: vi.fn().mockResolvedValue([]),
        subscribe: vi.fn().mockResolvedValue(() => {}),
      };
    },
  }),
}));

import Library from "./+page.svelte";

describe("library tag filter", () => {
  it("filters the grid to the selected tag", async () => {
    render(Library);
    await waitFor(() => expect(screen.getByText("Machine learning intro")).toBeInTheDocument());
    expect(screen.getByText("Cooking pasta")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: /^ml$/i }));

    await waitFor(() => expect(screen.queryByText("Cooking pasta")).not.toBeInTheDocument());
    expect(screen.getByText("Machine learning intro")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @readmepls/web test tag-filter`
Expected: FAIL — no tag chip rendered / no filtering.

- [ ] **Step 3: Implement** — in `library/+page.svelte`, load the user's tags and a selected-tag filter:

```ts
  import Tag from "$lib/components/ui/Tag.svelte";
  let tags = $state<{ id: string; name: string }[]>([]);
  let selectedTag = $state<string | null>(null);
  let visible = $derived(
    selectedTag === null ? articles : articles.filter((a) => taggedArticleIds.has(a.id))
  );
  let taggedArticleIds = $state<Set<string>>(new Set());

  async function loadTags() {
    tags = (await browserPb().collection("tags").getFullList({ sort: "name" }))
      .map((t) => ({ id: t.id, name: t.name }));
  }

  async function selectTag(tagId: string | null) {
    selectedTag = tagId;
    if (tagId === null) { taggedArticleIds = new Set(); return; }
    const links = await browserPb().collection("article_tags").getFullList({ filter: `tag = "${tagId}"` });
    taggedArticleIds = new Set(links.map((l) => l.article));
  }
```

Markup: render a tag rail with an "all" reset plus a chip per tag (`onclick={() => selectTag(t.id)}`), and iterate `visible` instead of `articles` in the grid. Call `loadTags()` on mount.

- [ ] **Step 4: Run tests + checks, verify pass**

Run: `pnpm --filter @readmepls/web test library && pnpm --filter @readmepls/web check`
Expected: PASS (both `page.test.ts` empty-state and `tag-filter.test.ts`), no new check errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/library/+page.svelte apps/web/src/routes/library/tag-filter.test.ts
git commit -m "feat(web): filter the library grid by tag"
```

---

## Task 12: Collections CRUD + view + add-to-collection + items test

**Files:**
- Create: `apps/web/src/lib/components/AddToCollection.svelte`, `apps/web/src/routes/collections/[slug]/+page.svelte`
- Modify: `apps/web/src/routes/library/+page.svelte` (collections list/CRUD), `apps/web/src/routes/read/[id]/+page.svelte` (mount AddToCollection)
- Modify: `packages/core/src/pb/migration-phase4.test.ts` (collection_items scoping)

**Interfaces:**
- Consumes: `slugify` (Task 2); `browserPb()`; `Collection`/`CollectionItem` types; `CardGrid`/`ArticleCard`.
- Produces:
  - `AddToCollection.svelte` props `{ collections: {id:string,name:string}[], onadd: (collectionId:string)=>void, oncreate:(name:string)=>void }`.
  - `/collections/[slug]` route listing a collection's articles.
  - Library-side create/rename/delete of collections.

- [ ] **Step 1: Write the failing collection_items scoping test** — append to `migration-phase4.test.ts`:

```ts
describe("collection_items scoping", () => {
  it("a user cannot read another user's collection items", async () => {
    const emailE = `e${Date.now()}@test.local`;
    const ue = await h.pb.collection("users").create({
      email: emailE, password: "password12345", passwordConfirm: "password12345",
      tier: "free", monthly_quota_used: 0,
    });
    const { articleId } = await makeArticleWithContent(h.pb, ue.id, "coliso", "body");
    const col = await h.pb.collection("collections").create({
      user: ue.id, name: "Private", slug: `private-${Date.now()}`, parent: "", order: 0,
    });
    await h.pb.collection("collection_items").create({ collection: col.id, article: articleId, order: 0 });

    const emailF = `f${Date.now()}@test.local`;
    await h.pb.collection("users").create({
      email: emailF, password: "password12345", passwordConfirm: "password12345",
      tier: "free", monthly_quota_used: 0,
    });
    const cf = await authedClient(h.url, emailF);
    const items = await cf.collection("collection_items").getFullList();
    expect(items.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails or passes** — this asserts the Task 3 rule already works.

Run: `pnpm --filter @readmepls/core test migration-phase4`
Expected: PASS (rule from Task 3). If it FAILS, fix the `collection_items` rule in the migration (`collection.user = @request.auth.id`) before continuing.

- [ ] **Step 3: Write the AddToCollection failing test** — `apps/web/src/lib/components/AddToCollection.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import AddToCollection from "./AddToCollection.svelte";

describe("AddToCollection", () => {
  it("adds to an existing collection", async () => {
    const onadd = vi.fn();
    render(AddToCollection, { collections: [{ id: "c1", name: "Read Later" }], onadd, oncreate: vi.fn() });
    await fireEvent.click(screen.getByRole("button", { name: /read later/i }));
    expect(onadd).toHaveBeenCalledWith("c1");
  });

  it("creates a new collection", async () => {
    const oncreate = vi.fn();
    render(AddToCollection, { collections: [], onadd: vi.fn(), oncreate });
    const input = screen.getByLabelText(/new collection/i);
    await fireEvent.input(input, { target: { value: "Recipes" } });
    await fireEvent.submit(input.closest("form")!);
    expect(oncreate).toHaveBeenCalledWith("Recipes");
  });
});
```

- [ ] **Step 4: Run test, verify it fails**

Run: `pnpm --filter @readmepls/web test AddToCollection`
Expected: FAIL — cannot find component.

- [ ] **Step 5: Implement** — `apps/web/src/lib/components/AddToCollection.svelte`

```svelte
<script lang="ts">
  let { collections, onadd, oncreate }: {
    collections: { id: string; name: string }[];
    onadd: (collectionId: string) => void;
    oncreate: (name: string) => void;
  } = $props();
  let draft = $state("");
  function create(e: SubmitEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (name) { oncreate(name); draft = ""; }
  }
</script>

<div class="add-to-collection">
  <ul>
    {#each collections as c (c.id)}
      <li><button onclick={() => onadd(c.id)}>{c.name}</button></li>
    {/each}
  </ul>
  <form onsubmit={create}>
    <input aria-label="new collection" placeholder="new collection…" bind:value={draft} />
  </form>
</div>

<style>
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
  button { background: none; border: none; text-align: left; cursor: pointer; color: var(--ink); font: inherit; }
  input { border: none; border-bottom: 1px solid var(--border); background: transparent; font: inherit; color: var(--ink); }
</style>
```

- [ ] **Step 6: Run component test, verify pass**

Run: `pnpm --filter @readmepls/web test AddToCollection`
Expected: PASS.

- [ ] **Step 7: Wire persistence into the reader** — in `read/[id]/+page.svelte`:

```ts
  import AddToCollection from "$lib/components/AddToCollection.svelte";
  let collections = $state<{ id: string; name: string }[]>([]);

  async function loadCollections() {
    collections = (await browserPb().collection("collections").getFullList({ sort: "name" }))
      .map((c) => ({ id: c.id, name: c.name }));
  }
  async function addToCollection(collectionId: string) {
    await browserPb().collection("collection_items").create({
      collection: collectionId, article: $page.params.id, order: 0,
    });
  }
  async function createCollection(name: string) {
    const pb = browserPb();
    const c = await pb.collection("collections").create({
      user: pb.authStore.record!.id, name, slug: slugify(name), parent: "", order: 0,
    });
    await addToCollection(c.id);
    await loadCollections();
  }
```

Markup: `<AddToCollection {collections} onadd={addToCollection} oncreate={createCollection} />`. Call `loadCollections()` on mount.

- [ ] **Step 8: Implement the collection view route** — `apps/web/src/routes/collections/[slug]/+page.svelte`

```svelte
<script lang="ts">
  import { page } from "$app/stores";
  import { browserPb } from "$lib/pb";
  import CardGrid from "$lib/components/ui/CardGrid.svelte";
  import ArticleCard from "$lib/components/ArticleCard.svelte";

  let name = $state("");
  let articles = $state<any[]>([]); // shape: ArticleRecord view-model (see $lib/article/record)
  let slug = $derived($page.params.slug);

  $effect(() => {
    const s = slug;
    (async () => {
      const pb = browserPb();
      const col = await pb.collection("collections").getFirstListItem(`slug = "${s}"`);
      name = col.name;
      const items = await pb.collection("collection_items").getFullList({
        filter: `collection = "${col.id}"`, sort: "order",
        expand: "article.content",
      });
      articles = items.map((i) => i.expand!.article);
    })();
  });
</script>

<svelte:head><title>{name}</title></svelte:head>
<section>
  <h1>{name}</h1>
  <CardGrid>
    {#each articles as a (a.id)}
      <ArticleCard article={a} />
    {/each}
  </CardGrid>
</section>
```

> Replace `any[]` with the project's `ArticleRecord` view-model type (`$lib/article/record`) and map the expanded record to it, mirroring how `library/+page.svelte` builds its cards. No bare `any` in the final code (per Global Constraints) — read `record.ts` and reuse its mapper.

- [ ] **Step 9: Add collections list + CRUD to the library** — in `library/+page.svelte`, render the user's collections (links to `/collections/[slug]`), a create form (`slugify` the name), rename (update `name`/`slug`), and delete (`collections.delete` — `collection_items` cascade per Task 3). Reuse the tag-rail styling.

- [ ] **Step 10: Run full suites + checks**

Run: `pnpm --filter @readmepls/web test && pnpm --filter @readmepls/web check && pnpm --filter @readmepls/core test`
Expected: PASS, no check errors.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/lib/components/AddToCollection.svelte apps/web/src/lib/components/AddToCollection.test.ts apps/web/src/routes/collections apps/web/src/routes/library/+page.svelte apps/web/src/routes/read/[id]/+page.svelte packages/core/src/pb/migration-phase4.test.ts
git commit -m "feat(web): collections CRUD, add-to-collection, and collection view"
```

---

## Final verification

- [ ] **Run the whole test suite**

Run: `pnpm -r test`
Expected: all packages PASS.

- [ ] **Run type/svelte checks**

Run: `pnpm --filter @readmepls/web check`
Expected: no errors.

- [ ] **Manual smoke (optional, via `/run` or local compose):** capture an article → open reader → select text → highlight (color + note) → reload → highlight re-anchors → search a word in it → result appears with snippet → add a manual tag → filter library by it → add article to a new collection → open the collection view.
