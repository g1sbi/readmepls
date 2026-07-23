# Chapters Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stylized, collapsible chapters (table-of-contents) sidebar to the reader that lists article headings, jumps on click, and highlights the chapter in view.

**Architecture:** Headings come from two cooperating sources sharing one shape (`TocEntry`): (1) the worker emits a heading tree + injected ids at capture, stored on `content.toc`; (2) the reader falls back to parsing the rendered DOM when a record has no stored tree (legacy articles). The pure heading-nesting logic lives in `@readmepls/core` (`nestHeadings`); each edge (worker jsdom, web real DOM) owns a thin adapter that finds headings, assigns slug ids, and calls `nestHeadings`. The reader renders the tree as a sticky section in the left `Rail` on desktop and inside a slide-in `Sheet` on mobile, with an `IntersectionObserver` driving the active-chapter highlight.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript strict, Zod, Vitest + `@testing-library/svelte`, shadcn-svelte (`Collapsible`), PocketBase migrations, jsdom (worker).

## Global Constraints

- **TDD always** — failing test first, then implementation. Every unit below leads with a test.
- **Single vitest workspace** — run subsets with `pnpm exec vitest run <pattern>`. `pnpm --filter <pkg> test` does NOT work.
- **Isolation** — all work happens in a git worktree on branch `feat/chapters-sidebar` (created via `superpowers:using-git-worktrees` at execution start, before Task 1).
- **No hardcoded colors/fonts** — reference `tokens.css` vars only. Active state = `--color-accent` (terracotta).
- **Mobile-first** — usable at 360px, tap targets ≥44px, no horizontal overflow.
- **TypeScript strict** — no `any` without a written reason.
- **Validate at boundaries with Zod** — `content.toc` read back from PocketBase is parsed before use.
- **Lowercase playful voice** — UI copy is lowercase ("chapters"), matching the design language.
- **Conventional Commits**, one logical change per commit.
- **Verify before done** — after each task run `pnpm typecheck` and the relevant `pnpm exec vitest run <pattern>`; read the output.

---

### Task 1: `TocEntry` type + `toc` fields (types package)

**Files:**
- Create: `packages/types/src/toc.ts`
- Test: `packages/types/src/toc.test.ts`
- Modify: `packages/types/src/index.ts` (export the new module)
- Modify: `packages/types/src/content.ts` (add `toc` field)
- Modify: `packages/types/src/extract.ts` (add `toc` field)

**Interfaces:**
- Produces: `TocEntry` (Zod schema + inferred type) — `{ id: string; text: string; level: number; children: TocEntry[] }`. Consumed by core, worker, and web.

- [ ] **Step 1: Write the failing test**

`packages/types/src/toc.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { TocEntry } from "./toc.js";

describe("TocEntry", () => {
  it("parses a nested tree", () => {
    const tree = [
      { id: "intro", text: "Intro", level: 2, children: [
        { id: "background", text: "Background", level: 3, children: [] },
      ] },
    ];
    expect(TocEntry.array().parse(tree)).toEqual(tree);
  });

  it("rejects an out-of-range heading level", () => {
    const bad = [{ id: "x", text: "X", level: 7, children: [] }];
    expect(TocEntry.array().safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/types/src/toc.test.ts`
Expected: FAIL — cannot find module `./toc.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/types/src/toc.ts`:
```ts
import { z } from "zod";

export type TocEntry = {
  id: string;
  text: string;
  level: number;
  children: TocEntry[];
};

// z.lazy handles the self-referential `children` array.
export const TocEntry: z.ZodType<TocEntry> = z.lazy(() =>
  z.object({
    id: z.string(),
    text: z.string(),
    level: z.number().int().min(1).max(6),
    children: z.array(TocEntry),
  }),
);
```

Add to `packages/types/src/index.ts`:
```ts
export * from "./toc.js";
```

In `packages/types/src/content.ts`, add the import and field (schema stays otherwise unchanged):
```ts
import { TocEntry } from "./toc.js";
// ...inside z.object({ ... }) after content_text:
  toc: z.array(TocEntry).default([]),
```

In `packages/types/src/extract.ts`, add the import and field:
```ts
import { TocEntry } from "./toc.js";
// ...inside ExtractResult z.object({ ... }) after contentText:
  toc: z.array(TocEntry).default([]),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/types/src/toc.test.ts && pnpm typecheck`
