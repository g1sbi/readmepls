# Reader mockups: notes (plan 4, gate 4)

Open `index.html`. Every page puts its frames on one canvas, fitted to the
window by default. Use "Show actual size" for 1:1. The frames are live: you can
scroll inside them, click chapters and highlights, open the phone sheets, and
open the desktop "⋯". The tokens, `marker.css` and `fonts.css` are inlined
verbatim from `apps/web/src/lib/styles/` (font paths made relative), so the
colors match the build. All the reader-specific CSS is the proposal.

## Type, per breakpoint

| | Phone <640 | Tablet 640–1023 | Desktop ≥1024 |
|---|---|---|---|
| Body | 1.0625rem (17px) | 1.125rem (18px) | 1.1875rem (19px) |
| Leading | 1.6 | 1.62 | 1.64 |
| Measure | full width, 1.25rem gutters (~40–44 ch, measured 41) | 36rem (~60 ch) | 38rem (~65 ch) |
| h1 | 2.125rem | 2.5rem | 2.875rem |
| h2 | 1.4375rem | 1.625rem | 1.75rem |
| h3 | 1.1875rem | 1.25rem | 1.3125rem |
| h4 | 1rem Bold | 1.0625rem Bold | 1.0625rem Bold |

- **Headings:** Ronzino Medium. Tracking is h1 −0.045em, h2 −0.03em, h3
  −0.02em. The h4 is body size in Bold, so four levels stay distinct without
  a fifth size.
- **Spacing:** paragraphs are 1em apart. An h2 gets 2.2em above and 0.55em
  below; an h3 gets 1.8em and 0.45em.
- **Links:** a thin solid marker stroke (0.16em) under the word. On hover it
  grows to the 42% swipe.
- **Lists:** ordered lists use muted tabular numerals. Unordered lists use an
  en dash, and nested ones a middle dot.
- **Blockquote:** a 2px ink rule at 1.04em.
- **Code:** inline code is Plex Mono at 0.84em on a 7% ink wash. Code blocks
  are 0.8125rem with 1.65 leading (0.78rem on phone) and scroll inside
  themselves.
- **Table:** `display:block; overflow-x:auto` is set on the `<table>` itself.
  Worker HTML has no wrapper element, so the CSS can't rely on one.
- **Phone bleed:** on phones, `pre`, tables, images and display math run to
  the screen edge and scroll inside their own box. The page has no sideways
  overflow at 390px (checked: `sheet-paper` scrollWidth equals clientWidth in
  every phone frame).
- **Figure caption:** UI font at 0.8125rem, muted.
- **hr:** one short, slanted stroke of marker.
- **Footnotes:**
  - The refs are small ink-wash pills with a 44px invisible hit area. They
    turn marker on hover.
  - The notes section is 0.875em and muted, with a ↩ backref.
- **Math (MathML):**
  - Inline math is 1.08em, display math 1.22em.
  - Display equations scroll inside their own box.
  - **Finding:** brackets only stretch when a math font is installed. On a
    machine without one (as in these renders), `(` stays small around the
    fraction. Recommendation for #8: self-host STIX Two Math or Latin Modern
    Math and name it first in the `math` font stack.

## Dark tuning

- **Text:** `#dcdcda` for reading text (UI keeps `#ededec`). Math is `#ecece9`.
- **Spacing:** leading +0.05 and tracking +0.006em.
- **Smoothing:** `-webkit-font-smoothing: antialiased`.
- **Weight (ambiguity resolved):** the brief asks for a "slightly lighter
  weight", but Ronzino ships nothing below 400. So the lighter look comes from
  grayscale smoothing and softer contrast, not a thinner cut.
- **Images:** `brightness(.88) contrast(1.05)`, so white figures don't glare.

## Highlights

- **Colors:** the token values already in `tokens.css` are kept.
  - `terracotta` → yellow `rgb(255 206 0 / .45)`, `.32` in dark.
  - `amber` → rose `rgb(255 107 157 / .3)`, `.32` in dark.
  - `sage` → mint `rgb(52 199 123 / .3)`.
  - The swatches in the popover use opaque versions of the same three.
- **Shape:** the band covers the lower 70% of the line, so it reads as the
  marker motif drawn wide. Links are a thin stroke; highlights are a band.
  The two never look alike.
- **Selection:**
  - Inside the article, selection is a neutral 16% ink wash, not
    `--color-selection` (marker yellow). Otherwise "selected" and "highlighted
    yellow" look the same.
  - The token stays as it is for the UI. This only scopes `::selection` in
    the prose.
- **Current chapter and bar label:** these use `--color-marker-soft` (the
  full-strength yellow under off-white text was illegible in dark).
- **Desktop popover:**
  - It sits above the selection and flips below when there's no room.
  - Yellow is ringed as the primary.
  - One click on a swatch saves. The note field is optional, and you type it
    before picking. That's today's flow, unchanged.
- **Phone tray:**
  - The tool docks at the bottom, replacing the bar while a selection exists.
  - Why: the iOS edit menu and Android's floating toolbar both sit above the
    selection, and both platforms put drag handles at its two ends. Anything
    floated near the selection collides with one of them.
  - The bottom edge is never used by either, and it's in thumb reach.
  - If the selection is low, the page scrolls it up by the tray's height.
  - With the note field focused, the tray rides on the keyboard
    (`visualViewport`).

## Owner decisions

A2, B1, C2. The phone reader is approved exactly as rendered.

## Focused desktop (`reader-focused.html`, supersedes the three columns)

- **Layout:**
  - The article sits alone in the middle: 44rem sheet, same type values.
  - There's about 290px of empty margin each side at 1280.
  - Header: Back. Then Search, Highlights (icon + count), "⋯" (A2) and Menu.
