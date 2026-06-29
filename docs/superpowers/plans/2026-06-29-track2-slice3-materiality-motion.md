# UI Rework — Track 2 · Slice 3 (Materiality & Motion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the existing paper/ink design tokens as tactile surfaces (grain, layered shadows, dog-ear motif) and Balanced, reduced-motion-safe motion (hover/press, staggered reveals, shimmer skeletons, cross-route view transitions) — changing no behavior and preserving every accessible name.

**Architecture:** Tokens already exist (`--texture-grain`, `--shadow-*`, `--color-fold`, `--ease-*`, `--dur-*`). The app shell already paints grain and the `.page` already has an entrance animation. This slice tokenizes the remaining hardcoded values, extends grain to card/popover surfaces, adds two primitives (`PaperCorner`, `Skeleton`), one ported action (`reveal`), and a feature-detected View Transitions hook. Logic (the action, the skeleton, the view-transition guard) is TDD'd; pure-visual CSS is run-app verified.

**Tech Stack:** SvelteKit (Svelte 5 runes), Vitest + `@testing-library/svelte` (jsdom), scoped component `<style>`, CSS custom properties in `apps/web/src/lib/styles/tokens.css`, global `apps/web/src/app.css`, the View Transitions API via `$app/navigation`'s `onNavigate`.

**Source spec:** `docs/superpowers/specs/2026-06-29-track2-slice3-materiality-motion.md`.

## Global Constraints

- **Tokens only — never hardcode a color, font, shadow, duration, or opacity in a component.** New visual constants become new tokens in `tokens.css`. (`CLAUDE.md` › Design language; spec §3)
- **No behavior, routing, or copy changes. No new features.** Visual language only; every control keeps its accessible name (existing `getByRole`/`getByText` queries are the regression contract). (spec §2, §5)
- **All motion is `prefers-reduced-motion: reduce`-safe via an explicit guard** — not merely the zeroed `--dur-*`. A transform/opacity entrance, the shimmer keyframe, and the view-transition pseudo-elements must each be disabled under reduced motion. (spec §3, §5)
- **Decorative elements are non-announced:** grain, dog-ear, and skeletons carry `aria-hidden="true"` (or a non-content role) so assistive tech and `getByRole({name})` never pick them up. (spec §5)
- **Deferred (NOT this slice):** shared-element / morph view transitions; status-as-color, drop-caps, toasts, display type (slice 4); landing hero, empty-state personality copy, capture-delight, focus mode (slice 5). No dog-ear on article cards or dense surfaces — sparing only. (spec §2)
- **TypeScript strict.** No `any` without a written reason. (`CLAUDE.md`)
- **Conventional Commits, one logical change per commit** (`feat:`/`refactor:`). Squash NOT required on `develop`. **Never push or open a PR.** (`CLAUDE.md`)
- **Run-app visual checks** (jsdom computes no layout): dev server `cd apps/web && pnpm dev` at `http://localhost:3000`; verify across light/dark/sepia and with reduced-motion ON. Never write a hollow assertion to fake a visual test.
- **Test commands run from `apps/web/`:** `pnpm vitest run <path>` (single run). Typecheck: `pnpm check` (expect 0 NEW errors; ~4 pre-existing errors in unrelated files remain).

---

## File map

