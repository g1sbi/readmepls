# Unified Search Palette — Design

Date: 2026-07-08
Status: approved, pre-plan

## Problem

Search is scattered across three entry points that all do the same thing and
feel inconsistent:

- **Desktop header** (`TopBar.svelte`): a real `<input>` that submits to
  `/search?q=`, a redirect-only route that bounces to `/library?q=`.
- **Library page** (`LibraryToolbar.svelte`): its own inline `<input>` writing
  the `?q=` URL param.
- **Mobile bottom nav** (`BottomNav.svelte`): a "search" tab that navigates to
  `/library?focus=search`, which only *focuses* the library input.

Two visible search boxes that do identical work, plus a mobile tab that is just
a shortcut to one of them. Redundant chrome, viewport-dependent behavior, no
single mental model.

The **backend is not the problem** — hybrid keyword+semantic search already
ships (`hybridSearchIds` → PB FTS `keywordSearchIds` fused via RRF with the
worker's `/search` semantic endpoint), all driven by one `?q=` URL param through
the library page load. This is purely a UX / entry-point consolidation.

## Goal

One search surface — a global command palette (⌘K) — reachable identically from
every viewport. Delete the duplicate inputs and the redirect shim. Keep the
existing `?q=` hybrid library grid as the authoritative "all results" view.

## Decisions (locked in brainstorming)

1. **Model:** global command palette (⌘K), built on **shadcn-svelte
   `Command` / `Command.Dialog`**.
2. **Library inline search bar:** removed. The palette is the *only* place a
   query is typed. An active `?q=` renders as a removable chip in the library.
3. **Palette scope:** live article results + tags & collections + recent/empty
   state. **No** command-runner actions (not a "do things" palette, a
   search/navigator palette).
4. **Live semantic:** two-phase progressive — instant keyword results per
   keystroke, full hybrid folded in on a typing pause. Semantic still runs on
   every completed query without blocking typing.
5. **Desktop header:** a fake search *bar* (bar-shaped button reading
   "search your library… ⌘K") that opens the palette. Not a bare icon.

## Architecture

### Entry points (all converge on one palette)

- **Desktop header** — `TopBar.svelte`'s real `<input>` becomes a fake search
  bar: a button styled like an input, label "search your library…", trailing
  `⌘K` hint. Click/focus → `openSearchPalette()`. No typing in the header.
- **Mobile bottom nav** — `BottomNav.svelte`'s search tab calls
  `openSearchPalette()` instead of navigating to `/library?focus=search`. Its
  `match` can now reflect real open state (or stay inert — the palette is a
  modal, not a route).
- **Keyboard** — global listener (in `+layout.svelte`): `⌘K` / `Ctrl-K` and `/`
  open the palette; `Esc` closes. `/` is ignored while focus is in an
  input/textarea/contenteditable so it doesn't hijack typing.
- **Removed** — the `/search` route (`routes/search/+page.server.ts`) and the
  `?focus=search` mechanism. Deep-links to `/library?q=…` still work unchanged.

### Palette component

`SearchPalette.svelte` (in `$lib/components/`), built on shadcn-svelte
`Command.Dialog`. **Single instance mounted once** in `+layout.svelte`, opened
via a tiny store.

- **State store** `$lib/stores/search-palette.ts`: `open` boolean + `openSearchPalette(initialQuery?)` / `close()`. Optional `initialQuery` lets the
  library query-chip reopen the palette pre-filled.
- **Sections** (shadcn `Command.Group`s):
  - *empty query* → **recent searches** (localStorage, last ~5) and
    **recently-read articles** (from existing reading-progress data).
  - *typing* → **articles** (title + source + snippet → reader),
    **tags** (→ `/library?tags=…`), **collections** (→ `/library?collection=…`).
  - *footer* → `↵ see all N results →` navigates to `/library?q=<query>` (the
    full hybrid grid).
- **Responsive:** full-screen on mobile (≤640px), centered overlay on desktop —
  one component, token-driven breakpoints. Portals to `document.body` (same
  escape-the-`.page`-transform trick the existing `Sheet` uses).
- **Selection → navigation:** every result is a link/`goto`. Selecting closes
  the palette. Enter on the footer row = "see all".

### Data flow — live search endpoint (new)

A live JSON endpoint is required; today search only runs through the library
page `load`. Add:

- **`GET /api/search/live?q=`** — SvelteKit `+server.ts`, server-only, auth via
  `locals.pb` (the user's own session; tenant-scoped). Returns
  `{ articles: [...], tags: [...], collections: [...] }`, each capped small
  (~5–8). Response validated/shaped with **Zod** at the boundary.
- **Two-phase, client-driven:**
  - **Phase 1 (per keystroke, ~120ms debounce):** endpoint called with a
    `mode=keyword` flag → keyword-only (`keywordSearchIds`, PB FTS, sub-100ms) +
    tag/collection name matches. Instant preview.
  - **Phase 2 (on ~250ms typing pause):** endpoint called with `mode=hybrid` →
    `hybridSearchIds` (keyword+semantic RRF). When it returns, the palette's
    article list **re-ranks in place**; a subtle pending indicator covers the
    gap. Stale requests aborted via `AbortController`.
  - Semantic-search failure already degrades to keyword-only inside
    `hybridSearchIds` — the palette shows phase-1 results and never errors out.
- **Result shaping is pure core:** a function in `@readmepls/core`
  (e.g. `shapeLiveSearch`) turns ranked article ids + fetched article/tag/
  collection records into the sectioned, capped `LiveSearchResult` shape. Pure,
  unit-tested, no IO.
- **Tags/collections** matched by case-insensitive name `contains` over the
  user's own records (PB filter with placeholders — never string-interpolate).
- **"See all"** does *not* use this endpoint — it navigates to `/library?q=` and
  the existing library `load` runs the authoritative full hybrid search.

### Library page changes

- **Remove** the text `<input>` from `LibraryToolbar.svelte` (keep sort +
  "filters" controls). Drop its `focusSearch` / `onSearch` props and the
  `searchEl` autofocus effect.
- **Query chip:** when `params.q` is set, render it as a removable chip in
  `ActiveFilters` (reuse the existing tag-chip pattern). The chip's `×` clears
  `q` (via the existing `patch({ q: "" })` path); clicking the chip body calls
  `openSearchPalette(params.q)` to edit.
- **Remove** the `focus=search` handling from `library/+page.server.ts` and the
  `focusSearch` load return. Remove `bottom-nav` focus plumbing.
- The library `load`, `parseLibraryParams`, `fetchLibraryPage`, and the hybrid
  `resolver` are **unchanged** — `?q=` still drives the full hybrid grid.

## Types

- `LiveSearchResult` (new, in `@readmepls/types`): `{ articles: LiveArticle[],
  tags: LiveTag[], collections: LiveCollection[] }` with small item shapes
  (`articleId`/`title`/`snippet`/`source` etc.). Zod schema, consumed by both
  the endpoint and the palette.
- `LiveSearchMode = "keyword" | "hybrid"` union for the endpoint flag.

## Testing (TDD)

- **Core (pure):** `shapeLiveSearch` — id lists + records → sectioned/capped
  result; empty query; caps enforced; ordering preserves rank.
- **Endpoint `/api/search/live`:** tenant isolation (user A never sees user B's
  articles / tags / collections), Zod validation of output, empty-query returns
  empty sections, `mode=keyword` vs `mode=hybrid` dispatch, semantic-failure
  degradation to keyword-only.
- **Palette component:** opens on ⌘K / `/` / header-click / mobile-tab; `/`
  ignored while typing in a field; sections render for empty vs typing states;
  Enter on an article → reader; footer → `/library?q=`; recent-searches persist
  to and load from localStorage; phase-1→phase-2 in-place re-rank; stale request
  abort.
- **Regression:** removing `/search` and `?focus=search` doesn't break existing
  `/library?q=` deep-links; library query chip clears and edits correctly.

## Out of scope

- Command-runner actions (add link, settings, theme) — deliberately excluded;
  palette is search/navigation only.
- Changing the hybrid ranking / RRF, the worker `/search` internals, or adding a
  vector index. Latency is acceptable as-is for personal-library scale.
- Server-side caching of live results. Revisit only if measured latency warrants.
- E2E (Playwright) — deferred with the rest of the reader-flow E2E work.

## Files touched (approximate)

- New: `apps/web/src/lib/components/SearchPalette.svelte`,
  `apps/web/src/lib/stores/search-palette.ts`,
  `apps/web/src/routes/api/search/live/+server.ts`,
  `packages/core/src/library/live-search.ts` (+ tests),
  `packages/types/src/live-search.ts`.
- Modified: `TopBar.svelte`, `BottomNav.svelte`, `LibraryToolbar.svelte`,
  `ActiveFilters.svelte`, `routes/+layout.svelte`,
  `routes/library/+page.svelte`, `routes/library/+page.server.ts`,
  `bottom-nav-scroll.ts` (if focus plumbing lives there).
- Deleted: `apps/web/src/routes/search/+page.server.ts` (and the `search` route
  dir).
- shadcn-svelte: add the `command` component if not already generated.
