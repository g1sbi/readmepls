# Phase 4 — Annotations, Search, Tags & Collections — Design

**Date:** 2026-06-24
**Status:** Approved design, pre-implementation
**Phase:** 4 (per `CLAUDE.md` roadmap)
**Depends on:** Phase 1 (capture loop), Phase 2 (reader shell), Phase 3 (visual polish) — all done.

## 1. Summary

Phase 4 adds the reader's annotation and organization layer over the existing
reader shell: **highlights + notes**, **full-text search**, and **manual tags +
collections UI**. One spec, one migration, built in sequence (highlights →
search → tags/collections). No worker changes; AI auto-tagging from Phase 1 is
untouched — this phase adds the *manual* counterparts and the browse/search
surfaces.

## 2. Goals / Non-Goals

### Goals
- Select text in the reader → create a colored highlight with an optional note;
  highlights survive re-render and minor content change via robust anchoring.
- Per-article highlights sidebar: list, note, click-to-scroll, delete.
- Full-text search over the user's library, ranked, with match snippets.
- Manual tag editing on an article (alongside AI tags); filter the library by tag.
- Flat collections: create / rename / delete, add/remove articles, view contents.

### Non-Goals (deferred)
- Nested collections and manual drag-reorder of items. The data model keeps a
  `parent` field and `order` columns for forward-compat, but no nesting/reorder UI
  ships in v1.
- Semantic / vector search, search-as-you-type across other users — out of scope.
- Cross-device highlight conflict resolution beyond last-write-wins.

## 3. Existing state (what's already built)

- Collections present: `content`, `articles`, `jobs`, `tags`, `article_tags`,
  `reader_prefs`. `tags`/`article_tags` exist with relation-scoped rules but have
  **no UI**. `content.content_text` exists but is **not searchable** yet.
- Reader shell, library grid, capture loop, theming, `ui/` primitives all done.
- `pocketbase/pb_hooks/` directory exists (search route lands here).
- No slug helper yet (added in this phase).

## 4. Architecture

Mostly PocketBase-SDK-direct from the browser, relying on per-user API rules for
isolation. Search is the only piece needing server-side SQL, and it lives in a
PocketBase custom route (the data + FTS index live in PB; search is not a
secret-bearing action, so it does not belong in a SvelteKit server route).

```
Browser (SvelteKit reader/library)
  ├─ PB JS SDK ──► highlights / collections / collection_items / article_tags
  │                 (CRUD; per-user API rules enforce isolation)
  ├─ @readmepls/core: anchor.describe() / anchor.anchor()   (pure, browser-side)
  └─ fetch /api/search?q=… ─► PB custom route (pb_hooks/search.pb.js)
                                 └─ FTS5 MATCH → join to caller's articles
                                    → ranked SearchResult[] with snippets
```

No worker changes. No new SvelteKit secret routes.

## 5. Data model — new migration `1719100000_phase4.js`

Follows the existing migration style (`up`/`down`, `app.findCollectionByNameOrId`,
explicit indexes and rules). The `down` step deletes the new collections and drops
the FTS table + triggers.

### highlights
```
user         relation → users   (required, maxSelect 1)
article      relation → articles (required, maxSelect 1)
text         text     (the exact quoted selection)
prefix       text     (up to N chars preceding the quote, for disambiguation)
suffix       text     (up to N chars following the quote)
start_offset number   (char offset of quote start in normalized content text)
end_offset   number   (char offset of quote end)
color        select   (enum: see §9 tokens; required)
note         text     (nullable)
created      autodate onCreate
updated      autodate onCreate+onUpdate
```
- Rules (all): `user = @request.auth.id`.
- Index: `CREATE INDEX idx_highlights_article ON highlights (article)`.