| File | Responsibility | Tasks |
| --- | --- | --- |
| `apps/web/src/lib/styles/tokens.css` | `--grain-opacity`, `--dur-view` tokens | 1, 6 |
| `apps/web/src/routes/+layout.svelte` | tokenize shell grain opacity; `onNavigate` view-transition hook | 1, 6 |
| `apps/web/src/lib/components/ui/Card.svelte` | surface grain; resting shadow; hover/press lift | 1, 3 |
| `apps/web/src/lib/components/ui/ConfirmDialog.svelte` | surface grain + `--shadow-lg` | 1 |
| `apps/web/src/lib/components/HighlightPopover.svelte` | surface grain + `--shadow-lg` | 1 |
| `apps/web/src/lib/components/ui/PaperCorner.svelte` *(new)* | dog-ear motif primitive | 2 |
| `apps/web/src/lib/components/TopBar.svelte` | nav-link hover tint | 3 |
| `apps/web/src/lib/components/ui/Chip.svelte` | chip hover tint | 3 |
| `apps/web/src/lib/actions/reveal.ts` *(new, ported)* + `reveal.test.ts` | staggered entrance action | 4 |
| `apps/web/src/lib/view-transition.ts` *(new)* + `view-transition.test.ts` | `shouldAnimateNavigation` guard | 6 |
| `apps/web/src/lib/components/ui/Skeleton.svelte` *(new)* + `skeleton.test.ts` | shimmer placeholder | 5 |
| `apps/web/src/routes/library/+page.svelte` | reveal on grid; `Skeleton` while loading; `PaperCorner` on empty-state | 2, 4, 5 |
| `apps/web/src/routes/read/[id]/+page.svelte` | `Skeleton` while loading; `PaperCorner` on header | 2, 5 |
| `apps/web/src/lib/components/HighlightsSidebar.svelte` | reveal on the list | 4 |
| `apps/web/src/app.css` | `::view-transition-*` cross-fade keyframes | 6 |

> **Already done by Track 1 — do NOT re-add:** the shell grain overlay exists at `+layout.svelte` `.app::before` (currently a hardcoded `opacity: 0.04`); the `.page` entrance animation + its reduced-motion guard exist. Task 1 only *tokenizes* the shell opacity; Task 6 adds *cross-route* transitions (distinct from the page-mount animation).

---

## Task 1: Materiality foundation — grain tokens + surface grain + resting shadows

**Files:**
- Modify: `apps/web/src/lib/styles/tokens.css` (tokens)
- Modify: `apps/web/src/routes/+layout.svelte` (tokenize shell opacity)
- Modify: `apps/web/src/lib/components/ui/Card.svelte` (grain + resting shadow)
- Modify: `apps/web/src/lib/components/ui/ConfirmDialog.svelte` (grain + shadow-lg)
- Modify: `apps/web/src/lib/components/HighlightPopover.svelte` (grain + shadow-lg)

**Interfaces:**
- Produces: `--grain-opacity` and `--dur-view` tokens (consumed by Tasks 3/6); a reusable surface-grain `::before` pattern. No JS exports. Pure-visual — run-app verified; no new test (existing suite must stay green).

- [ ] **Step 1: Add tokens**

In `tokens.css`, inside `:root`, after the grain texture / motion tokens, add:
```css
  --grain-opacity: 0.04;        /* banner ::before grain strength */
  --dur-view: var(--dur-base);  /* cross-route view-transition duration */
```

- [ ] **Step 2: Tokenize the existing shell grain opacity**

In `+layout.svelte` `<style>`, change the `.app::before` opacity from the hardcoded value to the token:
```css
  .app::before {
    content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image: var(--texture-grain); opacity: var(--grain-opacity); mix-blend-mode: multiply;
  }
```

- [ ] **Step 3: Add grain + resting shadow to Card**

In `Card.svelte` `<style>`, make `.card` a positioned, clipped surface at resting elevation `--shadow-sm`, and add a decorative grain `::before` (hover lift is Task 3 — do not add `:hover` here):
```css
  .card {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0; /* allow flex/grid children to shrink so long content wraps */
    background: var(--color-surface-raised);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    padding: 1.1rem 1.2rem;
  }
  .card::before {
    content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background-image: var(--texture-grain); opacity: var(--grain-opacity); mix-blend-mode: multiply;
    border-radius: inherit;
  }
```
The card's children sit in normal flow above the `z-index: 0` pseudo-element; no markup change needed.

- [ ] **Step 4: Add grain + shadow-lg to the dialog and popover surfaces**

