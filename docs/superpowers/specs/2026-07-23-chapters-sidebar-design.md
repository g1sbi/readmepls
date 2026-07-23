# Chapters Sidebar (Table of Contents) — Design Spec

**Date:** 2026-07-23
**Status:** Approved, pending implementation
**Branch:** `feat/chapters-sidebar` (git worktree)

## Goal

Give long-form articles a stylized chapters sidebar. It lists the article's
headings, lets the reader click to jump between them, nests deeper headings as
collapsible subchapters, and highlights the chapter currently in view as you
scroll. It stays out of the way on articles with no structure (X/Twitter,
YouTube, short posts).

## Non-goals

- Editing/reordering the TOC.
- Persisting collapse state across sessions.
- Backfilling/re-extracting existing content (legacy articles use the
  client-parse fallback instead).
- TOC for non-article sources that lack headings (they get an empty TOC and no
  sidebar).

## Sourcing decision

Chapters come from **two** cooperating sources:

1. **Extractor-emitted TOC (rich, forward path).** On capture, the worker
   produces a structured heading tree stored on the `content` record, with
   stable ids injected into the article HTML.
2. **Client-parse fallback (universal, retroactive).** When a `content` record
   has no stored TOC (everything captured before this ships), the reader walks
   the rendered article DOM to build the same tree live. No re-extraction.

Both produce the identical `TocEntry` shape, so the reader renders them the same
way.

## Data model

Package: `packages/types`.

New recursive type + Zod schema (`packages/types/src/content.ts` or a new
`toc.ts` re-exported from the package index):

```ts
type TocEntry = {
  id: string;        // slug id, matches an id on a heading element in content_html
  text: string;      // heading text content, trimmed
  level: number;     // original heading level 1..6
  children: TocEntry[];
};
```

- Add `toc: TocEntry[]` (Zod, `.default([])`) to the `Content` schema.
- Add the same `toc` field to `ExtractResult` (`packages/types/src/extract.ts`),
  defaulting to `[]` so extractors that produce no headings validate cleanly.
- Zod handles the recursion via `z.lazy(...)`.

PocketBase migration (new file under `pocketbase/pb_migrations/`): add a `toc`
`json` field to the `content` collection. Nullable/optional; existing rows read
back as empty. No rule changes — `content` stays worker-writable,
authenticated-readable.

## Extractor (worker)

### `buildToc` — pure core function

New pure function in `@readmepls/core` (e.g.
`packages/core/src/toc/build.ts`), signature:

```ts
buildToc(html: string): { html: string; toc: TocEntry[] }
```

Behavior:

- Parse `h1`–`h6` in document order.
- For each heading, generate an id from its text via the existing
  `slugify` (`@readmepls/core`). Deduplicate collisions deterministically
  (e.g. append `-2`, `-3`).
- **Inject the generated id** onto each heading element in the returned HTML
  (`<h2 id="...">`). If a heading already has an id, keep it and use it in the
  tree.
- Build a nested tree by heading level: the **shallowest level present** in the
  document becomes the top-level chapters; deeper levels nest as `children`.
  Handle skipped levels gracefully (e.g. an `h2` followed directly by an `h4`
  nests the `h4` under the `h2`, no phantom `h3` node).
- Empty/heading-less input → `{ html: <unchanged>, toc: [] }`.

Pure and deterministic — tested in isolation with fixtures, no network.

### Pipeline wiring

In `apps/worker/src/extract/parse-article.ts`, run `buildToc` **after**
`sanitizeContentHtml`. Because ids are generated and injected by our own code
(not carried from untrusted source HTML), we do **not** loosen the sanitizer's
attribute allowlist. Store `buildToc`'s returned `html` as `content_html` and
its `toc` on the extract result.

All extractors funnel through the shared sanitize/parse path, so X, YouTube, and
archive fallbacks automatically get `toc: []` when they have no headings.

## Reader client (`apps/web`)

### Fallback: `buildTocFromDom`

New function (e.g. `apps/web/src/lib/reader/toc.ts`):