- **Chapters as ticks that expand into the list (left edge):**
  - At rest: one tick per TOC entry, vertically centred, in 44px rows. h2
    ticks are 18px at 1.5px in subtle grey; sub-chapters are 10px at 60%. The
    current chapter is 26px, 2px, ink. The column rests at 40% opacity and
    comes to full within 170px of the edge.
  - Pointer enters the column (100ms hover intent) or a tick gets focus: the
    whole column expands into a card listing every chapter. Each row stays
    where its tick was. The tick shrinks to a leading dash and the label
    slides in. Sub-chapters are indented. The current chapter is Medium with
    the marker-soft band. The row under the pointer or focus gets the accent
    wash. Click jumps.
  - Motion: open is 250ms expo-out (width, surface, shadow), with labels
    staggered 16ms per row, capped at 160ms. Close starts 200ms after the
    pointer leaves and runs 150ms ease-in. Reduced motion swaps instantly.
  - Size: the card width is capped to the left margin (up to 272px, ending
    16px before the article). At 1280 it ends at 272px, and the article
    starts at 288px. Max height is the viewport below the header; longer
    lists scroll inside.
  - Keyboard: focus opens the list. Up/Down/Home/End move between rows,
    Enter jumps, Esc collapses.
  - Touch: the first tap on the column opens the list, a tap on a row jumps
    (then the list folds), and a tap outside collapses it.
- **Highlight map (right edge):**
  - A hairline track stands for the whole article, top to bottom.
  - Each highlight is a 16 × 3px tick in its opaque swatch color, placed
    proportionally. A highlight with a note gets a 5px dot.
  - A 3px ink bar at 30% shows the part currently on screen.
  - Same 40% rest and edge proximity as the left (within 120px).
  - Hit areas are 48 × 44px. Ticks closer than 44px apart overlap; the
    nearest wins.
  - Hover or focus opens a 256px card toward the article: the excerpt
    (4-line clamp, with the color band), the note, the color name and
    "Click to jump". Click jumps with the existing flash.
  - Orphaned highlights have no position, so they appear only in the panel.
- **Full list:**
  - The header Highlights button opens a 360px panel from the right
    (450ms expo-out). It has the same list as the phone sheet, orphan
    included, so the count is 5.
  - The article slides 170px left so it stays fully readable. The edge
    rails fade out while the panel is open.
  - Esc, the button or Close shuts it.
- **New highlight:** the band draws across the passage (600ms expo-out). Then
  its map tick draws in from the track with the same swipe, 400ms later.
  Under reduced motion, everything appears already drawn.
- **Touch, coarse pointer (landscape tablet ≥1024):**
  - Both edges sit at full opacity, since there's no hover.
  - Chapters: tap opens the list, tap a row to jump, tap outside to close.
  - Highlights: the first tap shows the card, a second tap on the same tick
    jumps, and a tap elsewhere dismisses.

## Decisions (rendered in `reader-options.html`)

- **A. Desktop article actions.** Recommend **A2**: header "⋯" (add to
  collection, open original, archive, delete), with tags in the article meta
  under the title.
  - Why: rails navigate, the header acts, the meta describes.
  - It's the same set and order as the phone More sheet.
  - The alternative is A1, the left rail under chapters, as today.
- **B. Phone bar.** Recommend **B1**: three slots, Chapters, Highlights and
  More. The bar drops to two when there are no chapters, as today.
  - Why: the tools stay in thumb reach, and every action has one home.
  - B2 (adding a Collection slot) duplicates the More sheet.
  - B3 (header-only) crowds six controls at the top of the screen.
- **C. Failed or partial extraction in the reader** (an open question I found,
  in `reader-states.html`).
  - Today the reader has **no** failed or partial UI. A failed row renders a
    blank title and body with only "Open original".
  - Recommend **C2**: reuse the library card's existing `failure_reason` and
    Retry, plus Open original. The title falls back to the URL. For partial,
    the reason goes in a quiet notice above the text.
  - This adds no new data or action, but it is new reader UI, so it's your
    call.

## Ambiguities resolved / flagged

- **Reading time and saved date:** not shown in the reader today. Both come
  from existing data (`content.read_time` and the article's `created`), so I
  show them in the meta. This is display only. Drop them if that counts as
  adding.
- **Header title after scroll (desktop):** once the h1 leaves the screen, the
  article title fades into the header, small and muted (Notion does this).
  It's chrome, not a feature. Veto if unwanted.
- **End of article:**
  - Nothing exists today. I added a hairline rule with "End of article" and no
    actions.
  - The phone bar stays tucked after scrolling down, as today.
  - In the mockup's scroll tracking, the last heading on screen becomes
    current at the very bottom. Today's IntersectionObserver
    (`rootMargin -70%`) may never mark "Notes".
- **Loading skeleton:** shaped like the real page. The source pill, two-line
  title, meta and paragraphs sit at the real measure. The rails and bar
  appear only once content arrives, as today.
- **Progress strip:**
  - It changes from 3px accent to 2px ink. Yellow is kept for the current
    chapter, per "sparingly".
  - On phones it sits at `top: env(safe-area-inset-top)`, so it stays visible
    when the header tucks.
- **Tags:** only manual tags are shown and editable, as today. AI tags stay
  out of the reader.
- **Touch on desktop:** rail rows are 34px on desktop, which fits a fine
  pointer. Use 44px under `(pointer: coarse)`, since a landscape iPad
  (≥1024) gets the three-column layout.
- **Mockup vs build:** breakpoints in the mockup are container queries on
  the frame. In the app they're the usual media queries, with the same
  values.
