# Track 2 · Slice 2 — Iconography

**Date:** 2026-06-29
**Status:** Approved design, pre-implementation
**Track:** UI rework Track 2 (Phase-3 design language / polish), slice 2 of 5.
**Source brief:** `docs/superpowers/specs/2026-06-29-ui-review-findings.md` — finding
`G3`; §F work item 8.

## 1. Summary

Introduce a tokenized line-icon system and apply icons across all chrome
(actions and navigation), pairing icons with the existing lowercase text labels on
primary actions and using icon-only controls (with `aria-label`) for dense or
repeated affordances. This is Phase-3 design-language work: it **adds visual
language but changes no behavior**. Every control keeps its current accessible
name, so existing component tests remain the regression contract.

Icons come from **`@lucide/svelte`** — a clean line set whose rounded geometry
pairs with Fredoka — imported per-icon so the bundle stays small. Size and stroke
are tokenized; color inherits `currentColor`; icons are always decorative
(`aria-hidden`), never the sole accessible name.

## 2. Goals / Non-Goals

### Goals
- Add `@lucide/svelte` as an `apps/web` dependency (per-icon, tree-shakeable).
- Add icon size/stroke tokens to `tokens.css` and global `.icon-sm/md/lg`
  utility classes to `app.css`.
- Apply icons across the chrome surfaces per the §6 map, following the
  icon+text vs icon-only policy in §4.
- Make the `Button` primitive lay out icon+text cleanly (inline-flex + gap).
- Preserve every control's accessible name; keep all tests green.

### Non-Goals
- No behavior, routing, or copy changes. No new features.
- No motion/hover animation on icons (slice 3), no status-color icon language for
  card states (slice 4), no segmented-control rework of theme buttons (slice 3/5).
- No icons on tag/collection chips (reads noisy — deliberately text-only).
- ConfirmDialog cancel/confirm stay text-only (dialogs read clearer worded).
- No icon on the ConfirmDialog (no close affordance is added).

## 3. Dependency

Add `@lucide/svelte@^1.22` (current `1.22.0`, peerDep `svelte: ^5`) to `apps/web`
`dependencies`. The brief's §G3 named `lucide-svelte`; that is the older package
predating the Svelte-5 rewrite — `@lucide/svelte` is the maintained Svelte-5
package with the same icon set. Flag it in review as a deliberate new dependency.
Icons are imported individually (e.g. `import { Search } from "@lucide/svelte"`)
so only used icons ship.

## 4. Icon system & policy

### Tokens (`tokens.css`)
```
--icon-sm: 1rem;     /* 16 — inline with sm/md text */
--icon-md: 1.25rem;  /* 20 — default action/control icon */
--icon-lg: 1.5rem;   /* 24 — emphasis */
--icon-stroke: 1.75; /* line weight, pairs with Fredoka */
```