In `ConfirmDialog.svelte`, find the dialog content/panel surface rule and (a) ensure its shadow is `var(--shadow-lg)`, (b) add a grain `::before` like Step 3 (with `position: relative; overflow: hidden;` on the surface if not already present). In `HighlightPopover.svelte`, do the same on the `:global(.hl-popover)` rule — note it is portaled, so the grain pseudo-element must be `:global(.hl-popover)::before` and the rule already uses `:global`. Use `var(--shadow-lg)` for its `box-shadow`.

- [ ] **Step 5: Typecheck + suite green**

Run: `cd apps/web && pnpm check` (0 new errors) and `pnpm vitest run` (all green — currently 72).
Expected: PASS. No behavior/markup change, so all tests resolve unchanged.

- [ ] **Step 6: Verify in the running app**

`pnpm dev`; confirm: subtle grain on the page background AND on cards/dialog/popover surfaces; cards read slightly flatter at rest (shadow-sm); dialog/popover sit clearly elevated (shadow-lg). Check light/dark/sepia — grain uses `mix-blend: multiply` so it should read on all three.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/styles/tokens.css apps/web/src/routes/+layout.svelte apps/web/src/lib/components/ui/Card.svelte apps/web/src/lib/components/ui/ConfirmDialog.svelte apps/web/src/lib/components/HighlightPopover.svelte
git commit -m "feat(web): tokenize grain and apply it to card and popover surfaces"
```

---

## Task 2: `<PaperCorner>` dog-ear primitive (sparing)

**Files:**
- Create: `apps/web/src/lib/components/ui/PaperCorner.svelte`
- Test: `apps/web/src/lib/components/ui/paper-corner.test.ts`
- Modify: `apps/web/src/routes/library/+page.svelte` (empty-state)
- Modify: `apps/web/src/routes/read/[id]/+page.svelte` (header)

**Interfaces:**
- Produces: `PaperCorner` — a decorative dog-ear. Props `{ size?: number }` (px, default 48). Renders one `aria-hidden="true"` `<span>` positioned top-right; the host must be `position: relative`. Consumes `--color-fold`. Used only by the library empty-state and the reader header (sparing).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/components/ui/paper-corner.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import PaperCorner from "./PaperCorner.svelte";

describe("PaperCorner", () => {
  it("renders a decorative, non-announced element", () => {
    const { container } = render(PaperCorner);
    const el = container.querySelector("span.paper-corner");
    expect(el).not.toBeNull();
    expect(el?.getAttribute("aria-hidden")).toBe("true");
  });

  it("applies the size as a custom property", () => {
    const { container } = render(PaperCorner, { size: 64 });
    const el = container.querySelector("span.paper-corner") as HTMLElement;
    expect(el.style.getPropertyValue("--corner-size")).toBe("64px");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run src/lib/components/ui/paper-corner`
Expected: FAIL — `Failed to resolve import "./PaperCorner.svelte"`.

- [ ] **Step 3: Create the component**

Create `apps/web/src/lib/components/ui/PaperCorner.svelte`:
```svelte
<script lang="ts">
  // Decorative dog-ear fold echoing assets/_banner.html's .fold motif.
  // Purely visual: aria-hidden, no interaction. Host must be position: relative.
  let { size = 48 }: { size?: number } = $props();
</script>

<span class="paper-corner" aria-hidden="true" style="--corner-size: {size}px;"></span>

<style>
  .paper-corner {
    position: absolute;
    top: 0;
    right: 0;
    width: var(--corner-size);
    height: var(--corner-size);
    pointer-events: none;
    background: linear-gradient(225deg, var(--color-fold) 0 50%, transparent 50%);
    border-bottom-left-radius: var(--radius-md);
  }
</style>
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && pnpm vitest run src/lib/components/ui/paper-corner`
Expected: PASS — both cases green.

- [ ] **Step 5: Apply to the library empty-state**

