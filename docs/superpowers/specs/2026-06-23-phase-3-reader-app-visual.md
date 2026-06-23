# Phase 3 — Reader App Visual Design

**Date:** 2026-06-23
**Status:** Approved design, pre-implementation
**Phase:** 3 (frontend design language & visual polish), applied to the reader app
(`apps/web`). The design-system tokens and the marketing site (`apps/site`) already
landed in earlier Phase-3 slices; this spec covers the product UI itself.

## 1. Summary

Apply the warm-paper stationery design language to the reader app (`apps/web`). The
Phase-2 screens are structural only and — critically — currently render **broken**:
every CSS custom property the components reference is undefined (see §3). This phase
reconciles the components to the real token vocabulary, styles them to the design
language, builds the app shell, and restructures the single Phase-2 page into two
focused surfaces: an **extractor home** and a **library**.

No new product features. Tags/collections/search UI, highlights, and real connectors
remain Phase 4+.

## 2. Goals / Non-Goals

### Goals
- Every component references real semantic/reader tokens from
  `apps/web/src/lib/styles/tokens.css`. No undefined-var fallbacks remain.
- App shell: paper-gradient background + grain overlay, minimal top bar (brand,
  nav, theme toggle, sign-out), one staggered page-load reveal.
- Global theme (light/dark/sepia) on `<html>`, persisted, with a reader-screen
  override (the global+override model).
- Restructure `/` into **extractor home** + new **`/library`** route.
- Polished states everywhere: empty, loading/skeleton, processing, failed/partial.
- Motifs: dog-ear fold, warm shadows. Motion collapses under
  `prefers-reduced-motion`.

### Non-Goals
- No new features: tags/collections/search UI, highlights/notes, real connectors
  (all Phase 4+).
- No backend/worker/schema changes beyond the one user-prefs field already present
  (`reader_prefs`) — theme persistence reuses it; no new collections.
- No E2E/Playwright (roadmap places it later).
- Library grid is reading-only; no filtering/sorting UI yet.

## 3. Current state — the token mismatch

Phase 2 wrote components against an invented token vocabulary. The later
design-system commit defined a different one. They were never reconciled, so the
app renders with undefined custom properties falling back to inherited values.

Confirmed undefined references → the real token they must map to:

| Component reference (undefined) | Real token in `tokens.css` |
| --- | --- |
| `--paper-2` (Card bg) | `--color-surface` / `--color-surface-raised` |
| `--shadow-card` (Card) | `--shadow-md` (hover lift → `--shadow-lg`) |
| `--bg`, `--fg` (reader CSS) | `--reading-bg`, `--reading-text` |
| `--muted` (Tag) | `--color-text-muted` |
| `--fold` (Tag) | `--color-fold` |
| `--font-ui` (Tag) | `--font-display` |
| `--reader-font` etc. (css-vars.ts ↔ reader CSS) | see §5 — emit/read must agree |
| `--font-reader-serif` (css-vars.ts) | `--font-reading` (Newsreader) |
| `--font-reader-sans` (css-vars.ts) | `--reading-font-sans` (new token, see §5/§8) |

Additionally: `Button` and `Input` have **no `<style>` block** — raw native
elements.

Token reconciliation is a **prerequisite layer**: it lands before any polish,
because styling on top of broken references is wasted effort.

## 4. Information architecture

Two surfaces split from Phase 2's single page. Both read the `articles` collection;
the framing differs.

### `/` — extractor home
- **Centerpiece capture input.** Large, focal URL paste field + terracotta
  `save it` button. Busy → in-button spinner. Quota (HTTP 402) and error messages
  are warm, not alarmist. This is the hero of the page.
- **Active captures.** Render **every** article whose extraction state is not `ok`
  (i.e. `processing`, `partial`, `failed`) — nothing in-flight or needing attention
  is ever hidden, regardless of count. Failed/partial show a retry affordance.
- **Recent strip.** A few most-recent `ok` items for context (small fixed count,
  e.g. 6), linking into the reader.
- **Realtime.** Subscribe to `articles` so status transitions update live (the
  PB list rule `user = @request.auth.id` already scopes events per user).

