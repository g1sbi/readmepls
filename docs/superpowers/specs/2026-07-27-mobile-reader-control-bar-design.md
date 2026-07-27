# Mobile Reader Control Bar — Design Spec

**Date:** 2026-07-27
**Status:** Approved, pending implementation
**Branch:** `feat/mobile-reader-control-bar` (git worktree)

## Goal

Replace the mobile reader's scattered top-of-page controls with a single
**persistent bottom control bar** reachable from anywhere in the article. Today
every reader control (typography, chapters, tags, actions) collapses to the top
of the page on mobile, and chapters additionally hides behind a top-bar button —
so jumping chapters or changing fonts mid-read means scrolling back to the top.
The bottom bar puts those controls one thumb-tap away at any scroll position.

## Non-goals

- Any change to the **desktop** reader (`≥1024px`) — the 3-column Rail layout
  stays exactly as-is.
- New data, persistence, PocketBase, or worker changes. This is pure frontend
  chrome over existing state and components.
- Edge-swipe-to-**open** gestures. The bar is the reach mechanism; drag only
  **dismisses** an open sheet.
- Remembering the last-open sheet across sessions.
- Search / collections navigation while reading (you exit to library first).

## Decisions (locked during brainstorming)

1. **Scope:** unify *all* mobile reader controls into one surface (not chapters
   alone) — they share the same top-of-page problem.
2. **Pattern:** a persistent **bottom control bar + bottom sheets** (the mobile-
   reader gold standard), not an edge-swipe drawer or FAB.
3. **Bar items (4):** `aa` (typography) · `chapters` · `highlights` · `more`.
4. **Bar behavior:** auto-hide on scroll-down, reveal on scroll-up / at top /
   at bottom.
5. **Sheets:** shadcn-svelte **Drawer** (vaul-svelte) bottom sheets with a
   drag-to-dismiss grabber.
6. **Global-nav integration:** on `/read` (mobile) the global `BottomNav` is
   **suppressed** and the reader bar replaces it.
7. **Exit:** a floating, absolutely-positioned **`← library`** at the top-left,
   whose visibility is **bound to the bar's** visibility (both reveal/hide
   together). Replaces the current in-flow top back-link.

## Context: what exists today

- Reader page: `apps/web/src/routes/read/[id]/+page.svelte`. Single-column below
  `1024px`; 3-column grid (`Rail | article | HighlightsSidebar`) at `≥1024px`.
  The `Rail` (`ui/Rail.svelte`) renders the *same* children at both breakpoints,
  stacking at the top on mobile: `ReaderControls` (typography), a `rail-chapters`
  section, `TagEditor`, and an inline `.article-actions` group (add-to-collection
  `DropdownMenu`, archive, delete). Chapters also has a mobile `.toc-trigger`
  button in the top `.bar` that opens a right-edge `Sheet` (`mobileTocOpen`).
- Global nav: `BottomNav.svelte`, rendered in the root `+layout.svelte` on every
  route, **mobile only** (`@media (max-width: 640px)`). Tabs: `library` (link,
  active on `/library` or `/read`), `search` (opens the search palette),
  `collections`. Auto-hides via the pure `nextNavVisible(prevY, curY, visible)`
  helper in `bottom-nav-scroll.ts`.
- The two bottom bars would collide on `/read` at `≤640px`; above `640px` the
  global nav is not shown at all.

## Architecture

### Components

- **`ReaderControlBar.svelte`** *(new, presentational)*
  - Props: `{ hasChapters: boolean; hidden: boolean; active: SheetKey | null;
    onOpen: (sheet: SheetKey) => void }` where
    `SheetKey = 'type' | 'chapters' | 'highlights' | 'more'`.
  - Renders a `<nav aria-label="reader controls">` fixed to the bottom with four
    icon buttons (chapters button omitted when `!hasChapters`). Each button
    calls `onOpen(key)`; the button matching `active` gets `aria-current`.
  - No business logic. `padding-bottom: env(safe-area-inset-bottom)`, tap targets
    ≥44px, `data-hidden` toggles a `translateY(100%)` transform.

- **`BottomSheet.svelte`** *(new)* — thin wrapper over the shadcn-svelte
  **Drawer** primitive (add via `pnpm dlx shadcn-svelte@latest add drawer`).
  Props: `{ open: boolean; onClose: () => void; title: string; children }`.
  Provides the drag-to-dismiss grabber, backdrop, focus trap, scroll-lock, and a
  lowercase title header. Mirrors how the existing `Sheet.svelte` wraps the
  right-edge Dialog. Composed — no direct `bits-ui`/`vaul` imports in feature
  components.

- **`ArticleActions.svelte`** *(new, extraction)* — the current inline
  `.article-actions` markup (add-to-collection `DropdownMenu` + archive + delete)
  lifted into one component. Props: the handlers/data it needs
  (`collections`, `onAddToCollection`, `onArchive`, `onDelete`). Consumed by
  **both** the desktop Rail and the mobile `more` sheet — zero duplication.

- **Reused unchanged inside sheets:** `ReaderControls` (`type`),
  `ChaptersSidebar` (`chapters`), `HighlightsSidebar` (`highlights`),
  `TagEditor` + `ArticleActions` (`more`).

### State & data flow (reader page)

- Replace the boolean `mobileTocOpen` with a union:
  `let activeSheet = $state<SheetKey | null>(null)`. Opening one sheet closes
  others (single-sheet-at-a-time). Models states as a union per repo convention.
- `let controlsVisible = $state(true)` — drives **both** the bottom bar and the
  floating back-link. Updated by a scroll listener using the existing
  **`nextNavVisible`** helper (same feel as the global nav), folded into the
  reader's existing scroll/visibility listeners + `onDestroy` cleanup. Reduced-
  motion disables the slide transition.
