# Mobile chrome redesign — TopBar, BottomNav, LibraryToolbar

**Date:** 2026-07-06
**Status:** Approved (design), pending implementation plan
**Phase context:** Phase 2 (reader shell) gap closure — structural/behavioral, no
new visual design. Enforces the newly-added CLAUDE.md "mobile-first, always
responsive" principle.

## Problem

On mobile (≤640px) the app chrome is buggy and cluttered:

- **Wrap chaos.** `TopBar` uses `flex-wrap: wrap`; at 360px the brand, nav links
  (library/profile), a full-width search box, a 3-button theme switcher, and sign
  out collapse into 2–3 ragged rows.
- **Duplicate search.** `TopBar` has a global search box that redirects to
  `/library?q=` (via the `/search` 308 redirect), and `LibraryToolbar` has its own
  search that drives the same library query. On the library page both stack on
  mobile — two search boxes, same destination.
- **Sub-44px tap targets.** Theme buttons (~24px tall), nav links, and sign out are
  all below the 44px minimum required for touch.
- **No thumb-zone navigation.** All navigation sits at the top, out of thumb reach
  on phones.

## Goals

- Clean, single-row `TopBar` on mobile with 44px+ targets.
- Thumb-friendly primary navigation.
- Eliminate the duplicate search.
- Maximize reading space: navigation gets out of the way while scrolling into
  content, returns on scroll-up intent.
- Desktop (>640px) layout unchanged — this is additive/enhancing, mobile-first.

## Non-goals (YAGNI)

- No new visual design language — tokens only (Phase 3 owns visuals).
- No breakpoint-token infrastructure. CSS media queries cannot consume `var()`
  without a PostCSS `@custom-media` setup that this repo does not have. Reuse the
  existing **640px** convention (already used in the codebase).
- No changes to the desktop chrome beyond what is required to hide the new
  mobile-only elements.

## Breakpoint

`≤640px` = mobile. Existing repo convention (already used in `TopBar` and one other
component). All new mobile rules and the desktop-hide of `BottomNav` key off this.

## Design

### 1. BottomNav — new component (mobile-only)

`apps/web/src/lib/components/BottomNav.svelte`. Fixed bottom tab bar, thumb zone.

- **3 tabs:** Library (`/library`), Search, Profile (`/profile`). Icon + label,
  each ≥44px tall.
- **Search tab** navigates to `/library?focus=search`. `LibraryToolbar` reads the
  `focus=search` param and autofocuses its search input. This gives search access
  from any page (reader, profile) where no search box exists.
- **Active state:** derived from `$page.url.pathname`; the matching tab gets
  `aria-current="page"` plus accent styling. Fully reactive to navigation.
- **Visibility:** hidden `>640px` via CSS. Bottom padding uses
  `env(safe-area-inset-bottom)` for the iOS home indicator.

#### Auto-hide on scroll direction

- Hide (slide down, `transform: translateY(100%)`) when the user scrolls **down**;
  reveal when scrolling **up**. Always visible near the top of the page.
- **Pure logic, thin shell** (repo convention): a pure helper
  `nextNavVisible(prevY, curY, wasVisible, threshold)` returns the next visibility
  boolean. The component wires a `requestAnimationFrame`-throttled `scroll` listener
  to it. A ~8px threshold ignores jitter.
- **State:** visibility is `$state`; it drives the transform.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, snap (no slide
  transition) — still hides/shows, just without animation.

### 2. TopBar — modify

`apps/web/src/lib/components/TopBar.svelte`.

- **Mobile:** brand (left) + a single menu button (right, ≥44px). The inline search
  is removed on mobile (redundant with the bottom Search tab and `LibraryToolbar`).
  Nav links are removed on mobile (they live in `BottomNav`).
- **Menu button** opens the existing `Sheet` (`$lib/components/ui/Sheet.svelte`,
  already used by the filter drawer) containing full-size rows: the theme switcher
  (3 options, each ≥44px) and sign out. Reuses `Sheet` — no new overflow primitive.
- **Desktop (>640px):** unchanged — brand + nav + inline search + theme group +
  sign out, all inline as today.

### 3. LibraryToolbar — modify

`apps/web/src/lib/components/LibraryToolbar.svelte`.

- **Mobile:** search full-width (row 1); filters + sort + count (row 2). All
  controls ≥44px min-height.
- Reads `?focus=search` from the URL and autofocuses the search input (wired to the
  BottomNav Search tab).
- **Desktop:** unchanged.

### 4. Layout — modify

`apps/web/src/routes/+layout.svelte`.

- Mount `<BottomNav>` alongside `TopBar` whenever `chrome` is true (i.e. not on
  `/login`).
- Add `padding-bottom` to `.page` on mobile equal to the bottom-bar height plus
  `env(safe-area-inset-bottom)`, so fixed-bar content never covers page content.

## Data flow

- **Active tab:** `$page.url.pathname` → BottomNav derived active state (reactive).
- **Search focus:** BottomNav Search tab → URL `?focus=search` → LibraryToolbar
  effect autofocuses input. One-directional, URL-driven (consistent with the
  existing URL-driven faceted library).
- **Scroll visibility:** `scroll` event → rAF throttle → `nextNavVisible(...)` →
  `$state` boolean → `transform`.
- **Theme / sign out:** unchanged handlers (`onTheme`, `onSignOut`), now invoked
  from Sheet rows on mobile.

## Testing (TDD — test first)

- `bottom-nav-scroll.test.ts` (new): unit-test the pure `nextNavVisible` —
  down→hide, up→show, near-top→always show, sub-threshold jitter→unchanged.
- `bottomnav.test.ts` (new): renders 3 tab links with correct hrefs; marks the
  active tab via `aria-current="page"` from a given pathname; Search tab href
  targets `/library?focus=search`.
- `topbar.test.ts` (extend): keep the 2 existing link tests green; add a mobile
  menu button that opens the Sheet exposing theme controls + sign out.
- `library-toolbar.test.ts` (extend): `?focus=search` focuses the search input.

All existing web tests (42 files, 144 tests) must stay green.

## Rollout / risk

- Purely additive on desktop; low risk there.
- Fixed bottom bar + safe-area padding must be verified on a real small viewport
  (Playwright or manual devtools) before claiming done.
- Scroll listener must be rAF-throttled and removed on component destroy to avoid
  leaks.