### `/library` — reading collection (new route)
- **All articles**, reading-forward responsive card grid.
- Empty state and loading skeletons (see §7).
- Phase 4 will layer tags/collections/search here; this phase ships the grid only.

### Partition logic
A pure function `home-feed.ts` partitions a fetched article list into
`{ active, recent }` using `deriveCardState` (which already yields
`processing | partial | failed | ok`):
- `active` = all items with state ≠ `ok`.
- `recent` = the most-recent N items with state `ok` (N small, fixed).

## 5. Theming — global + reader override

- A theme store (`$lib/theme/`) resolves the active theme and applies it as
  `data-theme` on the document root (`<html>`).
- **Source of truth for instant paint:** localStorage, read before first paint to
  avoid FOUC. The app shell applies it on load.
- **Sync:** when authenticated, mirror the chosen theme to the user's
  `reader_prefs` so it follows the account across devices. On login, the stored
  pref hydrates the store.
- **Reader override:** the reader screen (`/read/[id]`) may apply a different theme
  to its `<article>` container (e.g. sepia just for reading) via the existing
  per-article reader prefs. The segmented theme control in the reader writes this
  override; it does not have to match the global chrome theme.
- **css-vars reconciliation:** `readerCssVars` currently emits `--reader-font`,
  `--reader-size`, `--reader-line-height`, `--reader-width`, but the reader CSS
  reads `--bg`/`--fg`/`--reader-font`. Reconcile so emitted names and consumed
  names agree, and so reading colors come from the theme's `--reading-bg` /
  `--reading-text` tokens. The serif/sans choice maps to real font tokens:
  serif → `--font-reading` (Newsreader); sans → `--reading-font-sans`, a new token
  added to `tokens.css` (§8). The design system mandates Newsreader as the only
  body face, so the sans option must be a genuine humanist reading sans (system
  sans stack is acceptable) — **never** Fredoka/`--font-display`.

Themes themselves (`[data-theme="dark"]`, `="sepia"`) are already defined in
`tokens.css`; this phase wires them up, it does not redefine palettes.

## 6. App shell (`+layout.svelte`)

Today the layout only imports CSS. It gains:

- **Background:** the banner paper radial gradient (`--color-bg-gradient`) plus a
  page-level grain overlay (`--texture-grain`, ~0.04 opacity, `multiply`).
- **Top bar (minimal):** brand mark (`readmepls`, terracotta "pls"), nav linking
  home ↔ library, theme toggle, sign-out. **No sidebar** — collections/search nav
  is Phase 4 and building it now would violate "the design phase does not add
  features."
- **Page-load reveal:** one staggered entrance (per the design-system motion
  rules), `--ease-paper`. All motion collapses to 0 under `prefers-reduced-motion`.
- Theme applied on `<html>` from the theme store before paint.

## 7. Screens

### Login (`/login`)
- Centered paper card on the gradient background, warm shadow, one dog-ear fold
  corner.
- Brand mark + lowercase tagline ("save any link. actually read it. pls.").
- Styled `Input` with a visible focus ring (`--color-ring`), accent submit
  `Button`.
- Inline error in `--color-danger`, warm tone.
- signin/signup toggle as a quiet text link, not a second heavy button.

### Extractor home (`/`)
- Centerpiece `CaptureBar` (see §4). Wide input + terracotta `save it`.
- Active-captures section: cards for every non-`ok` item; failed/partial show the
  warm failure reason (`--color-warning` / `--color-danger`) + accent Retry.
- Recent strip of `ok` items linking into the reader.
- Realtime list updates.

### Library (`/library`)
- Responsive card grid (`auto-fill`/`minmax`), gap, page-load stagger.
- `ArticleCard` `ok` state: title, tag chips, Read button, hover lift (shadow step
  up, `--ease-out`).
- Empty state: warm dog-ear card — "nothing saved yet. paste a link ☝".
- Loading state: skeleton cards while the first fetch resolves (currently blank).

### Reader (`/read/[id]`)
- Sticky controls bar (grouped, Fredoka, quiet until hover): A−/A+ size,
  serif/sans, theme segmented control, archive — not raw stacked buttons.
- Thin terracotta progress bar at the top, driven by the existing scroll→`progress`
  logic.
