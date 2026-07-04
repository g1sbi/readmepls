# Library Faceted Filtering — Design

**Date:** 2026-07-04
**Status:** Approved (design), pending implementation plan
**Phase:** Phase 4 area (tags/collections/search UI); no roadmap reordering

## Problem

The library can only be narrowed by source (multi-select chips), a single tag at
a time, and an archived on/off toggle. The collections panel manages collections
but does **not** filter the grid. Sort is hardcoded to `-created` with no control.
Full-text search lives on a disconnected `/search` page. Filtering runs in-memory
over the newest 100 loaded rows, so any filter silently ignores everything past
row 100 as a library grows.

Goal: a real faceted filtering system over the whole library — correct at any
size, combinable facets, shareable state, with search folded in as one more facet.

## Non-goals

- No visual redesign (that is Phase 3). Use existing tokens and primitives.
- No new user data model / collections. All facets map to existing fields.
- No per-facet context-sensitive result counts (see §Counts).
- No saved/named filter presets in v1.

## Architecture

Filtering moves **server-side** into a thin BFF, with query translation as a
**pure function** — matching the repo's "pure core, thin IO shell" convention.

### Components

1. **`buildLibraryQuery(params) → { filter, sort, page, perPage }`**
   Pure function (lives in `@readmepls/core` or `apps/web/src/lib`). Translates a
   validated params object into a PocketBase filter string and sort expression.
   No IO. This is the testable heart of the feature — exhaustively unit-tested
   over every facet and combination. All values are passed as **bound filter
   params** (never raw string interpolation) to prevent injection.

2. **`LibraryParams` Zod schema**
   Parses and clamps URL query params into the typed params object. Unknown or
   malformed values are dropped, not errored. Empty input → default view
   (`sort = -created`). Round-trip tested (params → URL → params).

3. **`/library` server load (`+page.server.ts`)**
   Validates URL params via `LibraryParams`, calls `buildLibraryQuery`, runs the
   PB list query through `locals.pb` (already authenticated and tenant-scoped by
   `hooks.server.ts`), and returns a typed, paginated page plus the facet option
   lists (tags, collections, sources, languages, authors present in the user's
   library). Search folds in here (see §Search).

4. **Client (`/library/+page.svelte`)**
   Owns the drawer UI, active-filter chips, sort control, and search box. Reads
   and writes filter state to the URL (via `goto` with `keepFocus`/`noScroll`),
   which re-triggers the server load. A light realtime subscription on `articles`
   calls `invalidate` so new captures appear without a manual reload.

### PocketBase filter coverage (no schema change)

- Content facets: `content.word_count`, `content.read_time`, `content.lang`,
  `content.author`, `content.published_at`, `content.extract_status`
- Back-relations: `article_tags_via_article.tag`,
  `collection_items_via_article.collection`, `highlights_via_article.id`,
  `highlights_via_article.note`
- Article fields: `status`, `created`

## Facets

**Combination semantics:** OR within a facet group, AND across groups (standard
faceted browse). This matches the existing union source filter — no behavior
surprise.

| Group | Values | Backing field |
|---|---|---|
| Read state | unread · reading · finished (`progress` ≈ 1) · archived | `articles.status`, `articles.progress` |
| Reading time | quick <5m · medium 5–15m · long >15m | `content.read_time` |
| Tags | multi-select (AI + manual together) | `article_tags_via_article.tag` |
| Collections | multi-select membership (**new**) | `collection_items_via_article.collection` |
| Source | multi-select + "favorites only" | `content.source`, `source_favorites` |
| Saved date | today · this week · this month · this year · older | `articles.created` |
| Published date | today · this week · this month · this year · older | `content.published_at` |
| Language | select from values present | `content.lang` |
| Author | select from values present | `content.author` |
| Has | highlights · notes | `highlights_via_article` (id / note) |
| Needs attention | partial · failed extractions | `content.extract_status` |
| Search | free-text query | FTS (see §Search) |

