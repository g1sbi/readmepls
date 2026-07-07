# UI library refactor — candidate selection

Date: 2026-07-07

## Problem

The in-house component system (`apps/web/src/lib/components/ui/`, ~20 files:
`Button`, `Card`, `Chip`, `Tag`, `Input`, `Sheet`, `DropdownMenu`,
`ConfirmDialog`, `Skeleton`, `Spinner`, `PaperCorner`, `SourcePill`, `Rail`,
`MenuItem`, `CardGrid`) is too laborious to maintain.

The pain is specifically **hand-written CSS and visual consistency**, not
behavior. `bits-ui` is already a dependency and already supplies the
behavior/accessibility layer for the interactive primitives (`Sheet` wraps its
`Dialog`, `DropdownMenu` wraps its menu primitive). The cost is writing and
syncing scoped `<style>` blocks against `tokens.css` by hand across every
component, variant, and state.

This document is a candidate-selection design, not a migration plan. It picks
a direction so a follow-up effort analysis (component-by-component sizing) can
be done concretely against one target library.

## Candidates considered

| Candidate | Model | Fit |
|---|---|---|
| **shadcn-svelte** | Copy-in component source, built on `bits-ui`, themed via CSS custom properties | Strong — additive to what's already adopted |
| Skeleton | Pre-styled component set, Tailwind + CSS-variable (OKLCH) theming | Requires adopting Tailwind, which this repo has no footprint of; own markup/class conventions would compete with the existing token layering |
| Park UI | Copy-in component source, built on Ark UI/Zag.js, themed via CSS custom properties | Same copy-in philosophy as shadcn-svelte, but its behavior layer (Zag) would run alongside the already-adopted `bits-ui` rather than replacing/extending it — two headless behavior libraries for no clear gain |

## Recommendation: shadcn-svelte

- Not an npm runtime dependency — its CLI copies component source into the
  repo, so each component is owned and edited like any other file. This fits
  the existing "small, single-purpose files" convention.
- Built directly on `bits-ui`, which is already the behavior layer for `Sheet`
  and `DropdownMenu`. Expanding its footprint is reuse of an
  already-adopted dependency, not a new one.
- Theming is CSS custom properties — the same mechanism `tokens.css` already
  uses (primitives → semantic → theme layers). Migration is retheming
  generated var names to the existing semantic tokens, not inventing a new
  theming approach.

## Shape of the follow-up effort analysis (not done here)

The next pass should, per component in `ui/`:

- Map it to a shadcn-svelte equivalent, or mark it "no equivalent, stays
  hand-rolled" (e.g. `PaperCorner`, `SourcePill` are bespoke to this app's
  paper/dog-ear motif and have no generic counterpart).
- Note the retheme work: which generated CSS vars need remapping to
  `tokens.css` semantic tokens.
- Note existing Vitest coverage per component (e.g. `sheet.test.ts`,
  `DropdownMenu.test.ts`) that must keep passing or be ported.
- Flag any component where swapping risks the warm-paper/terracotta/Fredoka
  visual identity (`assets/_banner.html` is the source of truth) — those may
  be better left hand-rolled even if a shadcn-svelte equivalent exists.

## Out of scope here

- No code changes.
- No per-component effort estimate or migration order — that's the next
  planning document.
- No decision yet on incremental vs. big-bang migration strategy.
