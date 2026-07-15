# Collections Surface on the Library — Design

**Date:** 2026-07-15
**Status:** Approved, ready for planning
**Branch:** feat/collections-on-library

## Problem

Creating a collection is only reachable inside the library's **filter drawer**
(`LibraryToolbar` "filters" → `FilterDrawer` → `CollectionsPanel` → "new
collection"). Collection management is conflated with filtering: a create action
is buried behind a control whose job is narrowing the list. Users report there is
"literally not one button to create a collection" anywhere obvious in the UI.

This lands on top of the shipped "collections on the library" work (folder strip,
`/collections` index, `CollectionFolder` tile, per-collection counts) — it does
not replace it; it promotes creation + browsing to a first-class surface on
desktop.

## Goal

Promote collection **create + browse** to an always-present section at the top of
the library on desktop, decoupled from filtering. Leave mobile behavior exactly
as it is today.

## Non-goals

- No change to collection filtering (the `collections` filter-chip fieldset in
  `FilterDrawer` stays put on both viewports).
- No change to the `/collections` index page or the `CollectionFolder` tile.
- No change to per-collection counts or the core `fetchCollections` data path.
- No new rename/delete surface on desktop — those stay in the drawer panel.
- No visual redesign of tiles; reuse existing `CollectionFolder`.

## Breakpoint

**640px** — the existing mobile/desktop boundary used by `BottomNav`
(`@media (max-width: 640px)` shows the bottom nav). Desktop = `>640px`,
mobile = `≤640px`. Reuse this exact value; do not introduce a new breakpoint.

## Architecture

### 1. New component: `apps/web/src/lib/components/LibraryCollections.svelte`

Owns the library's entire collection surface. Renders **one** tile list so
screen readers and tests see each collection once (no desktop/mobile DOM
duplication); presentation is switched purely by CSS media query.

**Props:**

```ts
{
  collections: { id: string; name: string; slug: string; count: number }[];
  error?: string;
  onCreate: (name: string) => void;
}
```

**Local state:** `creating: boolean`, `draft: string` — mirrors the create
pattern already in `CollectionsPanel.svelte` (reveal input on click, trim,
submit, call `onCreate`, reset).

**Structure (single DOM, CSS-toggled):**

- A `collections` heading (`<h2>`), styled hidden on mobile.
- A tiles container that renders `CollectionFolder` per collection.
- An inline create control: a "+ new collection" button that reveals an
  `Input` + create `Button`; shows `error` (role="alert") when present. Styled
  hidden on mobile.
- An empty-state block (shown only when `collections.length === 0`): a short
  hint line alongside the create prompt. Hidden on mobile (mobile empty = no
  footprint).

**Responsive CSS (640px):**

- **Desktop (`min-width: 641px`):** heading + create control visible; tiles
  container is a wrapping grid (`flex-wrap: wrap`, like the `/collections`
  index grid). Section always occupies the top of the library, even with zero
  collections (header + hint + create prompt).
- **Mobile (`max-width: 640px`):** heading, create control, and empty-state
  hidden. Tiles container becomes a horizontal-scroll strip
  (`overflow-x: auto`, `flex: none` children) — byte-for-byte the current
  `.folder-strip` behavior. With zero collections the section renders nothing
  visible and collapses to no vertical footprint (no padding/margin that would
  leave a blank band).

Reference the current strip CSS in `library/+page.svelte` (`.folder-strip`) for
the mobile presentation; reference the `/collections` `+page.svelte`
`.folder-grid` for the desktop grid. Token-driven only — no hardcoded colors or
fonts (per CLAUDE.md), reuse `--space-*`, `--font-ui`, `--color-*`,
`--color-accent`, matching `CollectionsPanel`'s create-control styling for the
button/error.

### 2. `apps/web/src/routes/library/+page.svelte`

Replace the inline strip block:

```svelte
{#if data.facets.collections.length}
  <nav class="folder-strip" aria-label="collections"> … </nav>
{/if}
```

with:

```svelte
<LibraryCollections
  collections={data.facets.collections}
  error={collectionError}
  onCreate={createCollection}
/>
```

Remove the now-unused `.folder-strip` CSS from the page. Keep the existing
`CollectionFolder` import only if still referenced elsewhere on the page
(it is not after this change — move the import into `LibraryCollections`).
`FilterDrawer` continues to receive `onCreateCollection`, `onRenameCollection`,
`onDeleteCollection` unchanged (mobile still creates in the drawer).

### 3. `apps/web/src/lib/components/CollectionsPanel.svelte`

The create control (the `{#if creating} … {:else} new collection button {/if}`
block, plus its create-specific error) is **hidden on desktop** and shown on
mobile — create now lives in `LibraryCollections` on desktop. Rename/delete rows
stay visible on both viewports. Simplest mechanism: wrap the create block in an
element (or add a class) with `@media (min-width: 641px) { display: none }`. The
`oncreate` prop and local create state remain (mobile uses them); no prop
signature change. The `collections` filter-chip fieldset lives in
`FilterDrawer`, not this panel — untouched.

## Data flow

Unchanged. `library/+page.server.ts` → `fetchFacetOptions` → `data.facets.collections`
(`{id,name,slug,count}[]`). `LibraryCollections` is presentational; create/rename/
delete handlers stay in `+page.svelte` (`createCollection`, `renameCollection`,
`deleteCollection`) writing via `browserPb()` then `invalidateAll()`, exactly as
today. `collectionError` state is shared and passed to both `LibraryCollections`
(desktop create) and `CollectionsPanel` (mobile create); only one create UI is
visible per viewport, so only one surfaces the error.

## Error handling

Reuse existing behavior: `createCollection` sets `collectionError` on failure and
clears it on a new attempt (current `+page.svelte` logic). `LibraryCollections`
renders `error` beside its create control with `role="alert"`, matching
`CollectionsPanel`.

## Testing (TDD)

**New:** `apps/web/src/lib/components/librarycollections.test.ts`
- Renders the `collections` heading (always present, even with zero collections).
- Renders one `CollectionFolder` link per collection → `href="/collections/{slug}"`
  showing the count.
- Create flow: click "+ new collection" reveals the input; typing + submit calls
  `onCreate` with the trimmed name; blank submit does not call `onCreate`.
- Empty state (`collections: []`): heading + create prompt/hint present, no tile
  links.

**Updated:** `apps/web/src/routes/library/page.test.ts`
- The existing "manages collections from within the filter drawer" test stays
  green: create in the drawer still works on mobile (jsdom ignores media queries,
  so the drawer create control is still in the DOM). Drawer queries remain
  scoped to `role="dialog"`.
- The existing folder-strip tests ("renders a folder strip linking to each
  collection", "hides the strip when there are no collections") are updated to
  target the new section. With a single tile list, the "renders" test finds one
  link; the "hides" test asserts no tile link when `collections: []` (the header
  and create control are still present — that is the new always-on behavior).
- Note in the plan: when the drawer is **open** the page now contains the
  top-section create control **and** the drawer create control; top-section
  create assertions must be page-scoped and drawer assertions dialog-scoped to
  avoid ambiguous matches.

**Manual/visual (jsdom ignores media queries — cannot be asserted in unit tests):**
- Desktop (>640px): top section always visible with header + create + tile grid;
  create works; no strip; drawer has no create control but keeps rename/delete +
  filter chips.
- Mobile (≤640px): no top header/create; tiles show as a horizontal strip only
  when collections exist; empty = no blank band; drawer create/rename/delete all
  present. Confirm at 360px: no horizontal overflow, tap targets ≥44px.

## Files

- Create: `apps/web/src/lib/components/LibraryCollections.svelte`
- Create: `apps/web/src/lib/components/librarycollections.test.ts`
- Modify: `apps/web/src/routes/library/+page.svelte`
- Modify: `apps/web/src/routes/library/page.test.ts`
- Modify: `apps/web/src/lib/components/CollectionsPanel.svelte`

## Constraints (from CLAUDE.md)

- shadcn-svelte / existing UI primitives; reuse `CollectionFolder`, `Input`,
  `Button`. No hand-rolled equivalents of shipped primitives.
- Mobile-first; tap targets ≥44px; no horizontal page overflow.
- Token-driven; never hardcode a color or font.
- TDD: failing test first, then implementation; run tests and read output before
  claiming pass.
- Conventional Commits, one logical change per commit.
