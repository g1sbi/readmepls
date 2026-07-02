# Track 2 · Slice 3 — Materiality & Motion Foundation

**Date:** 2026-06-29
**Status:** Approved design, pre-implementation
**Track:** UI rework Track 2 (Phase-3 design language / polish), slice 3 of 5.
**Source brief:** `docs/superpowers/specs/2026-06-29-ui-review-findings.md` — §F work
item 9; findings `G1` (materiality), `G2` (motion), `A4` (depth), `E3` (paper motif).

## 1. Summary

Apply the established paper/ink design language as **tactile surfaces** and
**restrained-but-present motion**. The design tokens already exist (derived from
`assets/_banner.html`): grain texture, a warm layered shadow scale, motion
easings/durations, reduced-motion zeroing, and the dog-ear fold color. This slice
*applies* them — it adds no new behavior, routing, or copy, and every control
keeps its current accessible name. All motion is `prefers-reduced-motion`-safe.

Motion level (decided): **Balanced** — micro-interactions, staggered reveals,
shimmer skeletons, **and** cross-route view transitions (global cross-fade). The
fancier shared-element card→reader title morph is **deferred to slice 5**.

## 2. Goals / Non-Goals

### Goals
- Grain texture on the app shell **and** card/popover surfaces (tokenized opacity).
- Formalize rest→hover shadow elevation using the existing `--shadow-*` scale.
- A reusable `<PaperCorner>` dog-ear motif, applied **sparingly** (library
  empty-state + reader header only — not on every grid card).
- Hover/press micro-interactions on cards, chips, and nav links.
- A `reveal` action (ported from the landing site) for staggered list/grid entrance.
- A `<Skeleton>` shimmer primitive for the library grid and reader loading states.
- Global cross-route view transitions via the View Transitions API, feature-detected.
- Keep all existing tests green; TDD the units that carry logic.

### Non-Goals
- No behavior, routing, or copy changes. No new features.
- **No shared-element / morph view transitions** (slice 5 signature moments).
- No status-as-color card language, drop-caps, toasts, or display-scale type
  (slice 4). No landing hero, empty-state personality copy, capture-delight, or
  reader focus mode (slice 5).
- No dog-ear on article cards or dense surfaces (noise — deliberately sparing).
- No new color/font values — tokens only.

## 3. Existing tokens this slice builds on (`tokens.css`)

Already defined — do **not** redefine:
- `--texture-grain` — the SVG fractal-noise data-URI (banner `::before`).
- `--shadow-sm` / `--shadow-md` / `--shadow-lg` / `--shadow-xl` — warm-tinted scale.
- `--color-fold` — dog-ear fold color (per theme, incl. dark/sepia).
- `--ease-paper` (`cubic-bezier(0.2,0.7,0.2,1)`), `--ease-out`.
- `--dur-fast` (120ms) / `--dur-base` (200ms) / `--dur-slow` (360ms).
- Reduced-motion: the existing `@media (prefers-reduced-motion: reduce)` block
  zeroes `--dur-*`. Units that animate via `@keyframes`/transition must ALSO carry
  their own reduced-motion guard (zeroed duration alone does not disable a
  `transform`-based entrance or the view-transition pseudo-elements).

### New tokens (add to `tokens.css`)
```
--grain-opacity: 0.04;   /* banner ::before opacity */
--dur-view: var(--dur-base); /* cross-route view-transition duration */
```

## 4. Units / components

Each unit is one task in the plan. Logic units are TDD'd; pure-visual units are
run-app verified (jsdom computes no layout — never write a hollow assertion).

### 4.1 Grain overlay (visual)
A reusable approach: a `::before` overlay carrying `background-image:
var(--texture-grain)`, `opacity: var(--grain-opacity)`, `mix-blend-mode: multiply`,
`pointer-events: none`, `inset: 0`, on (a) the app shell (`app.css` `.app` or the
layout root — reuse the Track-1 shell element) and (b) `ui/Card.svelte` and the
portaled popover/dialog surfaces. The host must be `position: relative` (or the
existing stacking context). Decorative — no a11y impact.

### 4.2 Layered shadow elevation (visual)
- `Card`: rest `--shadow-sm` → hover `--shadow-md`.
- `ConfirmDialog` / `HighlightPopover` surfaces: `--shadow-lg`.
Wire consistently; values come only from the existing scale.

### 4.3 `<PaperCorner>` dog-ear primitive (visual) — NEW `ui/PaperCorner.svelte`
The banner `.fold` motif: an absolutely-positioned decorative triangle
(`linear-gradient(135deg, var(--color-fold) 0 50%, transparent 50%)`), a small
border-radius on the inner corner, `aria-hidden="true"`, sized via a prop or
fixed small size, placed in a `position: relative` parent. **Applied only** to the
library empty-state and the reader header. Tokenized via `--color-fold`.

### 4.4 Hover/press micro-interactions (visual)
- `Card` (when interactive): hover `translateY(-2px)` + shadow step; press
  (`:active`) settles to `translateY(0)`. Uses `--dur-fast` + `--ease-out`.
- Chips and nav links: subtle background/tint on hover (tokens only).
- Buttons already have hover lift — leave as is.
- Reduced-motion: no transform (guarded).

