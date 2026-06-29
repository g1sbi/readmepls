# Track 2 · Slice 1 — Bits UI Behavioral Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled native-`<dialog>` modal in `ConfirmDialog` and the naive `getBoundingClientRect` positioning in `HighlightPopover` with Bits UI headless `Dialog`/`Popover` primitives, keeping both public APIs and all visuals identical.

**Architecture:** Add the headless, zero-CSS `bits-ui` library. Each component becomes a thin wrapper: same `$props()` signature in, Bits UI primitive inside, existing scoped CSS reused verbatim on the Bits parts. `ConfirmDialog` uses a controlled `Dialog` (open driven by the parent, `onOpenChange`→`onCancel`). `HighlightPopover` uses a `Popover` whose `Popover.Content` anchors to a zero-size `customAnchor` div placed at the selection `x/y`, so Floating UI handles edge flip/collision. No call-site or reader-logic changes.

**Tech Stack:** SvelteKit (Svelte 5 runes), `bits-ui@^2.18`, Vitest + `@testing-library/svelte` (jsdom), scoped component `<style>`, CSS custom properties in `apps/web/src/lib/styles/tokens.css`.

**Source spec:** `docs/superpowers/specs/2026-06-29-track2-slice1-bits-ui-seam.md` (findings `B`, `C6`, `C8`; §F item 7).

## Global Constraints

- **Headless only — no visual redesign.** Reuse the existing scoped CSS as-is. Add **no** new tokens, colors, fonts, radii, shadows, motifs, motion, or icons (those are Track 2 slices 3–5). The existing hardcoded overlay color `rgb(0 0 0 / 0.4)` stays unchanged this slice. (Spec §2, §5.3)
- **Public prop APIs are frozen.** `ConfirmDialog`: `{ open, title, message, confirmLabel?="delete", onConfirm, onCancel }`. `HighlightPopover`: `{ x, y, onpick, oncancel }`. Call-sites (`ArticleCard.svelte`, `routes/read/[id]/+page.svelte`) and the reader selection logic must not change. (Spec §4, §5)
- **Tokens only — never hardcode a color or font name** beyond what already exists in the reused CSS. (`CLAUDE.md` › Design language)
- **TypeScript strict.** No `any` without a written reason. (`CLAUDE.md`)
- **TDD.** Behavior changes get a failing test first. Pure layout (focus-trap, flip near viewport edge, overlay-click) can't be asserted in jsdom — verify by running the app. Never write a hollow assertion. (Spec §6)
- **Conventional Commits, one logical change per commit.** `feat:`/`refactor:`/`test:`. Local commits only — never push or open a PR. (`CLAUDE.md`)
- **Test commands run from `apps/web/`:** `npm run test -- <path>` (Vitest single run). Typecheck: `npm run check`. Dev server: `http://localhost:3000`, sign in with the project test account, light theme unless noted.

---

## File map

| File | Responsibility | Tasks |
| --- | --- | --- |
| `apps/web/package.json` | Add `bits-ui` dependency | 1 |
| `apps/web/src/lib/components/ui/ConfirmDialog.svelte` | Wrap Bits UI `Dialog`; drop native-dialog plumbing | 2 |
| `apps/web/src/lib/components/ui/confirm-dialog.test.ts` | Add Escape-cancel case; keep existing cases green | 2 |
| `apps/web/src/lib/components/HighlightPopover.svelte` | Wrap Bits UI `Popover` with virtual `customAnchor` | 3 |
| `apps/web/src/lib/components/HighlightPopover.test.ts` | Add Escape-cancel case; keep existing case green | 3 |

Unchanged (verified, do not edit): `ArticleCard.svelte`, `routes/read/[id]/+page.svelte`.

---

## Task 1: Add the `bits-ui` dependency

**Files:**
- Modify: `apps/web/package.json` (`dependencies`)

**Interfaces:**
- Produces: `bits-ui` importable as `import { Dialog, Popover } from "bits-ui"` in Tasks 2–3.

- [ ] **Step 1: Install the dependency**

Run from `apps/web/`:

```bash
npm install bits-ui@^2.18
```