Expected: PASS. Typecheck will surface any `ExtractResult` literal that now needs `toc` — those are fixed in Tasks 3 and 4.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/toc.ts packages/types/src/toc.test.ts packages/types/src/index.ts packages/types/src/content.ts packages/types/src/extract.ts
git commit -m "feat(types): add TocEntry schema and toc field on content/extract"
```

---

### Task 2: Pure heading-nesting core helpers

**Files:**
- Create: `packages/core/src/toc/nest.ts`
- Test: `packages/core/src/toc/nest.test.ts`
- Modify: `packages/core/src/index.ts` (export the new module)

**Interfaces:**
- Consumes: `TocEntry` (type) from `@readmepls/types` (already a core dependency).
- Produces:
  - `interface FlatHeading { id: string; text: string; level: number }`
  - `nestHeadings(items: FlatHeading[]): TocEntry[]` — shallowest level present becomes roots; deeper levels nest; skipped levels handled.
  - `makeIdDeduper(): (base: string) => string` — returns unique slug ids (`intro`, `intro-2`, …); empty base → `section`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/toc/nest.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { nestHeadings, makeIdDeduper, type FlatHeading } from "./nest.js";

describe("nestHeadings", () => {
  it("nests deeper headings under shallower ones", () => {
    const flat: FlatHeading[] = [
      { id: "a", text: "A", level: 2 },
      { id: "a1", text: "A1", level: 3 },
      { id: "b", text: "B", level: 2 },
    ];
    const tree = nestHeadings(flat);
    expect(tree.map((n) => n.id)).toEqual(["a", "b"]);
    expect(tree[0]!.children.map((n) => n.id)).toEqual(["a1"]);
    expect(tree[1]!.children).toEqual([]);
  });

  it("treats the shallowest present level as the top level", () => {
    // No h1/h2 present — h3 headings should be roots, not orphaned.
    const flat: FlatHeading[] = [
      { id: "x", text: "X", level: 3 },
      { id: "y", text: "Y", level: 3 },
    ];
    expect(nestHeadings(flat).map((n) => n.id)).toEqual(["x", "y"]);
  });

  it("nests a skipped level (h2 then h4) without a phantom node", () => {
    const flat: FlatHeading[] = [
      { id: "a", text: "A", level: 2 },
      { id: "deep", text: "Deep", level: 4 },
    ];
    const tree = nestHeadings(flat);
    expect(tree[0]!.children.map((n) => n.id)).toEqual(["deep"]);
    expect(tree[0]!.children[0]!.level).toBe(4);
  });

  it("returns [] for no headings", () => {
    expect(nestHeadings([])).toEqual([]);
  });
});

describe("makeIdDeduper", () => {
  it("suffixes collisions and falls back for empty base", () => {
    const dedupe = makeIdDeduper();
    expect(dedupe("intro")).toBe("intro");
    expect(dedupe("intro")).toBe("intro-2");
    expect(dedupe("")).toBe("section");
    expect(dedupe("")).toBe("section-2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/toc/nest.test.ts`
Expected: FAIL — cannot find module `./nest.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/toc/nest.ts`:
```ts
import type { TocEntry } from "@readmepls/types";

export interface FlatHeading {
  id: string;
  text: string;
  level: number;
}

/** Build a nested outline from headings in document order. The first heading
 *  always roots the tree, so the shallowest level actually present becomes the
 *  top level; deeper (or skipped-deeper) levels nest under the nearest
 *  shallower ancestor. */
export function nestHeadings(items: FlatHeading[]): TocEntry[] {
  const roots: TocEntry[] = [];
  const stack: TocEntry[] = [];
  for (const it of items) {
    const node: TocEntry = { id: it.id, text: it.text, level: it.level, children: [] };
    while (stack.length && stack[stack.length - 1]!.level >= node.level) stack.pop();
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1]!.children.push(node);
    stack.push(node);
  }
  return roots;
}

/** Returns a function that yields collision-free slug ids: "intro", "intro-2",
 *  … An empty base becomes "section". */
export function makeIdDeduper(): (base: string) => string {
  const seen = new Map<string, number>();
  return (base: string): string => {
    const key = base || "section";
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}-${n}`;
  };
}
```

Add to `packages/core/src/index.ts`:
```ts
export * from "./toc/nest.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/toc/nest.test.ts`
Expected: PASS (4 + 1 assertions green).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/toc/nest.ts packages/core/src/toc/nest.test.ts packages/core/src/index.ts
git commit -m "feat(core): add pure heading-nesting helpers"
```

---

### Task 3: Worker `buildToc` adapter + parse-article wiring

**Files:**
- Create: `apps/worker/src/extract/toc.ts`
- Test: `apps/worker/src/extract/toc.test.ts`
- Modify: `apps/worker/src/extract/parse-article.ts`
- Modify: `apps/worker/src/extract/parse-article.test.ts` (assert toc + injected ids)

**Interfaces:**
- Consumes: `slugify`, `nestHeadings`, `makeIdDeduper`, `FlatHeading` from `@readmepls/core`; `TocEntry` from `@readmepls/types`; `JSDOM`.
- Produces: `buildToc(html: string): { html: string; toc: TocEntry[] }` — injects a slug `id` onto each heading in `html` (preserving any existing id) and returns the nested tree. Empty/heading-less input returns the html unchanged and `toc: []`.

- [ ] **Step 1: Write the failing test**

`apps/worker/src/extract/toc.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildToc } from "./toc.js";

