# Phase 6 — Connector Seam + Markdown Export — Design

**Date:** 2026-06-26
**Status:** Approved design, pre-implementation
**Phase:** 6 (see `CLAUDE.md` roadmap)

## 1. Summary

Phase 6 introduces the **connector plugin seam** and ships its first working
implementation: a high-quality **Markdown export**. A `ConnectorPlugin` interface
plus an in-code registry hold three connectors — `markdown` (works end-to-end),
`notion` and `obsidian` (stubs that throw `NotImplemented`). Export runs
**synchronously in a SvelteKit server route** that resolves an article set, renders
each article to Markdown in pure core, and streams back a single `.md` (one
article) or a `.zip` (many). The worker is untouched.

A small, locked scope-add rides along: a `published_at` field is threaded through
the extraction pipeline so exported frontmatter can carry a real publication date
instead of only the fetch date.

Decisions locked during brainstorming:

- **Export runtime:** synchronous SvelteKit server route, not a worker job. Instant
  download, no polling, worker stays extraction-only. The connector interface is
  runtime-agnostic so a worker-dispatched path can be added later behind the same
  seam.
- **Scopes (four):** single article, collection, whole library, and active
  **filter** (current tag/search). All resolve **server-side** — `filter`
  recomputes the set from query params; there is no client-supplied id list and no
  multi-select UI.
- **Frontmatter:** core source metadata + reading `status` + tags (manual and AI
  split into separate keys) + summary. Reader `progress` is **excluded** so
  re-export is byte-stable (progress churns every read).
- **Highlights:** best-effort **inline `==mark==`**, with an appended
  `## Highlights` fallback so nothing is dropped silently.
- **Per-article failure:** single-article export **fails loud**; multi-article
  (zip) export **continues** and includes an `_export-report.md` manifest of what
  failed (no silent partial).
- **Seam depth:** code-level interface + registry + a Settings → Connectors page.
  **No `connectors` PB collection yet** — export is config-less, so the table is
  YAGNI until a connector needs persisted per-user config.
- **Publish date (option B):** add `published_at` through `ExtractResult` →
  `Content` → worker → migration, read best-effort by each extractor.

## 2. Goals / Non-Goals

### Goals
- `ConnectorPlugin` interface + in-code registry in `packages/core` (pure).
- A working Markdown connector: HTML→Markdown (Turndown + GFM), safe YAML
  frontmatter, inline highlight marking with a non-lossy fallback, deterministic
  slug-based filenames, stable re-export.
- Four export scopes wired through one server route, all resolved server-side.
- `notion`/`obsidian` stub connectors registered and surfaced as "coming soon".
- Settings → Connectors page.
- `published_at` threaded through the extraction pipeline + migration.
- Pure render core tested against offline fixtures; route tested for tenant
  isolation and scope resolution.

### Non-Goals
- `connectors` PB collection / per-user connector config / `last_run` (deferred —
  export is config-less this phase).
- Multi-select export / client-supplied article-id lists. The `filter` scope
  recomputes its set server-side from query params, so no grid checkboxes and no
  trusted client id list this phase.
- Local image download / bundling (keep original remote image URLs; SSRF +
  packaging concerns deferred).
- Worker-side or async export (sync route handles it; seam stays runtime-agnostic).
- Real Notion/Obsidian implementations or any two-way / live sync (stubs only).
- Re-fetch on export, extraction repair, or export templates/customization UI.

## 3. Current State (what exists)

- **No connector code exists.** Spec §8 of the design spec
  (`2026-06-21-reader-app-design.md`) sketches the `ConnectorPlugin` interface and
  the registry intent; nothing is implemented.
- `packages/core/src/slug.ts` — existing slug helper, reused for filenames.
- `packages/types/src/content.ts` — `Content` carries `title`, `author`,
  `site_name`, `lang`, `excerpt`, `content_html`, `content_text`, `ai_tags_json`,
  `fetched_at`. **No publish date** — only `fetched_at`.
- `packages/types/src/extract.ts` — `ExtractResult`; no `publishedAt`.
- `packages/types/src/highlight.ts` — `Highlight` carries `text`, `prefix`,
  `suffix`, offsets, `color`, `note`. Anchored to **rendered** content, so offsets
  do not survive HTML→Markdown conversion (see §5).
- `apps/worker/src/extract/parse-article.ts` — reads metadata via JSDOM +
  Readability; the natural place to also read a publish date.
- `apps/worker/src/worker.ts` — maps `ExtractResult` → `content` row on extract.
- `apps/web` — existing reader, library grid (tag filter, search, Phase-4
  collections). Export actions hook into these surfaces.
- `pocketbase/pb_migrations/` — tracked migrations; a new one adds `published_at`.

## 4. Architecture — pure core, thin IO shell