In `library/+page.svelte`, the empty-state block is:
```svelte
  <div class="empty">
    <p>nothing saved yet. paste a link on the <a href="/">extract page</a> ☝</p>
  </div>
```
Add the import (with the other `$lib` imports): `import PaperCorner from "$lib/components/ui/PaperCorner.svelte";`
Place the corner inside and make the host relative:
```svelte
  <div class="empty">
    <PaperCorner />
    <p>nothing saved yet. paste a link on the <a href="/">extract page</a> ☝</p>
  </div>
```
In `<style>`, ensure `.empty` has `position: relative; overflow: hidden;` (add to the existing rule; keep its other declarations).

- [ ] **Step 6: Apply to the reader header**

In `read/[id]/+page.svelte`, add the import and place a `<PaperCorner />` inside the reader header bar element (the `.bar`), and ensure `.bar` is `position: relative` in `<style>` (add only if missing; keep other declarations). Use a smaller size to suit the bar: `<PaperCorner size={36} />`.

- [ ] **Step 7: Suite + typecheck + run-app**

Run: `cd apps/web && pnpm vitest run` and `pnpm check`. Expected: PASS, 0 new type errors.
Run-app: the library empty-state (sign in with no articles, or filter to an empty tag) shows a dog-ear in its top-right; the reader header shows a small dog-ear. Check the fold color reads in all three themes (`--color-fold` is themed).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/components/ui/PaperCorner.svelte apps/web/src/lib/components/ui/paper-corner.test.ts apps/web/src/routes/library/+page.svelte apps/web/src/routes/read/[id]/+page.svelte
git commit -m "feat(web): add PaperCorner dog-ear motif on the empty-state and reader header"
```

---

## Task 3: Hover/press micro-interactions

**Files:**
- Modify: `apps/web/src/lib/components/ui/Card.svelte` (hover lift + press)
- Modify: `apps/web/src/lib/components/TopBar.svelte` (nav-link hover tint — if not already present)
- Modify: `apps/web/src/lib/components/ui/Chip.svelte` (hover tint)

**Interfaces:**
- Consumes: `--shadow-md` (hover step), `--dur-fast`, `--ease-out`. Pure-visual — run-app verified; existing suite stays green.

- [ ] **Step 1: Card hover lift + press settle (reduced-motion guarded)**

In `Card.svelte` `<style>`, add after the `.card` rule:
```css
  .card:hover { box-shadow: var(--shadow-md); transform: translateY(-2px); }
  .card:active { transform: translateY(0); }
  .card { transition: box-shadow var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out); }
  @media (prefers-reduced-motion: reduce) {
    .card { transition: none; }
    .card:hover { transform: none; }
  }
```

- [ ] **Step 2: Chip hover tint**

In `Chip.svelte` `<style>`, add a subtle hover background using an existing wash token (e.g. `--color-accent-wash` or `--color-surface-sunken` — use whichever the chip's resting style already references for consistency):
```css
  /* append to the chip's selector */
  .chip:hover { background: var(--color-surface-sunken); }
```
Match the actual class name in the file; if chips are non-interactive in some contexts, scope the hover to the interactive variant already used.

- [ ] **Step 3: Nav-link hover tint (only if not already present)**

`TopBar.svelte` already has `nav a:hover { color: var(--color-text); }`. Confirm it exists; if so, no change is needed here and this step is a no-op — note that in the report. Do not duplicate the rule.

- [ ] **Step 4: Suite + typecheck + run-app**

Run: `cd apps/web && pnpm vitest run` and `pnpm check`. Expected: PASS, 0 new type errors.
Run-app: hovering a library card lifts it slightly with a deeper shadow; pressing settles it; chips tint on hover. Toggle reduced-motion ON → cards no longer transform (shadow may still change instantly, but no movement).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/ui/Card.svelte apps/web/src/lib/components/ui/Chip.svelte apps/web/src/lib/components/TopBar.svelte
git commit -m "feat(web): add hover/press lift to cards and hover tint to chips"
```

---

## Task 4: `reveal` staggered-entrance action

