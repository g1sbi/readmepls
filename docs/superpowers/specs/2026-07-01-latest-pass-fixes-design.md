# Latest-pass fixes — design

Date: 2026-07-01
Phase: Phase 4 polish (collections/archive UI, reader chrome)

Six fixes from a UI pass. Each is small; two share a new primitive
(`DropdownMenu`) and a shared "add to collection" surface.

## Goals

1. A clean way to add an article to a collection — from the library card and
   from the reader detail.
2. Fix the pill-in-pill font controls in the reader.
3. Remove collection *creation/management* from the reader detail.
4. Make "archive" do something visible — archived articles leave the default
   library view, gain a dedicated view, and can be unarchived.
5. Fix article/card titles rendering black in the dark theme.
6. Keep the top header sticky.

## Non-goals

- No collection creation from the reader (creation stays in the library
  `CollectionsPanel`).
- No new archived *route* — archived is a filter in the library rail.
- No redesign of the card layout beyond swapping the trash button for a menu.

---

## New primitive: `ui/DropdownMenu.svelte`

A reusable trigger + popover-panel menu. Powers both the card `⋯` menu and the
reader "add to collection" button, so the interaction is built and tested once.

- **API:** `trigger` snippet (the button contents / aria-label) and `children`
  snippet (the panel contents). Exposes an internal `open` state; closes on
  outside click, `Escape`, and after an item is chosen.
- **Behavior:** panel renders below the trigger. Keyboard: `Escape` closes and
  returns focus to the trigger; arrow/tab navigation follows native focus order
  of the buttons inside the panel. `focus-visible` ring via existing tokens.
- **Style:** `--color-surface-raised` background, `--radius-md`, `--shadow-md`,
  `1px solid var(--color-border)`. No hardcoded colors — tokens only.
- **Item helper:** panel content uses plain `<button>`s styled by a shared
  `.menu-item` class defined in the primitive (full-width, left-aligned,
  hover `--color-accent-wash`). Dividers via a thin `--color-border` rule.

The primitive renders arbitrary panel content; the collection list, archive, and
delete rows are composed by the consumer.

## 1 + 3 + 4a — `ArticleCard` consolidated `⋯` menu

Replace the hover-revealed trash button with a `⋯` menu trigger (same
reveal-on-hover, always-visible-on-touch behavior the trash button had).

**Panel contents (flat sections, top to bottom):**

1. **add to collection** — a small section label, then one `.menu-item` button
   per existing collection. Choosing one calls `onAddToCollection(articleId,
   collectionId)`. Existing collections only; no create input. If there are no
   collections, show a muted "no collections yet" line.
2. divider
3. **archive** or **unarchive** — label chosen by `article.status`
   (`"archived"` → "unarchive", else "archive"). Calls `onArchive(id)` /
   `onUnarchive(id)`.
4. divider
5. **delete** — opens the existing `ConfirmDialog`; confirm calls `onDelete(id)`.

**Props (additions to current `article` / `onRetry` / `onDelete`):**

```ts
collections?: { id: string; name: string }[];
onAddToCollection?: (articleId: string, collectionId: string) => void;
onArchive?: (id: string) => void;
onUnarchive?: (id: string) => void;
```

The menu only renders when `collections`/handlers are provided, so the
`processing` / `failed` card states are unaffected. `ArticleRecord.status` is
already on the record; read it to pick the archive label.

## Reader detail (`routes/read/[id]/+page.svelte`)

- **Remove** `AddToCollection`: delete the import and its usage in the rail.
  Delete `lib/components/AddToCollection.svelte` and
  `lib/components/AddToCollection.test.ts` (this page is the only consumer).
  Remove the now-unused `createCollection` handler; keep `loadCollections` and
  `addToCollection`.
- **Add** an "add to collection" control in the existing `article-actions`
  group, rendered as a `DropdownMenu` whose panel lists existing collections
  only (reuse the same `.menu-item` composition — collection section only, no
  archive/delete, those already have their own buttons in the rail).
- **Archive:** after `archive()` succeeds, `goto("/library")` (mirrors the
  delete flow) so the article visibly leaves the default view. On failure, reuse
  the existing inline `deleteError`-style pattern with an archive message.

## 2 — Font controls as a unified segmented control (frontend-design)

