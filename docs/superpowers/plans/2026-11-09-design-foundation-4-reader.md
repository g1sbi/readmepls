# Design Foundation, Plan 4 of 5: Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the reader to the approved renders.

- Hand-tuned Marker typography for every article element.
- No reader settings: prefs shrink to `theme` only.
- Desktop focus mode:
  - chapter ticks that expand into the full list;
  - a highlight map;
  - a highlights panel;
  - a header "⋯" for actions.
- The approved phone reader: a three-slot bar, its sheets, and a highlight
  tray.
- Real loading, failed, partial and end-of-article states.

**Architecture:**

- **Small pieces:** the 800-line reader page is split into focused components
  under `lib/components/reader/`, plus pure helpers under `lib/reader/`. The
  page keeps data loading and wiring only.
- **Typography:** values live in `tokens.css`, with per-breakpoint and
  dark-mode overrides. One stylesheet, `lib/styles/reading.css`, styles every
  article element under a `.prose-reader` class.
- **Layout split:**
  - Desktop (≥64rem) uses the focused layout: `ChapterTicks` on the left
    edge, `HighlightMap` on the right edge, and `HighlightsPanel` from the
    header.
  - Below 64rem the phone layout applies: `ReaderControlBar` and its sheets.
- Plans 1–3 are done on this branch. This plan only restyles and recomposes
  existing features, plus the owner-approved C2 failed and partial view.

**Tech Stack:** SvelteKit 2 / Svelte 5 (runes, `svelte/reactivity` `MediaQuery`), Tailwind v4 + shadcn primitives (Button, DropdownMenu, Sheet, BottomSheet, Popover, Skeleton), Marker tokens + `marker.css`, PocketBase JS migrations, Vitest + @testing-library/svelte.