```
packages/core/src/connector/
  plugin.ts        ConnectorPlugin interface; ExportFile / ExportResult zod schemas;
                   NotImplementedError.
  registry.ts      register / get / list. Registers markdown + notion + obsidian.
  markdown/
    connector.ts   MarkdownConnector implementing ConnectorPlugin (pure render).
    render.ts      pure: (ArticleExport) -> ExportFile { filename, contents }.
    frontmatter.ts pure: object -> safe YAML block (string escaping, list encoding).
    highlights.ts  pure: best-effort inline ==mark==; else appended ## Highlights.
    html-to-md.ts  pure: Turndown + turndown-plugin-gfm wrapper (HTML string -> MD).
    filename.ts    pure: slug(title) + collision-suffix; deterministic.
  notion.ts        NotionConnector stub: export() throws NotImplementedError.
  obsidian.ts      ObsidianConnector stub: throws NotImplementedError.

apps/web/src/routes/api/export/+server.ts          (IO shell)
  - authn: require session. authz falls out of PB queries scoped
           user = @request.auth.id (no client-supplied id list — see §6).
  - resolve scope -> article-id set server-side (see §6).
  - read article + content + highlights + tags from PB; zod-validate at boundary.
  - assemble ArticleExport DTOs; call MarkdownConnector per article (pure).
  - 1 file  -> stream text/markdown with Content-Disposition filename.
    N files -> jszip -> stream application/zip.

apps/web/src/routes/settings/connectors/           Settings UI (see §7).
```

The connector layer is **pure and offline-testable** (HTML/highlights/meta in →
deterministic Markdown out), mirroring how extractors are tested. The route is the
thin edge that does PB IO, zipping, and streaming. Turndown ships its own Node DOM
(domino), so the route needs no JSDOM; the HTML→Markdown transform stays a pure
function with no IO.

### `ArticleExport` DTO (input to the pure connector)

The route maps PB records into a connector-facing DTO so core never imports PB:

```ts
interface ArticleExport {
  title: string;
  url: string;                 // original article url
  author: string | null;
  siteName: string | null;
  lang: string | null;
  publishedAt: string | null;  // new this phase (§8)
  fetchedAt: string;
  capturedAt: string;          // articles.created
  status: ArticleStatus;       // unread | reading | archived
  tags: string[];              // user's manual tags
  aiTags: string[];            // content.ai_tags_json
  summary: string;             // content.excerpt (AI summary)
  contentHtml: string;
  highlights: Highlight[];
}
```

## 5. The exported `.md` file

### Frontmatter (YAML)
All values string-escaped / safely quoted; lists encoded as YAML sequences. Keys
are `snake_case`. **Reader `progress` is deliberately excluded** so the same article
re-exports byte-identically regardless of read position (the "stable re-export"
goal). Manual and AI tags are split into separate keys so a downstream tool's tag
graph (e.g. Obsidian) is not polluted by machine tags.

```yaml
---
title: "…"
url: "https://…"
author: "…"          # omitted if null
site_name: "…"        # omitted if null
published: "2026-…"   # omitted if null (see §8)
fetched: "2026-…"
captured: "2026-…"    # articles.created
status: reading       # reader state (stable per export; does not churn)
tags: ["…"]           # user's manual tags (omitted if none)
ai_tags: ["…"]        # machine tags (omitted if none)
summary: "…"
---
```

### Body
`content_html` → Turndown + GFM (tables, strikethrough, task lists, fenced code).
Image `src` attributes are kept as their **original remote URLs** (no download).

### Highlights — inline, with a non-lossy fallback
Highlights are anchored to the **rendered** reader content; their offsets do **not**
map onto the converted Markdown. So inline marking is done by **text search on the
rendered Markdown**, not by offset:

1. For each highlight, search the Markdown body for its stored `text`,
   disambiguated by `prefix`/`suffix` when the text occurs more than once.
2. **Found confidently** → wrap the match in `==…==`.
3. **Not found** (Markdown conversion altered the text — e.g. a link became
   `[text](url)`, whitespace collapsed) → append it to a trailing `## Highlights`
   section as a blockquote plus its note.

No highlight is ever silently dropped. The `## Highlights` section is omitted
entirely when every highlight was anchored inline (or there are none).

### Filename
`{slug(title)}.md` using the existing `slug.ts`. Within a single zip, a filename
collision appends a short stable suffix (e.g. a fragment of the article id) so the
mapping stays deterministic and re-export is stable.

## 6. Export route + scopes

One route, scope-parameterized. Every scope reduces to "resolve article-id set →
render → package":

- **single** — one article id → resolve → one raw `.md` download.
- **collection** — a collection id → its article ids (Phase-4 collection seam) →
  zip.
- **filter** — a `tag` and/or `q` (search) query param. The server **re-runs the
  same scoped query the library grid uses** for that caller and exports the result
  → zip. No client-supplied id list; no multi-select.
- **library** — all of the user's articles → zip.

Packaging rule: exactly one file → stream `.md`; otherwise → `jszip` → `.zip`.

