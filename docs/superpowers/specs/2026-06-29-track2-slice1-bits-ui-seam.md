# Track 2 · Slice 1 — Behavioral Primitives Seam (Bits UI)

**Date:** 2026-06-29
**Status:** Approved design, pre-implementation
**Track:** UI rework Track 2 (Phase-3 design language / polish), slice 1 of 5.
**Source brief:** `docs/superpowers/specs/2026-06-29-ui-review-findings.md` — findings
`B`, `C6`, `C8`; §F work item 7.

## 1. Summary

Replace two fragile hand-rolled mechanisms — `ConfirmDialog`'s native-`<dialog>`
modal management and `HighlightPopover`'s naive `getBoundingClientRect`
positioning — with **[Bits UI](https://bits-ui.com)** headless primitives
(`Dialog`, `Popover`). Bits UI is headless and ships **zero CSS**, so the
warm-paper token system and the "retheme without touching components" rule in
`CLAUDE.md` are preserved.

This is the sanctioned **behavioral seam** of Track 2 — the one slice permitted to
change behavior. It is **not** a visual redesign: existing scoped CSS is reused
verbatim, no new tokens are added, and no decorative motifs/motion/icons are
introduced (those are slices 3–5). Both components keep their exact public props,
so all call-sites and existing tests are unchanged.

## 2. Goals / Non-Goals

### Goals
- Add `bits-ui` as an `apps/web` dependency (headless, zero-CSS).
- Migrate `ConfirmDialog` to `Dialog`, deleting the jsdom `showModal`/`close`
  try/catch workaround entirely and gaining focus-trap, scroll-lock,
  return-focus, and correct ARIA labelling.
- Migrate `HighlightPopover` to `Popover` with a virtual `customAnchor`, gaining
  viewport-edge collision/flip (fixes `C8`).
- Keep both components' public prop APIs byte-for-byte identical.
- Keep all existing tests green; add tests for the now-real Escape / outside-click
  cancel behavior.

### Non-Goals
- No visual redesign. No new colors, fonts, radii, shadows, motifs, motion, or
  icons. (Slices 3–5.)
- No toasts, reader-toolbar control menu, tag combobox, or collection picker —
  those are downstream Bits UI consumers, not this slice.
- No change to the reader's selection logic (`onMouseUp`, anchoring,
  `createHighlight`) or to either component's call-sites.
- No new tokens. The existing hardcoded overlay color (`rgb(0 0 0 / 0.4)`) stays
  as-is; tokenizing it is slice 4 (color/feedback) work — keep concerns unmixed.

## 3. Dependency

