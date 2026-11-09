# Design Foundation, Plan 1 of 5: Tokens, Fonts, Motion, Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retone the whole app from warm-paper to Marker (light + dark) by
replacing tokens, fonts, and motion, and replace the light/dark/sepia theme
setting with light/dark/system. No component markup is redesigned in this plan.

**Architecture:**
- **Components keep their semantic token names,** so a token rewrite alone
  retones every screen.
- **Retired paper-only tokens** (grain, fold, gradient, `--ease-paper`,
  `--font-display`) are first removed from their few consumers, then
  deleted from `tokens.css`.
- **Motion:**
  - tokens supply the easings and durations;
  - `tw-animate-css` provides the shared enter/exit library that shadcn
    components already reference (its classes are currently no-ops because
    the package was never installed);
  - one small action plus CSS provides the marker swipe.
- **Theme preference:**
  - becomes `light | dark | system`;
  - is resolved by pure functions;
  - is applied before first paint by an inline script;
  - is migrated in PocketBase.

**Tech Stack:** SvelteKit 2 / Svelte 5, Tailwind v4 + shadcn-svelte on the
`tokens.css` bridge, `tw-animate-css`, Vitest (jsdom), PocketBase JS
migrations, Zod.

**Spec:** `docs/superpowers/specs/2026-11-09-design-foundation-design.md`
(issue #10). This is plan 1 of the five slices listed in the spec's "Left to
the builder". Plans 2–5 are written after this one lands.

## Global Constraints

- Never hardcode a color or font name in a component; reference a token
  (CLAUDE.md).
- `tokens.css` stays the single source of truth, layered as primitives,
  then semantic, then modes. The shadcn bridge maps onto it and never holds
  a second palette.
- `data-theme` values are `light` and `dark` only.
  `@custom-variant dark ([data-theme="dark"] &)` is unchanged.
- Do not switch to a bare `@import "tailwindcss"`; no preflight (CLAUDE.md).
- One accent only: highlighter yellow `#ffce00`. No second accent hue.
- Ronzino (SIL OFL) for UI and reading, self-hosted. Source:
  `https://github.com/collletttivo/ronzino` `fonts/*.woff2` plus
  `LICENSE.txt`. Never the mockup folder.
- Everything collapses under `prefers-reduced-motion`; the marker then
  renders already drawn.
- No hover-only affordances.
- Mobile-first at 360px; tap targets ≥ 44px.
- Tests:
  - subset: `pnpm exec vitest run <pattern>`;
  - all: `pnpm test`.
  - `pnpm --filter <pkg> test` does not work.
  - Typecheck: `pnpm typecheck`. Lint: `pnpm lint`.
- Conventional Commits. End each message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Pre-1.0:
  `feat`/`fix` bump the patch, so never use `!`.

## Review Focus

These conditions bite real users but no single feature test exercises them.
Each one has its pinning test added to the owning task.

1. A returning user whose localStorage holds `"light"` or `"sepia"` from the
   old app should end up following the OS, not pinned to light. Task 6:
   `migrateStoredTheme` test.
2. A self-hosted instance whose DB hasn't run the new migration yet sends
   `reader_prefs.theme = "sepia"`. It should be treated as `system`, not
   crash or fall back to light. Task 6: `resolveThemePref` test.
3. With the pref set to `system`, an OS switch to dark while the app is
   open should retone live, without a reload. Task 6: `watchSystemMode`
   test.
4. On a touch device with no hover, the marker should draw once when
   scrolled into view, and not flicker or re-run on every scroll. Task 5:
   `markerInView` tests.
5. Existing highlights stored with keys `terracotta | amber | sage` must
   still render in both modes after the retone. Task 3: tokens test asserts
   every `--hl-*` key is defined in light and dark.

---

### Task 1: Gate 1 — Marker palette review (owner checkpoint, no code)

The spec requires owner approval of the light and dark palette before it is
built. The values below are **proposed** and were contrast-checked during
planning (WCAG ratios in brackets). If the owner changes any value, update
it here and in Task 3 before continuing.

**Files:**
- Create: `docs/superpowers/mockups/2026-11-09-design-foundation/palette.html`

**Proposed values:**

| semantic token | light | dark |
|---|---|---|
| `--color-bg` (page) | `#e4e4e2` | `#0e0f11` |
| `--color-surface` (cards) | `#f7f7f6` | `#17181b` |
| `--color-surface-sunken` (chips, tracks) | `#d6d6d4` | `#26282c` |
| `--color-surface-raised` (popovers) | `#fbfbfa` | `#1e1f23` |
| `--color-text` | `#020203` [16.3 on bg] | `#ededec` [16.4] |
| `--color-text-muted` | `#55585c` [5.6 bg / 6.7 surface] | `#a3a6ab` [7.9 / 7.3] |
| `--color-text-subtle` | `#6e7378` [3.8 / 4.5] | `#8a8e94` [5.8 / 5.4] |
| `--color-hairline` | `rgb(2 2 3 / 0.12)` | `rgb(237 237 236 / 0.10)` |
| `--color-inverse` (active pill, ink tile) | `#020203` | `#ededec` |
| `--color-text-inverse` | `#f7f7f6` [19.4] | `#0e0f11` [16.4] |
| `--color-accent` (primary action fill) | `#020203` | `#ededec` |
| `--color-accent-hover` | `#2a2b2e` | `#ffffff` |
| `--color-text-on-accent` | `#f7f7f6` | `#0e0f11` |
| `--color-accent-wash` (neutral hover wash) | `#dcdcda` | `#222327` |
| `--color-marker` | `#ffce00` [13.9 vs ink] | `#ffce00` |
| `--color-marker-soft` | `rgb(255 206 0 / 0.55)` | `rgb(255 206 0 / 0.38)` |
| `--color-text-on-marker` | `#020203` | `#020203` |
| `--color-ring` | `#020203` | `#ededec` |
| `--color-selection` | `var(--color-marker-soft)` | same |
| `--color-success` | `#1f8a4c` | `#3fbf73` |
| `--color-warning` | `#9a6412` | `#e0a23a` |
| `--color-danger` | `#d92d20` | `#ff6b5e` |
| `--color-info` | `#2f6fde` | `#6ea0ff` |
| `--hl-terracotta` (default highlight → marker) | `rgb(255 206 0 / 0.45)` | `rgb(255 206 0 / 0.32)` |
| `--hl-amber` (→ rose) | `rgb(255 107 157 / 0.30)` | `rgb(255 107 157 / 0.32)` |
| `--hl-sage` (→ mint) | `rgb(52 199 123 / 0.30)` | `rgb(52 199 123 / 0.30)` |

- [ ] **Step 1: Build `palette.html`.**
  - Start from `docs/superpowers/mockups/2026-11-09-design-foundation/home-v2.html`.
  - Render the home screen (ink feature, goal tile, continue-reading list,
    sidebar) twice, light and dark, using exactly the values above as
    CSS variables.
  - Add a swatch table and a highlighted paragraph showing all three
    highlight colors.
  - Load Ronzino from `https://cdn.jsdelivr.net/gh/collletttivo/ronzino@main/fonts/`.
- [ ] **Step 2: Show it to the owner and record approval.**
  - Get the owner's approval, or their changes, in the issue: comment on
    #10 with the final table.
  - Update the table above if anything changed.
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/mockups/2026-11-09-design-foundation/palette.html docs/superpowers/plans/2026-11-09-design-foundation-1-tokens-motion-theme.md
git commit -m "docs: Marker light/dark palette review mockup"
```

---

### Task 2: Ronzino fonts replace Fredoka, Newsreader, and IBM Plex Sans

**Files:**
- Create: `apps/web/static/fonts/ronzino-{regular,oblique,medium,medium-oblique,bold,bold-oblique}.woff2`,
  `apps/web/static/fonts/ronzino-OFL.txt`
- Delete: `apps/web/static/fonts/{fredoka-variable,newsreader-variable,newsreader-italic-variable,ibm-plex-sans-variable}.woff2`
- Modify: `apps/web/src/lib/styles/fonts.css`, `apps/web/src/app.html` (preload links)
- Test: `apps/web/src/lib/styles/fonts.test.ts`

**Interfaces:**
- Produces: `@font-face` family name `"Ronzino"` at weights 400, 500, and
  700, each normal and italic. Task 3's `--font-ui` and `--font-reading`
  stacks reference it. IBM Plex Mono stays as `--font-mono`.

- [ ] **Step 1: Write the failing test** `fonts.test.ts`. It reads
  `fonts.css` and `app.html` from disk, like `ui/tailwind-bridge.test.ts`
  does, and asserts:
  - `it("declares Ronzino in 3 weights × normal/italic")`: for each
    `[400,"normal"],[400,"italic"],[500,"normal"],[500,"italic"],[700,"normal"],[700,"italic"]`,
    there is an `@font-face` block containing `font-family: "Ronzino"`,
    that `font-weight`, that `font-style`, `font-display: swap`, and a
    `/fonts/ronzino-*.woff2` url.
  - `it("drops the warm-paper faces")`: `fonts.css` does not match
    `/Fredoka|Newsreader|IBM Plex Sans/`.
  - `it("every referenced font file exists")`: every `url("/fonts/…")` in
    `fonts.css` resolves to an existing file under `apps/web/static`.
  - `it("preloads Ronzino regular + medium, not the old faces")`: `app.html`
    contains `fonts/ronzino-regular.woff2` and `fonts/ronzino-medium.woff2`
    preload links, and not `fredoka` or `newsreader`.
- [ ] **Step 2: Run it and confirm it fails.**
  `pnpm exec vitest run fonts.test`. Expected: FAIL (no Ronzino face).
- [ ] **Step 3: Download the fonts and wire them up.**
  - Download the six `fonts/Ronzino-*.woff2` files and `LICENSE.txt` from
    `collletttivo/ronzino@main`. Save them lowercase-kebab
    (`Ronzino-MediumOblique.woff2` → `ronzino-medium-oblique.woff2`) and
    the license as `ronzino-OFL.txt`.
  - Delete the four old files.
  - Rewrite `fonts.css`: six Ronzino `@font-face` blocks plus the two
    existing IBM Plex Mono blocks, and update the header comment.
  - In `app.html`, replace the two preloads with Ronzino regular and
    medium.
- [ ] **Step 4: Run it and confirm it passes.**
  `pnpm exec vitest run fonts.test`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/static/fonts apps/web/src/lib/styles/fonts.css apps/web/src/lib/styles/fonts.test.ts apps/web/src/app.html
git commit -m "feat(web): self-host Ronzino, drop Fredoka/Newsreader/Plex Sans"
```

---

### Task 3: Retire paper-only tokens from components, then rewrite `tokens.css` as Marker

The retired tokens are `--texture-grain`, `--grain-opacity`, `--color-fold`,
`--color-bg-gradient`, `--ease-paper`, `--font-display`,
`--tracking-eyebrow`, `--reading-font-sans`, and every primitive ramp
`--paper-*`, `--ink-*`, `--terracotta-*`, `--sage-*`, `--amber-*`,
`--clay-*`, `--dusk-*`, `--marker-{butter,rose,sky,mint}`.

Current consumers (verified at planning time):
- `BottomNav.svelte`, `ReaderControlBar.svelte`, `routes/+layout.svelte`,
  and `routes/read/[id]/+page.svelte`: `--ease-paper` → `--ease-out`.
- `TopBar.svelte`: `--font-display` → `--font-ui`.
- `HighlightPopover.svelte`, `ui/Card.svelte`, `ui/ConfirmDialog.svelte`,
  and `routes/+layout.svelte`: grain overlay rules are deleted outright.
- `routes/+layout.svelte`, `login/+page.svelte`, and `verify/+page.svelte`:
  `--color-bg-gradient` → `--color-bg`.
- `ui/Spinner.svelte`: `--color-fold` → `--color-surface-sunken`.
- `login/+page.svelte`: dog-ear rule deleted.
- `ui/PaperCorner.svelte`: deleted, along with its one use in
  `routes/library/+page.svelte`.
- `lib/reader/css-vars.ts` (and its test): the `sans` option maps to
  `var(--font-reading)` too, since both are Ronzino now. Plan 4 removes the
  option entirely.

**Files:**
- Modify: the consumers above, plus `apps/web/src/lib/styles/tokens.css`
- Delete: `apps/web/src/lib/components/ui/PaperCorner.svelte` (and its test,
  if any)
- Test: `apps/web/src/lib/styles/tokens.test.ts`,
  `apps/web/src/lib/styles/retired-tokens.test.ts`, the updated
  `lib/reader/css-vars.test.ts`

**Interfaces:**
- Produces, as semantic tokens defined in `:root` and redefined in
  `[data-theme="dark"]`, with the values from Task 1's table:
  - `--color-bg`, `--color-surface`, `--color-surface-sunken`,
    `--color-surface-raised`
  - `--color-text`, `--color-text-muted`, `--color-text-subtle`
  - `--color-hairline`, `--color-inverse`, `--color-text-inverse`
  - `--color-accent`, `--color-accent-hover`, `--color-text-on-accent`,
    `--color-accent-wash`
  - `--color-marker`, `--color-marker-soft`, `--color-text-on-marker`
  - `--color-border` (= `--color-hairline`),
    `--color-border-strong` (= ink or text at 22%)
  - `--color-ring`, `--color-selection`
  - `--color-success`, `--color-warning`, `--color-danger`, `--color-info`
  - `--hl-terracotta`, `--hl-amber`, `--hl-sage`
  - `--shadow-color` (light `0 0 0`; dark `0 0 0`, with the dark shadows'
    alpha doubled)
  - `--reading-text`, `--reading-bg`
- Also produces, unchanged names with new values:
  - `--font-ui` = `--font-reading` = `"Ronzino", ui-sans-serif, system-ui, sans-serif`;
  - `--radius-lg: 16px`, `--radius-xl: 26px` (sheets), `--radius-2xl: 32px`;
  - `--tracking-display: -0.045em`, `--tracking-tight: -0.015em`.
- The shadcn bridge keeps compiling: every `--color-*` it references still
  exists, so `ui/tailwind-bridge.test.ts` must stay green.

- [ ] **Step 1: Write the failing test** `retired-tokens.test.ts`. It globs
  `apps/web/src/**/*.{svelte,ts,css}`, excluding `lib/styles/tokens.css`
  and test files.
  - `it("no source file references a retired token")`: no file contains
    `var(--X` for any retired name or ramp prefix listed above.
  - `it("PaperCorner is gone")`: no file imports `PaperCorner`.
- [ ] **Step 2: Run it and confirm it fails.**
  `pnpm exec vitest run retired-tokens`. Expected: FAIL, listing the
  consumers above.
- [ ] **Step 3: Update every consumer as listed.** Update
  `css-vars.test.ts` so its expectation for `sans` is `var(--font-reading)`.
- [ ] **Step 4: Run it and confirm it passes.**
  `pnpm exec vitest run retired-tokens css-vars`. Expected: PASS.
- [ ] **Step 5: Write the failing test** `tokens.test.ts`. Use a small
  in-test helper `block(css, selector): Map<string,string>` that extracts
  the custom properties declared in the `:root {…}` (first) or
  `[data-theme="dark"] {…}` block. Also add a `contrast(hexA, hexB): number`
  (WCAG relative-luminance ratio).
  - `it("defines every semantic token in light and dark")`: each token in
    the Produces list exists in both blocks. Exception: `--color-marker`
    and `--color-text-on-marker` may be inherited from `:root`.
  - `it("has no sepia mode and no retired tokens")`: the CSS lacks
    `data-theme="sepia"` and every retired name.
  - `it("keeps every stored highlight key renderable")`: `--hl-terracotta`,
    `--hl-amber`, and `--hl-sage` are in both blocks.
  - `it("meets contrast floors in both modes")`, per mode:
    - `text` vs `bg`/`surface`/`surface-sunken` ≥ 7;
    - `text-muted` vs `bg`/`surface` ≥ 4.5;
    - `text-subtle` vs `bg`/`surface` ≥ 3;
    - `text-inverse` vs `inverse` ≥ 7;
    - `text-on-marker` vs `marker` ≥ 7.

    Read the hex values from the parsed blocks.
  - `it("uses one accent hue")`: `--color-marker` is `#ffce00` in light and
    dark resolution.
  - `it("sets Ronzino for UI and reading")`: `--font-ui` and
    `--font-reading` both start with `"Ronzino"`.
- [ ] **Step 6: Run it and confirm it fails.**
  `pnpm exec vitest run tokens.test`. Expected: FAIL.
- [ ] **Step 7: Rewrite `tokens.css`.**
  - Primitives: a neutral gray ramp plus the marker, as needed by the
    semantic values. Delete all retired ramps.
  - Semantic light values from Task 1, in `:root`.
  - A `[data-theme="dark"]` block. Delete `[data-theme="sepia"]`.
  - Keep the reader `--reading-*` knobs, the space, width, z, and icon
    scales, and the `--topbar-h` comment block.
  - Rewrite the header comment to describe Marker.
- [ ] **Step 8: Run the tests and confirm they pass.**
  `pnpm exec vitest run tokens.test retired-tokens tailwind-bridge`.
  Expected: PASS.
- [ ] **Step 9: Check it visually.**
  - Start the dev server with `pnpm --filter @readmepls/web dev`.
  - Open `/library` and `/read/<id>` at 360px and at desktop width, in
    light and in dark (set `data-theme` in devtools).
  - Confirm no unreadable text and no leftover warm tints.
  - Screenshot both modes for the PR.
- [ ] **Step 10: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(web): retone to Marker light/dark tokens, retire paper motifs

Refs #10"
```

---

### Task 4: Motion tokens and the shared enter/exit library

**Files:**
- Modify: `apps/web/src/lib/styles/tokens.css` (motion section),
  `apps/web/src/lib/styles/shadcn-bridge.css`, `apps/web/package.json`
- Test: `apps/web/src/lib/styles/motion.test.ts`

**Interfaces:**
- Produces:
  - easings: `--ease-out: cubic-bezier(0.075, 0.82, 0.165, 1)` (snappy
    expo-out, the default), `--ease-in: cubic-bezier(0.4, 0, 1, 1)`
    (exits), and `--ease-bounce: cubic-bezier(0.175, 0.885, 0.325, 1.275)`
    (presses, primary buttons);
  - durations: `--dur-fast: 150ms`, `--dur-base: 250ms`,
    `--dur-slow: 450ms`, `--dur-marker: 600ms`;
  - `--dur-view` stays as `var(--dur-base)`.
- Also produces: Tailwind utilities `ease-out`, `ease-in`, and
  `ease-bounce`, all resolving to these tokens. tw-animate-css classes
  (`animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-bottom`, …) now
  work, and plans 2–3 use them for every overlay.

- [ ] **Step 1: Write the failing test** `motion.test.ts`, reading
  `tokens.css`, `shadcn-bridge.css`, and `package.json`:
  - `it("defines the named easings and durations")`: exact values as
    above.
  - `it("zeroes every duration under reduced motion")`: the
    `prefers-reduced-motion: reduce` block sets `--dur-fast`, `--dur-base`,
    `--dur-slow`, and `--dur-marker` to `0ms`.
  - `it("ships the shared enter/exit library")`: `package.json`
    devDependencies include `tw-animate-css`, and `shadcn-bridge.css`
    contains `@import "tw-animate-css"`.
  - `it("registers ease-bounce as a Tailwind easing")`:
    `shadcn-bridge.css`'s `@theme` declares an `--ease-bounce` that
    resolves to the token (no literal curve duplicated).
- [ ] **Step 2: Run it and confirm it fails.**
  `pnpm exec vitest run motion.test`. Expected: FAIL.
- [ ] **Step 3: Install the library and wire up the tokens.**
  - Run `pnpm --filter @readmepls/web add -D tw-animate-css` (pin the exact
    resolved version).
  - Import it in the bridge after the utilities import.
  - Update the motion section of `tokens.css`, replacing `--ease-paper`.
  - Register `ease-bounce` in the bridge's `@theme inline`.
    - tokens.css's unlayered `:root` already overrides Tailwind's own
      `--ease-out`/`--ease-in` theme values, so they need no remap.
    - To avoid a self-referencing `--ease-bounce`, name the source token
      `--motion-bounce` in tokens and alias `--ease-bounce` to it in both
      places.
- [ ] **Step 4: Run it and confirm it passes.**
  `pnpm exec vitest run motion.test tailwind-bridge`. Expected: PASS.
  Then check by hand: open any shadcn dialog in dev and confirm it fades
  and zooms in.
- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/lib/styles
git commit -m "feat(web): Marker motion tokens + tw-animate-css enter/exit library"
```

---

### Task 5: Marker swipe motif (CSS and `markerInView` action)

**Files:**
- Create: `apps/web/src/lib/styles/marker.css`,
  `apps/web/src/lib/actions/marker-in-view.ts`
- Modify: `apps/web/src/routes/+layout.svelte` (import `marker.css` after
  tokens)
- Test: `apps/web/src/lib/actions/marker-in-view.test.ts`,
  `apps/web/src/lib/styles/marker.test.ts`

**Interfaces:**
- Produces, as CSS classes:
  - `.marker`: a static swipe, a `--color-marker-soft` band over the lower
    42% of the text box, `padding-inline: 0.08em`.
  - `.marker-swipe`: the same band, starting at `background-size: 0% 42%`.
    It draws to `100% 42%` over `--dur-marker` with `--ease-out` when
    `.is-drawn` is present, or on `:hover` inside
    `@media (hover: hover) and (pointer: fine)`.
  - `.marker-inverse`: for ink surfaces, the band covers 100% of the line
    height in `--color-marker`. Drawn text switches to
    `--color-text-on-marker`; undrawn text inherits.
- Produces, as an action:
  `markerInView(node: HTMLElement): { destroy(): void } | void`.
  - When pointer hover is unavailable
    (`matchMedia("(hover: hover) and (pointer: fine)")` is false), it adds
    `is-drawn` once, the first time the node intersects at threshold 0.6,
    then disconnects.
  - When reduced motion is set, or `IntersectionObserver` is missing, it
    adds `is-drawn` immediately.
  - On hover-capable pointers it does nothing; CSS handles hover.

  Mirror `actions/reveal.ts`.

- [ ] **Step 1: Write the failing tests** `marker-in-view.test.ts`. Stub
  `window.matchMedia` and a fake `IntersectionObserver` that records
  `observe`/`disconnect` calls and lets the test fire entries.
  - `it("draws immediately under reduced motion")`
  - `it("draws immediately without IntersectionObserver")`
  - `it("on touch, draws once on first intersection then disconnects")`:
    fire a non-intersecting entry (no class), then an intersecting one
    (class added, `disconnect` called). Firing again adds no duplicate
    work.
  - `it("on hover-capable pointers, leaves drawing to CSS")`: no observer
    is created and no class is added.
- [ ] **Step 2: Write `marker.test.ts`** (reads `marker.css`):
  - `.marker-swipe` transitions `background-size` using `var(--dur-marker)`
    and `var(--ease-out)`;
  - the hover rule sits inside `@media (hover: hover) and (pointer: fine)`;
  - the band color is `var(--color-marker-soft)` (inverse:
    `var(--color-marker)`);
  - there are no literal colors.
- [ ] **Step 3: Run them and confirm they fail.**
  `pnpm exec vitest run marker`. Expected: FAIL (the files don't exist).
- [ ] **Step 4: Implement `marker.css` and `markerInView`,** then import
  `marker.css` in `+layout.svelte`.
- [ ] **Step 5: Run them and confirm they pass.**
  `pnpm exec vitest run marker`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/styles/marker.css apps/web/src/lib/styles/marker.test.ts apps/web/src/lib/actions/marker-in-view.ts apps/web/src/lib/actions/marker-in-view.test.ts apps/web/src/routes/+layout.svelte
git commit -m "feat(web): marker swipe motif (hover on pointers, scroll-in on touch)"
```

---

### Task 6: Theme preference light/dark/system (pure functions and types)

**Files:**
- Modify: `apps/web/src/lib/theme/theme.ts`,
  `apps/web/src/lib/theme/theme.test.ts`,
  `packages/types/src/reader.ts`, `packages/core/src/reader/prefs.ts`,
  `packages/core/src/reader/prefs.test.ts`

**Interfaces:**
- Produces, in `theme.ts`:
  - `type ThemePref = "light" | "dark" | "system"` and
    `const THEME_PREFS = ["light","dark","system"] as const`.
  - `type Mode = "light" | "dark"`.
  - `resolveThemePref(stored: string | null, accountPref?: string | null): ThemePref`.
    - A valid account pref wins.
    - Otherwise a valid stored value is used.
    - Otherwise the result is `"system"`.
    - The legacy `"sepia"` (from either source) is treated as `"system"`.
  - `resolveMode(pref: ThemePref, systemPrefersDark: boolean): Mode`.
  - `migrateStoredTheme(storage: Pick<Storage,"getItem"|"setItem"|"removeItem">): void`.
    - If `storage.getItem("theme-v") !== "2"`, it removes `"theme"` unless
      it is `"dark"`, then sets `"theme-v"` to `"2"`.
    - This is idempotent.
  - `applyTheme(pref: ThemePref, mode: Mode): void`. It sets
    `document.documentElement.dataset.theme = mode` and
    `localStorage.theme = pref`.
  - `watchSystemMode(onChange: (prefersDark: boolean) => void): () => void`.
    It subscribes to `matchMedia("(prefers-color-scheme: dark)")` changes
    and returns an unsubscribe function.
  - `THEMES`, `Theme`, `resolveTheme`, and `readStoredTheme` are removed;
    their callers are updated in Task 7.
- Produces, in `packages/types/src/reader.ts`:
  `theme: z.enum(["light","dark","system"])`. In `prefs.ts`: `DEFAULTS.theme = "system"`.
  An unparseable stored `"sepia"` therefore falls back to `"system"` via
  the existing per-field discard.

- [ ] **Step 1: Write the failing tests** in `theme.test.ts`, replacing the
  `resolveTheme` tests:
  - `resolveThemePref`:
    - `("dark", null)` → `"dark"`;
    - `("light", "dark")` → `"dark"` (account wins);
    - `(null, null)` → `"system"`;
    - `("sepia", null)` → `"system"`;
    - `(null, "sepia")` → `"system"` (Review Focus 2);
    - `("neon", "blurple")` → `"system"`.
  - `resolveMode`: `("system", true)` → `"dark"`; `("system", false)` →
    `"light"`; `("light", true)` → `"light"`.
  - `migrateStoredTheme` (Review Focus 1, with an in-memory storage fake):
    - `"light"` is removed;
    - `"sepia"` is removed;
    - `"dark"` is kept;
    - a second run after the user picks `"light"` keeps `"light"` (the
      version marker is honored).
  - `watchSystemMode` (Review Focus 3, with a stubbed `matchMedia` holding
    an `addEventListener` registry):
    - a dispatched `change` with `matches: true` calls back `true`;
    - unsubscribing removes the listener.

  In `prefs.test.ts`:
  - `withReaderDefaults({})` → `theme: "system"`;
  - `withReaderDefaults({ theme: "sepia" as never })` → `theme: "system"`.
- [ ] **Step 2: Run them and confirm they fail.**
  `pnpm exec vitest run theme.test prefs.test`. Expected: FAIL.
- [ ] **Step 3: Implement it in `theme.ts`, `reader.ts`, and `prefs.ts`.**
- [ ] **Step 4: Run them and confirm they pass.** Run the same command;
  expected: PASS. `pnpm typecheck` is expected to fail only at the Task 7
  call sites (`+layout.svelte`, `TopBar.svelte`). Note the errors and fix
  them in Task 7.
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/theme packages/types/src/reader.ts packages/core/src/reader
git commit -m "feat: theme preference light/dark/system with legacy sepia fallback"
```

---

### Task 7: Apply the theme before first paint and wire up the toggle

**Files:**
- Modify: `apps/web/src/app.html` (inline boot script),
  `apps/web/src/routes/+layout.svelte`,
  `apps/web/src/lib/components/TopBar.svelte` (theme control: light / dark
  / system; icons `Sun`, `Moon`, `Monitor`)
- Test: `apps/web/src/lib/theme/boot-script.test.ts`, and the existing
  TopBar/layout tests updated

**Interfaces:**
- Consumes: Task 6's `resolveThemePref`, `resolveMode`,
  `migrateStoredTheme`, `applyTheme`, and `watchSystemMode`.
- Produces:
  - `app.html` contains exactly one `<script data-theme-boot>`. Before
    first paint it:
    - runs the `migrateStoredTheme` logic inline;
    - reads `localStorage.theme`;
    - resolves the mode against `prefers-color-scheme`;
    - sets `document.documentElement.dataset.theme`.

    It is wrapped in try/catch so blocked storage still paints light.
  - The TopBar theme control emits `ThemePref`. Plan 3 moves this control
    into `/settings` → Appearance; the control itself stays.

- [ ] **Step 1: Write the failing test** `boot-script.test.ts`. It extracts
  the `<script data-theme-boot>` body from `app.html` and runs it with
  `new Function` against a fake `document.documentElement.dataset`, a fake
  `localStorage`, and a `matchMedia` stub:
  - stored `"dark"` → `dataset.theme === "dark"`;
  - nothing stored with the system dark → `"dark"`;
  - nothing stored with the system light → `"light"`;
  - stored `"sepia"` without `theme-v` and the system dark → `"dark"`, and
    the storage `theme` is removed;
  - a `localStorage` getter that throws → `"light"` with no exception
    escaping.
- [ ] **Step 2: Run it and confirm it fails.**
  `pnpm exec vitest run boot-script`. Expected: FAIL.
- [ ] **Step 3: Implement the wiring.**
  - Add the inline script to `app.html` before `%sveltekit.head%`. Keep it
    tiny and dependency-free, with the logic mirroring Task 6.
  - In `+layout.svelte`, `onMount` runs:
    - `migrateStoredTheme(localStorage)`;
    - `pref = resolveThemePref(readStored, account reader_prefs.theme)`;
    - `applyTheme(pref, resolveMode(pref, matchMedia(...).matches))`;
    - and, when `pref === "system"`, keeps `watchSystemMode` subscribed
      (re-applying on change, unsubscribing on pref change or destroy).
  - `setTheme(pref)` persists `reader_prefs.theme` as today.
  - In TopBar, show the three options with `aria-pressed`. The accessible
    names are "Light", "Dark", and "Match system".
- [ ] **Step 4: Run the tests and confirm they pass.**
  `pnpm exec vitest run boot-script theme TopBar layout`, then
  `pnpm typecheck`. Expected: PASS, with no new type errors.
- [ ] **Step 5: Check it by hand.**
  - Hard-reload with the OS in dark: there should be no light flash.
  - Toggle the OS theme with the app open while the pref is "Match
    system": the app retones live.
- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app.html apps/web/src/routes/+layout.svelte apps/web/src/lib/components/TopBar.svelte apps/web/src/lib/theme
git commit -m "feat(web): paint the right theme before load; light/dark/match-system toggle"
```

---

### Task 8: PocketBase migration from sepia/light to system

**Files:**
- Create: `pocketbase/pb_migrations/1720300000_theme_system.js`
- Test: `packages/core/src/pb/migration-theme-system.test.ts`

**Interfaces:**
- Produces a data-only migration over `users.reader_prefs`.
  - Up: where `reader_prefs.theme` is `"sepia"` or `"light"`, set it to
    `"system"`. Leave `"dark"`, missing prefs, and every other key
    untouched.
  - Down: `"system"` → `"light"`.

- [ ] **Step 1: Write the failing test.** Use the two-boot pattern from
  `migration-tier-standard-rename.test.ts`.
  - Boot 1 runs all migrations before `1720300000_theme_system.js` and
    creates four users with `reader_prefs` of:
    - `{theme:"sepia",size:18}`;
    - `{theme:"light"}`;
    - `{theme:"dark"}`;
    - none.
  - Boot 2 adds the migration and asserts the stored themes are
    `"system"`, `"system"`, `"dark"`, and an unchanged empty prefs value.
    The first user keeps `size: 18`.
- [ ] **Step 2: Run it and confirm it fails.**
  `pnpm exec vitest run migration-theme-system`. Expected: FAIL (the
  migration file is missing).
- [ ] **Step 3: Write the migration.**
  - Iterate `app.findRecordsByFilter("users", "reader_prefs != ''", "", 0, 0)`.
  - Read the JSON. If the theme matches, `set` the merged object and
    `app.save`.
  - Comment the why: the old default was `light`, so most `light` values
    weren't a real choice.
- [ ] **Step 4: Run it and confirm it passes.**
  `pnpm exec vitest run migration-theme-system`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add pocketbase/pb_migrations/1720300000_theme_system.js packages/core/src/pb/migration-theme-system.test.ts
git commit -m "feat(pb): migrate sepia/light theme prefs to system"
```

---

### Task 9: Living docs reflect Marker

**Files:**
- Modify: `docs/superpowers/specs/2026-06-22-design-system.md`, rewritten.
  Keep its section headings (Concept, Color, Type, Shape/depth, Motion,
  Voice, Rules for components) and describe Marker per the spec, including
  the marker motif and the sentence-case voice.
- Modify: `CLAUDE.md` → "Design language". The source of truth becomes
  `tokens.css` plus the design-system doc; `assets/_banner.html` is no
  longer it. Replace the palette, font, and motif line with Marker
  (`ink #020203`, marker `#ffce00`, Ronzino, marker motif, sentence case).
  Update the dark-variant and theme lines to `data-theme` light/dark plus
  the `system` pref.

- [ ] **Step 1: Rewrite both sections.**
- [ ] **Step 2: Verify everything.**
  - Run `pnpm test && pnpm typecheck && pnpm lint`. Expected: all green;
    paste the summary lines into the PR.
  - Run `grep -rn "sepia\|Fredoka\|terracotta" CLAUDE.md docs/superpowers/specs/2026-06-22-design-system.md`.
    The only allowed hits are historical mentions (e.g. "replaces
    warm-paper").
- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-06-22-design-system.md
git commit -m "docs: design system and CLAUDE.md describe Marker"
```

---

## After this plan

- Tick the boxes as you go. When it's merged, comment on #10 with
  screenshots (light and dark, 360px and desktop). Do not close #10; plans
  2–5 remain.
- Next: write plan 2 (primitives consolidation and the `/dev/components`
  sheet, gate 2) against the code as it then stands.