### 4.5 `reveal` staggered-entrance action (LOGIC — TDD) — NEW `lib/actions/reveal.ts`
Port the landing site's `reveal` action (`apps/site/src/lib/actions/reveal.ts`
and its test) into `apps/web`. A Svelte action that fades+rises its node on first
paint (or on intersection), accepting an optional per-item `index`/`delay` for
stagger. Applied to the library grid items and the highlights-sidebar list.
- **Reduced-motion:** the action must no-op the transform/opacity animation
  (render final state immediately) when `prefers-reduced-motion: reduce`.
- **TDD:** port the existing test; assert the action applies the entrance state
  and respects reduced-motion (mock `matchMedia`).

### 4.6 `<Skeleton>` shimmer primitive (LOGIC + visual) — NEW `ui/Skeleton.svelte`
A placeholder block with an animated shimmer gradient sweep (`@keyframes`, using
paper tokens). Props for width/height/shape (e.g. `lines`, `radius`). Used in:
- the library grid while articles load (a few skeleton cards),
- the reader while content loads.
- **Reduced-motion:** static muted block, no shimmer animation (guarded).
- **TDD:** assert it renders the requested shape and carries an appropriate
  `aria-hidden`/`role` so it is not announced as content; visual shimmer is
  run-app verified.

### 4.7 Route view transitions (LOGIC guard + visual) — `+layout.svelte`
In the root layout, add an `onNavigate` hook that calls
`document.startViewTransition(...)` **only when it exists** (feature-detected;
Firefox lacks it) and **only when motion is allowed** (`prefers-reduced-motion`
not `reduce`), resolving the navigation inside the callback per the SvelteKit
pattern. Add global `::view-transition-old(root)` / `::view-transition-new(root)`
cross-fade CSS with `--dur-view`. No per-route shared elements (deferred).
- **TDD:** the guard logic — extract a small pure helper
  `shouldAnimateNavigation(doc, mql)` returning boolean (true only if
  `startViewTransition` exists and motion is allowed) and unit-test both
  branches. The DOM wiring itself is run-app verified.

## 5. Accessibility

- Grain, dog-ear, and skeletons are decorative (`aria-hidden` / non-announced).
- Every existing control keeps its accessible name; no markup change alters a
  name. Existing `getByRole(..., { name })` queries remain the regression contract.
- All motion (reveal, hover lift, shimmer, view transitions) is disabled under
  `prefers-reduced-motion: reduce` via explicit guards, not just zeroed `--dur-*`.

## 6. Components / files touched

- `apps/web/src/lib/styles/tokens.css` — `--grain-opacity`, `--dur-view`.
- `apps/web/src/app.css` and/or `apps/web/src/routes/+layout.svelte` — shell grain
  overlay; `onNavigate` view-transition hook + `::view-transition-*` CSS.
- `apps/web/src/lib/components/ui/Card.svelte` — grain, hover lift, shadow step.
- `apps/web/src/lib/components/ui/ConfirmDialog.svelte`,
  `HighlightPopover.svelte` — surface grain + `--shadow-lg`.
- `apps/web/src/lib/components/ui/PaperCorner.svelte` *(new)*.
- `apps/web/src/lib/components/ui/Skeleton.svelte` *(new)*.
- `apps/web/src/lib/actions/reveal.ts` *(new, ported)* + `reveal.test.ts`.
- `apps/web/src/lib/view-transition.ts` *(new)* — `shouldAnimateNavigation` helper
  + test.
- `apps/web/src/routes/library/+page.svelte` — reveal on grid, Skeleton while
  loading, PaperCorner on empty-state.
- `apps/web/src/routes/read/[id]/+page.svelte` — Skeleton while loading,
  PaperCorner on header.
- `apps/web/src/lib/components/HighlightsSidebar.svelte` — reveal on the list.
- Chips / nav links — hover tint (TopBar, Chip/Tag).

## 7. Testing

- **TDD (logic):** `reveal` action (entrance state + reduced-motion no-op);
  `shouldAnimateNavigation` (both branches); `Skeleton` shape/role assertions.
- **Regression:** full existing web suite stays green; accessible names unchanged.
- **Run-app visual (no hollow assertions):** grain texture on shell + cards;
  rest→hover shadow elevation; dog-ear on empty-state + reader header; card
  hover/press lift; staggered grid/list reveal; shimmer skeletons during load;
  cross-route fade on navigation. Verify across light/dark/sepia and with
  reduced-motion ON (all motion stops; layout intact).

## 8. Build order

1. Tokens (`--grain-opacity`, `--dur-view`) + grain overlay (shell + Card) + shadow
   elevation — the materiality foundation.
2. `<PaperCorner>` primitive + sparing application (empty-state, reader header).
3. Hover/press micro-interactions (Card, chips, nav links).
4. `reveal` action (port + TDD) + apply to library grid and highlights list.
5. `<Skeleton>` primitive (TDD) + apply to library + reader loading states.
6. View transitions: `shouldAnimateNavigation` helper (TDD) + `onNavigate` wiring
   + `::view-transition-*` CSS.

Each step lands as its own Conventional Commit (`feat:`/`refactor:`). Squash not
required on `develop`. Local commits only — no push/PR unless asked.
