# Collections on the library — design

## Problem

Collections exist (CRUD in `FilterDrawer`'s `CollectionsPanel`, per-collection
pages at `/collections/[slug]`, collection *filtering* in the library) but have no
first-class presence. There's no way to see collections at a glance or jump into
one. Collections should appear as small folders on top of the library grid, and on
mobile get their own tab.

## Goal

- Desktop: a horizontal strip of folder tiles at the top of `/library`, each a
  quick link into a collection.
- Mobile: a dedicated `collections` tab in the bottom nav → a `/collections` index
  page listing every collection as a folder.
- Each folder shows name + article count.
- Clicking a folder navigates to the existing `/collections/[slug]` page.

Collection filtering (FilterDrawer) and CRUD (CollectionsPanel) are unchanged.
The strip and index are navigation-only surfaces.

## Non-goals

- Per-folder covers, colors, or icons beyond a folder glyph.
- Drag-to-reorder collections.
- Any change to collection filtering or CRUD.
- Realtime updates of the strip (collections change rarely; a load re-run suffices).

## Design

### 1. Data + counts (core)

Extend the collections facet from `{ id, name, slug }` to
`{ id, name, slug, count }`, where `count` is the number of articles in the
collection.

- `packages/core/src/library/fetch.ts` (`fetchFacets`) already lists `collections`.
  Add one query: `collection_items.getFullList({ fields: "collection" })`, tally
  by `collection` id, attach `count` to each collection row (default `0`).
- API rules scope `collection_items` to the owner, so the tally is per-user
  (tenant isolation holds — another user's items never counted).
- Extract the count-tally into a small pure helper so both the library facets and
  the new `/collections` load reuse identical logic (no duplicated counting).
- **Graceful degrade:** if the count query fails, collections still return with
  `count: 0` rather than throwing — folders remain navigable.

### 2. Components

- **`$lib/components/ui/CollectionFolder.svelte`** (new shared primitive)
  - Props: `{ id, name, slug, count }`.
  - Renders an `href` link (to `/collections/[slug]`) via the shadcn-svelte
    `button` primitive (`variant="outline"`), containing a `FolderOpen` lucide
    icon, the name (truncated on overflow), and the count in a shadcn-svelte
    `badge`.
  - Tap target ≥44px. Token-driven colors only (terracotta accent on hover).
  - `button` and `badge` are already installed — no new shadcn-svelte deps.

- **Library strip** — inline in `routes/library/+page.svelte`
  - A horizontal `overflow-x: auto` row of `CollectionFolder`, placed above
    `LibraryToolbar`.
  - Guarded by `{#if data.facets.collections.length}` — no empty strip.
  - Consumes `data.facets.collections` (now carrying counts); no new fetch.

- **`routes/collections/+page.svelte`** (new index route)
  - A wrapping flex/grid of `CollectionFolder` tiles.
  - Empty state: a single line pointing the user to where collections are created
    (FilterDrawer) — no CRUD duplicated here.
  - `routes/collections/+page.server.ts`: load via the shared core helper,
    returning `{ id, name, slug, count }[]`.

- **`BottomNav`** — add a 4th tab
  - `{ href: "/collections", label: "collections", icon: FolderOpen,
    match: (p) => p.startsWith("/collections") }`.
  - 4 tabs fit at 360px.

### 3. Data flow

- Library page: unchanged path — facets (now with counts) feed the strip.
- `/collections`: server load → core helper → folder grid. No client-side
  fetching, no realtime.

### 4. Error handling

- Count query failure → `count: 0`, folders still work.
- Zero collections → strip hidden on `/library`; `/collections` shows empty state.
- Matches the repo's graceful-degrade convention (typed/defaulted, never a hard
  throw on a secondary read).

## Testing (TDD)

- **core (count helper):** collections with 0 and N items; another user's items
  excluded (explicit tenant-isolation assertion).
- **CollectionFolder:** renders name + count; `href` resolves to
  `/collections/[slug]`; ≥44px target.
- **library page:** strip hidden when no collections; one folder per collection
  with correct count.
- **/collections page:** grid renders a folder per collection; empty state when
  none.
- **BottomNav:** collections tab present; `aria-current="page"` on `/collections*`.

## Files touched

- `packages/core/src/library/fetch.ts` — counts on collections facet + count helper.
- `apps/web/src/lib/components/ui/CollectionFolder.svelte` — new.
- `apps/web/src/routes/library/+page.svelte` — strip above toolbar.
- `apps/web/src/routes/collections/+page.svelte` — new index page.
- `apps/web/src/routes/collections/+page.server.ts` — new load.
- `apps/web/src/lib/components/BottomNav.svelte` — 4th tab.
- Paired tests for each.