**Spec:** `docs/superpowers/specs/2026-11-09-design-foundation-design.md` (#10), section "Reader" plus "Visual language: Marker", "Dark mode" and "Motion".

**Approved renders (binding).** Everything is in
`docs/superpowers/mockups/2026-11-09-design-foundation/reader/`:

- `reader-focused.html`: desktop.
- `reader-phone.html`: phone, **approved exactly as rendered**.
- `reader-typography.html`, `reader-states.html` and `reader-options.html`.
- `notes.md`: **all numeric values**.
- `decisions.md`: A2, B1, C2, and focused desktop option 2.

`reader-desktop.html` (three columns) is **superseded** and is not to be built.

Serve the folder (`python3 -m http.server -d <folder>`) to inspect live
behavior. Implementers copy values from `notes.md` and the render CSS rather
than re-deriving them.

## Global Constraints

- **Components and styling:**
  - Tokens only, no hex in components.
  - shadcn primitives from `$lib/components/ui/`, with no `bits-ui` imports
    outside `ui/` (the `no-hand-rolled` guard enforces this).
  - Feature components carry layout glue only. A new look becomes a
    primitive variant or lives in `reading.css`.
- **Breakpoints:**
  - Desktop focused layout from **64rem (1024px)**. Export it as
    `DESKTOP_QUERY = "(min-width: 64rem)"` from `lib/shell/nav.ts`, next to
    `WIDE_QUERY`.
  - Below 64rem is the phone layout, which includes tablets in portrait.
  - Typography has three tiers: phone `<40rem`, tablet `40rem–63.99rem`,
    desktop `≥64rem`.
- **Touch and pointer:**
  - Tap targets ≥ 44px (invisible hit areas are fine for ticks).
  - No horizontal page overflow at 360px. Wide content scrolls inside its
    own box.
  - No hover-only affordances: every hover state has a focus and a
    tap equivalent.
- **Motion:**
  - Easings: `--ease-out` (expo-out), `--ease-in`, `--ease-bounce`.
  - Durations: `--dur-fast/base/slow/marker`.
  - Under `prefers-reduced-motion` everything is instant and the marker
    shows already drawn.
- **One accent:** marker yellow, used only for the current chapter
  (`--color-marker-soft`), link strokes, the primary swatch, and the motif.
  The progress strip is 2px ink.
- **Copy and type:**
  - All reader copy is sentence case: "Back", "Chapters", "Highlights",
    "More", "Add to collection", "Open original", "Archive", "Delete",
    "Add tag", "End of article", "Retry".
  - Sizes in `rem`.
  - Ronzino for UI and reading; IBM Plex Mono for code.
- **Data and highlights:**
  - Keep every existing reader feature. Add none beyond C2 and the
    display-only items the owner saw in the renders: reading time, saved
    date, header title fade, and the end-of-article rule.
  - Stored highlight color keys stay `terracotta | amber | sage`. Their
    names are Yellow, Rose and Mint.
- **Commands and commits:**
  - Tests: subset `pnpm exec vitest run <pattern>`, all `pnpm test`.
  - Also run `pnpm typecheck` and `pnpm lint`.
  - svelte-check must stay ≤ **43** errors.
  - Use Conventional Commits. End each message with
    `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Articles without headings:** no chapter column on desktop, a two-slot
   bar (Highlights, More) on phones, and no crash in the scroll spy.
   Tasks 5 and 9 pin these.
2. **Wide article content at 360px:** a long `<pre>`, a 7-column `<table>`,
   a wide `<math display="block">` and a 2000px `<img>` must not widen the
   page. jsdom can't lay out, so Task 2 pins the containing CSS rules for
   each element. Gate 4 (Task 11) measures `scrollWidth` in a real browser
   at 360 and 390px.
3. **Malformed or legacy `reader_prefs` rows:**
   - `null`, a string, `{size: 40}` or `{theme:"sepia"}` must migrate
     without aborting.
   - Only a valid `theme` survives; invalid values become `"system"`.
   - Task 1's two-boot migration test covers each row.
4. **Highlights that no longer anchor (orphans):** they are counted in the
   header badge, listed in the panel and sheet with the warning, absent from
   the map, and must never throw while positions are computed. Tasks 6 and 7
   pin these.
5. **The last chapter:** it becomes current when the reader scrolls to the
   bottom, even when its heading never reaches the top 30% of the viewport.
   Task 5's `activeHeadingId` tests pin the bottom-of-page case.

---

### Task 1: Prefs shrink to `theme`; remove reader settings

**Files:**

- Modify: `packages/types/src/reader.ts` and `packages/core/src/reader/prefs.ts` (plus `prefs.test.ts`)
- Create: `pocketbase/pb_migrations/1720400000_reader_prefs_theme_only.js`, `packages/core/src/pb/migration-reader-prefs.test.ts` (mirror `migration-theme-system.test.ts`, including its two-boot pattern)
- Delete: `apps/web/src/lib/components/ReaderControls.svelte` (and its test), `apps/web/src/lib/reader/css-vars.ts` (and its test)
- Modify: `apps/web/src/lib/reader/control-bar.ts`, `ReaderControlBar.svelte` (and its test), `routes/read/[id]/+page.svelte` (and `page.test.ts`), `apps/web/src/lib/styles/theme-scope.test.ts` if it references the removed vars

**Interfaces:**

- Produces:
  - `ReaderPrefs = z.object({ theme: z.enum(["light","dark","system"]) })`.
  - `withReaderDefaults(partial?: unknown): ReaderPrefs`, which never throws.
  - `SheetKey = "chapters" | "highlights" | "more"`.

- [ ] **Step 1: Write the failing tests.**
  - `prefs.test.ts`:
    - `withReaderDefaults()` → `{theme:"system"}`;
    - `withReaderDefaults({theme:"dark", size: 20, font:"serif"})` →
      `{theme:"dark"}` (extra keys dropped);
    - `withReaderDefaults({theme:"sepia"})` → `{theme:"system"}`;
    - `withReaderDefaults("junk")` → `{theme:"system"}`.
  - Migration test, with these rows before → after:
    - `{font:"serif",size:20,lineHeight:1.8,width:"wide",theme:"dark"}` →
      `{theme:"dark"}`;
    - `{size:40}` → `{theme:"system"}`;
    - `null` → unchanged `null`;
    - `"garbage"` → skipped, no abort;
    - `{theme:"sepia"}` → `{theme:"system"}`.

    It uses `saveNoValidate`, and the second boot is a no-op.
  - `ReaderControlBar.test.ts`: the labels are "Chapters", "Highlights",
    "More". Without chapters, only "Highlights" and "More" show. No "text"
    item.
  - Reader `page.test.ts`: no element with
    `aria-label` matching `/text size|font|line height|width/i` is rendered.
- [ ] **Step 2: Run them.**
      `pnpm exec vitest run prefs migration-reader-prefs ReaderControlBar routes/read`.
      Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The reader drops `prefs` state, `savePrefs`, `readerCssVars` and the
    "type" sheet.
  - `--reading-*` comes from tokens only (Task 2).
  - The layout's theme write (`reader_prefs: {...prev, theme}`) stays as is.
- [ ] **Step 4: Run the same command, then `pnpm test`.** Expected: PASS.
- [ ] **Step 5: Commit**
      `feat(web): reader prefs keep only theme; drop reader settings`. Don't
      add `!`: under the pre-1.0 versioning policy that would bump the minor
      version.

### Task 2: Reading typography (`reading.css`) and highlight marks

**Files:**

- Modify: `apps/web/src/lib/styles/tokens.css`. Add these reading tokens:
  - `--reading-size`, `--reading-leading`, `--reading-measure`,
    `--reading-h1..h4`, `--reading-tracking`, `--reading-leading-adjust`;
  - the phone defaults in `:root`;
  - `@media (min-width: 40rem)` and `@media (min-width: 64rem)` overrides
    in `:root`;
  - dark mode: `--reading-text: #dcdcda` (as a primitive token),
    `--reading-math: #ecece9`, `--reading-leading-adjust: 0.05`,
    `--reading-tracking: 0.006em`;
  - `--color-prose-selection: rgb(2 2 3 / .16)` (light) and
    `rgb(255 255 255 / .16)` (dark).
- Create: `apps/web/src/lib/styles/reading.css`, imported from `app.css`. It
  styles everything under `.prose-reader`:
  - `h1`–`h4`, `p`, `a`, `strong`/`em`, `ol`/`ul` (nested), `blockquote`;
  - `code`, `pre`, `figure`/`img`/`figcaption`;
  - `table`, `hr`;
  - footnote refs (`sup > a[href^="#"]`) and the footnotes section
    (`.footnotes`, `ol.references`, `section[role="doc-endnotes"]`);
  - `math` and `math[display="block"]`;
  - `::selection`;
  - `mark[data-hl-id]` keyed by `[data-hl-color]`.
- Modify: `apps/web/src/lib/highlight/render.ts`. Stop setting inline
  `background` and `borderRadius`; the marks are styled by `reading.css`
  through `data-hl-color`.
- Modify: `routes/read/[id]/+page.svelte`. Remove the page's prose
  `:global` rules, and give the article `class="prose-reader"`.
- Modify: `routes/+layout.svelte`. The `.progress` strip becomes 2px
  `--color-ink`, at `top: env(safe-area-inset-top)`.
- Test: `apps/web/src/lib/styles/reading.test.ts`, which reads the CSS
  files as text like `tokens.test.ts` does; `highlight/render.test.ts`.

**Interfaces:**

- Produces:
  - the `.prose-reader` class contract, consumed by Tasks 7–10;
  - `mark[data-hl-id][data-hl-color]` styling, consumed by Task 8's draw-in.

All values come from `notes.md` → "Type, per breakpoint", "Dark tuning" and
"Highlights". Copy them exactly:

- body 1.0625 / 1.125 / 1.1875rem;
- leading 1.6 / 1.62 / 1.64;
- measure: full width with 1.25rem gutters, then 36rem, then 38rem;
- headings Ronzino Medium, with tracking −0.045 / −0.03 / −0.02em;
- link stroke 0.16em, growing to the 42% swipe on hover;
- the highlight band covers the lower 70% of the line;
- code: inline 0.84em on a 7% ink wash; pre 0.8125rem / 1.65 (0.78rem on
  phone);
- tables use `display:block; overflow-x:auto` on `<table>`;
- on phone, `pre`, `table`, `img`, `figure` and display `math` bleed to the
  screen edge;
- the hr is one short slanted marker stroke;
- math: inline 1.08em, display 1.22em, with
  `font-family: "STIX Two Math", math`;
- dark images get `filter: brightness(.88) contrast(1.05)`.

- [ ] **Step 1: Write the failing tests.**
  - `reading.test.ts` asserts:
    - `tokens.css` defines `--reading-size: 1.0625rem` in `:root`,
      `1.125rem` under `min-width: 40rem`, and `1.1875rem` under
      `min-width: 64rem`;
    - `[data-theme="dark"]` sets `--reading-leading-adjust: 0.05`;
    - `reading.css` contains `.prose-reader table` with
      `display: block` and `overflow-x: auto`;
    - it contains `.prose-reader pre` with `overflow-x: auto`;
    - it contains `.prose-reader math[display="block"]` with
      `overflow-x: auto`;
    - it contains `.prose-reader img` with `max-width: 100%`;
    - it contains `.prose-reader ::selection` using
      `--color-prose-selection`;
    - it contains `mark[data-hl-color="terracotta"]` using `--hl-terracotta`.

    These pin Review Focus 2 at rule level.
  - `render.test.ts`: `markRange` sets `data-hl-color` and no inline
    `style.background`.
- [ ] **Step 2: Run** `pnpm exec vitest run reading render`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, then `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): Marker reading typography and highlight bands`.

### Task 3: Article meta and one action set (A2 + More sheet)

**Files:**

- Create: `apps/web/src/lib/reader/read-meta.ts`, exporting:
  - `readTimeLabel(minutes: number | null | undefined): string | null`.
    `12` → `"12 min read"`; `0`, `null` and `undefined` → `null`; `0.4`
    → `"1 min read"`.
  - `savedLabel(created: string, now?: Date): string`. The same year
    gives `"Saved Nov 2"`; another year gives `"Saved Nov 2, 2025"`.
- Create: `apps/web/src/lib/article/retry.ts`, exporting
  `retryArticle(fetchFn: typeof fetch, id: string): Promise<boolean>`. It
  POSTs `/api/retry` `{articleId}` and returns `res.ok`. `routes/+page.svelte`
  switches to it.
- Create in `apps/web/src/lib/components/reader/`:
  - `ArticleMeta.svelte`. Props:
    `source, originalUrl, readTime, created, tags, onAddTag, onRemoveTag`.
    It renders the source pill, then reading time · saved date · "Open
    original" (link variant with marker underline), then the manual tags
    row (`TagEditor` restyled as chips plus "Add tag").
  - `ReaderActionsMenu.svelte` (desktop). Props:
    `collections: CollectionSummary[], originalUrl, onAddToCollection(id), onArchive, onDelete`.
    It is a `DropdownMenu` on a "⋯" icon Button with
    `aria-label="Article actions"`, containing:
    - a group labelled "Add to collection", with one row per collection
      showing its name and a tabular `count`;
    - a separator;
    - "Open original" (when there's a URL);
    - "Archive";
    - a separator;
    - "Delete" (destructive).
  - `ReaderMoreSheet.svelte` (phone). Props: the same as the menu, plus
    `tags, onAddTag, onRemoveTag, open, onClose`. It is a `BottomSheet`
    titled "More", containing:
    - "Tags";
    - the "Add to collection" rows;
    - "Open original";
    - "Archive";
    - "Delete".

    The order is identical to the menu.
- Delete: `ArticleActions.svelte` and its test, replaced by the two above.
- Test:
  - `read-meta.test.ts`, `retry.test.ts`;
  - `ArticleMeta.test.ts`, `ReaderActionsMenu.test.ts`,
    `ReaderMoreSheet.test.ts`.

**Interfaces:**

- Consumes: `CollectionSummary` (`{id,name,slug,count}`) from root layout
  data `$page.data.collections`. This replaces the reader's own
  `loadCollections`.
- Produces: the components above. Tasks 7 and 9 mount them.

- [ ] **Step 1: Write the failing tests.**
  - The `read-meta` and `retry` cases listed above.
  - `ReaderActionsMenu`: opening it lists the collection rows with counts,
    then "Open original", "Archive" and "Delete" in that order. Clicking a
    collection calls `onAddToCollection(id)`. "Open original" is absent
    when `originalUrl` is null.
  - `ReaderMoreSheet`: the same order, preceded by tags. Removing a tag
    calls `onRemoveTag`.
  - `ArticleMeta`: it renders "12 min read" and "Saved Nov 2", and omits
    the reading time when `null`.
- [ ] **Step 2: Run** `pnpm exec vitest run read-meta retry ArticleMeta ReaderActionsMenu ReaderMoreSheet`. Expected: FAIL.
- [ ] **Step 3: Implement.** Copy is sentence case. Delete still goes through the page's `ConfirmAction`.
- [ ] **Step 4: Run** the same command, then `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): article meta and one reader action set`.

### Task 4: Header for the focused desktop

**Files:**

- Modify: `apps/web/src/lib/components/shell/ReaderHeader.svelte` (and its test), `apps/web/src/lib/shell/nav.ts` (add `DESKTOP_QUERY`)

**Interfaces:**

- Produces new optional `ReaderHeader` props:
  - `title?: string`;
  - `showTitle?: boolean`;
  - `highlightsCount?: number`;
  - `onHighlights?: () => void`;
  - `actions?: Snippet`.
- Behavior:
  - The right cluster order on desktop is Search, Highlights (an icon plus a
    tabular count, `aria-label="Highlights, {n}"`), `actions` (the "⋯"),
    then Menu.
  - The Highlights button and `actions` render only at `DESKTOP_QUERY`.
  - The centred `title` fades in (`--dur-base --ease-out`) when
    `showTitle`, desktop only.
  - Hide-on-scroll applies below `DESKTOP_QUERY`, matching where the phone
    bar exists. This changes Plan 3's `WIDE_QUERY`. `inert` follows the
    same rule.

- [ ] **Step 1: Write the failing tests.**
  - Desktop: the Highlights button shows the count and calls
    `onHighlights`, and the `actions` snippet renders.
  - Phone: neither renders.
  - `showTitle` toggles the visible title.
  - The header is `inert` and translated at 900px wide when hidden, and
    not at 1280.
- [ ] **Step 2: Run** `pnpm exec vitest run ReaderHeader nav`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): reader header gains highlights, actions and title on desktop`.

### Task 5: Chapter ticks that expand into the list (desktop), and a scroll spy that reaches the end

**Files:**

- Create: `apps/web/src/lib/reader/scroll-spy.ts`, exporting
  `activeHeadingId(headings: {id: string; top: number}[], viewportH: number, atBottom: boolean): string | null`.
  - `top` is the heading's viewport-relative top.
  - Without `atBottom`, the result is the last heading with
    `top <= viewportH * 0.3`, or `null` if none.
  - With `atBottom`, it is the last heading with `top < viewportH`.
- Create: `apps/web/src/lib/components/reader/ChapterTicks.svelte`. Props:
  `toc: TocEntry[], activeId: string | null, onjump: (id) => void`.
- Modify: the reader page replaces the `IntersectionObserver` with a
  rAF-throttled scroll handler that calls `activeHeadingId`. It sets
  `atBottom` when `scrollY + innerHeight >= scrollHeight - 2`.
- Test: `scroll-spy.test.ts`, `ChapterTicks.test.ts`

**Interfaces:**

- Consumes: `TocEntry` from `@readmepls/types` (read its exact shape
  there), as produced by `buildTocFromDom` or `content.toc`. Reuse
  `ChapterList`'s nesting and flattening logic rather than duplicating it.
- Produces: `ChapterTicks`, mounted by Task 7.

Behavior, from `notes.md` → "Chapters as ticks":

- **At rest:**
  - One tick per entry, in a vertically centred column at the left edge,
    in 44px rows.
  - h2 ticks are 18px × 1.5px in subtle grey; sub-chapters are 10px at 60%.
  - The current chapter is 26px × 2px in ink.
  - The column rests at 40% opacity and comes to full when the pointer is
    within 170px of the edge or a tick has focus.
- **Expand:**
  - Pointer enter with 100ms hover intent, or focus inside: the column
    becomes a card listing every entry.
  - Each row sits where its tick was, and the tick shrinks to a leading
    dash.
  - Labels slide in, staggered 16ms per row, capped at 160ms.
  - The surface and shadow fade in over 250ms `--ease-out`.
  - Sub-chapters are indented. The current row is Medium on
    `--color-marker-soft`, and the hovered or focused row gets the
    `accent` wash.
  - The width is capped to the left margin (max 272px, ending 16px before
    the article), and the max height is the viewport below the header,
    scrolling inside.
- **Collapse:** 200ms after the pointer leaves, over 150ms `--ease-in`.
- **Keyboard:** Up, Down, Home and End move between rows, Enter jumps, and
  Esc collapses and returns focus.
- **Touch** (`pointer: coarse`): rest opacity is full. A tap on the column
  expands it, a tap on a row jumps and collapses it, and a tap outside
  collapses it.
- **No `toc`:** render nothing.

- [ ] **Step 1: Write the failing tests.**
  - `scroll-spy`:
    - `[{a,-500},{b,100},{c,900}]` with `viewportH` 800 → `"b"`;
    - none at or above 240 → `null`;
    - `atBottom` with `[{a,-500},{b,100},{c,700}]` → `"c"` (Review Focus 5);
    - empty → `null`.
  - `ChapterTicks`:
    - empty `toc` renders nothing (Review Focus 1);
    - it renders N buttons named by the chapter text;
    - the active entry has `aria-current="location"`;
    - focusing a tick sets `data-expanded="true"`;
    - ArrowDown moves focus to the next row;
    - Enter calls `onjump(id)`;
    - Escape sets `data-expanded="false"`;
    - with fake timers, pointerenter followed by 50ms leaves it collapsed,
      and 120ms expands it;
    - pointerleave followed by 250ms collapses it.
- [ ] **Step 2: Run** `pnpm exec vitest run scroll-spy ChapterTicks`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): chapter ticks expand into the chapter list`.

### Task 6: Highlight map (desktop right edge)

**Files:**

- Create: `apps/web/src/lib/reader/highlight-map.ts`, exporting
  `mapPositions(items: {id: string; top: number}[], docHeight: number): {id: string; at: number}[]`.
  - `at` is in `[0,1]`.
  - It returns `[]` when `docHeight <= 0`.
  - Results are sorted by `at`.
  - `measureMarks(root: HTMLElement): {id: string; top: number}[]` takes,
    for each id, the first `mark[data-hl-id]`, using
    `getBoundingClientRect().top + scrollY`.
- Create: `apps/web/src/lib/components/reader/HighlightMap.svelte`. Props:
  - `highlights: Highlight[]`;
  - `positions: {id: string; at: number}[]`;
  - `viewport: {at: number; size: number}`;
  - `onjump: (id) => void`.
- Test: `highlight-map.test.ts`, `HighlightMap.test.ts`

**Interfaces:**

- Consumes: `Highlight` (`{id,text,note,color,...}`), and `--hl-*` swatch
  colours (opaque variants, from `notes.md`).
- Produces: `HighlightMap`, mounted by Task 7, which recomputes positions on
  load, resize and highlight change.

Behavior, from `notes.md` → "Highlight map":

- **Track:** a hairline track spans the article's height.
- **Ticks:**
  - Each tick is 16 × 3px in its colour's opaque swatch at `at`.
  - A highlight with a note gets a 5px dot.
  - The viewport bar is a 3px ink bar at 30%.
  - The track rests at 40% opacity and comes to full within 120px of the
    edge, or on focus.
  - Hit areas are 48 × 44px; when ticks are close, the nearest one wins.
- **Card:** hover or focus opens a 256px card toward the article, showing:
  - the excerpt, clamped to 4 lines with the colour band;
  - the note;
  - the colour name (Yellow, Rose or Mint);
  - "Click to jump".
- **Click:** calls `onjump(id)`. In Task 7 the page's `jumpTo` scrolls the
  mark to centre and sets `data-hl-flash` on it for 1.2s. `reading.css`
  redraws the band once while the attribute is set (add that rule in this
  task, together with a `reading.test.ts` assertion for it).
- **Touch:** the first tap shows the card, a second tap on the same tick
  jumps, and a tap elsewhere dismisses.
- **Orphans:** highlights missing from `positions` are not drawn.

- [ ] **Step 1: Write the failing tests.**
  - `mapPositions`:
    - `[{a,500},{b,100}]` with height 1000 → `[{b,0.1},{a,0.5}]`;
    - height 0 → `[]`;
    - `top` greater than the height clamps to 1.
  - `HighlightMap`:
    - with 3 highlights and positions for 2 (one orphan), it renders 2
      ticks (Review Focus 4);
    - the tick with a note has a dot (`data-has-note`);
    - focusing a tick shows a dialog or tooltip containing the excerpt and
      note;
    - Enter calls `onjump`;
    - a tick's style top equals `at*100%`.
- [ ] **Step 2: Run** `pnpm exec vitest run highlight-map HighlightMap`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): highlight map on the reader's right edge`.