describe("buildToc", () => {
  it("builds a nested tree and injects heading ids", () => {
    const { html, toc } = buildToc(
      "<h2>Getting Started</h2><p>x</p><h3>Install</h3><h2>Usage</h2>",
    );
    expect(html).toContain('<h2 id="getting-started">Getting Started</h2>');
    expect(html).toContain('<h3 id="install">Install</h3>');
    expect(toc.map((n) => n.id)).toEqual(["getting-started", "usage"]);
    expect(toc[0]!.children.map((n) => n.id)).toEqual(["install"]);
  });

  it("dedupes colliding heading slugs", () => {
    const { toc } = buildToc("<h2>Notes</h2><h2>Notes</h2>");
    expect(toc.map((n) => n.id)).toEqual(["notes", "notes-2"]);
  });

  it("preserves an existing heading id", () => {
    const { html, toc } = buildToc('<h2 id="custom">Title</h2>');
    expect(html).toContain('id="custom"');
    expect(toc[0]!.id).toBe("custom");
  });

  it("returns html unchanged and empty toc when there are no headings", () => {
    const input = "<p>just a paragraph</p>";
    expect(buildToc(input)).toEqual({ html: input, toc: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/worker/src/extract/toc.test.ts`
Expected: FAIL — cannot find module `./toc.js`.

- [ ] **Step 3: Write minimal implementation**

`apps/worker/src/extract/toc.ts`:
```ts
import { JSDOM } from "jsdom";
import { slugify, nestHeadings, makeIdDeduper, type FlatHeading } from "@readmepls/core";
import type { TocEntry } from "@readmepls/types";

/** Parse sanitized article HTML, assign stable slug ids to h1–h6 (keeping any
 *  id already present), and return the id-annotated HTML plus a nested outline. */
export function buildToc(html: string): { html: string; toc: TocEntry[] } {
  if (!html.trim()) return { html, toc: [] };
  const dom = new JSDOM(`<body>${html}</body>`);
  const doc = dom.window.document;
  const headings = [...doc.querySelectorAll("h1,h2,h3,h4,h5,h6")];
  if (headings.length === 0) return { html, toc: [] };

  const dedupe = makeIdDeduper();
  const flat: FlatHeading[] = [];
  for (const h of headings) {
    const text = (h.textContent ?? "").trim();
    if (!text) continue;
    const level = Number(h.tagName[1]);
    const id = h.getAttribute("id") || dedupe(slugify(text));
    h.setAttribute("id", id);
    flat.push({ id, text, level });
  }
  return { html: doc.body.innerHTML, toc: nestHeadings(flat) };
}
```

Wire into `apps/worker/src/extract/parse-article.ts`. Import at top:
```ts
import { buildToc } from "./toc.js";
```
In the failed-extraction early return, add `toc: [],` (after `contentText: "",`). In the success return, replace the `contentHtml` line and add `toc`:
```ts
    // was: contentHtml: sanitizeContentHtml(parsed.content ?? ""),
    ...(() => {
      const { html, toc } = buildToc(sanitizeContentHtml(parsed.content ?? ""));
      return { contentHtml: html, toc };
    })(),
```
> Prefer a clearer form if you like: compute `const { html: contentHtml, toc } = buildToc(sanitizeContentHtml(parsed.content ?? ""));` above the return and reference both in the object. Either way, `sanitize` runs first, then `buildToc` injects ids — the sanitizer allowlist is NOT changed.

- [ ] **Step 4: Extend the parse-article test**

Add to `apps/worker/src/extract/parse-article.test.ts` a case asserting a document with headings yields a populated `toc` and ids in `contentHtml`:
```ts
it("emits a toc and injects heading ids", () => {
  const html = `<!doctype html><html><body><article>
    <h2>First</h2><p>${"word ".repeat(60)}</p><h3>Sub</h3><p>${"word ".repeat(60)}</p>
  </article></body></html>`;
  const result = parseArticleHtml("https://example.com/post", html);
  expect(result.status).toBe("ok");
  expect(result.toc.length).toBeGreaterThan(0);
  expect(result.contentHtml).toMatch(/<h[23] id="/);
});
```
> Readability keeps headings inside article-like content; the repeated words give it enough body to classify as readable. If Readability drops a heading for a given fixture, adjust the fixture body length — do not weaken the assertion.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/worker/src/extract/toc.test.ts apps/worker/src/extract/parse-article.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/extract/toc.ts apps/worker/src/extract/toc.test.ts apps/worker/src/extract/parse-article.ts apps/worker/src/extract/parse-article.test.ts
git commit -m "feat(worker): build heading toc and inject ids during extraction"
```

---

### Task 4: Persist `toc` to PocketBase content

**Files:**
- Modify: `apps/worker/src/content/upsert-content.ts` (add `toc` to `ContentFields`)
- Modify: `apps/worker/src/content/upsert-content.test.ts` (add `toc: []` to the fixture)
- Modify: `apps/worker/src/worker.ts` (write `toc: result.toc`)
- Create: `pocketbase/pb_migrations/1720200000_content_toc.js`

**Interfaces:**
- Consumes: `ExtractResult.toc` (Task 1), `TocEntry` (Task 1).
- Produces: `content.toc` json column populated on every extraction write.

- [ ] **Step 1: Write the failing test**

Add to `apps/worker/src/content/upsert-content.test.ts` a case asserting `toc` is forwarded to the PB write. Extend the existing `fields` fixture with `toc: [],` and add:
```ts
it("forwards toc to the created content record", async () => {
  const create = vi.fn(async () => ({ id: "c1" }));
  const update = vi.fn();
  const pb = fakePb(null, { create, update }); // 404 → create path
  await upsertContent(pb, "https://example.com/a", {
    ...fields,
    toc: [{ id: "intro", text: "Intro", level: 2, children: [] }],
  });
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ toc: [{ id: "intro", text: "Intro", level: 2, children: [] }] }),
  );
});
```
> Match the existing test's `fakePb`/`create`/`update` mock shape — mirror how the other cases in this file construct them.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/worker/src/content/upsert-content.test.ts`
Expected: FAIL — `toc` missing on `ContentFields` type (typecheck) and/or not present on the create payload.

- [ ] **Step 3: Write minimal implementation**

In `apps/worker/src/content/upsert-content.ts`, add to the `ContentFields` interface (after `content_text`):
```ts
  toc: TocEntry[];
```
and update the import:
```ts
import type { SourceType, ExtractStatus, TocEntry } from "@readmepls/types";
```
(`upsertContent` already spreads `fields`, so no body change is needed.)

In `apps/worker/src/worker.ts`, add to the `upsertContent(pb, target, { ... })` object (after `content_text: result.contentText,`):
```ts
      toc: result.toc,
```

Create the migration `pocketbase/pb_migrations/1720200000_content_toc.js`:
```js
/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const content = app.findCollectionByNameOrId("content");
    content.fields.add(new Field({ name: "toc", type: "json" }));
    app.save(content);
  },
  (app) => {
    const content = app.findCollectionByNameOrId("content");
    content.fields.removeByName("toc");
    app.save(content);
  },
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/worker/src/content/upsert-content.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/content/upsert-content.ts apps/worker/src/content/upsert-content.test.ts apps/worker/src/worker.ts pocketbase/pb_migrations/1720200000_content_toc.js
git commit -m "feat(worker): persist toc to content collection"
```

---

### Task 5: Web client fallback `buildTocFromDom`

**Files:**
- Create: `apps/web/src/lib/reader/toc.ts`
- Test: `apps/web/src/lib/reader/toc.test.ts`

**Interfaces:**
- Consumes: `slugify`, `nestHeadings`, `makeIdDeduper`, `FlatHeading` from `@readmepls/core`; `TocEntry` from `@readmepls/types`.
- Produces: `buildTocFromDom(root: HTMLElement): TocEntry[]` — walks `root` for h1–h6, assigns slug ids to headings lacking one (mutating the live DOM so jump targets exist), and returns the nested tree.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/reader/toc.test.ts` (web vitest env is jsdom):
```ts
import { describe, it, expect } from "vitest";
import { buildTocFromDom } from "./toc.js";

function root(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("buildTocFromDom", () => {
  it("builds a nested tree from rendered headings", () => {
    const el = root("<h2>Alpha</h2><h3>Beta</h3><h2>Gamma</h2>");
    const tree = buildTocFromDom(el);
    expect(tree.map((n) => n.id)).toEqual(["alpha", "gamma"]);
    expect(tree[0]!.children.map((n) => n.text)).toEqual(["Beta"]);
  });

  it("writes ids back onto headings that lack them", () => {
    const el = root("<h2>Alpha</h2>");
    buildTocFromDom(el);
    expect(el.querySelector("h2")!.id).toBe("alpha");
  });

  it("keeps an existing id", () => {
    const el = root('<h2 id="keep">Alpha</h2>');
    const tree = buildTocFromDom(el);
    expect(tree[0]!.id).toBe("keep");
    expect(el.querySelector("h2")!.id).toBe("keep");
  });

  it("returns [] when there are no headings", () => {
    expect(buildTocFromDom(root("<p>nope</p>"))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/reader/toc.test.ts`
Expected: FAIL — cannot find module `./toc.js`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/reader/toc.ts`:
```ts
import { slugify, nestHeadings, makeIdDeduper, type FlatHeading } from "@readmepls/core";
import type { TocEntry } from "@readmepls/types";

/** Build a toc from already-rendered article HTML. Assigns slug ids to any
 *  heading missing one (mutating the DOM) so click-to-jump has a target. Used
 *  only when a content record carries no worker-emitted toc. */
export function buildTocFromDom(root: HTMLElement): TocEntry[] {
  const headings = [...root.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")];
  const dedupe = makeIdDeduper();
  const flat: FlatHeading[] = [];
  for (const h of headings) {
    const text = (h.textContent ?? "").trim();
    if (!text) continue;
    const level = Number(h.tagName[1]);
    let id = h.getAttribute("id");
    if (!id) {
      id = dedupe(slugify(text));
      h.setAttribute("id", id);
    }
    flat.push({ id, text, level });
  }
  return nestHeadings(flat);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/web/src/lib/reader/toc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/reader/toc.ts apps/web/src/lib/reader/toc.test.ts
git commit -m "feat(web): parse chapters from rendered article DOM as fallback"
```

---

### Task 6: `ChaptersSidebar` component (with collapsible subchapters)

**Files:**
- Generate: `apps/web/src/lib/components/ui/collapsible/` (shadcn-svelte CLI)
- Create: `apps/web/src/lib/components/ChaptersSidebar.svelte`
- Create: `apps/web/src/lib/components/ChapterList.svelte`
- Create: `apps/web/src/lib/components/ChapterGroup.svelte`
- Test: `apps/web/src/lib/components/ChaptersSidebar.test.ts`

**Interfaces:**
- Consumes: `TocEntry` (Task 1); `Collapsible` from `$lib/components/ui/collapsible`.
- Produces: `ChaptersSidebar` with props `{ toc: TocEntry[]; activeId?: string | null; onjump: (id: string) => void }`. Renders a `<nav aria-label="chapters">`; leaf entries are jump buttons; entries with children are collapsible (expanded by default, auto-expanded when they contain the active id).

- [ ] **Step 1: Add the shadcn-svelte Collapsible primitive**

Run: `pnpm dlx shadcn-svelte@latest add collapsible`
Expected: creates `apps/web/src/lib/components/ui/collapsible/` exporting `Collapsible.Root`, `Collapsible.Trigger`, `Collapsible.Content`. Commit this as its own step at the end (Step 6) alongside the components.

- [ ] **Step 2: Write the failing test**

`apps/web/src/lib/components/ChaptersSidebar.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ChaptersSidebar from "./ChaptersSidebar.svelte";
import type { TocEntry } from "@readmepls/types";

const toc: TocEntry[] = [
  { id: "intro", text: "intro", level: 2, children: [
    { id: "why", text: "why", level: 3, children: [] },
  ] },
  { id: "usage", text: "usage", level: 2, children: [] },
];

describe("ChaptersSidebar", () => {
  it("renders top-level chapters and nested subchapters", () => {
    render(ChaptersSidebar, { toc, activeId: null, onjump: vi.fn() });
    expect(screen.getByRole("navigation", { name: "chapters" })).toBeTruthy();
    expect(screen.getByText("intro")).toBeTruthy();
    expect(screen.getByText("usage")).toBeTruthy();
    // subchapter visible because groups are expanded by default
    expect(screen.getByText("why")).toBeTruthy();
  });

  it("emits the heading id on click", async () => {
    const onjump = vi.fn();
    render(ChaptersSidebar, { toc, activeId: null, onjump });
    await fireEvent.click(screen.getByText("usage"));
    expect(onjump).toHaveBeenCalledWith("usage");
  });

  it("marks the active chapter", () => {
    render(ChaptersSidebar, { toc, activeId: "usage", onjump: vi.fn() });
    expect(screen.getByText("usage").getAttribute("aria-current")).toBe("true");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/ChaptersSidebar.test.ts`
Expected: FAIL — cannot find `ChaptersSidebar.svelte`.

- [ ] **Step 4: Write the components**

`apps/web/src/lib/components/ChaptersSidebar.svelte`:
```svelte
<script lang="ts">
  import type { TocEntry } from "@readmepls/types";
  import ChapterList from "./ChapterList.svelte";
  let { toc, activeId = null, onjump }: {
    toc: TocEntry[];
    activeId?: string | null;
    onjump: (id: string) => void;
  } = $props();
</script>

<nav class="toc" aria-label="chapters">
  <ChapterList items={toc} {activeId} {onjump} />
</nav>

<style>
  .toc { font-family: var(--font-ui); font-size: var(--text-sm); }
  .toc :global(ul) { list-style: none; margin: 0; padding: 0; }
  .toc :global(ul ul) { margin-left: var(--space-3); }
</style>
```

`apps/web/src/lib/components/ChapterList.svelte`:
```svelte
<script lang="ts">
  import type { TocEntry } from "@readmepls/types";
  import ChapterGroup from "./ChapterGroup.svelte";
  let { items, activeId, onjump }: {
    items: TocEntry[];
    activeId: string | null;
    onjump: (id: string) => void;
  } = $props();
</script>

<ul>
  {#each items as node (node.id)}
    <li>
      {#if node.children.length > 0}
        <ChapterGroup {node} {activeId} {onjump} />
      {:else}
        <button
          class="link"
          class:active={node.id === activeId}
          aria-current={node.id === activeId ? "true" : undefined}
          onclick={() => onjump(node.id)}
        >{node.text}</button>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .link {
    display: block; width: 100%; text-align: left;
    min-height: 44px; padding: var(--space-2);
    background: none; border: none; border-left: 2px solid transparent;
    color: var(--color-text-muted); font: inherit; cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .link:hover { color: var(--color-text); }
  .link.active { color: var(--color-accent); border-left-color: var(--color-accent); }
  .link:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
</style>
```

`apps/web/src/lib/components/ChapterGroup.svelte`:
```svelte
<script lang="ts">
  import type { TocEntry } from "@readmepls/types";
  import ChapterList from "./ChapterList.svelte";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { ChevronRight } from "@lucide/svelte";

  let { node, activeId, onjump }: {
    node: TocEntry;
    activeId: string | null;
    onjump: (id: string) => void;
  } = $props();

  const containsActive = (n: TocEntry): boolean =>
    n.id === activeId || n.children.some(containsActive);

  // Expanded by default; force-open when the active heading is inside.
  let open = $state(true);
  $effect(() => { if (containsActive(node)) open = true; });
</script>

<Collapsible.Root bind:open>
  <div class="row">
    <button
      class="link"
      class:active={node.id === activeId}
      aria-current={node.id === activeId ? "true" : undefined}
      onclick={() => onjump(node.id)}
    >{node.text}</button>
    <Collapsible.Trigger class="toggle" aria-label={`toggle ${node.text} subchapters`}>
      <ChevronRight class="icon-sm chevron" data-open={open} aria-hidden="true" />
    </Collapsible.Trigger>
  </div>
  <Collapsible.Content>
    <ChapterList items={node.children} {activeId} {onjump} />
  </Collapsible.Content>
</Collapsible.Root>

<style>
  .row { display: flex; align-items: center; gap: var(--space-1); }
  .link {
    flex: 1; text-align: left; min-height: 44px; padding: var(--space-2);
    background: none; border: none; border-left: 2px solid transparent;
    color: var(--color-text-muted); font: inherit; cursor: pointer;
    border-radius: var(--radius-sm);
  }
  .link:hover { color: var(--color-text); }
  .link.active { color: var(--color-accent); border-left-color: var(--color-accent); }
  .link:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .toggle {
    display: inline-flex; align-items: center; justify-content: center;
    width: 44px; height: 44px; background: none; border: none;
    color: var(--color-text-muted); cursor: pointer;
  }
  .toggle:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .chevron { transition: transform var(--dur-fast) var(--ease-out); }
  .chevron[data-open="true"] { transform: rotate(90deg); }
  @media (prefers-reduced-motion: reduce) { .chevron { transition: none; } }
</style>
```

> Note the shadcn-svelte import style is `import * as Collapsible from "$lib/components/ui/collapsible"`, then `<Collapsible.Root>` etc. If the generated index re-exports differently, match whatever `apps/web/src/lib/components/ui/collapsible/index.ts` exports.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/web/src/lib/components/ChaptersSidebar.test.ts && pnpm typecheck`
Expected: PASS. If the collapsible content is not rendered into the DOM while closed in jsdom, the "renders subchapters" assertion still holds because groups default to `open = true`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/ui/collapsible apps/web/src/lib/components/ChaptersSidebar.svelte apps/web/src/lib/components/ChapterList.svelte apps/web/src/lib/components/ChapterGroup.svelte apps/web/src/lib/components/ChaptersSidebar.test.ts
git commit -m "feat(web): add collapsible chapters sidebar component"
```

---

### Task 7: Wire chapters into the reader page

**Files:**
- Modify: `apps/web/src/routes/read/[id]/+page.svelte`
- Test: `apps/web/src/routes/read/[id]/page.test.ts` (extend)

**Interfaces:**
- Consumes: `buildTocFromDom` (Task 5), `ChaptersSidebar` (Task 6), `TocEntry` (Task 1), existing `Sheet` (`$lib/components/ui/Sheet.svelte`) and `Rail`.
- Produces: reader UI that resolves the toc (stored-then-fallback), tracks the active heading via `IntersectionObserver`, renders chapters in the desktop `Rail` and a mobile `Sheet`, and hides all chapter UI when the toc is empty.

- [ ] **Step 1: Write the failing test**

Extend `apps/web/src/routes/read/[id]/page.test.ts`. Follow the file's existing mock setup for `browserPb` / article fetch (mirror an existing test in that file). Add a case: given a content record whose `content_html` contains headings (and empty/absent `toc`), after mount the sidebar lists a chapter.
```ts
it("shows a chapters sidebar built from article headings", async () => {
  // Arrange the mocked article/content so content_html includes:
  //   "<h2>First Chapter</h2><p>...</p><h2>Second Chapter</h2>"
  // and content.toc is undefined (legacy fallback path).
  render(Page); // however this file renders the reader page
  expect(await screen.findByRole("navigation", { name: "chapters" })).toBeTruthy();
  expect(screen.getByText("First Chapter")).toBeTruthy();
});
```
> Reuse the existing test's harness verbatim for mounting and PB mocking — do not invent a new one. If the file already fabricates a content record, extend that fixture's `content_html` with the two headings above.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run "apps/web/src/routes/read/[id]/page.test.ts"`
Expected: FAIL — no `navigation` with name "chapters".

- [ ] **Step 3: Add script state + toc resolution + scroll-spy**

In `apps/web/src/routes/read/[id]/+page.svelte` `<script>`:

Imports:
```ts
  import ChaptersSidebar from "$lib/components/ChaptersSidebar.svelte";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import { buildTocFromDom } from "$lib/reader/toc.js";
  import { TocEntry } from "@readmepls/types";
```
State (near the other `$state` declarations):
```ts
  let toc = $state<TocEntry[]>([]);
  let activeHeadingId = $state<string | null>(null);
  let mobileTocOpen = $state(false);
  let tocObserver: IntersectionObserver | null = null;
```
Helpers:
```ts
  // Prefer the worker-emitted toc (validated); fall back to parsing the DOM.
  function resolveToc() {
    const parsed = TocEntry.array().safeParse(content?.toc);
    toc = parsed.success && parsed.data.length ? parsed.data : buildTocFromDom(bodyEl);
  }

  function observeHeadings() {
    const headings = bodyEl.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6");
    if (headings.length === 0) return;
    tocObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting && e.target.id) activeHeadingId = e.target.id;
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    headings.forEach((h) => tocObserver!.observe(h));
  }

  function jumpToHeading(id: string) {
    bodyEl.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    mobileTocOpen = false;
  }
```
In `onMount`, after `resolveInitialScroll();` (which runs post-`tick()`), add:
```ts
    resolveToc();
    observeHeadings();
```
In `onDestroy` (add one if absent, next to the existing scroll listener cleanup), disconnect:
```ts
    tocObserver?.disconnect();
```
> The reader already removes its `scroll`/`visibilitychange` listeners on teardown — add the observer disconnect in the same place.

- [ ] **Step 4: Add the markup**

In the template, inside `<Rail label="reading tools">`, add a chapters section as the first child (desktop-only via CSS):
```svelte
        {#if toc.length}
          <section class="rail-chapters" aria-label="chapters">
            <h2 class="rail-heading">chapters</h2>
            <ChaptersSidebar {toc} activeId={activeHeadingId} onjump={jumpToHeading} />
          </section>
        {/if}
```
Add a mobile trigger in the existing top `.bar` (the row with the back link), after the back link:
```svelte
        {#if toc.length}
          <button class="toc-trigger" onclick={() => (mobileTocOpen = true)}>chapters</button>
        {/if}
```
Add the mobile Sheet near the other top-level overlays (next to `ConfirmDialog`):
```svelte
<Sheet open={mobileTocOpen} onClose={() => (mobileTocOpen = false)} title="chapters">
  <ChaptersSidebar {toc} activeId={activeHeadingId} onjump={jumpToHeading} />
</Sheet>
```
Add styles in the page `<style>`:
```css
  .rail-heading { font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-text-muted); margin: 0 0 var(--space-2); }
  /* Chapters live in the Rail on desktop; on mobile they move into the Sheet. */
  .rail-chapters { display: none; }
  .toc-trigger {
    display: inline-flex; align-items: center; min-height: 44px; padding: 0 var(--space-2);
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-md); color: var(--color-text-muted);
    font-family: var(--font-ui); font-size: var(--text-sm); cursor: pointer;
    margin-left: auto;
  }
  .toc-trigger:hover { color: var(--color-accent); }
  @media (min-width: 1024px) {
    .rail-chapters { display: block; }
    .toc-trigger { display: none; }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run "apps/web/src/routes/read/[id]/page.test.ts" && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Full suite + manual smoke**

Run: `pnpm test`
Expected: whole workspace green.

Manual (optional but recommended): start PocketBase + web dev server, open a long article (e.g. a Wikipedia capture), confirm: chapters list in the left rail on desktop, active chapter highlights on scroll, subchapters collapse/expand, mobile "chapters" button opens the drawer and jumping closes it, and an article with no headings shows no chapters UI.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/routes/read/[id]/+page.svelte" "apps/web/src/routes/read/[id]/page.test.ts"
git commit -m "feat(web): render chapters sidebar and scroll-spy in reader"
```

---

## Post-implementation

- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm lint` — all green.
- [ ] Use `superpowers:finishing-a-development-branch` to squash and integrate `feat/chapters-sidebar`.
- [ ] Delete this plan and the paired spec (`docs/superpowers/specs/2026-07-23-chapters-sidebar-design.md`) once merged, per the working agreements.

## Self-review notes (coverage check)

- Data model (spec §Data model) → Task 1 + Task 4 (migration).
- Extractor-emitted toc + id injection (spec §Extractor) → Tasks 2, 3, 4.
- Client-parse fallback (spec §Reader client) → Task 5, wired in Task 7.
- ChaptersSidebar, collapsible subchapters, jump, scroll-spy (spec §Reader client) → Tasks 6, 7.
- Desktop Rail slot / mobile Sheet / hide-when-empty (spec §Layout) → Task 7.
- Styling via tokens, mobile 44px (spec §Styling) → Tasks 6, 7.
- Testing matrix (spec §Testing) → tests in Tasks 1, 2, 3, 5, 6, 7.