```ts
buildTocFromDom(root: HTMLElement): TocEntry[]
```

- Walk `root.querySelectorAll("h1,h2,h3,h4,h5,h6")`.
- Assign `slugify` ids to headings lacking one (same dedup rule as `buildToc`),
  mutating the live DOM so jump targets exist.
- Build the identical nested tree.

Used only when `content.toc` is empty. When `content.toc` is present, the
injected ids already exist in the rendered HTML, so the reader uses the stored
tree directly.

### `ChaptersSidebar.svelte` (feature component)

- Renders the nested `TocEntry[]` tree.
- Subchapters are **collapsible**, using the shadcn-svelte `Collapsible`
  primitive (add via `pnpm dlx shadcn-svelte@latest add collapsible`), **expanded
  by default**.
- Clicking an entry scrolls its heading into view
  (`scrollIntoView({ behavior: "smooth", block: "start" })`), mirroring the
  existing `jumpTo` pattern in the reader page.
- Accepts the tree + an active-id as props/state; emits jump events. Composes UI
  primitives, no direct `bits-ui` imports.

### Scroll-spy (active chapter)

- An `IntersectionObserver` over the heading elements inside `bodyEl` maintains
  an "active heading id" store.
- The sidebar highlights the active chapter (terracotta accent token) and
  auto-expands its parent chapter if the active heading is a subchapter.
- Observer is created after `await tick()` (post-`{@html}` render) and torn down
  on unmount, alongside the existing highlight-render lifecycle.

### Layout

- **Desktop (≥1024px):** a sticky section inside the existing left `Rail`
  ("reading tools"). No new grid column, no `--width-reader` change.
- **Mobile / <1024px:** the same tree rendered inside a slide-in `Sheet` drawer,
  opened by a "chapters" button placed in the Rail. Full-width reading column
  preserved.
- **Empty TOC:** when the resolved TOC has zero entries, neither the desktop
  section nor the mobile button/drawer renders.

### Styling

- All colors/fonts/spacing via `tokens.css` — no hardcoded values in the
  component. Active state uses the terracotta accent token.
- Mobile-first: tap targets ≥44px, no horizontal overflow at 360px, long
  heading text wraps/truncates gracefully.

## Testing (TDD — failing test first for each unit)

- **core `buildToc`** (fixtures, offline): nested headings; slug collisions;
  skipped levels (h2→h4); already-present ids preserved; empty/heading-less
  input.
- **client `buildTocFromDom`** (jsdom fixture): same cases, plus verifies ids
  are written back onto DOM headings.
- **types**: `Content` Zod schema parses a record with and without `toc`;
  recursion validates a multi-level tree.
- **extractor**: `parse-article` fixture now yields a populated `toc` and
  matching `id` attributes in `content_html`.
- **component `ChaptersSidebar.svelte`**: renders the tree; collapse toggle
  shows/hides children; clicking emits the correct jump target; active-id prop
  highlights the right entry and expands its parent.

## Isolation / workflow

- Implement in a git worktree on branch `feat/chapters-sidebar` (via the
  `using-git-worktrees` skill at implementation start).
- TDD throughout; small Conventional Commits; squash before merge.

## File touchpoints (summary)

- `packages/types/src/content.ts` (+ maybe `toc.ts`), `extract.ts`, index export.
- `packages/core/src/toc/build.ts` (new) + index export; reuse `slugify`.
- `apps/worker/src/extract/parse-article.ts` (wire `buildToc`).
- `pocketbase/pb_migrations/<ts>_content_toc.js` (new migration).
- `apps/web/src/lib/reader/toc.ts` (new, `buildTocFromDom`).
- `apps/web/src/lib/components/ui/collapsible/` (shadcn-svelte, generated).
- `apps/web/src/lib/components/reader/ChaptersSidebar.svelte` (new; location to
  match existing reader feature-component convention).
- `apps/web/src/routes/read/[id]/+page.svelte` (resolve TOC, scroll-spy,
  Rail section, mobile Sheet button).
- Test files paired with each of the above.