### collections
```
user      relation → users   (required, maxSelect 1)
name      text   (required)
slug      text   (required)
parent    relation → collections (nullable, maxSelect 1)  -- forward-compat, no UI
order     number (default 0)                              -- forward-compat
created   autodate onCreate
updated   autodate onCreate+onUpdate
```
- Rules (all): `user = @request.auth.id`.
- Index: `CREATE UNIQUE INDEX idx_collections_user_slug ON collections (user, slug)`.

### collection_items
```
collection relation → collections (required, maxSelect 1)
article    relation → articles    (required, maxSelect 1)
order      number (default 0)      -- forward-compat
created    autodate onCreate
```
- Rules (all): `collection.user = @request.auth.id` (relation-scoped, mirrors
  `article_tags`).
- Cascade: deleting a collection deletes its `collection_items` (PB relation
  cascade delete on the `collection` field).
- Index: `CREATE INDEX idx_collection_items_collection ON collection_items (collection)`.

### FTS5 full-text index
A **standalone** FTS5 virtual table (not external-content): PocketBase record ids
are 15-char text, not integer rowids, so external-content mapping is awkward.

```sql
CREATE VIRTUAL TABLE content_fts USING fts5(
  content_id UNINDEXED,
  title,
  body
);
```
Kept in sync with the `content` collection via triggers on insert / update /
delete that mirror `id`, `title`, `content_text` into `content_fts`. The migration
also backfills any existing `content` rows.

## 6. Units & boundaries

| Unit | Kind | Responsibility | Depends on |
|------|------|----------------|------------|
| `core/highlight/anchor.ts` | pure | `describe(root,range)→HighlightSelector`, `anchor(root,selector)→Range\|null` | `apache-annotator` |
| `core/search/query.ts` | pure | sanitize raw query → safe FTS5 MATCH string | — |
| `core/slug.ts` | pure | slugify a name (shared by tags + collections) | — |
| `pb_hooks/search.pb.js` | IO | `GET /api/search`: auth → FTS MATCH → scope to caller's articles → ranked results | PB JSVM, `content_fts` |
| web components | UI | compose `ui/` primitives + tokens only | core, PB SDK |

`anchor.ts` wraps `apache-annotator` (`dom-anchor-text-quote` +
`dom-anchor-text-position`) behind our own interface so the library is swappable
and the unit is testable against fixtures in isolation.

## 7. Types — `@readmepls/types` (Zod-validated)

New modules, exported from `index.ts`:

- `highlight.ts` — `HighlightColor` (union literal matching the `color` enum),
  `HighlightSelector` `{ text, prefix, suffix, startOffset, endOffset }`,
  `Highlight` (record shape with id/user/article/color/note/timestamps).
- `collection.ts` — `Collection`, `CollectionItem`.
- `search.ts` — `SearchResult` `{ articleId, title, snippet, rank }`.

Every shape is parsed with its Zod schema at the PB-read and route boundaries
before use (per repo convention: never trust external shapes).

## 8. Web surfaces

### Reader (`read/[id]`)
- `HighlightLayer` — on text selection, show `HighlightPopover` (color swatches +
  optional note field). On confirm: `describe()` the selection → create a
  `highlights` row via PB SDK → wrap the range in a `<mark>` styled by color.
- On load: fetch the article's highlights → `anchor()` each → wrap located ranges.
  Highlights that fail to anchor are **not** rendered inline (see §10).
- `HighlightsSidebar` — list highlights with their notes; click scrolls to the
  anchored range; delete removes the row and the mark. Orphaned highlights appear
  flagged as un-locatable.
- `TagEditor` — add/remove **manual** tags. Adding a tag creates the `tags` row if
  the slug is new, then an `article_tags` row with `source = "manual"`. AI tags
  remain visible and are not editable here.
- "Add to collection" action (select an existing collection or create one).

### Library
- Tag filter: a tag list (existing `Tag.svelte` chips) filters the grid via
  `article_tags`.
- Search input → `/search` route: calls `/api/search`, renders results in the
  existing `CardGrid`/`ArticleCard` with the match snippet.