**Files:**
- Create: `apps/web/src/lib/actions/reveal.ts`
- Test: `apps/web/src/lib/actions/reveal.test.ts`
- Modify: `apps/web/src/routes/library/+page.svelte` (grid items)
- Modify: `apps/web/src/lib/components/HighlightsSidebar.svelte` (list items)

**Interfaces:**
- Produces: `reveal(node: HTMLElement, params?: { delay?: number })` — a Svelte action that animates a fade+rise on first intersection. No-ops (renders final state immediately) under `prefers-reduced-motion: reduce` or when `IntersectionObserver` is missing (jsdom). Sets `--reveal-delay`. Consumed by the library grid and highlights list via `use:reveal`.

- [ ] **Step 1: Write the failing test (ported from the landing site)**

Create `apps/web/src/lib/actions/reveal.test.ts`:
```ts
import { expect, test } from "vitest";
import { reveal } from "./reveal";

test("reveals immediately when IntersectionObserver is unavailable (no-JS/jsdom safety)", () => {
  const node = document.createElement("div");
  reveal(node);
  expect(node.classList.contains("is-visible")).toBe(true);
});

test("records the stagger delay as a custom property", () => {
  const node = document.createElement("div");
  reveal(node, { delay: 120 });
  expect(node.style.getPropertyValue("--reveal-delay")).toBe("120ms");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run src/lib/actions/reveal`
Expected: FAIL — `Failed to resolve import "./reveal"`.

- [ ] **Step 3: Port the action**

Create `apps/web/src/lib/actions/reveal.ts` (ported verbatim from `apps/site/src/lib/actions/reveal.ts`):
```ts
// Scroll-triggered reveal. Progressive enhancement: the element is visible by
// default, so it stays visible without JS, with reduced motion, or anywhere
// IntersectionObserver is missing (e.g. jsdom in tests). When motion is allowed
// we hide it first (.reveal), then reveal it (.is-visible) as it scrolls in.
export function reveal(node: HTMLElement, params?: { delay?: number }) {
  const delay = params?.delay ?? 0;
  node.style.setProperty("--reveal-delay", `${delay}ms`);

  const prefersReduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced || typeof IntersectionObserver === "undefined") {
    node.classList.add("is-visible");
    return;
  }

  node.classList.add("reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          node.classList.add("is-visible");
          observer.unobserve(node);
        }
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
  );
  observer.observe(node);

  return {
    destroy() {
      observer.disconnect();
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && pnpm vitest run src/lib/actions/reveal`
Expected: PASS — both cases green.

- [ ] **Step 5: Add the reveal CSS (global)**

In `apps/web/src/app.css`, append the entrance styles the action toggles (kept global so any `use:reveal` element picks them up):
```css
/* Staggered entrance (lib/actions/reveal.ts). `.reveal` is the hidden start
   state applied only when motion is allowed; `.is-visible` settles it. */
.reveal { opacity: 0; transform: translateY(8px); }
.reveal.is-visible {
  opacity: 1; transform: none;
  transition: opacity var(--dur-base) var(--ease-out) var(--reveal-delay, 0ms),
              transform var(--dur-base) var(--ease-out) var(--reveal-delay, 0ms);
}
@media (prefers-reduced-motion: reduce) {
  .reveal, .reveal.is-visible { opacity: 1; transform: none; transition: none; }
}
```

- [ ] **Step 6: Apply to the library grid**