- Every sheet body is a thin wrapper fed the **same** existing reactive state and
  handlers: `prefs`/`savePrefs`; `toc`/`activeHeadingId`/`jumpToHeading`;
  `highlights`/`orphans`/`jumpTo`/`deleteHighlight`; `manualTags`/`collections`
  and their handlers; `archive`/delete. No new data. The `IntersectionObserver`
  scroll-spy already maintained keeps driving the active chapter inside its sheet.
- `jumpToHeading` continues to close the active sheet after scrolling (was
  `mobileTocOpen = false` → becomes `activeSheet = null`).

### Template restructure

- **`Rail` becomes desktop-only** (`≥1024px`). Its children are no longer stacked
  at the top on mobile; on mobile they are reached only through the bottom-bar
  sheets. The mobile-stacked `HighlightsSidebar` likewise moves into its sheet.
- The top `.bar` in-flow back-link becomes **desktop-only** (`≥1024px`,
  unchanged there). On mobile (`<1024px`) it is replaced by a new floating
  **`← library`** (`position: fixed`, top-left, `env(safe-area-inset-top)`-aware,
  `--color-surface` pill for legibility over prose) whose visibility is bound to
  `controlsVisible`. The `.toc-trigger` button and the right-edge chapters
  `Sheet` (both mobile-only today) are **removed** outright.
- The `ReaderControlBar` + the four `BottomSheet`s render only `<1024px`.
- Article content gets `padding-bottom` so its last lines clear the bar when
  shown.

### Global-nav integration (`+layout.svelte`)

- Suppress the global `BottomNav` on reader routes:
  `{#if !$page.url.pathname.startsWith("/read")}<BottomNav … />{/if}`. It is a
  no-op above `640px` anyway; the meaningful effect is removing the collision at
  `≤640px`, where the reader bar takes over. Add a `bottomnav.test.ts` case
  asserting suppression on `/read` if practical (the component takes `pathname`,
  so gating lives in the layout — test at the layout level or document the gate).

### Breakpoints

- Reader control bar + floating back-link + sheets: **`<1024px`** (the single-
  column reader range).
- Global-nav swap-out matters at **`≤640px`** (where the two bars would overlap).
- `≥1024px`: desktop Rail, no bar, no floating back-link — the in-flow top `.bar`
  `← library` link remains exactly as today.

## Styling

Tokens only — bar/back-link use `--color-surface`, `--color-border`; icons
`--color-text-muted`; active item `--color-accent`; slide via `--dur-*` /
`--ease-paper` (match the global nav's transition). Lowercase labels. Mobile-
first, safe-area-aware (`env(safe-area-inset-bottom|top)`), no horizontal
overflow at 360px, tap targets ≥44px. `prefers-reduced-motion` removes the slide.

## Testing (TDD — failing test first per unit)

- **`ReaderControlBar.svelte`**: renders the four items; omits `chapters` when
  `hasChapters=false`; a tap fires `onOpen` with the correct `SheetKey`; the
  `active` item gets `aria-current`; `hidden` toggles the hidden state;
  accessible labels present.
- **`ArticleActions.svelte`**: renders collection dropdown + archive + delete;
  each fires its handler. (Behavior parity with the pre-extraction inline group.)
- **`BottomSheet.svelte`**: opens/closes; `onClose` fires on dismiss; renders its
  child body; title present. (Drawer drag is vaul's — not re-tested.)
- **Reader page (`page.test.ts`, mobile viewport)**: the control bar is present;
  tapping `chapters` reveals the toc `nav` and a jump closes the sheet; an
  article with no headings shows no `chapters` item; the floating `← library`
  exit is present. Desktop: Rail present, no control bar. Update/remove the old
  `.toc-trigger` / `mobileTocOpen` / right-edge chapters `Sheet` assertions.
- **Layout / `BottomNav`**: global nav suppressed on `/read` (asserted at the
  layout level or documented as a layout-owned gate).

## Edge cases

- No toc → no `chapters` bar item (existing behavior preserved).
- No highlights → highlights sheet shows `HighlightsSidebar`'s existing empty /
  orphans state.
- Bar auto-hidden while scrolling down → controls (and exit) return on a small
  scroll-up / at top / at bottom; consistent for all controls.
- A `BottomSheet` open over an auto-hidden bar → the sheet is modal (backdrop +
  scroll-lock); the bar's hidden state is irrelevant while a sheet is open.
- `HighlightPopover` (text-selection) must not be occluded by the bar — content
  `padding-bottom` and z-index ordering keep both usable.

## File touchpoints (summary)

- `apps/web/src/lib/components/ReaderControlBar.svelte` (new) + test.
- `apps/web/src/lib/components/ui/BottomSheet.svelte` (new) + test, and generated
  `apps/web/src/lib/components/ui/drawer/` (shadcn-svelte).
- `apps/web/src/lib/components/ArticleActions.svelte` (new, extraction) + test.
- `apps/web/src/routes/read/[id]/+page.svelte` (bar + sheets + floating back-link,
  union `activeSheet`, `controlsVisible`, Rail → desktop-only, remove
  `.toc-trigger`/`mobileTocOpen`/right-edge chapters Sheet).
- `apps/web/src/routes/read/[id]/page.test.ts` (update).
- `apps/web/src/routes/+layout.svelte` (suppress `BottomNav` on `/read`).
- Reuse `apps/web/src/lib/components/bottom-nav-scroll.ts` (`nextNavVisible`).

## Isolation / workflow

- Implement in a git worktree on branch `feat/mobile-reader-control-bar` (via the
  `using-git-worktrees` skill at implementation start).
- TDD throughout; small Conventional Commits; squash before merge.