### Task 7: Focused desktop layout, highlights panel, and page recomposition

**Files:**

- Create:
  - `apps/web/src/lib/components/reader/HighlightsPanel.svelte`. Props:
    `open, onClose, highlights, orphans, onjump, ondelete`. It is a `Sheet`
    with `side="right"`, 360px wide, titled "Highlights {n}", using the
    restyled `HighlightList`.
  - `apps/web/src/lib/components/reader/HighlightList.svelte`. This is the
    current `HighlightsSidebar` content restyled per the phone render:
    - colour-banded excerpts;
    - the note under a speech icon;
    - delete always visible on touch;
    - an orphan warning reading "Can't find this in the current text".
- Delete: `HighlightsSidebar.svelte` and `ChaptersSidebar.svelte` with
  their tests, once their callers move. `ChapterList` is reused by Task 9's
  sheet. Delete `ui/Rail.svelte` if no callers remain.
- Modify: `routes/read/[id]/+page.svelte`:
  - At `DESKTOP_QUERY` (`MediaQuery`, replacing `matchMedia`) it renders:
    - `ChapterTicks` (left edge, fixed);
    - the centred article (`.prose-reader`, 44rem sheet);
    - `HighlightMap` (right edge, fixed);
    - `HighlightsPanel`.
  - While the panel is open, the article translates 170px left and the
    edges fade out.
  - The page passes the header its title, `showTitle` (when the h1 has
    left the viewport), the highlights count (`highlights.length`, orphans
    included), and the actions snippet (`ReaderActionsMenu`).
  - `ArticleMeta` sits under the h1.