In `library/+page.svelte`, add the import: `import { reveal } from "$lib/actions/reveal.js";`
Apply to each grid item with a capped per-item stagger (wrap the card or put the action on a wrapper element — `ArticleCard` renders a `Card`, so wrap it):
```svelte
  <CardGrid>
    {#each visible as a, i (a.id)}
      <div use:reveal={{ delay: Math.min(i, 8) * 40 }}>
        <ArticleCard article={a} onOpen={(id) => goto(`/read/${id}`)} onDelete={handleDelete} />
      </div>
    {/each}
  </CardGrid>
```
(Delay capped at `8 * 40ms` so a large library doesn't wait seconds.)

- [ ] **Step 7: Apply to the highlights list**

In `HighlightsSidebar.svelte`, add `import { reveal } from "$lib/actions/reveal.js";` and apply to each `<li>` with a capped stagger:
```svelte
    {#each highlights as h, i (h.id)}
      <li class:orphan={orphans.includes(h.id)} use:reveal={{ delay: Math.min(i, 8) * 40 }}>
```
(Keep the rest of the `<li>` content unchanged.)

- [ ] **Step 8: Suite + typecheck + run-app**

Run: `cd apps/web && pnpm vitest run` and `pnpm check`. Expected: PASS (the action's no-JS path keeps jsdom tests green — items get `is-visible` immediately, so existing library/sidebar queries still find them), 0 new type errors.
Run-app: loading the library fades the cards in with a gentle stagger; the highlights list staggers in. Reduced-motion ON → everything appears instantly, no movement.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/actions/reveal.ts apps/web/src/lib/actions/reveal.test.ts apps/web/src/app.css apps/web/src/routes/library/+page.svelte apps/web/src/lib/components/HighlightsSidebar.svelte
git commit -m "feat(web): add staggered reveal action to the library grid and highlights list"
```

---

## Task 5: `<Skeleton>` shimmer primitive

**Files:**
- Create: `apps/web/src/lib/components/ui/Skeleton.svelte`
- Test: `apps/web/src/lib/components/ui/skeleton.test.ts`
- Modify: `apps/web/src/routes/library/+page.svelte` (loading grid)
- Modify: `apps/web/src/routes/read/[id]/+page.svelte` (loading reader)

**Interfaces:**
- Produces: `Skeleton` — a decorative shimmer placeholder. Props `{ lines?: number; radius?: string }` (default `lines=1`). Renders `aria-hidden="true"` block(s); shimmer animates only when motion is allowed (static block under reduced-motion). Replaces the library's inline `.skeleton` and the reader's loading `Spinner`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/components/ui/skeleton.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import Skeleton from "./Skeleton.svelte";

describe("Skeleton", () => {
  it("is decorative (aria-hidden) so it is not announced as content", () => {
    const { container } = render(Skeleton);
    const root = container.querySelector(".skeleton");
    expect(root?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders one line by default and the requested number when asked", () => {
    const { container } = render(Skeleton, { lines: 3 });
    expect(container.querySelectorAll(".skeleton-line").length).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run src/lib/components/ui/skeleton`
Expected: FAIL — `Failed to resolve import "./Skeleton.svelte"`.

- [ ] **Step 3: Create the component**

Create `apps/web/src/lib/components/ui/Skeleton.svelte`:
```svelte
<script lang="ts">
  // Decorative loading placeholder with a shimmer sweep. aria-hidden so it is
  // never announced. Shimmer is disabled under prefers-reduced-motion.
  let { lines = 1, radius = "var(--radius-md)" }: { lines?: number; radius?: string } = $props();
</script>

<div class="skeleton" aria-hidden="true">
  {#each Array(lines) as _}
    <span class="skeleton-line" style="border-radius: {radius};"></span>
  {/each}
</div>

<style>
  .skeleton { display: flex; flex-direction: column; gap: var(--space-2); }
  .skeleton-line {
    display: block;
    height: 1rem;
    background: linear-gradient(
      90deg,
      var(--color-surface-sunken) 0%,
      var(--color-surface-raised) 50%,
      var(--color-surface-sunken) 100%
    );
    background-size: 200% 100%;
    animation: skeleton-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes skeleton-shimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton-line { animation: none; background: var(--color-surface-sunken); }
  }
</style>
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && pnpm vitest run src/lib/components/ui/skeleton`
Expected: PASS — both cases green.

- [ ] **Step 5: Use Skeleton in the library loading grid**

In `library/+page.svelte`, add `import Skeleton from "$lib/components/ui/Skeleton.svelte";`. Replace the loading block's inline placeholder:
```svelte
{#if loading}
  <CardGrid>
    {#each Array(6) as _}
      <Card><Skeleton lines={3} /></Card>
    {/each}
  </CardGrid>
```
Add `import Card from "$lib/components/ui/Card.svelte";` if not already imported. Remove the now-unused `.skeleton` style rule from this page's `<style>` if present (the inline `<div class="skeleton">` is gone).

- [ ] **Step 6: Use Skeleton in the reader loading state**

In `read/[id]/+page.svelte`, the loading branch is `{#if !content} <Spinner label="loading article" /> {:else} …`. Replace the `Spinner` with a content-shaped skeleton:
```svelte
  {#if !content}
    <Skeleton lines={8} />
  {:else}
```
Add `import Skeleton from "$lib/components/ui/Skeleton.svelte";`. Leave the `Spinner` import only if still used elsewhere in the file; if it becomes unused, remove the import to keep the suite/lint clean.

- [ ] **Step 7: Suite + typecheck + run-app**

Run: `cd apps/web && pnpm vitest run` and `pnpm check`. Expected: PASS, 0 new type errors. If the reader page test asserted on the Spinner's "loading article" text, update that assertion to the skeleton's decorative nature (it is `aria-hidden`); if no such assertion exists, nothing to change.
Run-app: while the library loads, skeleton cards shimmer; opening an article shows a shimmering text-block skeleton until content arrives. Reduced-motion ON → static muted blocks, no shimmer.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/components/ui/Skeleton.svelte apps/web/src/lib/components/ui/skeleton.test.ts apps/web/src/routes/library/+page.svelte apps/web/src/routes/read/[id]/+page.svelte
git commit -m "feat(web): add shimmer Skeleton for library and reader loading states"
```

---

## Task 6: Cross-route view transitions

**Files:**
- Create: `apps/web/src/lib/view-transition.ts`
- Test: `apps/web/src/lib/view-transition.test.ts`
- Modify: `apps/web/src/routes/+layout.svelte` (`onNavigate` hook)
- Modify: `apps/web/src/app.css` (`::view-transition-*` cross-fade)

**Interfaces:**
- Produces: `shouldAnimateNavigation(doc: Document, mql: MediaQueryList): boolean` — true only when `doc.startViewTransition` is a function AND `mql.matches` is false (motion allowed). Consumed by the layout's `onNavigate`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/view-transition.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { shouldAnimateNavigation } from "./view-transition";

const mql = (matches: boolean) => ({ matches }) as MediaQueryList;

describe("shouldAnimateNavigation", () => {
  it("is true when startViewTransition exists and motion is allowed", () => {
    const doc = { startViewTransition: () => {} } as unknown as Document;
    expect(shouldAnimateNavigation(doc, mql(false))).toBe(true);
  });

  it("is false when the API is missing", () => {
    const doc = {} as Document;
    expect(shouldAnimateNavigation(doc, mql(false))).toBe(false);
  });

  it("is false when the user prefers reduced motion", () => {
    const doc = { startViewTransition: () => {} } as unknown as Document;
    expect(shouldAnimateNavigation(doc, mql(true))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && pnpm vitest run src/lib/view-transition`
Expected: FAIL — `Failed to resolve import "./view-transition"`.

- [ ] **Step 3: Write the helper**

Create `apps/web/src/lib/view-transition.ts`:
```ts
// Guard for the View Transitions API: animate cross-route navigation only when
// the browser supports it (Firefox does not) AND the user allows motion.
export function shouldAnimateNavigation(doc: Document, mql: MediaQueryList): boolean {
  return typeof (doc as { startViewTransition?: unknown }).startViewTransition === "function" && !mql.matches;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/web && pnpm vitest run src/lib/view-transition`
Expected: PASS — all three cases green.

- [ ] **Step 5: Wire `onNavigate` in the layout**

In `+layout.svelte` `<script>`, add to the imports: `import { goto, onNavigate } from "$app/navigation";` (extend the existing `goto` import) and `import { shouldAnimateNavigation } from "$lib/view-transition.js";`
Add, at the top level of the script (not inside a function):
```ts
  // Cross-route view transition (global cross-fade). Feature-detected and
  // reduced-motion-guarded by shouldAnimateNavigation; resolves per the
  // SvelteKit onNavigate + startViewTransition pattern.
  onNavigate((navigation) => {
    if (typeof document === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!shouldAnimateNavigation(document, mql)) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
```

- [ ] **Step 6: Add the cross-fade CSS**

In `apps/web/src/app.css`, append:
```css
/* Cross-route view transitions (lib/view-transition.ts gates them on support +
   motion preference, so no reduced-motion guard is needed here — the hook simply
   isn't invoked when motion is off). */
::view-transition-old(root) { animation: vt-fade var(--dur-view) var(--ease-out) reverse; }
::view-transition-new(root) { animation: vt-fade var(--dur-view) var(--ease-out); }
@keyframes vt-fade { from { opacity: 0; } to { opacity: 1; } }
```

- [ ] **Step 7: Suite + typecheck + run-app**

Run: `cd apps/web && pnpm vitest run` and `pnpm check`. Expected: PASS, 0 new type errors.
Run-app (Chromium-based browser): navigating library → reader → back cross-fades smoothly. In Firefox (no API) navigation is instant with no error. Reduced-motion ON → instant, no fade.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/view-transition.ts apps/web/src/lib/view-transition.test.ts apps/web/src/routes/+layout.svelte apps/web/src/app.css
git commit -m "feat(web): add feature-detected cross-route view transitions"
```

---

## Final verification

- [ ] Full web suite green: `cd apps/web && pnpm vitest run` (new tests: paper-corner, reveal, skeleton, view-transition; all prior tests still green).
- [ ] Typecheck clean: `cd apps/web && pnpm check` (0 new errors).
- [ ] Grep guard — no hardcoded grain opacity or shadow literals introduced: `grep -rn "opacity: 0.04\|0 1px 2px\|0 4px 12px" apps/web/src/lib apps/web/src/routes` should only match `tokens.css` definitions, not components.
- [ ] Run-app pass across light/dark/sepia AND reduced-motion ON: grain on shell + cards/popovers; rest→hover card elevation + press; dog-ear on empty-state + reader header; staggered grid/list reveal; shimmer skeletons during load; cross-route fade (Chromium) / instant (Firefox / reduced-motion). No layout regression, no console errors.

## Self-Review notes

- **Spec coverage:** grain (spec §4.1) → Task 1; shadow elevation (§4.2) → Task 1 (rest) + Task 3 (hover step); PaperCorner (§4.3) → Task 2; hover/press (§4.4) → Task 3; reveal action (§4.5) → Task 4; Skeleton (§4.6) → Task 5; view transitions (§4.7) → Task 6. Reduced-motion guards present in Tasks 3,4,5,6. Non-goals respected: no shared-element morph, no status-color/drop-cap/toast/display-type, no dog-ear on cards.
- **Already-done reality:** shell grain + `.page` entrance pre-exist (Track 1); Task 1 only tokenizes the shell opacity, Task 6 adds the distinct cross-route transition. Library already had an inline `.skeleton` block → Task 5 replaces it with the shimmer primitive.
- **Type/name consistency:** `reveal(node, { delay })`, `shouldAnimateNavigation(doc, mql)`, `Skeleton { lines, radius }`, `PaperCorner { size }` are used identically across their definition and call sites. `--grain-opacity` / `--dur-view` token names match between `tokens.css` and consumers.
- **Test honesty:** logic units (reveal, skeleton, paper-corner, view-transition guard) are TDD'd with real assertions; grain/shadow/dog-ear/shimmer/transition *appearance* is explicitly run-app verified, never faked in jsdom.
