# Design Foundation, Plan 2 of 5: One Primitive per Concept Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every hand-rolled UI primitive that has a shadcn-svelte
equivalent with that equivalent, styled in Marker. Then put every primitive,
in every state, on a dev-only `/dev/components` sheet for the owner's
review (gate 2).

**Architecture:**

- **Look:** each primitive's Marker look lives in its shadcn `tv()` variant
  table, or in Tailwind classes on its generated component, and references
  tokens only.
- **Consumers:** they move to the shadcn primitive, after which the
  hand-rolled file is deleted.
- **Guard:** a test stops a deleted primitive from coming back.
- **Out of scope:** feature components keep their own `<style>` blocks in
  this plan. Plan 5 strips them.
- **The sheet:** `/dev/components` renders each primitive's states in
  light and dark side by side, at 360px and at desktop width. It 404s
  outside dev.

**Tech Stack:** SvelteKit 2 / Svelte 5, Tailwind v4 + shadcn-svelte
(`bits-ui`, `tailwind-variants`, `vaul-svelte`), tw-animate-css, Vitest
(jsdom), @testing-library/svelte.

**Spec:** `docs/superpowers/specs/2026-11-09-design-foundation-design.md`
(issue #10), the "Components" and "Review gates" sections. Plan 1
(`2026-11-09-design-foundation-1-tokens-motion-theme.md`) is done on the
same branch. Read `docs/superpowers/specs/2026-06-22-design-system.md` for
the Marker tokens, motion, and marker motif it produced.

## Global Constraints

- Tokens only: never a hardcoded color or font in a component. Tailwind
  color utilities must resolve to bridged tokens (`bg-primary`,
  `text-muted-foreground`, …). The arbitrary-value form
  `bg-[var(--color-…)]` is fine; `bg-[#…]` and palette utilities like
  `bg-slate-200` are not.
- shadcn-svelte for primitives. Add new ones with
  `pnpm dlx shadcn-svelte@latest add <name>` (run in `apps/web`). Never
  import `bits-ui` directly into a feature component.
- No preflight; never a bare `@import "tailwindcss"` (CLAUDE.md).
- Tap targets ≥ 44px at every size. Usable at 360px. No hover-only
  affordances: anything revealed on hover must also be visible, or reachable,
  under `@media (hover: none)`.
- Shapes: pill controls (`rounded-full`) for buttons, chips, and inputs;
  cards `rounded-lg` (16px); sheets `rounded-t-xl` (26px).
- One accent: marker yellow (`--color-marker`) is reserved for the `marker`
  button variant and the motif. Primary actions are ink (`bg-primary`).
- Motion uses Plan 1 tokens: `ease-out`, `ease-in`, and `ease-bounce`
  utilities; `--dur-*`; tw-animate-css `animate-in`/`animate-out` for every
  overlay. Respect reduced motion.
- Sentence case for any copy you add. Do not rewrite existing lowercase
  copy in consumers; plan 5 does that.
- Tests:
  - subset: `pnpm exec vitest run <pattern>`;
  - all: `pnpm test`;
  - also `pnpm typecheck` and `pnpm lint`.
  - svelte-check (`cd apps/web && pnpm exec svelte-check --tsconfig ./tsconfig.json --output machine | grep COMPLETED`)
    must not exceed **43** errors, the branch baseline.
- Conventional Commits. End each message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never use
  `!`.

## Review Focus

1. A 360px phone user tapping a small control (icon button, chip, menu
   item, the input's clear button) should always get a ≥ 44px hit area,
   even when the visual control is smaller. Task 2 (button sizes),
   Task 4 (chip), and Task 6 (menu item) each assert this in their tests.
2. A touch user with no hover must still find the article card's "⋯" menu
   and every dialog's close control. Task 6 and Task 7 assert visible
   triggers and close buttons.
3. Keyboard users must keep a visible focus ring on every primitive in both
   modes. Tasks 2–8 each assert a `focus-visible:` ring class on the
   interactive root.
4. Dark mode inside the sheet: a primitive rendered in a nested
   `[data-theme="dark"]` (or `"light"`) container must take that mode's
   tokens. Task 1 makes `[data-theme="light"]` a token scope; Task 10
   asserts both containers render.
5. Destructive confirms must not fire on an overlay click or Escape:
   cancel is the only non-confirm outcome. Task 7 asserts that.

---

### Task 1: Token scopes and bridge for Marker primitives

**Files:**

- Modify: `apps/web/src/lib/styles/tokens.css`,
  `apps/web/src/lib/styles/shadcn-bridge.css`
- Test: `apps/web/src/lib/styles/tokens.test.ts`,
  `apps/web/src/lib/components/ui/tailwind-bridge.test.ts`

**Interfaces:**

- Produces:
  - **Light as a nested scope:** the light semantic block applies to
    `:root, [data-theme="light"]`, so a nested light container inside a
    dark page gets light tokens. It carries `color-scheme: light`.
  - **Bridge aliases:** `--marker` → `var(--color-marker)`,
    `--marker-foreground` → `var(--color-text-on-marker)`, `--inverse` →
    `var(--color-inverse)`, `--inverse-foreground` →
    `var(--color-text-inverse)`, `--hairline` → `var(--color-hairline)`.
  - **Tailwind colors:** `@theme inline` exposes them as
    `--color-marker`, `--color-marker-foreground`, `--color-inverse`,
    `--color-inverse-foreground`, `--color-hairline`, so `bg-marker`,
    `text-inverse-foreground`, and `ring-hairline` generate.
  - **Breakpoints:** `@theme` pins `--breakpoint-sm: 40rem` (640px) and
    `--breakpoint-lg: 64rem` (1024px), the app's two existing breakpoints.
    Plan 5 moves the 7 duplicated `@media (max-width: 640px)` blocks onto
    them.
  - Pills use Tailwind's built-in `rounded-full`. Do not add a
    `--radius-full` alias.

- [ ] **Step 1: Write the failing tests.**
  - `tokens.test.ts` → `it("scopes light tokens to :root and [data-theme=light]")`:
    the light block's selector list contains both, and nested-light
    `color-scheme: light` is present.
  - `tailwind-bridge.test.ts` → `it("bridges Marker roles")`: each new
    alias maps to its token, e.g. `/--marker:\s*var\(--color-marker\)/`.
  - Same file → `it("pins the two app breakpoints")`.
- [ ] **Step 2: Run them and confirm they fail.**
      `pnpm exec vitest run tokens.test tailwind-bridge`. Expected: FAIL.
- [ ] **Step 3: Implement it** in `tokens.css` and `shadcn-bridge.css`.
- [ ] **Step 4: Run them and confirm they pass.** Same command; expected:
      PASS. `tokens.test`'s block parser must still find the light block.
      Update its selector match if needed.
- [ ] **Step 5: Commit**
      `feat(web): nestable light scope and Marker roles in the shadcn bridge`.

---

### Task 2: Button, in Marker, replaces `ui/Button.svelte`

**Files:**

- Modify: `apps/web/src/lib/components/ui/button/button.svelte`
  (`buttonVariants`)
- Modify consumers: `lib/components/CollectionsPanel.svelte`,
  `lib/components/ArticleCard.svelte`,
  `lib/components/LibraryCollections.svelte`,
  `routes/profile/+page.svelte`, `routes/login/+page.svelte`,
  `routes/verify/+page.svelte`
- Delete: `apps/web/src/lib/components/ui/Button.svelte` (and its test, if
  any)
- Test: `apps/web/src/lib/components/ui/button/button.test.ts` (new); the
  consumers' existing tests stay green

**Interfaces:**

- Produces `buttonVariants`, with:
  - variants:
    - `default` (ink: `bg-primary text-primary-foreground`, hover
      `bg-primary/85`);
    - `marker` (`bg-marker text-marker-foreground`; for the featured CTA
      only);
    - `secondary` (`bg-secondary text-secondary-foreground`, the sunken
      chip tone);
    - `outline` (transparent with `ring-1 ring-hairline`);
    - `ghost`;
    - `destructive` (`text-destructive`, with a tinted bg on hover);
    - `link`.
  - sizes:
    - `default` = `h-11 px-5 text-sm` (44px);
    - `sm` = `h-9 px-4 text-sm` plus a hit-area extension to 44px;
    - `lg` = `h-12 px-6 text-base`;
    - `icon` = `size-11`;
    - `icon-sm` = `size-9` plus the hit-area extension.

    Drop `xs` and `icon-xs`, which can't reach 44px.

  - **Hit-area extension:** `relative after:absolute after:-inset-1 after:content-['']`.
    That is 36px + 2×4px = 44px. Apply it on the sizes under 44px.
  - **Base:**
    - `rounded-full font-medium`;
    - `transition-[background-color,transform,box-shadow] duration-150 ease-out`;
    - `active:scale-[0.97] active:ease-bounce`;
    - `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`;
    - `disabled:opacity-50 disabled:pointer-events-none`;
    - `motion-reduce:transition-none motion-reduce:active:scale-100`.

- Migration map from the old hand-rolled API:
  - `variant="default"` → `variant="outline"`;
  - `variant="accent"` → `variant="default"`;
  - `type`, `disabled`, and `onclick` pass through unchanged.

- [ ] **Step 1: Write the failing test** `button.test.ts` (render with
      @testing-library/svelte):
  - `it("is a pill with a visible focus ring")`: the root's class contains
    `rounded-full` and `focus-visible:ring-2`.
  - `it("meets 44px at every size")`: for `default`, `lg`, and `icon`, the
    class contains `h-11`/`h-12`/`size-11`. For `sm` and `icon-sm`, the
    class contains `after:-inset-1`.
  - `it("offers no size below the 44px floor")`: the keys of
    `buttonVariants.variants.size` equal
    `["default","sm","lg","icon","icon-sm"]`.
  - `it("reserves marker yellow for the marker variant")`: only the
    `marker` variant's class string contains `bg-marker`.
  - `it("no consumer imports the hand-rolled Button")`: glob
    `apps/web/src/**/*.svelte`; none matches
    `/ui\/Button\.svelte|from "\.\/Button\.svelte"/`.
- [ ] **Step 2: Run it and confirm it fails.**
      `pnpm exec vitest run ui/button`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - Rewrite `buttonVariants`.
  - Migrate the 6 consumers using the migration map. Use
    `import { Button } from "$lib/components/ui/button"`.
  - Delete `ui/Button.svelte`.
  - Fix any consumer test that queried the old `data-variant`; query the
    role or name instead.
- [ ] **Step 4: Run the tests and confirm they pass.**
      `pnpm exec vitest run ui/button CollectionsPanel ArticleCard LibraryCollections profile login verify`,
      then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
      `refactor(web): one Button — Marker variants on shadcn, drop hand-rolled`.

---

### Task 3: Input and input-group, in Marker, replace `ui/Input.svelte`

**Files:**

- Modify: `apps/web/src/lib/components/ui/input/input.svelte`, the
  `ui/input-group/*.svelte` classes, `ui/textarea/textarea.svelte`
- Modify consumers: `lib/components/CollectionsPanel.svelte`,
  `lib/components/LibraryCollections.svelte`, `routes/login/+page.svelte`
- Delete: `apps/web/src/lib/components/ui/Input.svelte`
- Test: `apps/web/src/lib/components/ui/input/input.test.ts` (new)

**Interfaces:**

- Produces:
  - **Input:** `h-11 rounded-full px-4`, `bg-card ring-1 ring-hairline`,
    `placeholder:text-muted-foreground`,
    `focus-visible:ring-2 focus-visible:ring-ring`,
    `aria-invalid:ring-destructive`, `disabled:opacity-50`.
  - **InputGroup:** the same pill shell on the group, with the inner input
    borderless.
  - **Textarea:** `rounded-lg` (not a pill), with the same ring and focus
    treatment.
  - Old API → new: `value` (bindable), `placeholder`, `type`, `oninput`,
    and `aria-label` all pass through as attributes.

- [ ] **Step 1: Write the failing test** `input.test.ts`:
  - `it("is a 44px pill with a focus ring")`;
  - `it("binds value")`: type into it and assert the bound value updates,
    via a tiny harness.
  - `it("no consumer imports the hand-rolled Input")`: the same glob guard
    as in Task 2.
- [ ] **Step 2: Run it and confirm it fails.**
      `pnpm exec vitest run ui/input`. Expected: FAIL.
- [ ] **Step 3: Implement it.** Restyle the components, migrate the 3
      consumers, and delete `ui/Input.svelte`.
- [ ] **Step 4: Run the tests and confirm they pass.**
      `pnpm exec vitest run ui/input CollectionsPanel LibraryCollections login CaptureBar`,
      then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
      `refactor(web): one Input — Marker pill on shadcn, drop hand-rolled`.

---

### Task 4: Badge variants replace `Tag` and `Chip`

**Files:**

- Modify: `apps/web/src/lib/components/ui/badge/badge.svelte`
  (`badgeVariants`)
- Modify consumers: `lib/components/ArticleCard.svelte` (Tag),
  `lib/components/ActiveFilters.svelte`, `FilterDrawer.svelte`,
  `SourceFilter.svelte`, `TagEditor.svelte` (Chip)
- Delete: `apps/web/src/lib/components/ui/Tag.svelte`,
  `apps/web/src/lib/components/ui/Chip.svelte`
- Test: `apps/web/src/lib/components/ui/badge/badge.test.ts` (new)

**Interfaces:**

- Produces `badgeVariants`.
  - Variants:
    - `tag`: small, quiet metadata, `h-6 rounded-full px-2.5 text-xs bg-secondary text-secondary-foreground`;
    - `chip`: filter chip, `h-9 rounded-full px-3.5 text-sm bg-secondary text-foreground`, with
      `data-[selected=true]:bg-inverse data-[selected=true]:text-inverse-foreground`;
    - `outline`;
    - `marker`.
  - Badge accepts `selected?: boolean`, rendered as `data-selected`.
- Chip semantics: a Badge stays a display element. Where a consumer makes
  a chip interactive, the consumer wraps it in a `<button>` (as today), and
  that button carries the 44px hit area via the Task 2 extension class
  (`relative after:absolute after:-inset-1 after:content-['']`). The old
  `trailing` snippet becomes children content.

- [ ] **Step 1: Write the failing test** `badge.test.ts`:
  - `it("chip shows selection via data-selected")`;
  - `it("tag is quiet: secondary tone, xs text")`;
  - `it("no consumer imports Tag or Chip")`: the glob guard over
    `ui/Tag.svelte` and `ui/Chip.svelte`.
- [ ] **Step 2: Run it and confirm it fails.**
      `pnpm exec vitest run ui/badge`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - Add the variants.
  - Migrate the 5 consumers, wrapping interactive chips' buttons with the
    hit-area class.
  - Delete the two files.
- [ ] **Step 4: Run the tests and confirm they pass.**
      `pnpm exec vitest run ui/badge ArticleCard ActiveFilters FilterDrawer SourceFilter TagEditor`.
      Expected: PASS.
- [ ] **Step 5: Commit**
      `refactor(web): tags and chips are Badge variants`.

---

### Task 5: shadcn Skeleton and Spinner replace the hand-rolled ones

**Files:**

- Create via CLI: `ui/skeleton/`, `ui/spinner/`
- Modify consumers: `routes/read/[id]/+page.svelte` (Skeleton),
  `lib/components/ArticleCard.svelte` (Spinner)
- Delete: `ui/Skeleton.svelte`, `ui/Spinner.svelte`
- Test: `apps/web/src/lib/components/ui/feedback.test.ts` (new)

**Interfaces:**

- Produces:
  - **Skeleton:** `bg-secondary rounded-md animate-pulse motion-reduce:animate-none`.
    The old `lines` prop becomes the consumer rendering N skeletons.
  - **Spinner:** `role="status"`, an accessible name from its `label` prop
    (default `"Loading"`), and `motion-reduce:animate-none`.

- [ ] **Step 1: Write the failing test** `feedback.test.ts`:
  - `it("Skeleton stops pulsing under reduced motion")` (class contains
    `motion-reduce:animate-none`);
  - `it("Spinner announces its label")`
    (`getByRole("status", { name: "Processing" })`);
  - the glob guard for the two old files.
- [ ] **Step 2: Run it and confirm it fails.**
      `pnpm exec vitest run ui/feedback`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - Run `pnpm dlx shadcn-svelte@latest add skeleton spinner` in
    `apps/web`. If the registry has no spinner, hand-write
    `ui/spinner/spinner.svelte` in shadcn file style around the lucide
    `LoaderCircle`.
  - Restyle, migrate the consumers, and delete the old files.
- [ ] **Step 4: Run the tests and confirm they pass.**
      `pnpm exec vitest run ui/feedback ArticleCard read`. Expected: PASS.
- [ ] **Step 5: Commit**
      `refactor(web): shadcn Skeleton and Spinner`.

---

### Task 6: shadcn DropdownMenu replaces `DropdownMenu` and `MenuItem`

**Files:**

- Create via CLI: `ui/dropdown-menu/`
- Modify consumers: `lib/components/ArticleActions.svelte`,
  `lib/components/ArticleCard.svelte` (the card's `.card-menu` CSS that
  targets `.dropdown__trigger`)
- Delete: `ui/DropdownMenu.svelte`, `ui/MenuItem.svelte`,
  `ui/__fixtures__/DropdownMenuHarness.svelte` and the old tests that use
  them
- Test: `apps/web/src/lib/components/ui/dropdown-menu/dropdown-menu.test.ts`
  (new)

**Interfaces:**

- Produces, in Marker:
  - **Menu content:** `bg-popover rounded-lg ring-1 ring-hairline shadow-lg p-1`,
    entering with `animate-in fade-in-0 zoom-in-95 ease-out`.
  - **Items:** `min-h-11 rounded-md px-3`, focus-highlighted with
    `bg-accent`.
  - **Destructive items:** `variant="destructive"` → `text-destructive`.
  - **Separators and labels:** shadcn defaults, restyled.
- The old API maps to: `label` → the trigger's `aria-label`; `trigger`
  snippet → `DropdownMenu.Trigger` content; `MenuItem onSelect` →
  `DropdownMenu.Item onSelect`; `variant="danger"` → `"destructive"`.
- The ArticleCard "⋯" trigger:
  - It is a `Button` with `variant="ghost" size="icon-sm"`.
  - It keeps today's behavior: hidden until hover or focus on fine
    pointers, always visible under `@media (hover: none)`.
  - Retarget the card's CSS from `.dropdown__trigger` to a
    `data-slot="dropdown-menu-trigger"` selector.

- [ ] **Step 1: Write the failing test** `dropdown-menu.test.ts`:
  - `it("items are at least 44px tall")` (class contains `min-h-11`);
  - `it("destructive item is styled destructive")`;
  - `it("opens from the trigger and selects")`: click the trigger, click
    an item, and assert `onSelect` is called.

  In `ArticleCard.test.ts`, add
  `it("menu trigger is visible on touch")`: the component CSS contains a
  `@media (hover: none)` rule that sets the trigger's opacity to 1.
  The glob guard covers the deleted files.

- [ ] **Step 2: Run them and confirm they fail.**
      `pnpm exec vitest run dropdown-menu ArticleCard ArticleActions`.
      Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - Run `pnpm dlx shadcn-svelte@latest add dropdown-menu`.
  - Restyle it, migrate both consumers, retarget the CSS, and delete the
    old files and their tests.
- [ ] **Step 4: Run them and confirm they pass.** Same command; expected:
      PASS.
- [ ] **Step 5: Commit**
      `refactor(web): shadcn DropdownMenu, drop hand-rolled menu`.

---

### Task 7: shadcn AlertDialog replaces `ConfirmDialog`; Marker dialog and command shell

**Files:**

- Create via CLI: `ui/alert-dialog/`
- Modify: `ui/dialog/dialog-content.svelte`,
  `ui/dialog/dialog-overlay.svelte`, `ui/command/command-dialog.svelte`
  (Marker classes)
- Modify consumers: `lib/components/ArticleCard.svelte`,
  `routes/read/[id]/+page.svelte`
- Create: `apps/web/src/lib/components/ConfirmAction.svelte`. This is a
  thin feature component composing AlertDialog with the old props
  `open, title, message, confirmLabel = "Delete", onConfirm, onCancel`, so
  each consumer's change is a one-line import.
- Delete: `ui/ConfirmDialog.svelte` (and its test)
- Test: `apps/web/src/lib/components/ConfirmAction.test.ts` (new)

**Interfaces:**

- Produces:
  - **Overlay:** `bg-[color-mix(in_srgb,var(--color-inverse)_40%,transparent)]`
    (one rule for both modes), with `animate-in fade-in-0`.
  - **Content:** `bg-popover rounded-xl ring-1 ring-hairline shadow-xl p-6`.
    It enters with
    `animate-in fade-in-0 zoom-in-95 duration-[var(--dur-base)] ease-out`
    and exits with `animate-out fade-out-0 zoom-out-95 ease-in`. At 360px
    it is full-width minus a 16px gutter.
  - **Close button:** a visible close `Button` (`ghost`, `icon-sm`,
    `aria-label="Close"`) in plain dialogs.
  - **ConfirmAction:** confirm uses `Button variant="destructive"`, cancel
    uses `outline`. Overlay click or Escape → `onCancel`, never
    `onConfirm`.
- `ConfirmAction` is the one approved composition. Feature code imports it
  and never `bits-ui`.

- [ ] **Step 1: Write the failing test** `ConfirmAction.test.ts`:
  - `it("confirm calls onConfirm once")`;
  - `it("Escape cancels, never confirms")` (Review Focus 5);
  - `it("buttons are destructive + outline and at least 44px")`.

  In a new `ui/dialog/dialog.test.ts`:
  `it("plain dialogs show a visible Close button")` (Review Focus 2). The
  glob guard covers `ui/ConfirmDialog.svelte`.

- [ ] **Step 2: Run them and confirm they fail.**
      `pnpm exec vitest run ConfirmAction ui/dialog`. Expected: FAIL.
- [ ] **Step 3: Implement it.** Run
      `pnpm dlx shadcn-svelte@latest add alert-dialog`. Restyle the dialog,
      overlay, and command dialog. Create `ConfirmAction`, migrate the 2
      consumers, and delete the old file.
- [ ] **Step 4: Run the tests and confirm they pass.**
      `pnpm exec vitest run ConfirmAction ui/dialog ArticleCard read SearchPalette GetExtensionDialog`.
      Expected: PASS.
- [ ] **Step 5: Commit**
      `refactor(web): AlertDialog-based confirms; Marker dialog shell`.

---

### Task 8: shadcn Sheet replaces `ui/Sheet.svelte`; Marker drawer

**Files:**

- Create via CLI: `ui/sheet/`
- Modify: `ui/drawer/drawer-content.svelte`, `ui/BottomSheet.svelte` (it
  composes drawer and stays)
- Modify consumers: `lib/components/FilterDrawer.svelte`,
  `lib/components/TopBar.svelte`
- Delete: `ui/Sheet.svelte` (and its test)
- Test: `apps/web/src/lib/components/ui/sheet/sheet.test.ts`,
  `apps/web/src/lib/components/ui/BottomSheet.test.ts` (new or updated)

**Interfaces:**

- Produces:
  - **Sheet content:**
    - Side `right`/`left`: `bg-background ring-1 ring-hairline`, full
      height, `w-[min(22rem,90vw)]`.
    - Side `bottom`: `rounded-t-xl pb-[env(safe-area-inset-bottom)]`.
    - Enters with `animate-in slide-in-from-<side> ease-out duration-[var(--dur-slow)]`.
    - Has a visible Close `Button`.
  - **Drawer (BottomSheet):** `rounded-t-xl bg-background`, a visible grab
    handle (`h-1.5 w-10 rounded-full bg-secondary mx-auto`),
    `pb-[env(safe-area-inset-bottom)]`.
  - Old `Sheet` props `open, onClose, title, children` map to Sheet `open`
    plus `onOpenChange` (close → `onClose`), with `Sheet.Title` set to
    `title`.

- [ ] **Step 1: Write the failing tests**:
  - `it("sheet has a visible Close button and a title")`;
  - `it("bottom sheet respects the safe area")` (class contains
    `env(safe-area-inset-bottom)`);
  - `it("closing calls onClose")`;
  - the glob guard for `ui/Sheet.svelte`.
- [ ] **Step 2: Run them and confirm they fail.**
      `pnpm exec vitest run ui/sheet BottomSheet`. Expected: FAIL.
- [ ] **Step 3: Implement it.** Run
      `pnpm dlx shadcn-svelte@latest add sheet`. Restyle it, migrate
      FilterDrawer and TopBar (TopBar is rebuilt in plan 3; migrate
      minimally), and delete the old file.
- [ ] **Step 4: Run the tests and confirm they pass.**
      `pnpm exec vitest run ui/sheet BottomSheet FilterDrawer topbar`.
      Expected: PASS.
- [ ] **Step 5: Commit**
      `refactor(web): shadcn Sheet; Marker drawer with safe-area`.

---

### Task 9: shadcn Card replaces `ui/Card.svelte`; guard against regressions

**Files:**

- Create via CLI: `ui/card/`
- Modify consumer: `lib/components/ArticleCard.svelte`
- Delete: `ui/Card.svelte`
- Modify: `CLAUDE.md` → "Design language". Remove the grandfathered
  `Sheet.svelte`/`ConfirmDialog.svelte` sentence, since both are gone.
  Name `ConfirmAction` as the confirm composition.
- Test: `apps/web/src/lib/components/ui/card/card.test.ts`,
  `apps/web/src/lib/components/ui/no-hand-rolled.test.ts` (new)

**Interfaces:**

- Produces:
  - **Card:** `bg-card rounded-lg ring-1 ring-hairline p-4`.
  - **Interactive card hover:** `[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-md`
    with `transition-[transform,box-shadow] duration-[var(--dur-base)] ease-out motion-reduce:transform-none`.
  - **`no-hand-rolled.test.ts`:** one guard. `apps/web/src/lib/components/ui/`
    contains none of `Button, Input, Tag, Chip, Skeleton, Spinner,
DropdownMenu, MenuItem, ConfirmDialog, Sheet, Card` as a top-level
    `.svelte`, and no `.svelte` file outside `ui/` imports `bits-ui`. The
    per-task glob guards in Tasks 2–8 may be removed in favor of this one.

- [ ] **Step 1: Write the failing tests**:
  - `card.test.ts`: `it("lifts on hover only for fine pointers and not under reduced motion")`,
    asserting the class strings;
  - `no-hand-rolled.test.ts` as specified.
- [ ] **Step 2: Run them and confirm they fail.**
      `pnpm exec vitest run ui/card no-hand-rolled`. Expected: FAIL (Card
      still exists).
- [ ] **Step 3: Implement it.** Run
      `pnpm dlx shadcn-svelte@latest add card`. Restyle it, migrate
      ArticleCard, delete `ui/Card.svelte`, and update CLAUDE.md.
- [ ] **Step 4: Run the full verification.**
      `pnpm test && pnpm typecheck && pnpm lint`, plus svelte-check ≤ 43.
      Expected: all green.
- [ ] **Step 5: Commit**
      `refactor(web): shadcn Card; guard against hand-rolled primitives`.

---

### Task 10: `/dev/components` sheet (dev-only)

**Files:**

- Create: `apps/web/src/routes/dev/components/+page.ts`,
  `apps/web/src/routes/dev/components/+page.svelte`,
  `apps/web/src/routes/dev/components/sections/{Controls,Overlays,CardsLists}.svelte`,
  `apps/web/src/routes/dev/components/Frame.svelte`
- Create: `apps/web/src/__mocks__/app-environment.ts` and the alias in
  `apps/web/vitest.config.ts`
- Test: `apps/web/src/routes/dev/components/page.test.ts`

**Interfaces:**

- Produces:
  - **`+page.ts` `load`:** throws `error(404)` when
    `!dev` (`$app/environment`). Exports `prerender = false` and
    `ssr = false`.
  - **`Frame.svelte`:** props `mode: "light" | "dark"` and
    `width: "phone" | "desktop"`. It renders `<div data-theme={mode}>` with
    `bg-background text-foreground`, plus `max-w-[360px]` for phone.
  - **The page:**
    - It has three sections, with the headings "Controls", "Overlays", and
      "Cards & lists". Each renders in a grid of 4 frames (light/dark ×
      phone/desktop), stacked on narrow screens.
    - Controls: Button in every variant × size, plus disabled, a
      `focus-visible` demo (a static class), and loading (with Spinner).
      Also Input (empty, filled, invalid, disabled), Textarea, InputGroup,
      Badge (tag, chip, chip selected), Skeleton, and Spinner.
    - Overlays: a trigger for each of Dialog, ConfirmAction, Sheet (right
      and bottom), BottomSheet, DropdownMenu, and the command palette.
      Opened overlays use the page's theme, and the page has its own
      light/dark toggle at the top.
    - Cards & lists: Card (static and interactive), ArticleCard with
      sample data (ok, processing, failed, archived), CardGrid,
      SourcePill, CollectionFolder, and Collapsible.
    - It uses sentence-case labels and no real network: pass sample props.

- [ ] **Step 1: Write the failing test** `page.test.ts`:
  - `it("404s outside dev")`: mock `dev=false` and expect `load` to throw
    with status 404;
  - `it("renders the three sections in both modes")`: mock `dev=true`,
    render the page, then find the headings "Controls", "Overlays", and
    "Cards & lists". Assert that a `[data-theme="dark"]` and a
    `[data-theme="light"]` frame exist (Review Focus 4).
- [ ] **Step 2: Run it and confirm it fails.**
      `pnpm exec vitest run routes/dev`. Expected: FAIL.
- [ ] **Step 3: Implement it.** Build the route, frames, and sections, and
      add the `$app/environment` mock (`export const dev = true; export const browser = true;`)
      with a test-time override.
- [ ] **Step 4: Run it and confirm it passes.** Same command; expected:
      PASS. Then run `pnpm --filter @readmepls/web build` and confirm the
      build succeeds.
- [ ] **Step 5: Commit**
      `feat(web): dev-only component sheet at /dev/components`.

---

### Task 11: Gate 2 — owner review of the component sheet (controller-run, no subagent)

**Files:**

- Create: `docs/superpowers/mockups/2026-11-09-design-foundation/component-notes.md`.
  It holds a per-primitive state matrix (default, hover, focus-visible,
  pressed, disabled, loading, selected, empty, error, touch equivalent,
  light/dark) with ✓/n.a., plus a "vs Notion" line per primitive: what
  Notion does that we adopted or deliberately didn't.

- [ ] **Step 1: Check the sheet and capture it.**
  - Start the dev server.
  - Screenshot `/dev/components` at 360px and 1280px.
  - Open each overlay in light and dark.
- [ ] **Step 2: Write `component-notes.md`** from what the sheet shows.
- [ ] **Step 3: Get the owner's review.**
  - Share the screenshots and notes with the owner, and record the
    approval or the change list as a comment on #10.
  - Each requested change becomes a fix dispatch against the owning task,
    before plan 3.
- [ ] **Step 4: Commit** `docs: component sheet notes for gate 2`.
