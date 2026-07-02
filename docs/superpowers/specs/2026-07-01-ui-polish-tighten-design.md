# UI polish & tighten pass — design

**Date:** 2026-07-01
**Status:** approved (design), pending spec review
**Scope:** frontend only (`apps/web`). No backend, worker, or schema changes.

## Goal

The app is functional and the design language is defined, but the execution is
unpolished. Keep the playful warm-paper language — just tighten it: quiet the
chrome so the brand pops, make spacing/type consistent, and fix specific UX
rough edges (redundant controls, wasted width on large screens).

This is a polish pass, **not** the Phase-3 design phase and **not** a feature
phase. No new features; no palette/motif redesign.

## Direction (decided)

- **Fonts:** Fredoka is reserved for the **`readmepls` wordmark only**. All other
  UI (nav, buttons, chips, headings, meta, forms) moves to a single quiet UI font,
  **IBM Plex Sans** — the humanist sibling of the IBM Plex Mono already used for
  code. Newsreader continues to own the article body.
- **Palette:** values **and** usage unchanged. All "subtle" comes from the font
  swap plus spacing/type consistency.
- **Not in scope:** radii, shadows, and motion are left as-is (no restraint
  dial-back was requested). No landing-page redesign.

---

## 1. Design-language tightening

### 1.1 Fonts

**`tokens.css`**
- Add a new semantic family token:
  ```css
  --font-ui: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  ```
- Keep `--font-display` (Fredoka) defined. After this pass it is referenced by
  the wordmark only.
- `--font-reading` (Newsreader) and `--font-mono` (Plex Mono) unchanged.

**`fonts.css`**
- Add `@font-face` for IBM Plex Sans, self-hosted woff2 under `/fonts/` (same
  convention as the existing families). Prefer the variable font
  (`ibm-plex-sans-variable.woff2`, `font-weight: 400 600`); if a variable build
  isn't readily available, ship static 400/500/600. `font-display: swap`.
- Update the header comment to list Plex Sans as the UI family.
- **Task note:** the woff2 file(s) must be added to the web app's static
  `fonts/` directory alongside the existing ones.

