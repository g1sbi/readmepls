# First-class sources (websites) — design

**Status:** approved, ready for plan
**Date:** 2026-07-02

## Problem

Today a website is captured only as a free-text `site_name` on the `content`
row and is never surfaced in the UI. The source of an article is not a
first-class entity: you can't see which site an article came from at a glance,
you can't filter your library by site, and there's no site icon.

## Goal

Make the source website a first-class part of the data model. On extraction,
derive and store the source, show a source pill on cards and in the reader,
let the user filter their library by source (multi-select) and favorite sources,
and extract + store each site's favicon.

## Non-goals

- No public-suffix (eTLD+1) grouping. Subdomains are distinct sources.
- No third-party favicon services. Self-host and privacy first.
- No visual-design polish beyond a token-styled pill primitive (that's the
  design phase's job); this spec is structure + behavior.

## Decisions (locked during brainstorming)

1. **Normalized collection.** Sources get their own PocketBase collection, not a
   derived field. `content` relates to a source row.
2. **Source key = full hostname, minus leading `www.`.** `www.nytimes.com` and
   `nytimes.com` merge; every other subdomain (`blog.`, `m.`, `news.`) is its
   own source. No public-suffix list.
3. **Favicon = parse HTML + download bytes**, stored as a PocketBase file on the
   source row. No external favicon service.
4. **Sources are global**, worker-written (like `content`). But a user's
   filter/pill list is derived only from sources present in *their own* library —
   the global table is never enumerated to the client.
5. **Filtering is multi-select** (union / OR of selected sources).
6. **Favorites are per-user.** Favorited sources pin to the front of the chip
   bar with a star; the rest follow.

## Data model

### New collection: `sources` (global, worker-written)

| field | type | notes |
|-------|------|-------|
| `id` | id | |
| `host` | text, required, **unique** | canonical key: lowercased hostname, leading `www.` stripped (e.g. `nytimes.com`, `blog.acme.com`) |
| `name` | text, nullable | best-known site name (from `site_name`) |
| `favicon` | file, nullable | downloaded favicon bytes |
| `favicon_status` | text, required | `'pending' \| 'ok' \| 'none'` |
| `created` / `updated` | autodate | |

### New collection: `source_favorites` (per-user)

| field | type | notes |
|-------|------|-------|
| `id` | id | |
| `user` | relation → users, required | |
| `source` | relation → sources, required | |
| unique index | | on `(user, source)` |

### Change: `content`

- Add `source` — relation → `sources`, **nullable** (nullable so extraction can
  degrade gracefully if the host can't be derived).
- Keep existing `site_name` text as the raw fallback / backfill source.

State is modeled as a union (`favicon_status`) per repo convention, not booleans.

## Extraction pipeline

### Pure core functions (tested in isolation, no IO)

- `deriveSourceHost(url: string): string | null`
  - lowercase host, strip a single leading `www.`.
  - subdomains preserved; ports stripped; IDN left as the URL parser yields.
  - returns `null` for unparseable URLs (caller leaves `content.source` null).
- `pickFaviconCandidates(html: string, baseUrl: string): string[]`
  - ordered, absolute candidate URLs:
    1. `<link rel="icon"|"shortcut icon">` — prefer largest declared `sizes`.
    2. `<link rel="apple-touch-icon">`.
    3. fallback `/favicon.ico` at the origin.
  - deduped, resolved against `baseUrl`.

Both live in `@readmepls/core` alongside the existing extractors and are
covered by fixture/unit tests (offline, deterministic).

### Worker (IO shell)

After a successful extract, before/around the `content` create:

1. `host = deriveSourceHost(canonical_url)`. If null, skip source linkage.
2. **Upsert source by `host`** (idempotent): find-or-create the `sources` row.
   Set/refresh `name` from the extract's `site_name` when the row lacks one.
   Concurrent workers must converge on one row for a host (rely on the unique
   `host` index; treat a unique-violation on create as "already exists, re-read").
3. If the source has no favicon yet (`favicon_status` is `pending`/`none` and no
   file): compute `pickFaviconCandidates` from the fetched page HTML, fetch
   candidates in order, store the first that returns image bytes as the `favicon`
   file, set `favicon_status='ok'`. If none work, `favicon_status='none'`.
4. Set `content.source` to the source id.

Favicon fetching is best-effort and must never fail the extraction job. Jobs stay
idempotent and safe to re-run (favicon re-attempt only when status is not `ok`).

### X / YouTube

- `x.com` and `youtube.com` as hosts; `name` hardcoded as today (`X`, `YouTube`).
  Favicon fetch applies the same path.

## Frontend

### `SourcePill` (new UI primitive, `$lib/components/ui/`)

- Renders favicon (from the source's PB file URL) + site name.
- Fallbacks: no favicon → generic site glyph; no name → host text.
- Fully token-styled (colors/radii/fonts from `tokens.css`); no hardcoded values.
- Used on `ArticleCard` and in the reader header.

### Library source filter (chip bar)

- A chip bar above the library grid. Each chip: favicon + name + count.
- Chips are derived **only from the current user's library** — distinct sources
  over their articles → content → source. The global `sources` table is never
  listed to the client.
- Multi-select: toggling chips filters to the union (articles whose source is any
  selected). An `[all]` chip clears the selection.
- Favorites: a star affordance per chip toggles a `source_favorites` row.
  Favorited chips pin to the front (starred), remaining chips follow.

### Reader

- Show the `SourcePill` in the reader header near the title.

## Security

- `sources`: read = authenticated; create/update = worker service credential only
  (same pattern as `content`). No `user` relation. Because the client filter list
  is computed from the user's own articles, users never learn about sites they
  don't have.
- `source_favorites`: every rule scoped `user = @request.auth.id` (list/view/
  create/update/delete). Explicit tenant-isolation test: user A cannot read or
  mutate user B's favorites.
- No gated/private content leakage: sources hold only public site metadata
  (host, name, icon); nothing per-article or per-user lives on a source row.

## Backfill

- Migration adds the collections/fields.
- One-off worker pass over existing `content` rows: derive host from
  `canonical_url`, upsert source, link `content.source`, best-effort favicon.
- Idempotent and re-runnable (skips rows already linked / sources already iconed).

## Validation (Zod)

- New `Source` and `SourceFavorite` schemas in `@readmepls/types`, parsed at the
  PocketBase read boundary.
- `content` schema gains `source: z.string().nullable()`.
- Favicon-candidate output and derived host validated/typed in core.

## Testing (TDD — failing test first)

**Core (pure, offline):**
- `deriveSourceHost`: `www.` strip, subdomains kept distinct, ports stripped,
  bad URL → null, IDN.
- `pickFaviconCandidates`: fixtures for `<link rel=icon sizes>`, `apple-touch-icon`,
  bare `/favicon.ico`, none present; largest-size preference; relative→absolute.

**Worker (ephemeral PB):**
- source upsert idempotency (two jobs, same host → one row).
- concurrent create converges on one row (unique `host`).
- favicon downloaded and stored; `favicon_status` transitions.
- `content.source` linkage set.
- favicon failure does not fail the job.

**Isolation:**
- user A cannot read/mutate user B's `source_favorites`.
- library filter facets only include sources present in the requesting user's
  library.

**Web:**
- `SourcePill` renders favicon; fallbacks for missing favicon / missing name.
- chip bar multi-select produces union filter.
- favorite toggle pins the chip to the front.

## Rollout order (for the plan)

1. types + core pure functions (+ tests).
2. migrations (collections, fields, indexes, rules).
3. worker: derive host, upsert source, favicon fetch, link content (+ tests).
4. backfill pass.
5. web: `SourcePill` + reader + card.
6. web: library chip filter + favorites.
