# Reading Progress — Design

**Date:** 2026-07-06
**Status:** Approved (design), pending implementation plan
**Phase:** Gap closure (Phase 2 reader shell) + small Phase 4 library surface; no
roadmap reordering

## Problem

The pieces for reading progress already exist — `articles.progress` (0–1) in
PocketBase, its Zod type, a debounced scroll handler that writes it, a top
progress bar in the reader, and a `finished` library filter at `progress >=
0.98` — but none of it is actually visible or reliable to a user:

1. **Reader bar starts wrong.** `progress` is seeded at `0` and only updated
   after the first debounced scroll event. Reopening a 60%-read article shows
   an empty bar until the user scrolls.
2. **No resume.** The saved `progress` is fetched with the article but never
   used to restore scroll position — every reopen starts at the top.
3. **Library grid shows nothing.** `ArticleCard` has no progress signal at
   all — an in-progress article looks identical to an unread one.
4. **Progress isn't always saved.** The only write path is the scroll
   handler's 400ms debounce. Two concrete gaps:
   - **Short articles**: if content fits within the viewport
     (`scrollHeight <= innerHeight`), no `scroll` event ever fires, so
     `progress` is never written — a fully-read short article stays at 0
     forever.
   - **Lost final write**: if the tab closes or the user navigates away
     within the 400ms debounce window, the last pending save never reaches
     PocketBase (a bare `setTimeout` doesn't survive tab close).

Goal: make existing progress data correct, persistent, and visible, without
adding a new feature surface (no reading goals/history — that's the distinct,
unbuilt Phase 8 placeholder).

## Non-goals

- No server-side route for saving progress. Stays a direct client PocketBase
  write (existing pattern) — not something in scope here.
- No reading-goals / weekly-target / `reading_events` history feature (Phase 8
  placeholder, separate spec).
- No visual redesign beyond reusing existing tokens/patterns (Phase 3 already
  ran; this doesn't introduce new visual language).

## Architecture

### Shared thresholds (`@readmepls/core`)

New `packages/core/src/library/progress.ts`:

```ts
export const STARTED_THRESHOLD = 0.02;   // below this: unread — no bar, no resume
export const FINISHED_THRESHOLD = 0.98;  // existing constant, relocated here
```

`packages/core/src/library/query.ts` imports `FINISHED_THRESHOLD` from here
instead of its private local constant — one source of truth for the `finished`
filter, the reader's resume gate, and the library card's visibility gate.
Re-exported from the `@readmepls/core` package index.

### Reader page (`apps/web/src/routes/read/[id]/+page.svelte`)

**Seed on load.** Set `progress = article.progress ?? 0` immediately when
`article` is fetched in `onMount`, before `content` resolves — the `.progress`
bar div renders even during the skeleton-loading state, so this alone fixes
the "starts at 0" bug.

**Resume scroll.** After the existing `await tick()` call (content is in the
DOM — the same point already used before highlight anchoring runs):

- Compute `max = document.body.scrollHeight - window.innerHeight`.
- If `max <= 0` (content fits the viewport — nothing to scroll): treat as
  fully read. Set `progress = 1` and save immediately (see Save reliability
  below) — no scroll event will ever fire to do this later.
- Else if `progress > STARTED_THRESHOLD`: `window.scrollTo(0, progress *
  max)` — instant, no smooth-scroll (avoids an animated jump reading as
  jumpy on long articles). Below the threshold, skip — not worth resuming a
  barely-started article.

This is the exact inverse of the existing `onScroll` formula
(`p = scrollY / max`), so scroll-triggered saves and resume agree.

**Save reliability.** Replace the bare debounce with debounce + explicit
flush:

- `scheduleSave(p)` — existing behavior: clear/reset a 400ms timer, then
  write `p` to PocketBase.
- `flushSave()` — new: clears any pending timer and writes the
  currently-computed progress immediately (no debounce delay). Called from:
  - **`onDestroy`** — covers in-app navigation away (back to library,
    archive, delete-then-redirect, etc.), which already exists as a Svelte
    lifecycle hook here.
  - **`visibilitychange`** listener, when `document.hidden` — covers tab
    close, tab switch, and mobile backgrounding. Preferred over
    `beforeunload`/`unload`, which are unreliable (especially on mobile) —
    `visibilitychange` is the recommended pattern for persisting state before
    a page may disappear.

### Library card (`apps/web/src/lib/components/ArticleCard.svelte`)

- Widen the card's prop type to include `progress?: number` (the
  `ArticleRecord` passed in from `/library/+page.svelte` already carries it —
  `fetchLibraryPage` has no field restriction, so no query change needed).
- Add a bottom bar inside `Card`: same visual language as the reader's bar
  (`--color-accent`, width driven by a `--p` custom property), shown only
  when `STARTED_THRESHOLD < progress < FINISHED_THRESHOLD`. Hidden for
  unread, finished, processing, and failed/partial states.
- Decorative, `aria-hidden="true"` — matches the existing reader-bar pattern;
  no new accessibility surface to design.

## Data flow

```
reader open  → getOne(article) → progress seeded from article.progress
             → tick() (content in DOM)
             → max<=0 ? progress=1, flushSave() : progress>THRESHOLD ? scrollTo(progress*max)
             → scroll listener attached

user scrolls → debounced (400ms) → progress updated → scheduleSave (PB write)

tab hidden / component destroyed → flushSave() → immediate PB write, bypasses debounce

library load → fetchLibraryPage (unchanged) → ArticleCard renders bar from article.progress
```

## Testing (TDD — failing test first)

- **Reader page**: `progress` is seeded from the fetched article before any
  scroll occurs (currently unasserted).
- **Resume-scroll math**: `scrollTo` called with `progress * max`; skipped
  when `progress <= STARTED_THRESHOLD` or `max <= 0`.
- **No-scroll finish**: when `max <= 0`, `progress` is set to `1` and saved
  immediately, without waiting for a scroll event.
- **Flush on leave**: `flushSave` fires on `onDestroy` and on
  `visibilitychange` with `document.hidden`, writing the current progress
  immediately (pending debounce timer is cancelled, not double-fired).
- **`ArticleCard`**: bar renders/hides at the correct thresholds, using the
  shared `STARTED_THRESHOLD`/`FINISHED_THRESHOLD` constants; hidden for
  processing/failed/partial/unread/finished states.
- **`query.test.ts`**: continues to pass unchanged, now importing
  `FINISHED_THRESHOLD` from the shared `progress.ts` module.

## Schema / migration

No schema change — `articles.progress` already exists and is already typed.
No new PocketBase migration needed.
