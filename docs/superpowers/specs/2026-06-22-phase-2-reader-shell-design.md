# Phase 2 — Reader Shell + Typography — Design

**Date:** 2026-06-22
**Status:** Approved design, pre-implementation
**Builds on:** `2026-06-21-reader-app-design.md` (master design),
`2026-06-21-phase-1-core-capture-loop.md` (delivered backend capture loop).

## 1. Summary

Phase 1 delivered the backend capture loop (canonicalize → dedupe → extract →
AI-tag → store) with no frontend. Phase 2 builds the first usable end-to-end app:
a user signs in, captures URLs, watches them go ready in a live library, and reads
them in a typography-controlled reader. It also closes three gaps in the Phase-1
loop that block a working reader.

**Phase 2 is structural, not visual.** Components are built for reuse and
correctness; styling is limited to defining a single design-token source and
applying it minimally. All distinctive visual design (landing page, motifs,
animations, polish) is **Phase 3**, a dedicated frontend-design phase, so the two
concerns never mix.

## 2. Goals / Non-Goals

### Goals
- Auth: sign in / sign up via PocketBase, server-side session wiring.
- Library: capture bar, article list, **realtime** processing→ready/failed flip.
- Reader: render sanitized content, typography controls, reading-state tracking.
- Typography prefs persisted to the user record (cross-device).
- Close Phase-1 gaps: HTML sanitization, article→content linking, worker poll loop.
- Reusable component architecture: shared UI primitives, one token source, no
  duplicated markup/CSS, no hardcoded colors/fonts.

### Non-Goals (deferred)
- **Visual design / landing page / polish** → Phase 3 (frontend design language).
- Editable per-user tags, collections, highlights, full-text search → Phase 4.
- X/Twitter, YouTube, paywall extractors → Phase 5.
- Connectors, Markdown export → Phase 6.
- SaaS tier-gating UI, Docker Compose, self-host packaging → Phase 7.
- E2E (Playwright) — deferred per master design §10.

## 3. Phase-1 Gap Closures (backend; do first)

These are prerequisites — without them the reader has nothing correct to show.

### A. Sanitize HTML at write time
The worker stores raw `@mozilla/readability` output in `content.content_html`.
The reader renders it with `{@html}` → stored XSS. Master design §4 already
specifies "content_html (sanitized)"; it was never implemented.

- Pure function `sanitizeContentHtml(html: string): string` using `sanitize-html`.
- Strips `<script>`, `<style>`, event-handler attributes, `javascript:` URLs,
  `<iframe>`/`<object>`; allows article tags (`p a img h1-h6 ul ol li blockquote
  pre code em strong figure figcaption hr br`) and safe attrs (`href src alt
  title`).
- Applied **in the extractor** so `content_html` is clean before it ever reaches
  PocketBase — the global cache stays safe for every consumer.
- Lives in `apps/worker/src/extract/sanitize.ts` (pure, unit-tested). It belongs
  to extraction normalization, alongside the extractor.

### B. Link article → content on completion
On a cache MISS, `handleCapture` creates an `articles` row with an empty `content`
ref. The worker creates the `content` row and links it to the **job**, never to
the user's article — so the capturing user's article stays content-less forever.

Fix:
- Add denormalized `canonical_url` (text) to `articles`. `handleCapture` sets it
  on every article it creates.
- After `processJob` writes the `content` row, it updates **all** `articles` whose
  `canonical_url` matches the job and whose `content` is empty: set `content` ref
  and `is_private = false`. This links every user who captured the same deduped URL.
- The article's AI tags are read directly from `content.ai_tags_json` (read-only)
  in Phase 2. Editable per-user `article_tags` seeding is Phase 4 (with the tags UI).

### C. Worker poll loop
Phase 1 built `claimNextJob` and `processJob` but no long-running entrypoint.

- `apps/worker/src/main.ts`: loop → `claimNextJob` → `processJob`; sleep on empty
  queue; restart on transient error. Real deps wired: `fetchHtml` (HTTP with the
  Phase-1 SSRF guard), `ArticleExtractor`, resolved `AIProvider`, `classifySource`.
- Retry: failed jobs with `attempts < 3` are reclaimed via the existing stale-lock
  path; after 3 they stay `failed` and surface in the UI with a manual retry button
  (retry = reset job to `queued`).
- Runnable: `pnpm --filter @readmepls/worker start`.

## 4. Frontend Architecture

SvelteKit (Svelte 5 runes), PocketBase JS SDK used directly from the browser per
master design Approach C (auth, CRUD, realtime). SvelteKit server handles only
secret-bearing actions (`/api/capture`, already built).

### Auth wiring
- `apps/web/src/hooks.server.ts`: per request, construct a PB client, hydrate
  `authStore` from the request cookie, expose `locals.pb` and `locals.userId`,
  and write the refreshed auth cookie back on the response. This closes the
  existing `/api/capture` `locals.userId` gap (currently unset).
- `apps/web/src/lib/pb.ts`: browser-side PB singleton for SDK calls; shares the
  auth cookie with the server.

### Routes
- `/login` — sign in (`pb.collection('users').authWithPassword`) and sign up
  (`users.create`). Redirects to `/` on success. Unauthenticated access to `/`
  and `/read/[id]` redirects here (guarded in `hooks.server.ts` / `+layout`).