- **Remove** the pill wrap: delete the `.reader-layout :global(.controls)` rule
  (the `--radius-pill` + surface background) in the reader page style block.
- **Rebuild** `ReaderControls.svelte` markup as a single segmented control:
  one container (`--radius-md`, `--color-surface`, `1px solid
  var(--color-border)`, `overflow: hidden`), three flush segments — decrease
  (`A-`), increase (`A+`), font toggle (serif/sans) — separated by
  `1px var(--color-border)` dividers. Segments are custom `<button>`s (not the
  shared pill `Button`), full-height, hover `--color-accent-wash`,
  `focus-visible` ring. Preserve current a11y: `role="group"`, `aria-label`,
  the `sr-only` labels, and the `clampSize` bounds (14–24) / font-toggle logic.
- Visual proportions (segment padding, divider weight, icon sizing) decided
  during implementation with the `frontend-design` skill. Tokens only.

## 5 — Dark-theme titles

Root cause: base tokens define `--color-text` but nothing binds it to the
document, so unstyled headings (e.g. `ArticleCard` `<h3>`) fall back to the UA
default (black), which is invisible on dark surfaces. The reader `<h1>` is
unaffected because `.reader` sets its own `color: var(--reading-text)`.

**Fix:** add `body { color: var(--color-text); }` to `app.css`. This binds all
otherwise-unstyled text to the themed color across light/dark/sepia. Verify the
reader still reads its own `--reading-text` (it sets `color` on `.reader`, so it
overrides the inherited body color).

## 6 — Sticky header

`TopBar` `.topbar`: add `position: sticky; top: 0; z-index: 20;`. Background is
already opaque (`--color-surface`), so scrolled content won't show through.
`z-index: 20` sits above the reader progress bar (`z-index: 10`) so the header
stays on top. The header is the first child of `.app` (normal document flow), so
`top: 0` sticks it to the viewport top as the page scrolls.

## Library wiring (`routes/library/+page.svelte`)

- **Default filter:** `load()` requests `status != "archived"`
  (`pb.filter('status != {:s}', { s: 'archived' })`).
- **Archived toggle:** an `archived` boolean state; a toggle chip in the `Rail`
  (below the tag filter) styled like the existing `.tag-chip`. When active,
  `load()` requests `status = "archived"` and the grid shows archived items.
- **Handlers passed to each `ArticleCard`:** `collections`, plus
  `onAddToCollection` (create a `collection_items` record — same shape as the
  reader's `addToCollection`), `onArchive` / `onUnarchive` (update
  `articles.status`). The existing realtime `subscribe("*")` re-runs `load()`,
  so the grid refreshes after archive/unarchive; reuse the existing
  `articleError` inline-error pattern on failure.

## Data / migrations

None. `articles.status` is a free-text field; `"archived"` is already written by
the reader's `archive()`. No schema change.

## Testing (TDD, Vitest + Testing Library)

- **`DropdownMenu`:** opens on trigger click; closes on outside click, on
  `Escape` (focus returns to trigger), and after an item click; panel items are
  focusable.
- **`ArticleCard`:** `⋯` menu renders when collections/handlers are passed;
  choosing a collection calls `onAddToCollection` with the right ids; archive vs
  unarchive label follows `status`; archive/unarchive/delete call their
  handlers; delete still confirms via `ConfirmDialog`; `processing`/`failed`
  states render no menu.
- **Library:** default load excludes archived (filter asserted); toggling
  archived requests `status = "archived"`; add-to-collection handler creates a
  `collection_items` record.
- **Reader:** `AddToCollection` no longer rendered; the add-to-collection button
  opens a menu of existing collections and adds on click; archive triggers
  `goto("/library")`.
- **Visual (manual):** body-color dark-theme fix and sticky header verified in
  the running app (not unit-testable). Note in the PR/commit.

## Files touched

- **New:** `lib/components/ui/DropdownMenu.svelte` (+ test).
- **Edit:** `lib/components/ArticleCard.svelte` (+ test), `ReaderControls.svelte`
  (+ test), `routes/read/[id]/+page.svelte`, `routes/library/+page.svelte`,
  `lib/components/TopBar.svelte`, `app.css`.
- **Delete:** `lib/components/AddToCollection.svelte`,
  `lib/components/AddToCollection.test.ts`.