- Test: `HighlightsPanel.test.ts`, `HighlightList.test.ts`, and reader `page.test.ts`

**Interfaces:**

- Consumes: Tasks 3, 4, 5 and 6.
- Produces: the desktop composition that gate 4 screenshots.

- [ ] **Step 1: Write the failing tests.**
  - `HighlightList`:
    - the orphan shows the warning and still has delete;
    - a note renders;
    - with nothing yet, the empty copy is "Select any text to highlight
      it."
  - `HighlightsPanel`:
    - the title includes the count;
    - Esc calls `onClose`.
  - Reader page, with `matchMedia` stubbed to desktop:
    - no element has `aria-label="reading tools"`;
    - `ChapterTicks` and `HighlightMap` are present;
    - the header's highlights button shows 3 when there are 2 anchored
      highlights plus 1 orphan (Review Focus 4);
    - clicking it opens the panel listing 3;
    - the "⋯" menu lists the collections from `$page.data.collections`.
  - Reader page with no toc: no chapter ticks (Review Focus 1).
- [ ] **Step 2: Run** `pnpm exec vitest run HighlightsPanel HighlightList routes/read`. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the page's loading and wiring only, and move any remaining markup into components.
- [ ] **Step 4: Run** the same command, then `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): focused desktop reader with edge chapters, highlight map and panel`.