- `/` **library** — `CaptureBar` (POST `/api/capture`); article grid loaded via
  PB SDK (`getList`, `expand: 'content'`); **realtime subscription** on `articles`
  scoped to the user so cards flip live. Each card's state is a union derived from
  the linked content's `extract_status`:
  `processing | ready | partial | failed`. `failed`/`partial` show the reason and
  a retry button. Read-only AI tags rendered from `content.ai_tags_json`.
- `/read/[id]` **reader** — loads the article + expanded content; renders
  `content_html` (already sanitized) via `{@html}`; `ReaderControls` panel;
  reading state: marks `reading` on open, debounced scroll-position → `progress`
  (0..1), and an archive action (`status = archived`).

### Reusable component discipline (Phase 2 priority)
- `$lib/components/ui/` primitives consumed by every route — no duplicated markup
  or CSS: `Button`, `Card`, `Input`, `Tag`, `Spinner`.
- Feature components compose primitives: `CaptureBar`, `ArticleCard`,
  `ReaderControls`.
- Single token source `$lib/styles/tokens.css` is the only place colors, fonts,
  radii, and shadows are defined. **No literal hex or font names in components.**
- Shared data types come from `@readmepls/types`; shared logic from
  `@readmepls/core`. No cross-app or duplicated logic.

## 5. Typography & Preferences

- New `reader_prefs` (json) field on `users`.
- `ReaderPrefs` Zod schema in `@readmepls/types`:
  - `font: 'serif' | 'sans'`
  - `size: number` (px, clamped, e.g. 14–24)
  - `lineHeight: number` (e.g. 1.3–2.0)
  - `width: 'narrow' | 'normal' | 'wide'`
  - `theme: 'light' | 'dark' | 'sepia'`
- Pure `withReaderDefaults(partial): ReaderPrefs` in `@readmepls/core` — fills and
  clamps. Unit-tested.
- Applied as runtime CSS custom properties on the reader container, layered on top
  of `tokens.css`; theme via a `data-theme` attribute. Controls write prefs back to
  the user record via the PB SDK (debounced).

## 6. Design Tokens (single source; minimal application)

`tokens.css` derives from `assets/_banner.html`, the project's design-language
seed. Phase 2 **defines** the tokens and uses them only where structurally needed
(theme variables, reader prefs). Components are otherwise left visually plain —
all distinctive styling, motifs, and polish are Phase 3.

Tokens (CSS custom properties):
- Color: `--paper-1 #F7F3EA`, `--paper-2 #F1ECDF`, `--paper-3 #EAE3D2`,
  `--ink #211E17`, `--accent #C24A38`, `--muted #6E6453`, `--faint #AC9F86`,
  `--fold #E4DCC8`.
- Type: `--font-display "Fredoka"`, `--font-ui` (system stack),
  `--font-reader-serif`, `--font-reader-sans`.
- Radius / shadow scale placeholders for Phase 3 to expand.

## 7. Data Model Changes

- `articles`: add `canonical_url` (text, indexed) — links worker output back to the
  capturing user's article (§3B).
- `users`: add `reader_prefs` (json) — typography preferences (§5).
- New migration file under `pocketbase/pb_migrations/`. Up adds the fields; down
  removes them. No changes to existing collections' rules.

## 8. Error & State Handling

- Card/reader state is a type-checked union from `extract_status`
  (`processing|ready|partial|failed`), never booleans.
- `failed`/`partial`: show `failure_reason`; retry resets the job to `queued`.
- Unauthenticated → redirect to `/login`. Capture `402` (quota) → upgrade prompt.
- Reader for a not-yet-ready article shows a processing placeholder that flips via
  realtime.

## 9. Testing

- **Unit:** `sanitizeContentHtml` (script/onclick/iframe/`javascript:` stripped;
  `p/a/img/h2/blockquote/code` kept); `withReaderDefaults` (defaults + clamping).
- **Integration (ephemeral PB):** article→content linking, including concurrent
  captures of one deduped URL; reader-prefs round-trip through the user record.
- **Component (Vitest + @testing-library/svelte):** card renders each union state;
  `ReaderControls` emits pref changes; primitives render and forward props/events.
- **E2E:** deferred (master design §10).
- TDD per unit: failing test first, then implementation.

## 10. Out of Scope (later phases)

- **Phase 3:** Frontend design language & visual polish — landing page from
  `assets/_banner.html`, paper/dog-ear/grain motifs, Fredoka, theme variants,
  animations, empty/loading/error visuals, responsive layout. Uses the
  `frontend-design` skill. Builds on the Phase 2 token source and components.
- **Phase 4:** highlights/notes (anchoring), full-text search, tags/collections UI.
- **Phase 5:** X/Twitter + YouTube extractors, paywall fallback.
- **Phase 6:** connector seam + Markdown export; Notion/Obsidian stubs.
- **Phase 7:** SaaS tier-gating UI, Docker Compose deploy, self-host packaging.

## 11. Risks

- **Stored-HTML XSS** — mitigated by sanitizing at write time (§3A); the reader is
  the first renderer, so this must land before the reader ships.
- **Realtime auth scope** — the subscription must be user-scoped; PB API rules
  (`user = @request.auth.id`) remain the boundary, not the client filter.
- **Concurrent-capture linking** — multiple users on one deduped job; the
  update-all-matching-articles step (§3B) is covered by an explicit test.
