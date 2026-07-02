# UI Review — Findings & Remediation Brief

**Date:** 2026-06-29
**Branch:** `ui-review-findings`
**Method:** static review of every web surface + shared primitive, cross-checked
against `tokens.css` and `CLAUDE.md` design rules. (Live screenshots deferred —
local Playwright couldn't find a `chrome` channel binary; findings below are
code-cited and reproducible.)
**Scope:** full audit — every screen and every shared component.
**Audience:** implementing agents. Each finding is self-contained: symptom, root
cause with `file:line`, why it matters, and a fix direction (no code written).

---

## How to use this document

- Findings are grouped: **A. Global / app shell**, **B. Component architecture
  decision (Bits UI)**, **C. Shared primitives**, **D. Per-screen**, **E.
  Cross-cutting themes**, **G. Polish & modernization direction**. **§F** is the
  dependency-ordered work breakdown across both the bug-fix and polish tracks.
- Each finding has an ID (e.g. `A1`, `C3`) so work items and commits can
  reference them.
- **Severity:** 🔴 broken / visible bug · 🟠 layout or consistency defect · 🟡
  polish / nice-to-have.
- A suggested work breakdown with dependencies is in **§F**.
- This is a diagnosis brief, not a patch. Fix directions describe the approach;
  the implementing agent writes the code (TDD, tokens-only, per `CLAUDE.md`).

---

## A. Global / app shell

### A1 🔴 Background doesn't reach the viewport edges — the "outer border"

**Symptom:** a strip of bare canvas frames the whole app; the warm paper
gradient doesn't fill to the window edge.

**Root cause:** there is **no global CSS reset zeroing `body` margin**, and the
app is mounted inside a `display: contents` wrapper.

- `apps/web/src/app.html:13` — `<div style="display: contents">%sveltekit.body%</div>`.
  `display: contents` removes the div's own box, so `.app` becomes an effective
  child of `<body>`.
- `apps/web/src/routes/+layout.svelte:55` — `.app { min-height: 100dvh;
  background: var(--color-bg-gradient); }`.
- Nothing sets `body { margin: 0 }`. The UA default `margin: 8px` on `<body>`
  insets `.app`, and `100dvh` + that margin also forces a vertical scrollbar.

The 8px UA margin is the "border." `tokens.css` defines no `body`/`*` reset and
no `box-sizing`.

**Why it matters:** it's the first thing you see, on every authed page, and it
undercuts the full-bleed paper aesthetic the design is built around.

**Fix direction:** add a tiny global reset (new `app.css` imported once in
`+layout.svelte`, or a `:global()` block): `*, *::before, *::after { box-sizing:
border-box }`, `html, body { margin: 0; padding: 0 }`, and move the
`min-height`/background to `html`/`body` (or keep on `.app` but ensure body has
no margin and `background: var(--color-bg)` so over-scroll matches). Confirm
`100dvh` no longer overflows once margin is gone.

### A2 🟠 No global `box-sizing: border-box`

**Symptom:** elements with `padding` + `width: 100%` (e.g. `Input`, search box)
compute wider than their container; contributes to overflow math elsewhere.

**Root cause:** default `content-box` everywhere; no reset (`tokens.css` has no
`*` rule).

**Fix direction:** include `box-sizing: border-box` in the A1 reset. Re-check
`Input.svelte:26` (`width:100%` + padding) and `TopBar` search input after.

### A3 🟠 Inconsistent page container widths

**Symptom:** content column width jumps between screens, so the app feels
unaligned as you navigate.

**Root cause:** each screen sets its own max-width instead of sharing one scale:

- `+layout.svelte:60` `.page { max-width: 1100px }` (home, library inherit)
- `collections/[slug]/+page.svelte:52` `.collection-view { max-width: 900px }`
- `search/+page.svelte:52` `.search-results { max-width: 56rem }` (896px)
- `settings/connectors/+page.svelte:29` `.connectors { max-width: 48rem }` (768px)

Four different ceilings, none tokenized.

**Fix direction:** define container width tokens (e.g. `--width-page`,
`--width-prose`, `--width-narrow`) in `tokens.css` and reference them. Decide a
deliberate rhythm (wide for grids, narrow for prose) rather than per-file
guesses.

### A4 🟡 Page reveal animation replays on every navigation

**Symptom:** the whole page fades/translates in on each route change, not just
first load.