### Task 8: Making a highlight — desktop popover, phone tray, draw-in

**Files:**

- Modify: `apps/web/src/lib/components/HighlightPopover.svelte`, moved to
  `components/reader/HighlightPopover.svelte`, with its test.
- Create: `apps/web/src/lib/components/reader/HighlightTray.svelte` (phone).
  Props: `onpick(color, note)` and `oncancel`.
- Modify: the reader page's selection handling, so it listens for
  `selectionchange` (debounced, about 120ms) in addition to `mouseup`, so
  touch selections work. It shows the popover at `DESKTOP_QUERY` and the
  tray below it.
- Test: `HighlightPopover.test.ts`, `HighlightTray.test.ts`, and reader `page.test.ts`

**Interfaces:**

- Both components emit `onpick(color: HighlightColor, note: string)` and
  `oncancel()`, as today, so `createHighlight` is unchanged.

Behavior, from `notes.md` → "Highlights" and "New highlight":

- **Desktop popover:**
  - It sits above the selection and flips below when there's no room.
  - It shows three opaque swatches: Yellow (terracotta), ringed as the
    primary; Rose (amber); Mint (sage).
  - It has an optional "Add a note (optional)" field, typed before picking.
  - One click on a swatch saves.
  - It enters with `--ease-bounce` over `--dur-base`.