Notes:
- "finished" = `progress >= 0.98` (near-complete) and not archived.
- Reading-time buckets are computed as `read_time` ranges in minutes.
- Author is high-cardinality; its option list is capped/sorted by frequency and
  only shows values actually present in the user's library.

## URL schema

All state lives in query params → shareable, back-button friendly, reload-safe:

```
/library?read=unread,reading&time=long&tag=dev,rust&collection=abc
        &source=xyz&favsrc=1&saved=week&published=year&lang=en
        &author=jane-doe&has=highlights&attention=failed&q=neural&sort=longest
```

- Comma-separated lists for multi-value groups.
- `sort` values: `-created` (newest, default), `created` (oldest),
  `-published` (recently published), `-read_time`/`read_time` (longest/shortest),
  `-updated` (recently read), `title` (A–Z), `relevance` (only valid with `q`).
- `LibraryParams` clamps/drops anything invalid.

## UI

Chosen shell: **filter drawer / sheet** — keeps the reading grid full-width and
calm; the large facet set hides behind one button.

- **Top strip** (always visible): search box · `[≡ filters]` button · sort
  dropdown · active-filter chip row (each chip has ✖; a **clear-all** control) ·
  live result count ("42 articles").
- **Drawer**: slides from the right using a new reusable **`Sheet`** UI primitive
  in `$lib/components/ui/`. Contains collapsible facet groups with
  checkboxes/chips. Focus-trapped, ESC to close, dismiss on backdrop click.
  Tokens-only styling (no hardcoded colors/fonts).
- **Empty / loading / error** states reuse existing `Skeleton` and `PaperCorner`.
- Mobile: same drawer pattern (full-height sheet).

All new markup composes existing UI primitives (`Chip`, `Tag`, `Button`,
`DropdownMenu`, `Input`) plus the new `Sheet`. No duplicated markup or CSS.

### Counts

Facet options display **static** total counts only where the option list is
already enumerated cheaply (tags, sources). No per-toggle recomputation of
context-sensitive counts (that would be N extra queries per render — not worth it
in v1). The one live number shown is the **total result count** for the current
query (PB returns `totalItems` for free).

## Search as a facet

FTS (`content_fts`, exposed via PocketBase `/api/search`) returns ranked IDs.
PocketBase filters cannot express large `IN` lists, so the **server load
orchestrates** the join:

1. When `q` is present, call FTS to get up to ~200 ranked candidate IDs.
2. Inject them into the PB filter as an `(id = '..' || id = '..' ...)` clause,
   AND-combined with the other facets.
3. Default `sort` becomes `relevance` (preserve FTS rank order) unless the user
   picked another sort.

The standalone `/search` page is folded in: `/search?q=x` **redirects** to
`/library?q=x`. One unified find surface.

## Testing (TDD — failing test first)

- **`buildLibraryQuery`** — pure unit tests covering every facet, cross-group AND
  / within-group OR, date-preset boundaries, reading-time buckets, empty params →
  default, and injection-safety (values always bound, never interpolated).
- **`LibraryParams`** — Zod parse/clamp and params → URL → params round-trip.
- **Server load integration** — ephemeral PB instance: each facet returns the
  correct set; cross-group combinations intersect correctly; search + facet
  intersection; sort ordering. **Tenant isolation**: facet option lists and
  results never include another user's articles/tags/collections/highlights.
- **Component** — drawer open/close/ESC/backdrop, chip removal, clear-all, sort
  change writes the URL, active-chip render reflects URL state.

## Schema / performance

No new collections or fields. Indexes added only if measured query plans need
them — candidates: `content(read_time)`, `content(published_at)`, `content(lang)`,
`articles(status)`. Measure before adding; no speculative indexes.

## Migration / rollout

- `/library` load path changes from client-side `getList` to server-side load.
  The existing realtime-refresh behavior is preserved via `invalidate`.
- `/search` becomes a redirect; its ranked-results UI is absorbed into the
  library grid.
- Existing source-favorite and tag/collection data is reused as-is.