### Security
- Every scope resolves its article set **server-side from a single trusted
  input** (an article id, a collection id, query params, or "the caller's
  library") — there is no client-supplied id list to validate. The underlying PB
  queries are all scoped `user = @request.auth.id`, so tenant isolation falls out
  of the query, not a per-id re-check.
- Private articles **are** included — it is the owner exporting their own library.
  This is a per-user export, never a shared/global artifact, so the
  "never globally cache gated content" boundary is not crossed.

## 7. Settings / UI

- **Settings → Connectors** page lists the registry:
  - **Markdown** — active, with an "Export library" action.
  - **Notion**, **Obsidian** — greyed out, "coming soon" (driven by the registry's
    stub flag, not hard-coded markup).
- Contextual export actions reuse existing surfaces:
  - Reader / article menu → **single**.
  - Collection view → **collection**.
  - Library grid with an active tag/search → **filter** (exports the current
    query; no checkboxes/selection).
- All UI references design tokens; no hardcoded colors/fonts (per `CLAUDE.md`).

## 8. `published_at` pipeline addition (option B)

A clean vertical slice so frontmatter carries a real publication date:

1. `packages/types/src/extract.ts` — add `publishedAt: z.string().nullable()` to
   `ExtractResult`.
2. `packages/types/src/content.ts` — add `published_at: z.string().nullable()` to
   `Content`.
3. `apps/worker/src/extract/parse-article.ts` — read a publish date best-effort:
   `Readability`'s `publishedTime`, else `<meta property="article:published_time">`,
   `<meta name="date">`, or `<time datetime>`; normalize to ISO, else `null`. Set
   in both the `ok` and `failed` return branches.
4. X and YouTube extractors — set `publishedAt` best-effort (tweet `created_at` /
   video upload date) or `null`. Shared `ExtractResult` shape, so this is a
   one-field add each; `null` is acceptable.
5. `apps/worker/src/worker.ts` — write `published_at: result.publishedAt` on the
   `content` row.
6. `pocketbase/pb_migrations/` — new migration adding the `published_at` column to
   `content` (nullable text). Migrations are tracked in git.

No other shape churn. Existing extractor tests get a `publishedAt` assertion;
the field defaults to `null` where a source has no date.

## 9. Error handling

- Stub connectors (`notion`/`obsidian`) throw a typed `NotImplementedError`; the UI
  only ever offers `markdown` as active, so this is a guard, not a user path.
- **Empty scope** (0 resolved articles) → a friendly "nothing to export" response,
  not an empty zip.
- **Render failure, single-article scope** → **fail loud**: the request errors with
  the reason; nothing is downloaded. There is nothing to "continue past," so a
  half-broken single file is not offered.
- **Render failure, multi-article (zip) scope** → **continue**: the failing article
  is skipped and recorded; the zip still completes for the rest, and an
  `_export-report.md` manifest at the zip root lists every skipped article (title,
  url, reason). Partial export is never silent.
- A content-less article (extraction still pending/failed) exports frontmatter +
  a note that the body is unavailable, rather than erroring — this is not a render
  failure and does not go in the manifest.

## 10. Testing (TDD)

- **Pure render** (fixtures → exact Markdown):
  - frontmatter field set, `snake_case` keys, YAML escaping of hostile titles
    (quotes, colons, newlines), omitted-null/empty fields, separate `tags` /
    `ai_tags` encoding, and **no `progress` key**.
  - **stable re-export** — same input renders byte-identical output across runs.
  - GFM body: tables, fenced code, links, strikethrough preserved.
  - inline `==mark==` for a locatable highlight; fallback `## Highlights` for an
    unlocatable one; section omitted when empty.
  - deterministic filename + collision suffix.
- **Registry:** `markdown` resolves and exports; `notion`/`obsidian` throw
  `NotImplementedError`; `list()` reports stub state for the UI.
- **Route:**
  - tenant isolation — every scope's PB query is `user`-scoped, so a caller's
    export never includes another user's articles (collection/filter/library all
    resolve only the caller's set).
  - scope resolution — single/collection/filter(tag+q)/library each resolve the
    right set server-side.
  - packaging — single → `.md`, many → `.zip`; empty → friendly response.
  - failure handling — single bad article fails loud; multi skips it, completes the
    zip, and writes `_export-report.md` listing the skip.
- **Pipeline:** `parse-article` extracts a publish date from each metadata form and
  yields `null` when absent; worker writes `published_at`.

All connector/extractor tests are offline against saved fixtures — no live network.

## 11. Risks

- **Inline highlight anchoring is best-effort.** Markdown conversion mutates text,
  so some highlights land in the fallback section. This is by design (non-lossy) and
  covered by tests; perfect inline fidelity is explicitly not promised.
- **Turndown fidelity** on adversarial HTML. Mitigated by GFM plugin + the
  per-article failure isolation in §9.
- **Publish-date coverage is uneven** across sources; `null` is a valid, expected
  outcome and the frontmatter omits the field rather than guessing.