- **Phone tray:**
  - While a selection exists inside the article, the tray replaces the
    control bar at the bottom.
  - It holds the three swatches, "Highlight", Close, and "Add a note, then
    pick a color".
  - If the selection's bottom is below `innerHeight - trayHeight`, it
    scrolls up by the tray height.
  - When the note field is focused, it rides on `visualViewport`.
- **Draw-in:** after a save, the new mark's band draws left to right over
  `--dur-marker` (`data-hl-new` triggers it). On desktop its map tick draws
  in 400ms later. Under reduced motion both are already drawn.

- [ ] **Step 1: Write the failing tests.**
  - Popover:
    - the three swatches are named Yellow, Rose and Mint;
    - Yellow has `data-primary`;
    - typing a note then clicking Rose calls `onpick("amber", "x")`;
    - Esc calls `oncancel`.
  - Tray: the same pick contract, plus Close calls `oncancel`.
  - Reader page, phone viewport: a selection inside the article hides the
    control bar and shows the tray. A collapsed selection restores the bar.
- [ ] **Step 2: Run** `pnpm exec vitest run HighlightPopover HighlightTray routes/read`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): highlight popover on desktop, tray on phones`.

### Task 9: Phone reader chrome — B1 bar and sheets

**Files:**

- Modify: `ReaderControlBar.svelte`, restyled per `reader-phone.html`:
  - a floating pill bar above the home indicator;
  - icon plus label;
  - the opening slot carries the marker underline.
- Modify: the reader page's phone branch, which uses:
  - a `BottomSheet` titled "Chapters", with `ChapterList` restyled (44px
    rows, sub-chapters indented on a hairline, the current one on
    `--color-marker-soft`);
  - a "Highlights" sheet with `HighlightList`;
  - `ReaderMoreSheet` (Task 3).
- Test: `ReaderControlBar.test.ts`, the chapter list test, and reader
  `page.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - Bar: with chapters there are 3 slots; without, 2 (Review Focus 1). The
    active slot has `aria-expanded="true"`.
  - Reader page, phone: after a scroll down hides the chrome, a tap on the
    article with no selection brings the header and bar back. The spec
    says they "reappear on scroll up or tap".
  - Reader page, phone:
    - tapping Chapters opens a dialog titled "Chapters";
    - tapping a chapter closes it and scrolls;
    - More opens "More" with "Archive";
    - Highlights opens the list.