### Utility classes (`app.css`, global)
`.icon-sm`, `.icon-md`, `.icon-lg` set `width`/`height` to the matching token and
`stroke-width: var(--icon-stroke)` (CSS `stroke-width` overrides lucide's
attribute). Color is left to `currentColor` (lucide's default `stroke`), so an icon
takes the text color of its button/link automatically. These are applied via the
lucide component's `class` prop. No per-icon size/stroke props in markup — the
class carries it, keeping the values tokenized and themeable.

### Application policy
- **Icon + text** on primary/labelled actions: the lowercase text is the
  accessible name; the icon sits before it and is decorative (`aria-hidden`).
- **Icon only** for dense or repeated controls (card delete, popover cancel,
  size steppers, rail rename/delete): the button carries an `aria-label`; the icon
  is `aria-hidden`.
- An icon is **never** the sole accessible name. No control's accessible name
  changes as a result of this slice.

### `Button` primitive
Add `display: inline-flex; align-items: center; gap: var(--space-2)` to
`ui/Button.svelte` so an icon child and a text child align with consistent
spacing. Text-only buttons are unaffected (gap has no visible effect with a single
child). No prop/API change.

## 5. Accessibility

- Icon-only buttons keep (or, where newly icon-only, gain) an `aria-label`. The
  A−/A+ steppers become icon-only and gain `aria-label="decrease text size"` /
  `"increase text size"`.
- All decorative icons are `aria-hidden` (the lucide `<svg>` carries it).
- `aria-pressed` / `data-active` state on the theme controls is preserved.
- Existing `aria-label`s already present (`delete article`, highlight `delete`,
  popover `cancel`, search `search library`, collection rename/delete) are kept.

## 6. Icon map

Lucide icon names (`@lucide/svelte`):

| Surface | Control | Icon | Treatment |
| --- | --- | --- | --- |
| TopBar | search input | `Search` | decorative, inside the field |
| TopBar | theme light / dark / sepia | `Sun` / `Moon` / `Coffee` | icon+text; text labels hidden via CSS at ≤640px (icon-only on mobile, `aria-pressed` kept) |
| TopBar | sign out | `LogOut` | icon+text |
| TopBar nav | extract / library | `Sparkles` / `Library` | icon+text |
| CaptureBar | save it | `BookmarkPlus` | icon+text |
| ArticleCard | read / retry / delete | `BookOpen` / `RotateCw` / `Trash2` | read, retry icon+text; delete icon-only |
| ReaderControls | A− / A+ | `AArrowDown` / `AArrowUp` | icon-only + `aria-label` |
| ReaderControls | serif↔sans toggle | `Type` | icon+text (shows target font) |
| ReaderControls | light / dark / sepia | `Sun` / `Moon` / `Coffee` | icon+text |
| Reader page | back / archive / delete | `ArrowLeft` / `Archive` / `Trash2` | back, archive icon+text; delete icon-only |
| Collections detail | back | `ArrowLeft` | icon+text |
| HighlightsSidebar | delete | `Trash2` | icon-only |
| HighlightPopover | cancel | `X` | icon-only |
| Library collections-rail | rename / delete | `Pencil` / `Trash2` | icon-only |
| Library collections-rail | save / cancel / create | `Check` / `X` / `Plus` | icon+text |

Theme icons are consistent across TopBar and ReaderControls (`Sun`/`Moon`/`Coffee`)
so the same affordance reads the same everywhere.

Not iconned (deliberate): tag/collection **chips** (text-only), ConfirmDialog
buttons (text-only).

## 7. Components / files touched

- `apps/web/package.json` — add `@lucide/svelte`.
- `apps/web/src/lib/styles/tokens.css` — icon tokens.
- `apps/web/src/app.css` — `.icon-sm/md/lg` utilities.
- `apps/web/src/lib/components/ui/Button.svelte` — inline-flex + gap.
- `apps/web/src/lib/components/TopBar.svelte` — search, theme, sign-out, nav icons;
  mobile label-hide CSS.
- `apps/web/src/lib/components/CaptureBar.svelte` — save-it icon.
- `apps/web/src/lib/components/ArticleCard.svelte` — read/retry/delete icons.
- `apps/web/src/lib/components/ReaderControls.svelte` — size/font/theme icons; new
  `aria-label`s on the steppers.
- `apps/web/src/routes/read/[id]/+page.svelte` — back/archive/delete icons.
- `apps/web/src/routes/collections/[slug]/+page.svelte` — back icon.
- `apps/web/src/lib/components/HighlightsSidebar.svelte` — delete icon.
- `apps/web/src/lib/components/HighlightPopover.svelte` — cancel icon.
- `apps/web/src/routes/library/+page.svelte` — collections-rail action icons.

## 8. Testing

- **Regression contract:** existing tests for `TopBar`, `ReaderControls`,
  `ArticleCard`, `ConfirmDialog`, `HighlightPopover`, and the library/reader/
  collections pages must stay green. Because accessible names are unchanged
  (icons decorative, text/`aria-label` preserved), `getByRole(..., { name })`
  queries continue to resolve.
- **New assertions (TDD where it carries logic):** the A−/A+ steppers' new
  `aria-label`s (`getByRole("button", { name: "decrease text size" })` etc.) —
  write the failing query first, then add the labels.
- **Restyling is visual** — no hollow assertions. Pure-visual aspects (icon
  alignment, size, mobile label-hide) are verified by running the app, not in
  jsdom.
- **Run-app verification:** icons render and inherit text color in light/dark/
  sepia; icon+text controls align; TopBar theme pill collapses to icon-only at
  ≤640px with `aria-pressed` intact; no layout regression vs the pre-icon chrome.

## 9. Build order

1. Dependency + tokens + `.icon-*` utilities + `Button` inline-flex (the
   foundation; nothing visual yet beyond Button's harmless flex).
2. TopBar (search, nav, theme, sign-out) + mobile label-hide.
3. ArticleCard + CaptureBar.
4. ReaderControls (incl. new stepper `aria-label`s, TDD) + reader page +
   collections back.
5. HighlightsSidebar, HighlightPopover, library collections-rail.

Each step lands as its own Conventional Commit (`feat:`/`refactor:`). Squash is not
required for `develop`; keep commits logical. Local commits only — no push/PR
unless asked.