### Collections
- Sidebar list of the user's collections.
- `/collections/[slug]` — grid of the collection's articles (reuse `CardGrid`).
- Create / rename / delete a collection.

## 9. Design tokens

Add highlight-color tokens to `apps/web/src/lib/styles/tokens.css` (warm-paper
palette: a terracotta-accent highlight plus a small set such as amber and sage).
The `color` enum values in the `highlights` collection are the token *keys*;
components never hardcode a color — they map the key to a token (per repo design
rule).

## 10. Error handling

- **Orphaned highlight** — `anchor()` returns `null` (content changed / re-extracted).
  The highlight is listed in the sidebar as un-locatable and is never rendered
  inline. No crash.
- **Bad selection** — `describe()` throws or yields an empty quote → no highlight is
  created; a toast explains. No partial row written.
- **Search** — empty or malformed query is sanitized by `core/search/query.ts`;
  empty input and zero matches both render an empty state, not an error.
- **Collection slug conflict** — unique-index violation is surfaced as a friendly
  "name already used" message. Deleting a collection cascades its items.

## 11. Testing strategy (TDD — failing test first)

- **core (pure, offline):**
  - `highlight/anchor` — `describe`/`anchor` round-trips against fixture HTML **and
    mutated-DOM fixtures** (whitespace/markup changes, inserted nodes). This is the
    highest-risk unit; test it hardest.
  - `search/query` — sanitizer: quotes/operators escaped, prefix terms, empty input.
  - `slug` — slugify edge cases.
- **types:** Zod parse/round-trip for each new schema.
- **migration:** a `migration-phase4.test.ts` mirroring `migration-phase2.test.ts`:
  asserts the new collections + rules exist and that the `content_fts` triggers fire
  on a `content` write/update/delete.
- **integration (ephemeral PB):**
  - Highlight CRUD **tenant isolation** — a user cannot read/write another user's
    highlights.
  - Search route **cross-user isolation** — `/api/search` returns only the caller's
    matching articles.
  - `collection_items` scoping — items are reachable only via the owner.
- **web (Vitest):** component tests for `HighlightPopover`, `HighlightsSidebar`,
  `TagEditor`.
- **E2E (Playwright):** deferred (per base spec, the reader E2E flow comes later).

## 12. Security boundaries

- Per-user collections (`highlights`, `collections`) scoped `user = @request.auth.id`;
  `collection_items` scoped through `collection.user`. PB API rules are the boundary,
  never the client.
- The search route runs inside PocketBase and filters FTS matches to the
  authenticated user's `articles`; it never returns another user's content. It reads
  only the public `content` body already readable to authenticated users, but the
  *result set* is restricted to the caller's library.
- No secrets introduced. No global cache changes; FTS indexes only the existing
  public `content` table.

## 13. Build sequence

1. Types (`highlight`, `collection`, `search`) + `core/slug`.
2. Migration `1719100000_phase4.js` (collections + FTS table/triggers) + migration test.
3. `core/highlight/anchor` (TDD vs mutated-DOM fixtures).
4. Reader highlights: layer, popover, sidebar, color tokens.
5. `core/search/query` + `pb_hooks/search.pb.js` + integration isolation tests.
6. Search UI (`/search` route).
7. `core/...` tag/collection helpers as needed + tag editor + library tag filter.
8. Collections CRUD + `/collections/[slug]` view.

## 14. Open risks

- **Anchoring robustness** — mitigated by wrapping a proven library and testing
  against mutated-DOM fixtures; still the trickiest unit.
- **FTS sync drift** — triggers must cover insert/update/delete and the migration
  must backfill; covered by the migration test asserting triggers fire.
- **PB JSVM FTS query ergonomics** — raw SQL via the PocketBase DB API inside the
  custom route; if the JSVM proves limiting, fall back to a thin SvelteKit server
  route that proxies a PB query. Isolated behind the `/api/search` contract.