- [ ] **Step 2: Run** `pnpm exec vitest run ReaderControlBar ChapterList routes/read`. Expected: FAIL.
- [ ] **Step 3: Implement.** Match `reader-phone.html` exactly; it is approved as rendered.
- [ ] **Step 4: Run** the same command, then `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): phone reader bar and sheets in Marker`.

### Task 10: Reader states — loading, failed, partial (C2), end of article

**Files:**

- Create: `apps/web/src/lib/components/reader/ReaderSkeleton.svelte` and
  `apps/web/src/lib/components/reader/ExtractionNotice.svelte`.
- `ReaderSkeleton` is shaped like the page: the source pill, a two-line
  title, the meta, and paragraphs at the real measure.
- `ExtractionNotice` props:
  - `status: "failed" | "partial"`;
  - `reason: string | null`;
  - `originalUrl`;
  - `onRetry?`.
- Modify: the reader page:
  - **Failed** (`content.extract_status === "failed"` or no
    `content_html`):
    - the title falls back to the article URL's host plus path;
    - the body is the notice with the reason (or "We couldn't read this
      page."), Retry (via `retryArticle`) and Open original;
    - no chapters or highlights UI.
  - **Partial** (`"partial"`): a quiet notice above the text with the
    reason, and the text renders as usual.
  - **End:** a hairline rule with "End of article" after the body.
- Test: `ExtractionNotice.test.ts`, `ReaderSkeleton.test.ts`, and reader `page.test.ts`

- [ ] **Step 1: Write the failing tests.**
  - Notice:
    - failed shows the reason, "Retry" and "Open original";
    - Retry calls `onRetry`;
    - partial shows the reason and no Retry.
  - Reader page:
    - a failed content with a `failure_reason` "Blocked by paywall" shows
      it with Retry;
    - clicking Retry calls `retryArticle` with the article id;
    - no `ChapterTicks` or bar.
  - Reader page, ok content: "End of article" is present.
  - Skeleton: it has `aria-busy="true"` and no tick or bar chrome.
- [ ] **Step 2: Run** `pnpm exec vitest run ExtractionNotice ReaderSkeleton routes/read`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command, then `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): reader loading, failed, partial and end states`.

### Task 11: Gate 4 — reader typography and focus mode in the real app (controller-run)

- [ ] **Step 1: Seed real articles.** On the throwaway PocketBase, seed:
  - the Wikipedia "Navier–Stokes equations" page, extracted through the
    real worker extractor, by running the worker against the throwaway
    PocketBase or calling the extractor package on fetched HTML;
  - one article with no headings;
  - one failed article;
  - one partial article.

  Add four highlights to Navier–Stokes, one with a note and one orphaned
  by editing its text.
- [ ] **Step 2: Capture.**
  - Navier–Stokes at 390 and 1280, in light and dark: the top, the
    mid-article math, the tables, the footnotes, and the end.
  - Desktop chapters expanded; a highlight card; the panel open; the "⋯"
    menu.
  - Phone: the bar, each sheet, and the tray.
  - The failed, partial and no-headings articles.
  - Check there is no horizontal overflow at 390px.
  - Compare against the approved renders and note each deviation.
- [ ] **Step 3: Get the owner's review.** Present the screenshots on the
  companion page and record the outcome on #10. Changes become fix
  dispatches against the owning task.