**Root cause:** `+layout.svelte:60` `.page { animation: reveal ... both }`; the
`.page` element re-mounts per navigation.

**Fix direction:** scope the reveal to first paint (e.g. run once via a flag, or
move to a transition that only plays on mount), or accept it as intentional —
flag for the design phase to decide.

---

## B. Component architecture decision — adopt Bits UI for behavioral primitives

**Current state:** everything is hand-rolled. No UI library in
`apps/web/package.json` (deps: `jszip`, `pocketbase`, `zod`). All primitives are
bespoke Svelte: `Button`, `Card`, `Input`, `Tag`, `Spinner`, `ConfirmDialog`.

**Decision (agreed):** introduce **[Bits UI](https://bits-ui.com)** — a
**headless, unstyled**, Svelte-5-native primitive library — for the
**behavior-heavy** components only. Keep all visuals in `tokens.css`; Bits UI
ships zero CSS, so the warm-paper design and the "retheme without touching
components" rule in `CLAUDE.md` are preserved.

**Why headless, not a styled kit:** styled libraries (Flowbite-Svelte,
Skeleton, DaisyUI) carry their own visual language and would fight the bespoke
token system — more time overriding than building. Headless gives accessible
behavior (focus trap, ARIA, keyboard nav, popover collision/positioning) with
no look imposed.

**Migrate to Bits UI (high payoff — these are the fragile ones):**
- `ConfirmDialog.svelte` — currently hand-managing `showModal`/`close`/
  `::backdrop` with a jsdom fallback `$effect` (`ConfirmDialog.svelte:24-37`). A
  headless dialog gives focus trap, scroll-lock, escape, and return-focus
  correctly. See finding `C6`.
- `HighlightPopover` — manual `getBoundingClientRect` math in
  `read/[id]/+page.svelte:116-122`; no viewport-edge collision/flip. A headless
  popover/floating primitive handles placement. See `C8`.
- Future Phase-4 surfaces: tag combobox, collection picker, dropdowns, tooltips.

**Keep hand-rolled (a library buys nothing — trivial, no a11y traps):**
`Button`, `Input`, `Tag`, `Spinner`, `Card`. ~15 lines each.

**Scope note:** this is a targeted seam, **not** a rip-and-replace. It is
properly **Phase 3 (design language)** architectural work. Sequence: add
`bits-ui` dep → wrap `Dialog` in a token-styled `ConfirmDialog` keeping the same
props/API → migrate `HighlightPopover` → leave dumb primitives alone. Each
wrapper keeps its current public props so callers don't change.

**Verify:** existing `ConfirmDialog` test assertions (the `{#if open}` block,
role queries) must still pass after wrapping; Bits UI must not regress the
jsdom-friendly behavior the current code works around.

---

## C. Shared primitives

### C1 🔴 Card has no internal layout — children pile up

**Symptom:** card contents are misaligned and inconsistent; the queued/processing
card puts the spinner and URL on one line, other states stack differently.

**Root cause:** `ui/Card.svelte:9-14` is just `background + radius + shadow +
padding`. **No `display: flex`, no `flex-direction`, no `gap`.** Children fall
back to default block/inline flow, so each `ArticleCard` state lays out
differently and `align-self` on descendants is a no-op.

**Fix direction:** make `.card` a vertical flex container with a token `gap`
(`display:flex; flex-direction:column; gap: var(--space-2/3)`). This single
change fixes most of "the card layout is messy" and makes `ArticleCard`'s
`align-self: flex-end` (delete button) actually work. Consider a `min-width: 0`
so flex children can shrink (pairs with `C3`).

### C2 🔴 Article URL overflows the card (queued/processing state)

**Symptom:** when a job is queued, the card shows the raw URL and it spills
outside the card.

**Root cause:** two compounding issues:
- `ArticleCard.svelte:32` — `<span>{article.url}</span>` with no
  `overflow-wrap`/`word-break`. Long unbroken URLs don't wrap.
- Grid tracks are `minmax(240px, 1fr)` (`C3`), whose default `min-width: auto`
  refuses to shrink below content size, so the long URL pushes the track wider
  and overflows visually.

**Fix direction:** add `overflow-wrap: anywhere` (or `word-break: break-word`) to
the URL text, and truncate sensibly (e.g. show host or clamp to 1–2 lines with
ellipsis). Combine with `C3`. Also reconsider showing the full raw URL at all —
a hostname + spinner reads cleaner for a "working on it" state.

### C3 🟠 CardGrid tracks can't shrink below 240px

**Symptom:** cards refuse to get narrower than 240px even when content (a long
URL) would otherwise force a wider track, amplifying `C2`.

**Root cause:** `ui/CardGrid.svelte:9` —
`grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))`. `minmax`'s min of
`240px` plus default child `min-width:auto` lets content blow the track out.

**Fix direction:** use `minmax(min(240px, 100%), 1fr)` (or `minmax(0, 1fr)` with
a sensible min) so tracks can shrink and content wraps instead of overflowing.

### C4 🟡 Button labels violate the lowercase voice

**Symptom:** Title-Case button text against an otherwise lowercase, playful UI
("your library", "save it", "working on it").

**Root cause:** capitalized labels passed by callers:
`ArticleCard` "Retry"/"Read"; `read/[id]` "Archive"; `ReaderControls`
"Sans"/"Serif"/"Light"/"Dark"/"Sepia"/"A−"/"A+"; `Spinner` default label
"Processing"; `CaptureBar` errors "Quota exceeded…", "Could not capture…".

**Why it matters:** `CLAUDE.md` design language calls for a "lowercase playful
voice." This is applied inconsistently.

**Fix direction:** decide the rule once (recommend lowercase everywhere for
chrome), then normalize labels. Keep article *content* untouched. Low-risk,
high-consistency win.

### C5 🟡 `Tag` border uses a surface token as a border color

**Symptom:** tag outline is very faint / inconsistent with other bordered chips.

**Root cause:** `ui/Tag.svelte:14` — `border: 1px solid var(--color-fold)`.
`--color-fold` is the dog-ear *fill* token, not a border token; elsewhere
borders use `--color-border`.

**Fix direction:** switch to `--color-border` (or a dedicated chip token).
Reconcile with the tag-rail chip styling in `library/+page.svelte` so all chips
share one definition (see `D2`).

### C6 🟠 ConfirmDialog — fold into the Bits UI migration

Cross-ref `B`. The hand-rolled native `<dialog>` management
(`ConfirmDialog.svelte:24-37`) is functional but fragile and duplicates
behavior Bits UI provides (focus trap, return-focus, scroll-lock). Treat as the
first Bits UI migration target; preserve the current props API and tests.

### C7 🟡 Inconsistent / missing focus-visible styles

**Symptom:** keyboard focus is clearly ringed on some controls and invisible on
others.

**Root cause:** focus-visible is defined on `Button`, `Input`, `TopBar` buttons,
and the login toggle — but **missing** on:
- `ArticleCard.svelte:58` `.delete-btn`
- `library/+page.svelte` `.action-btn`, `.tag-chip`, `.collection-chip`
- `HighlightsSidebar.svelte` `.quote`, `.del`
- `search/+page.svelte` `.result` link
- `HighlightPopover.svelte` `.swatch`, `.cancel`
- `TagEditor.svelte` `.chip button`, the add-tag `input`
- `AddToCollection.svelte` list `button`s, the new-collection `input`

**Fix direction:** add a shared focus-ring utility (token-based `outline`) and
apply to every interactive element. Best done as one pass.

### C8 🟠 HighlightPopover positioning is naive — fold into Bits UI

Cross-ref `B`. `read/[id]/+page.svelte:116-122` positions the popover from raw
`getBoundingClientRect` + scroll offsets with no edge collision/flip; near the
viewport edge it will clip. Migrate to a headless floating/popover primitive.

---

## D. Per-screen findings

### D1 — Reader (`routes/read/[id]/+page.svelte`)

#### D1a 🔴 Reading column is too tight / cramped

**Symptom:** the article text column is narrower than intended and feels
cramped; chrome around it suffers.

**Root cause:** the measure cap is applied **twice and then padded inside**:
- `read/[id]/+page.svelte:304` `.reader-shell { max-width: var(--reading-measure) }`
  (default `68ch`, `tokens.css:177`).
- `:308-313` `.reader` *also* sets `max-width: var(--reading-measure)` **and**
  `padding: 1.5rem`.

So the actual text measure = `68ch − 3rem` of padding, below the intended
reading measure. And because the **shell** is capped at the measure, the toolbar
(`.bar`) and tag/collection sections are squeezed into `68ch` too.

**Fix direction:** separate "shell width" from "text measure." Let the shell be
wider (or full content width) and apply the measure to the prose column only,
with padding accounted for (e.g. `max-width: calc(var(--reading-measure) +
2*padding)` on the padded element, or use `box-sizing` + width on an inner
element). Ensure narrow/normal/wide prefs still drive the *text* measure.

#### D1b 🟠 Reader toolbar is cramped and wraps badly

**Symptom:** back-link + reading controls + Archive + delete crowd into one
narrow row inside the `68ch` shell; the `ReaderControls` group itself wraps.

**Root cause:** `.bar` (`:305`) lives inside the measure-capped `.reader-shell`;
`ReaderControls` is `flex-wrap: wrap` with 6 buttons (`ReaderControls.svelte:26`).
Fixing D1a (widening the shell) relieves most of this.

**Fix direction:** after D1a, give the bar room; consider grouping controls into
a single popover/menu (Bits UI) instead of 6 inline buttons, and right-aligning
Archive/delete.

#### D1c 🔴 "Highlights sidebar" is not a sidebar — it stacks below the article

**Symptom:** highlights appear as a full-width block *below* the article and
tag/collection sections, not beside the text.

**Root cause:** `HighlightsSidebar` is rendered at page root in normal document
flow (`read/[id]/+page.svelte:288-290`) with only
`display:flex; flex-direction:column` (`HighlightsSidebar.svelte:31`) — no
fixed/sticky/grid placement. The component name implies a rail; the layout
delivers a footer.

**Fix direction:** decide the intended pattern — a sticky side rail on wide
viewports (CSS grid: prose + rail), collapsing to a drawer/disclosure on
narrow — and implement the placement. This is a layout decision, not just CSS
tweaks; flag for design input on the desired pattern.

#### D1d 🟡 `bind:this` wrapper div is unstyled

Minor: the `{@html content.content_html}` is wrapped in a bare `<div
bind:this={bodyEl}>` (`:271`). Fine functionally; just confirm the prose styles
(`.reader :global(...)`) still target descendants (they do, via `.reader`).

### D2 — Library (`routes/library/+page.svelte`)

#### D2a 🟠 Three near-duplicate chip styles

**Symptom:** tag chips, collection chips, and the `Tag` primitive look
subtly different.

**Root cause:** there are **five** separate chip definitions:
- `ui/Tag.svelte` `.tag` (border `--color-fold`)
- `library/+page.svelte` `.tag-chip` (wraps `Tag`)
- `library/+page.svelte` `.collection-chip` (pill, `--color-surface-sunken`)
- `TagEditor.svelte` `.chip` (pill, `--color-surface-sunken`, inline-flex + ×)
- `HighlightPopover` swatches are a 6th pill-ish control.

Duplicated chip markup/CSS violates the "reusable primitives, no duplicated CSS"
rule in `CLAUDE.md`.

**Fix direction:** extract a single `Chip` primitive (states: default, selected,
interactive/link, removable) into `$lib/components/ui/`, and have the tag rail,
collections rail, `Tag`, and `TagEditor` compose it.

#### D2b 🟡 Collections management UI is dense/utilitarian

`.collection-item` rows (`:260`) put name + "rename" + "delete" as bare text
buttons in a wrapping flex row — functional but visually noisy and inconsistent
with the card aesthetic. Flag for design polish; group actions, add hover
affordance, align.

#### D2c 🟡 Loading skeleton height is a guess

`.skeleton { height: 9rem }` (`:218`) won't match real card height once `C1`
lands. Re-tune after card layout is fixed so the skeleton-to-content swap
doesn't jump.

### D3 — Home / Extract (`routes/+page.svelte`)

🟡 Mostly sound (hero + two card sections). Inherits all `ArticleCard`/`Card`/
`CardGrid` fixes (`C1`–`C3`). The "working on it" section is where the
queued-URL overflow (`C2`) is most visible. No screen-specific bug beyond the
shared ones.

### D4 — Login (`routes/login/+page.svelte`)

🟡 Self-contained and the most polished screen (own `main` with gradient,
dog-ear motif, focused card). No functional issue. Two notes: it duplicates the
dog-ear `::after` motif also present in `library` `.empty` (`D6`-style
duplication — candidate for a shared motif utility), and it's the visual quality
bar the other screens should reach.

### D5 — Search (`routes/search/+page.svelte`)

- 🟠 `.result` cards use a *different* card treatment than `ui/Card` (own border,
  radius `--radius-md`, hover) — inconsistent with the rest of the app's cards.
  Fold into the shared card/`Chip` system or document why search results differ.
- 🟡 `.result` link has no focus-visible ring (`C7`).
- 🟡 `{@html r.snippet}` is injected; confirm snippet HTML is server-sanitized
  (out of UI scope, but note for the implementing agent).

### D6 — Collections detail (`routes/collections/[slug]/+page.svelte`)

🟡 Uses `max-width: 900px` (see `A3`). Otherwise just composes `CardGrid` +
`ArticleCard`; inherits shared fixes. Has a back-link pattern duplicated with the
reader's `.back` — candidate for a shared `BackLink`.

### D7 — Settings / Connectors (`routes/settings/connectors/+page.svelte`)

🟡 Cleanest list layout in the app; uses space tokens well. Only note: `max-width:
48rem` (`A3`) and no link to it from `TopBar`/nav — discoverability gap (flag,
may be intentional pre-Phase-7).

---

## E. Cross-cutting themes

### E1 🔴 No responsive strategy anywhere

**Symptom:** the app is desktop-only; nothing adapts to narrow viewports.

**Root cause:** there are **zero `@media` width breakpoints** in the entire web
app (only `prefers-reduced-motion` blocks exist). Specific failures:
- `TopBar.svelte:32` — single flex row (brand + nav + search `max-width:20rem` +
  3 theme buttons + sign out, `gap:1.5rem`) overflows below ~700px with no
  collapse/menu.
- `ReaderControls` — 6 buttons wrap awkwardly on narrow screens.
- Reader toolbar (`D1b`) compounds on mobile.

**Fix direction:** establish breakpoint tokens and a mobile strategy: collapse
`TopBar` nav/search into a menu, stack the reader toolbar, verify `CardGrid`
single-column behavior with the A1 reset in place. Sizeable; treat as its own
work item.

### E2 🟠 Inconsistent interactive affordance on cards

`ui/Card` has no hover state; `search .result` and `.collection-chip` do.
`ArticleCard` is only partially clickable (a "Read" button, not the whole card).
Decide one model (whole-card clickable vs explicit button) and apply uniformly.

### E3 🟡 Motifs applied ad hoc

The dog-ear fold motif appears in `login` and `library .empty` as duplicated
`::after` blocks; the grain texture only on `.app`. `CLAUDE.md` treats these as
core design motifs. Extract a reusable motif utility/mixin so the design phase
can apply them consistently.

### E4 🟡 Voice/casing inconsistency

See `C4` — chrome text mixes lowercase and Title Case. One normalization pass.

---

## G. Polish & modernization direction

This section is **additive** to the bug fixes above: once the structural defects
(A–E) are closed, this is how the UI becomes more polished and modern **without
abandoning the warm-paper identity**. Direction agreed with the owner:

- **Ambition: expressive evolution** — push the paper personality *further*, not
  toward generic SaaS minimalism. Lean into materiality and the playful voice.
- **Motion: rich & choreographed** — micro-interactions *plus* route view
  transitions and staggered reveals, always behind `prefers-reduced-motion`.
- **Iconography: icons + text** — add a lightweight icon set alongside labels.

**North star:** `assets/_banner.html` (per `CLAUDE.md`, the design source of
truth). Every polish move below should look like it came from that banner.
**Hard rule (unchanged):** tokens only — no hardcoded colors/fonts; new visual
constants become tokens in `tokens.css` so the theme system keeps working.

### G1 — Materiality & depth (the "paper" should feel physical)

- **Grain beyond the backdrop.** Today the grain texture (`--texture-grain`)
  lives only on `.app::before` (`+layout.svelte:56`). Apply a faint grain to
  raised surfaces (cards, dialog, login card) so paper reads as paper up close.
- **Layered, warm shadows.** Shadows are already warm-tinted (`tokens.css:104`).
  Use *two-layer* elevation (ambient + key) on cards/dialogs for softer depth,
  and add a subtle 1px warm top-highlight border to lift surfaces off the bg.
- **Dog-ear as a recurring motif, not a one-off.** The folded corner appears
  only on `login` and `library .empty`. Promote it to a reusable
  `<PaperCorner>`/motif utility (cross-ref `E3`) and use it as a signature on
  article cards (e.g. on hover, or for "read"/archived state) — a memorable,
  on-brand detail.
- **Edge treatment.** Consider a faint torn/deckled or stitched edge token for
  hero and empty-state panels to reinforce stationery.

### G2 — Motion & choreography

- **Route view transitions.** Use the SvelteKit `onNavigate` + View Transitions
  API for cross-route continuity (library → reader especially: the card title
  morphs toward the article title). Gate entirely on `prefers-reduced-motion`.
- **Staggered reveals.** Card grids animate in with a small per-item delay
  (replace the single `.page` reveal, `A4`) — paper settling onto the desk via
  `--ease-paper`. Cap stagger so large grids don't feel slow.
- **Tactile hover/press.** Standardize: cards lift + shadow-deepen on hover
  (cross-ref `E2`), buttons already lift (`Button.svelte:35`) — extend the same
  press-down on `:active`. Dog-ear corner could "peel" slightly on card hover.
- **State-change motion.** Capture success, tag add/remove, highlight create,
  progress bar — animate transitions rather than snapping. The processing→ready
  card should cross-fade, not pop.
- **Shimmer skeletons.** Upgrade the pulse skeleton (`library .skeleton`,
  `:218`) to a warm directional shimmer; re-tune height after `C1`/`D2c`.
- **Contract:** every animation must no-op (or reduce to a fade) under
  `prefers-reduced-motion`. Extend the existing reduced-motion blocks.

### G3 — Iconography (icons + text)

- **Add a tree-shakeable icon set** — recommend **`lucide-svelte`** (clean, line,
  pairs well with Fredoka's rounded geometry; per-icon import keeps the bundle
  small). This is a new dependency — call it out in review like Bits UI (`B`).
- **Where:** actions and nav — search, theme toggle (sun/moon/book), delete
  (trash), archive (box), retry (rotate), close (×→icon), back (arrow), external
  link, collection (folder), tag. Keep the **lowercase text label alongside** the
  icon on primary actions to preserve voice; icon-only is fine for dense/
  repeated controls (card delete, dialog close) with `aria-label`.
- **Tokenize icon sizing/stroke** (e.g. `--icon-sm/md`, stroke width) so icons
  feel part of the system, not bolted on. Inherit `currentColor`.
- **A11y:** icon-only buttons keep `aria-label`; decorative icons get
  `aria-hidden`.

### G4 — Typography & hierarchy

- **Exploit Fredoka's display range.** The hero (`+page.svelte` h1) and reader
  title can go larger/tighter using `--text-3xl/4xl/hero` + `--tracking-display`
  for banner-grade presence. Current hero caps at `2.8rem` (`:65`) — modest.
- **Reader refinements:** a **drop-cap** on the first paragraph (display font),
  refined blockquote (current is a plain left-border, `:318` — add a paper pull-
  quote treatment), styled `pre`/`code` (mono token already wired), and figure/
  caption styling. These make long-form feel crafted.
- **Vertical rhythm:** standardize heading margins via space tokens; today each
  screen sets its own h1/h2 sizes ad hoc (library `1.6rem`, collections `1.6rem`,
  search `--text-xl`, connectors `--text-xl`). Define heading roles as tokens/
  classes.

### G5 — Color, state & feedback expression

- **One hot accent, richer states.** Keep the single terracotta accent
  (`CLAUDE.md`). Use `--color-accent-wash` and the status hues (sage/amber/clay/
  dusk, already in tokens) deliberately for success/warning/danger/info states —
  currently underused (e.g. processing, partial, failed cards in
  `ArticleCard` are plain text).
- **Status as visual language.** The card extraction states
  (`processing/ok/partial/failed`) should read at a glance via a small colored
  motif (accent dot, tinted edge), not just a paragraph of text.
- **Toasts for transient feedback.** Capture success/failure is currently inline
  text (`CaptureBar.svelte:39`). A small paper-toast (with Bits UI or a tiny
  custom) for "saved ✓ / couldn't save" feels modern and gets feedback out of
  the form. Honor `--z-toast` (already tokenized).
- **Selection & focus as brand.** Style `::selection` to `--color-selection`
  globally, and give focus rings a designed look (cross-ref `C7`) rather than the
  default-ish outline.

### G6 — Signature moments

- **Landing hero** (Phase 3 proper): bring `_banner.html`'s energy to the
  home/hero — the oversized brand, the "pls" terracotta pop, paper layering. This
  is the app's first impression and currently a plain centered h1 + input.
- **Empty & error states with personality.** The lowercase playful voice
  (`library .empty` already has it) should extend to every empty/error/loading
  state — a small illustrated paper motif + a warm line of copy, not a bare
  sentence.
- **Capture delight.** A small, satisfying confirmation animation when a link is
  saved (paper folding/filing) — a signature micro-moment, reduced-motion safe.

### G7 — Reader as the flagship surface

The reader is the product's core; it deserves the most polish once `D1` lands:
distraction-free focus mode, the drop-cap/pull-quote treatment (`G4`),
choreographed highlight creation, a refined reading-progress indicator, and a
properly-placed highlights rail (`D1c`). Treat the reader as the showcase for
the expressive-evolution direction.

---

## F. Suggested work breakdown (for agents)

Ordered by dependency. Each is a candidate branch/commit; all under TDD,
tokens-only, no hardcoded colors/fonts (`CLAUDE.md`). Two tracks: **structural**
(close the defects) then **polish** (the expressive-evolution layer). Polish
depends on the structural track landing first.

**Track 1 — Structural / behavioral (Phase-2 gap closure)**

1. **Global reset & shell** (`A1`, `A2`) — unblocks correct width/overflow math
   everywhere. *Do first.*
2. **Card layout + grid + URL overflow** (`C1`, `C2`, `C3`) — fixes the bulk of
   "messy cards" and the queued-URL spill. Depends on #1.
3. **Reader layout** (`D1a`, `D1b`, `D1c`) — separate shell width from measure;
   decide highlights-rail pattern. Depends on #1.
4. **Shared chip / focus / voice pass** (`C4`, `C5`, `C7`, `D2a`, `E2`, `E4`) —
   consistency sweep; extract `Chip`, unify focus rings, normalize casing.
5. **Container width tokens** (`A3`) — define and apply the width scale.
6. **Responsive pass** (`E1`) — breakpoints + TopBar/reader-toolbar mobile
   behavior. Depends on #1–#3.

**Track 2 — Polish / modernization (Phase-3 design language)**

7. **Bits UI seam** (`B`, `C6`, `C8`) — add `bits-ui`; migrate `ConfirmDialog`
   then `HighlightPopover`, keeping public APIs and tests green. Enables toasts
   (`G5`) and a future menu for the reader toolbar (`D1b`).
8. **Iconography** (`G3`) — add `lucide-svelte`; tokenize icon size/stroke; apply
   icons + text across actions/nav.
9. **Materiality & motion foundation** (`G1`, `G2`, `A4`) — grain on surfaces,
   layered shadows, `<PaperCorner>` motif (`E3`), hover/press, staggered reveals,
   route view transitions, shimmer skeletons. All `prefers-reduced-motion` safe.
10. **Type, color & feedback** (`G4`, `G5`) — display-scale headings, reader
    drop-cap/pull-quote, status-as-visual-language for card states, toasts,
    styled selection/focus.
11. **Signature moments & reader flagship** (`G6`, `G7`, `D2b`, `D5`, `D7`) —
    landing hero from `_banner.html`, personality-filled empty/error states,
    capture-delight animation, reader focus mode.

**Phasing note (per `CLAUDE.md`):** Track 1 is structural/behavioral — it must
**not** introduce new visual design. Track 2 is Phase-3 design-language work — it
must **not** change behavior. Keep the concerns unmixed, and land Track 1 before
Track 2 so polish builds on a correct structural base.

---

## Appendix — files reviewed

Shell: `app.html`, `routes/+layout.svelte`, `lib/styles/tokens.css`,
`lib/styles/fonts.css`.
Primitives: `ui/Card`, `ui/CardGrid`, `ui/Button`, `ui/Input`, `ui/Tag`,
`ui/Spinner`, `ui/ConfirmDialog`.
Components: `ArticleCard`, `TopBar`, `CaptureBar`, `ReaderControls`,
`HighlightsSidebar`, `HighlightPopover`, `TagEditor`, `AddToCollection`.
Screens: `routes/+page`, `library`, `read/[id]`, `login`, `search`,
`collections/[slug]`, `settings/connectors`.
</content>