- Article column: Newsreader body via reader tokens, comfortable measure, styled
  `h1`, terracotta links, Plex Mono code, rounded images, styled blockquote.
- Reader theme override applied to `<article>` per §5.
- Back-to-library affordance.
- `{@html content.content_html}` stays — already sanitized in the worker. Article
  typography is added as scoped CSS; no behavior change.

## 8. Tokens

- Reconcile every component reference to the existing `tokens.css` vocabulary
  (table in §3). Components reference **semantic + reader tokens only** — never a
  primitive, hex, font name, px radius, or gray shadow.
- The vocabulary already covers everything except one gap: the **only** new token
  this phase adds is `--reading-font-sans` (a humanist reading sans for the
  serif/sans toggle; see §5). Shadows (`--shadow-sm…xl`), reading colors
  (`--reading-bg`/`--reading-text`), motion, grain, and fold tokens all already
  exist — use them, do not duplicate. Never add an alias inside a component.
- Themes are remapped in `tokens.css` only; components never change per theme.

## 9. Components

Style the existing primitives (`$lib/components/ui/`) to the design language:
- `Button` — default + accent variants, hover/active/disabled, focus ring. (No
  styles today.)
- `Input` — paper field, focus ring. (No styles today.)
- `Tag` — chip on `--color-fold` border, `--color-text-muted`, `--font-display`.
- `Card` — surface bg, warm shadow, generous radius; optional dog-ear modifier.
- `Spinner` — on-brand.
- `ReaderControls` — grouped control bar with a segmented theme control.

Feature components (`CaptureBar`, `ArticleCard`) compose the primitives; no
duplicated markup or CSS.

## 10. Testing (TDD)

- **New pure logic gets a failing test first:**
  - `home-feed.ts` — partition into `{active, recent}` from a list + `deriveCardState`.
  - theme resolve/apply — given stored value + auth pref, resolve the active theme;
    pure resolution unit-tested (DOM application kept thin).
- **Restyling is CSS** — existing behavior tests (primitives, `ArticleCard`,
  `ReaderControls`, `card-state`) stay green.
- **Update structural tests** affected by the route split — e.g. any test asserting
  the library list lives on `/` moves to `/library`.
- **Add component cases** for new states that carry logic (empty, skeleton) where
  meaningful.
- **No E2E** this phase.

## 11. File plan

Changed:
- `apps/web/src/routes/+layout.svelte` — app shell (bg, grain, top bar, theme,
  reveal).
- `apps/web/src/routes/+page.svelte` — extractor home (centerpiece capture, active
  captures, recent strip, realtime).
- `apps/web/src/routes/read/[id]/+page.svelte` — reader polish, progress, sticky
  controls; reconcile reader CSS to real tokens.
- `apps/web/src/routes/login/+page.svelte` — centered paper card.
- `apps/web/src/lib/reader/css-vars.ts` — reconcile emitted/consumed var names and
  font tokens.
- `apps/web/src/lib/components/ui/*` — style all primitives.
- `apps/web/src/lib/components/CaptureBar.svelte`, `ArticleCard.svelte`,
  `ReaderControls.svelte` — restyle, compose primitives.
- `apps/web/src/lib/styles/tokens.css` — add the one missing token
  (`--reading-font-sans`); wire existing themes.

New:
- `apps/web/src/routes/library/+page.svelte` — reading collection grid.
- `apps/web/src/lib/theme/` — theme store (resolve/apply/persist) + tests.
- `apps/web/src/lib/article/home-feed.ts` — partition logic + test.

## 12. Build order

1. **Token reconciliation** — map all refs to real tokens; fix `css-vars.ts`;
   add any missing semantics to `tokens.css`. App renders correctly (if plainly).
2. **Primitives** — style `ui/*`.
3. **App shell** — `+layout.svelte` bg/grain/top bar/theme/reveal; theme store.
4. **Route split** — `home-feed.ts` (TDD), extractor home, new `/library`.
5. **Reader polish** — controls bar, progress, article typography.
6. **Login polish**, empty/loading states, dog-ear motif, motion + reduced-motion.

Each step lands as its own Conventional Commit; squash before merging to `main`.