Expected: `apps/web/package.json` `dependencies` gains `"bits-ui": "^2.18.x"`; lockfile updates; install exits 0.

- [ ] **Step 2: Verify it resolves and types load**

Run from `apps/web/`:

```bash
npm run check
```

Expected: no new errors (the dep is installed; nothing imports it yet, so the count is unchanged from baseline).

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json package-lock.json
git commit -m "chore(web): add bits-ui headless primitive library"
```

> Note: the lockfile path may be repo-root `package-lock.json` or `apps/web/package-lock.json` depending on the workspace setup — `git add` whichever the install touched (`git status` shows it).

---

## Task 2: Migrate `ConfirmDialog` to Bits UI `Dialog`

Wrap `Dialog` with controlled open. Delete the `$state` dialog ref, the `$effect` driving `showModal`/`close`, the jsdom try/catch fallback, and the manual `onBackdrop` handler. Escape and overlay-click now route through `onOpenChange`→`onCancel`.

**Files:**
- Modify: `apps/web/src/lib/components/ui/ConfirmDialog.svelte` (full rewrite of script + markup; reuse the `<style>` block)
- Test: `apps/web/src/lib/components/ui/confirm-dialog.test.ts`

**Interfaces:**
- Consumes: `bits-ui` `Dialog` (Task 1); local `Button.svelte`.
- Produces: `ConfirmDialog` with unchanged public props `{ open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }`.

- [ ] **Step 1: Add the failing Escape-cancel test**

Append a new case to `apps/web/src/lib/components/ui/confirm-dialog.test.ts` (keep all existing cases — they are the regression contract). `render`, `fireEvent`, `vi`, and `base` are already in scope at the top of the file — add only the `it(...)` block:

```ts
it("fires onCancel when Escape is pressed", async () => {
  const onCancel = vi.fn();
  render(ConfirmDialog, { ...base, open: true, onCancel });
  await fireEvent.keyDown(document.body, { key: "Escape" });
  expect(onCancel).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web/`:

```bash
npm run test -- src/lib/components/ui/confirm-dialog.test.ts
```

Expected: the new "fires onCancel when Escape is pressed" case FAILS (current native `<dialog>` `oncancel` doesn't fire on a jsdom `keyDown`); the five existing cases still PASS.

- [ ] **Step 3: Rewrite the component over Bits UI `Dialog`**

Replace the entire `apps/web/src/lib/components/ui/ConfirmDialog.svelte` with:

```svelte
<script lang="ts">
  import { Dialog } from "bits-ui";
  import Button from "./Button.svelte";

  let {
    open,
    title,
    message,
    confirmLabel = "delete",
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();

  // Controlled: the parent owns `open`. Any Bits-initiated close (Escape,
  // overlay click) requests `open=false` via onOpenChange — route it to onCancel
  // so the parent flips its state, exactly as the old hand-rolled handlers did.
  function onOpenChange(next: boolean) {
    if (!next) onCancel();
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay class="overlay" />
    <Dialog.Content class="panel">
      <Dialog.Title class="title">{title}</Dialog.Title>
      <Dialog.Description class="message">{message}</Dialog.Description>
      <div class="actions">
        <Button onclick={onCancel}>cancel</Button>
        <Button variant="accent" onclick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* Bits UI applies these classes to its portaled parts; styling is unchanged
     from the previous native-<dialog> version. */
  :global(.overlay) {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.4);
    z-index: var(--z-modal, 100);
  }
  :global(.panel) {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    max-width: 22rem;
    padding: 1.5rem;
    border: none;
    border-radius: var(--radius-xl);
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: var(--shadow-lg, var(--shadow-sm));
    z-index: var(--z-modal, 100);
  }
  :global(.title) {
    font-family: var(--font-display);
    font-size: var(--text-lg, 1.1rem);
    margin: 0 0 0.5rem;
  }
  :global(.message) {
    color: var(--color-text-muted);
    margin: 0 0 1.25rem;
  }
  :global(.actions) {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
```

> Why `:global`: Bits UI renders `Overlay`/`Content` into a body portal, outside this component's scoped-style subtree, so Svelte's scoping hashes would not reach them. The class names are specific (`.overlay`, `.panel`, `.title`, `.message`, `.actions`) to avoid collisions. The values are copied verbatim from the previous `<style>` block — no visual change. `--z-modal` falls back to `100` if the token is absent; confirm the token name against `tokens.css` and use the existing one if it differs.

- [ ] **Step 4: Run the full ConfirmDialog suite**

Run from `apps/web/`:

```bash
npm run test -- src/lib/components/ui/confirm-dialog.test.ts
```

Expected: all six cases PASS (five originals + Escape-cancel). The "does not render its panel when closed" case passes because `Dialog.Content` is not mounted while `open=false`.

- [ ] **Step 5: Typecheck**

Run from `apps/web/`:

```bash
npm run check
```

Expected: no new errors.

- [ ] **Step 6: Verify call-site suites still pass**

Run from `apps/web/`:

```bash
npm run test -- src/lib/components/ArticleCard.test.ts "src/routes/read/[id]/page.test.ts" src/routes/library/page.test.ts
```

Expected: all PASS — the call-sites pass the same props, so nothing downstream changed.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/components/ui/ConfirmDialog.svelte apps/web/src/lib/components/ui/confirm-dialog.test.ts
git commit -m "refactor(web): back ConfirmDialog with Bits UI Dialog"
```

---

## Task 3: Migrate `HighlightPopover` to Bits UI `Popover` with a virtual anchor

Wrap `Popover`. A zero-size div positioned at `x/y` is the `customAnchor`; Floating UI positions `Popover.Content` relative to it with flip/collision. Open-on-mount (the reader gates rendering with `{#if popover}`); Escape/outside-click route through `onOpenChange`→`oncancel`.

**Files:**
- Modify: `apps/web/src/lib/components/HighlightPopover.svelte` (full rewrite; reuse the styled values)
- Test: `apps/web/src/lib/components/HighlightPopover.test.ts`

**Interfaces:**
- Consumes: `bits-ui` `Popover` (Task 1); `HighlightColor` from `@readmepls/types`.
- Produces: `HighlightPopover` with unchanged public props `{ x: number; y: number; onpick: (color: HighlightColor, note: string) => void; oncancel: () => void }`.

- [ ] **Step 1: Add the failing Escape-cancel test**

Append a new case to `apps/web/src/lib/components/HighlightPopover.test.ts` (keep the existing "emits the chosen color and note" case). `render`, `fireEvent`, and `vi` are already imported at the top of the file — add only the `it(...)` block:

```ts
it("fires oncancel when Escape is pressed", async () => {
  const oncancel = vi.fn();
  render(HighlightPopover, { x: 10, y: 10, onpick: vi.fn(), oncancel });
  await fireEvent.keyDown(document.body, { key: "Escape" });
  expect(oncancel).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web/`:

```bash
npm run test -- src/lib/components/HighlightPopover.test.ts
```

Expected: the new "fires oncancel when Escape is pressed" case FAILS (the current plain `<div>` has no Escape handling); the existing color/note case still PASSES.

- [ ] **Step 3: Rewrite the component over Bits UI `Popover`**

Replace the entire `apps/web/src/lib/components/HighlightPopover.svelte` with:

```svelte
<script lang="ts">
  import { Popover } from "bits-ui";
  import type { HighlightColor } from "@readmepls/types";

  let { x, y, onpick, oncancel }: {
    x: number; y: number;
    onpick: (color: HighlightColor, note: string) => void;
    oncancel: () => void;
  } = $props();

  const colors: HighlightColor[] = ["terracotta", "amber", "sage"];
  let note = $state("");

  // Zero-size element placed at the selection rect; Popover.Content anchors to it
  // and Floating UI handles viewport-edge flip/collision (replaces manual left/top).
  let anchor = $state<HTMLElement>(null!);

  // Open while mounted (the reader gates this component with {#if popover}).
  // A Bits-initiated close (Escape / outside-click) requests open=false — route
  // it to oncancel so the reader clears its `popover` state and unmounts us.
  function onOpenChange(next: boolean) {
    if (!next) oncancel();
  }
</script>

<div bind:this={anchor} class="anchor" style="left:{x}px; top:{y}px;"></div>

<Popover.Root open onOpenChange={onOpenChange}>
  <Popover.Content {anchor} class="popover" role="dialog" aria-label="add highlight" sideOffset={4}>
    <div class="swatches">
      {#each colors as c}
        <button
          class="swatch"
          style="background: var(--hl-{c});"
          aria-label={c}
          onclick={() => onpick(c, note)}
        ></button>
      {/each}
    </div>
    <input class="note" placeholder="note…" bind:value={note} aria-label="note" />
    <button class="cancel" onclick={oncancel} aria-label="cancel">×</button>
  </Popover.Content>
</Popover.Root>

<style>
  /* Anchor is invisible; only its position matters. */
  .anchor {
    position: absolute;
    width: 0;
    height: 0;
  }
  /* Bits UI portals Popover.Content to the body, so styles are :global with a
     specific class. Values copied from the previous version — no visual change. */
  :global(.popover) {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    z-index: var(--z-sticky);
  }
  :global(.popover) .swatches { display: flex; gap: var(--space-1); }
  :global(.popover) .swatch {
    width: 1.25rem; height: 1.25rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  :global(.popover) .note {
    border: none;
    border-bottom: 1px solid var(--color-border);
    background: transparent;
    font: inherit;
    color: var(--color-text);
  }
  :global(.popover) .cancel {
    background: none; border: none; cursor: pointer; color: var(--color-text-muted);
  }
</style>
```

> `customAnchor` is exposed on `Popover.Content` as the `anchor`-style prop in bits-ui v2 — pass the bound `anchor` element. If the installed version names it `customAnchor`, use `customAnchor={anchor}` instead; confirm against the version's types (`npm run check` will flag a wrong prop name). No `Popover.Trigger` is needed — the popover is opened programmatically via controlled `open`. The note `<input>` lives inside `Popover.Content`, so typing in it is not an outside interaction and won't dismiss the popover.

- [ ] **Step 4: Run the full HighlightPopover suite**

Run from `apps/web/`:

```bash
npm run test -- src/lib/components/HighlightPopover.test.ts
```

Expected: both cases PASS — the color/note emit (portaled `Content` is queryable via `screen`) and the new Escape-cancel.

- [ ] **Step 5: Typecheck**

Run from `apps/web/`:

```bash
npm run check
```

Expected: no new errors (in particular, the `anchor`/`customAnchor` prop name resolves against the installed bits-ui types).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/HighlightPopover.svelte apps/web/src/lib/components/HighlightPopover.test.ts
git commit -m "refactor(web): back HighlightPopover with Bits UI Popover"
```

---

## Final verification

- [ ] **Run the full web test suite**

Run from `apps/web/`: `npm run test`
Expected: all suites PASS — no regressions from the two wrappers.

- [ ] **Typecheck the package**

Run from `apps/web/`: `npm run check`
Expected: no errors.

- [ ] **Walkthrough in the running app** (jsdom can't compute layout — these are the behaviors only a browser exercises)

Sign in (light theme), then:
- **Dialog:** on the library or reader, click delete → the confirm dialog opens centered with the overlay. Tab cycles only within the dialog (focus trap); Escape closes it and focus returns to the delete button; clicking the overlay closes it; the dialog looks identical to before. (`C6`)
- **Popover:** in the reader, select text near the **bottom** and **right** edges of the viewport → the highlight popover flips/repositions to stay fully on-screen (previously it clipped). Pick a color → highlight is created and the popover dismisses; press Escape with the popover open → it dismisses without creating. Typing in the note field does not dismiss it. (`C8`)
- **Themes:** repeat one dialog open and one popover in dark and sepia — both inherit theme tokens unchanged (tokens-only, no palette edits).

---

## Out of scope (later Track 2 slices)

Toasts (slice 4, also Bits-powered), reader-toolbar control menu / `D1b` (slice 5), tag combobox + collection picker (Phase 4), tokenizing the overlay color (slice 4). This slice only adds the seam and migrates the two fragile components.