**Component repoint** — change every `font-family: var(--font-display)` to
`var(--font-ui)`, **except** the wordmark. Known references (verify exhaustively
during implementation, don't trust this list to be complete):
- `TopBar.svelte`: nav links, `.search input`, `.themes button`, `.signout`.
  **Keep** `.brand` on `--font-display`.
- `Button.svelte`, `Chip.svelte`.
- `CaptureBar.svelte` error text.
- `+page.svelte` (home): `.block h2`, `.more`. **Hero `h1`** → `--font-ui`
  (see 1.2).
- `library/+page.svelte`: `h1`, `.collections-heading`, `.empty p`, form inputs,
  action buttons.
- `search/+page.svelte`: `h1`, `.status`, `.empty`, `.result h2`.
- `read/[id]/+page.svelte`: `.bar .back`. See 1.3 for the article `<h1>`.
- Any other component surfaced by a repo-wide grep for `--font-display`.

### 1.2 Article title & hero — the two judgment calls (both approved)

- **Article `<h1>`** (`read/[id]` `.reader :global(h1)`) moves from
  `--font-display` to `--font-reading` (Newsreader). The reading surface becomes
  one cohesive serif world rather than a Fredoka title over serif body.
- **Home hero** `h1` ("save any link. actually read it.") moves to `--font-ui`,
  honoring "Fredoka = wordmark only". This is called out explicitly as the one
  place a future Fredoka display exception might be reconsidered; for this pass
  it follows the rule.

### 1.3 Type-size consistency

Page titles use three different sizes today (`1.6rem`, `--text-xl`, a `clamp()`).
Standardize:
- **Page title** (`h1` chrome: library, search, collections): `--text-xl`,
  `--weight-semibold`, `--color-text`.
- **Section heading** (`h2`: "recently saved", "working on it", "collections"):
  `--text-lg`, `--weight-medium`, `--color-text-muted`.
- **Home hero** `h1`: may stay larger (`--text-2xl`/`--text-3xl`) since it is a
  marketing headline, now in `--font-ui`.

No new size tokens — reference the existing `--text-*` scale.

### 1.4 Spacing consistency

Snap hardcoded rem paddings/gaps to the 4px space scale. No new spacing values
invented; every value maps to an existing `--space-*` token. Examples:
- `TopBar` `padding: 0.75rem 1.25rem` → `var(--space-3) var(--space-5)`.
- `Card` `padding: 1.1rem 1.2rem` → `var(--space-4)`.
- `CardGrid` `gap: 1rem` → `var(--space-4)`; ad-hoc `0.4rem`/`0.6rem`/`0.9rem`
  gaps → nearest scale token.

Where a hardcoded value has no clean scale equivalent and changing it would shift
layout meaningfully, prefer the nearest token and verify visually rather than
preserving the odd value.

---

## 2. Route / nav hygiene

- **Remove the `extract` nav link** from `TopBar.svelte`. The brand/home link
  already routes to `/`, which *is* the capture page. Nav becomes a single
  `library` link. No route is deleted.
- **Library empty state** copy in `library/+page.svelte`:
  "paste a link on the `<a href="/">extract page</a> ☝`" →
  "paste a link on your `<a href="/">home page</a> ☝`" (wording only; keep the
  paper-corner motif and lowercase voice).

---

## 3. ArticleCard

**File:** `lib/components/ArticleCard.svelte` (+ its `.test.ts`, + call sites in
home `+page.svelte` and `library/+page.svelte`).

- The whole card becomes the click target: wrap the card content in
  `<a href="/read/{article.id}">` for the ready state. Remove the "read" button
  and its `BookOpen` icon.
- Inner interactive controls (delete button; retry button on failed/partial)
  call `stopPropagation` / are structured so they don't trigger the card link.
  (An `<a>` cannot contain a `<button>` — use a link-overlay pattern: the anchor
  is a positioned overlay covering the card, with the delete/retry controls
  layered above it at a higher z-index. Confirm keyboard focus order: card link
  focusable, then its action controls.)
- **Delete** icon: hidden at rest, revealed on card `:hover` and
  `:focus-within` (keyboard). Always visible where hover is unavailable
  (`@media (hover: none)`).
- **Retry** (failed/partial): stays an always-visible inline `Button`.
- **Processing** state (spinner + host): not a link (nothing to open yet),
  unchanged behavior.
- **Props:** `onOpen` is removed (navigation is now the anchor's `href`).
  `onRetry` and `onDelete` stay. Update both call sites to drop the
  `onOpen={(id) => goto(...)}` wiring.
- **Tests:** update `ArticleCard.test.ts` — assert the card is a link to
  `/read/{id}`, the read button is gone, delete is reachable, retry still fires
  on failed/partial. Follow TDD: adjust/extend the failing tests first.

---

## 4. Reader — wide-screen layout

**File:** `read/[id]/+page.svelte`, `ReaderControls.svelte` (control set is
reshaped), + `page.test.ts`, `ReaderControls.test.ts`.

### 4.1 `ReaderControls` — drop the theme selector
- Remove the three theme buttons (`light` / `dark` / `sepia`) and the separator
  from `ReaderControls.svelte`. Theme is already controlled from the `TopBar`
  header; it's redundant here. The control set becomes **size − / size + / font**
  only.
- `savePrefs` in the reader keeps persisting `reader_prefs` and the theme→context
  sync stays wired (TopBar drives theme); only the reader's *UI* for theme is
  removed. The `themeCtx` sync path in `savePrefs` becomes dead for the theme
  field — simplify it accordingly (size/font still persist).
- Update `ReaderControls.test.ts`: assert no theme buttons; size/font still emit.

### 4.2 Remove the dog-ear from the reader
- Drop the `PaperCorner` from the reader `.bar` (the `<PaperCorner size={36} />`).
  The reader detail should read clean; the dog-ear motif stays elsewhere
  (library empty state, etc.).

### 4.3 Article actions — grouped & standardized
- Today **archive** is a pill `<Button>` with a label and **delete** is a bare
  icon button — inconsistent. Standardize: both become the **same** treatment,
  grouped together in one action cluster (consistent icon-button styling, equal
  hit area, shared spacing). Keep accessible labels (`aria-label`, or icon +
  visually-hidden text). This cluster lives in the left rail on wide screens.

### 4.4 Wide (≥1024px): three columns — left rail · article · right rail
- **Left sticky rail:** reading controls (size / font) at top, then the tag
  editor and add-to-collection, then the grouped archive/delete cluster (§4.3).
  These are the controls + actions that today live in the top `.bar` and stacked
  under the article.
- **Center:** the article (`--reading-*` tokens, Newsreader).
- **Right sticky rail:** highlights (`HighlightsSidebar`), as today.
- **Top `.bar`** shrinks to just the `← library` back link. No dog-ear, no
  archive/delete pill.

Grid: extend the existing `.reader-layout` grid. Today it is
`minmax(0,1fr) 16rem` at ≥1024px. New: `<left-rail> minmax(0,1fr) <right-rail>`
(e.g. `14rem minmax(0,1fr) 16rem`), both rails `position: sticky; top`.
`.reader-shell` already widens to `--width-page` at that breakpoint.

### 4.5 Narrow (<1024px): stacked, tags/collections up top — not at the bottom
- Left rail collapses. Reading controls render as the horizontal strip under the
  back link (today's sticky pill behavior). **The tag editor, add-to-collection,
  and the archive/delete cluster move to a compact section directly below the
  controls strip — above the article — not stacked at the bottom** (current
  behavior buries add-tag/add-collection under the whole article; that is the
  thing being fixed). Highlights stack below the article (as today).
- The same components render in both layouts — only their placement changes via
  CSS grid/flow. Avoid duplicating markup for the two breakpoints.

---

## 5. Library — wide-screen layout

**File:** `library/+page.svelte` (+ `page.test.ts`, `tag-filter.test.ts`).

### Wide (≥1024px): left sidebar · grid
- **Left sticky sidebar:** the tag filter (`all` + tag chips) at top, then the
  collections panel (§5.1) below it.
- **Right:** the article grid (`CardGrid`), free to use more columns at width.
- Reuse the same rail styling as the reader (see §6) so the two pages read as one
  system.

### Narrow (<1024px): today's arrangement
- Sidebar collapses to the top tag-rail; the collections panel returns to a
  stacked section below the grid. Same components, CSS-driven placement.

The tag-filter and collections *logic* (selection, rename, create, delete) is
unchanged — placement moves and the collections *presentation* is reworked
(§5.1).

### 5.1 Collections — first-class nav list (rework)

Today collections render as tiny `Chip`s with even smaller always-on
pencil/trash icons, plus a bare-underline "new collection" input. Replace with a
proper nav list:

- **Section header:** a clear "collections" label distinct from the tag filter,
  so collections never read as part of tags.
- **Each collection is a full-width row**, the whole row a link to
  `/collections/{slug}`:
  - Leading **folder icon** (`@lucide/svelte` `Folder`), standardized to
    `--icon-sm`/`--icon-md` — a consistent marker, not an afterthought.
  - Collection **name** prominent (`--font-ui`, `--text-sm`/`--text-md`,
    `--color-text`).
  - **Rename + delete** actions reveal on row `:hover` / `:focus-within` (and are
    always shown under `@media (hover: none)`) — same calm hover-reveal pattern as
    the article cards (§3), replacing the tiny always-on icons.
- **Rename** still swaps the row for the inline edit form (existing behavior),
  now styled as a proper input, not a bare underline.
- **"+ new collection"**: a single button at the bottom of the list. Clicking it
  expands an inline input + create button (proper `Input`/`Button` primitives,
  not a bare underline). The existing duplicate-name error (`collectionError`)
  renders under the input. Collapse back to the button after create/cancel.
- **Reuse UI primitives** (`Input`, `Button`, and a shared row style) rather than
  bespoke markup; keep `slugify`, create/rename/delete logic and the injection-safe
  `pb.filter` bindings exactly as they are.
- **Consider extracting** a `CollectionsPanel.svelte` so the library page stays
  focused and the list is unit-testable in isolation (small, single-purpose file).
- **Tests:** cover row-is-link-to-slug, folder icon present, rename flow,
  create-via-expanding-input, duplicate-name error, delete. Update
  `library/page.test.ts` (or a new `CollectionsPanel.test.ts`) TDD-first.

---

## 6. Component polish

- **Shared rail primitive:** extract the sticky-rail styling (sticky position,
  internal spacing, section dividers) so the reader left rail and library sidebar
  share it rather than duplicating CSS. Small `$lib/components/ui` addition (e.g.
  `Rail.svelte` or a shared class) — keep it minimal and token-driven.
- **Alignment/spacing normalization** across `Button`, `Card`, `Chip`,
  `CaptureBar`, and search results: consistent gaps, aligned baselines,
  token-driven padding (per §1.4). No behavioral change.
- Keep all existing focus-visible outlines, reduced-motion guards, and grain
  overlays intact.

---

## Testing

- **TDD throughout** (per repo agreement). For each component with a `.test.ts`
  (`ArticleCard`, reader `page.test.ts`, library `page.test.ts`,
  `tag-filter.test.ts`, `primitives.test.ts`), adjust the failing test first,
  then implement.
- ArticleCard: card-is-link, no read button, delete reachable, retry on
  failed/partial.
- Reader/library: existing behavior tests must still pass after the layout
  refactor (controls change theme/size/font; tag filter; collection CRUD).
- No new integration/E2E scope; this is presentational.
- Run the full `apps/web` vitest suite and the linter before claiming done.

## Non-goals

- No palette value or usage changes.
- No radii / shadow / motion changes.
- No new features, routes, or backend/worker/schema changes.
- No landing-page redesign (Phase 3 owns that).
- Reading font unchanged except the article `<h1>` moving to Newsreader.

## Open judgment calls (both resolved for this pass)

1. **Article `<h1>` → Newsreader** — approved.
2. **Home hero → Plex Sans** (Fredoka = wordmark only) — approved; noted as a
   spot to potentially revisit if the hero later wants a display exception.