Add `bits-ui@^2.18` (current `2.18.1`, Svelte-5 native) to `apps/web`
`dependencies`. Flag it in code review as a deliberate new dependency (per the
brief's §B convention). It is headless: it imposes no visual language and adds no
CSS, so the bespoke token design and theme system are unaffected.

## 4. `ConfirmDialog.svelte` — wrap `Dialog`

### Public API (unchanged)
```ts
{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;   // default "delete"
  onConfirm: () => void;
  onCancel: () => void;
}
```

### Internals
- Compose `Dialog.Root` → `Dialog.Portal` → `Dialog.Overlay` + `Dialog.Content`,
  with `Dialog.Title` (title) and `Dialog.Description` (message) inside, and the
  cancel/confirm `Button`s in the actions row.
- **Controlled open:** `Dialog.Root open={open}` with
  `onOpenChange={(next) => { if (!next) onCancel(); }}`. This routes Escape and
  overlay-click — and any internal close — through the existing `onCancel`
  callback. The confirm `Button` calls `onConfirm` directly.
- **Delete** the `dialog` `$state`, the `$effect` driving `showModal`/`close`, the
  jsdom try/catch fallback (current lines 20–37), and the manual `onBackdrop`
  handler. Bits UI is div+portal based — none of that machinery is needed.
- ARIA labelling now comes from `Dialog.Title`/`Dialog.Description`
  (`aria-labelledby`/`aria-describedby`) instead of the manual `aria-label={title}`.

### Behavior gained
Focus trap, scroll-lock, return-focus to the trigger, and Escape/overlay-click
dismissal — all from Bits UI, all previously absent or hand-rolled.

### Styling
Reuse the current scoped CSS (surface bg, `--radius-xl`, `--shadow-lg`, panel
padding, Fredoka title, muted message, right-aligned actions) applied to the Bits
`Overlay`/`Content`/parts via `class`. No visual change intended; the dialog
should look identical to today.

### Call-sites (unchanged)
`ArticleCard.svelte` and `routes/read/[id]/+page.svelte` both pass exactly
`open/title/message/onConfirm/onCancel` — no edits required.

## 5. `HighlightPopover.svelte` — wrap `Popover` with a virtual anchor

### Public API (unchanged)
```ts
{
  x: number;
  y: number;
  onpick: (color: HighlightColor, note: string) => void;
  oncancel: () => void;
}
```

### Internals
- Render a **zero-size anchor element** absolutely positioned at `left:{x}px;
  top:{y}px`, and pass it to `Popover.Content` via `customAnchor`. Bits UI (via
  Floating UI) then positions the content relative to that point with automatic
  **flip/collision** handling near viewport edges — replacing the manual
  `position:absolute; left/top` that has no edge awareness (`C8`).
- `Popover.Root` is open while the component is mounted (the reader already gates
  rendering with `{#if popover}`). Use controlled open with
  `onOpenChange={(next) => { if (!next) oncancel(); }}` so Escape and outside-click
  dismiss via the existing `oncancel` callback.
- Move the swatches, the `note` input, and the cancel control inside
  `Popover.Content`. Because the note input lives inside `Content`, typing in it
  does not count as an outside interaction and won't dismiss the popover.
- Swatch buttons keep their `aria-label={color}` and call `onpick(color, note)`;
  the cancel control calls `oncancel`.

### Reader integration (unchanged)
`onMouseUp` still computes `{ x: rect.left + scrollX, y: rect.bottom + scrollY + 4,
range }` and the reader still renders `<HighlightPopover x y onpick oncancel />`
under `{#if popover}`. The virtual anchor consumes the same `x/y`, so no reader
edits are required.

### Styling
Reuse the current scoped CSS (surface, `--color-border`, `--radius-md`,
`--shadow-md`, swatch sizing, borderless note input). No visual change intended.

## 6. Testing (TDD)

- **Regression contract (must stay green):** `confirm-dialog.test.ts` and
  `HighlightPopover.test.ts`. Bits UI portals `Content` into `document.body`, which
  `@testing-library/svelte`'s `screen` queries, so the existing text/role/label
  assertions resolve against the portaled markup. The "does not render its panel
  when closed" assertion holds because `Dialog.Content` is not mounted when
  `open=false` (no `forceMount`).
- **New behavior tests (write failing first):**
  - ConfirmDialog: pressing Escape while open fires `onCancel`; clicking the
    overlay fires `onCancel`. (Previously hand-rolled / untested.)
  - HighlightPopover: pressing Escape (or outside-click) fires `oncancel`.
- **Run-the-app verification** (jsdom can't compute layout): dialog focus-trap +
  return-focus to the delete button; popover flips/stays on-screen when a selection
  is made near the bottom and right viewport edges. Light/dark/sepia themes hold
  (tokens-only, no palette change).

## 7. File plan

Changed:
- `apps/web/package.json` — add `bits-ui` dependency.
- `apps/web/src/lib/components/ui/ConfirmDialog.svelte` — wrap `Dialog`; delete
  native-dialog plumbing; keep props + scoped CSS.
- `apps/web/src/lib/components/HighlightPopover.svelte` — wrap `Popover` with
  virtual `customAnchor`; keep props + scoped CSS.
- `apps/web/src/lib/components/ui/confirm-dialog.test.ts` — add Escape /
  overlay-click cancel cases.
- `apps/web/src/lib/components/HighlightPopover.test.ts` — add Escape / outside
  cancel case.

Unchanged (verified): `ArticleCard.svelte`, `routes/read/[id]/+page.svelte`
(both call-sites + reader selection logic).

## 8. Build order

1. Add `bits-ui` dependency; confirm install + typecheck clean.
2. ConfirmDialog: write the Escape/overlay cancel tests (failing), then wrap
   `Dialog`, then make all dialog tests pass. Verify focus behavior in the app.
3. HighlightPopover: write the Escape/outside cancel test (failing), then wrap
   `Popover` with the virtual anchor, then make tests pass. Verify edge-flip in the
   app.
4. Full `apps/web` suite + `npm run check` green; theme walkthrough.

Each step lands as its own Conventional Commit (`feat:`/`refactor:`/`test:`).
Squash before merging to `main`. Local commits only — no push/PR unless asked.
