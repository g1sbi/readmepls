# UI Rework — Track 1 (Structural Fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the structural UI defects from the UI review (background fill, card layout/overflow, reader cramping, chip/focus/voice consistency, container widths, responsive) so the app is correct and consistent — without introducing new visual design.

**Architecture:** Pure SvelteKit + scoped-CSS work plus a small global reset. Changes are token-driven (every value references `tokens.css`); behavior/markup/copy changes are TDD'd with `@testing-library/svelte`; pure-visual CSS is verified by running the app and observing, since jsdom does not compute layout. One new shared primitive (`Chip`) consolidates five duplicated chip styles.

**Tech Stack:** SvelteKit (Svelte 5 runes), Vitest + `@testing-library/svelte` (jsdom), scoped component `<style>`, CSS custom properties in `apps/web/src/lib/styles/tokens.css`.

**Source spec:** `docs/superpowers/specs/2026-06-29-ui-review-findings.md` (finding IDs `A1`–`E1` referenced per task).

## Global Constraints

- **Tokens only — never hardcode a color or font name in a component.** Reference a semantic/reader token from `tokens.css`. New visual constants become new tokens. (`CLAUDE.md` › Design language)
- **TypeScript strict.** No `any` without a written reason. (`CLAUDE.md` › Code conventions)
- **TDD where testable.** Behavior, markup, copy, and component-API changes get a failing test first (`@testing-library/svelte`, jsdom). Pure-visual CSS (background fill, flex layout, shadows, responsive breakpoints) cannot be asserted in jsdom — verify by running the app and observing. Never write a hollow assertion to fake a test.
- **Structural track adds NO new visual design.** These are defect/consistency fixes only. Decorative motifs, motion, icons, drop-caps belong to Track 2 (Phase 3). (Findings §F phasing note)
- **Conventional Commits, one logical change per commit.** `fix:` / `refactor:` / `test:` / `style:`. (`CLAUDE.md`)
- **Never push or open a PR.** Local commits only. (`CLAUDE.md`)
- **Run app for visual checks:** dev server at `http://localhost:3000`; sign in with the project test account. Use light theme unless a step says otherwise.
- **Test commands run from `apps/web/`:** `npm run test -- <path>` (Vitest, single run). Typecheck: `npm run check`.

---

## File map

| File | Responsibility | Tasks |
| --- | --- | --- |
| `apps/web/src/app.css` *(new)* | Global reset: box-sizing, zero body margin, base bg | 1 |
| `apps/web/src/routes/+layout.svelte` | Import reset; apply width token to `.page` | 1, 2 |
| `apps/web/src/lib/styles/tokens.css` | Add container-width tokens + focus-ring token | 2, 7 |
| `apps/web/src/lib/components/ui/Card.svelte` | Card internal flex layout | 3 |
| `apps/web/src/lib/components/ui/CardGrid.svelte` | Shrinkable grid tracks | 3 |
| `apps/web/src/lib/components/ArticleCard.svelte` | URL wrap + hostname; lowercase labels; focus | 4, 5, 7 |
| `apps/web/src/lib/components/ui/Chip.svelte` *(new)* | Shared chip primitive | 6 |
| `apps/web/src/lib/components/ui/Tag.svelte` | Compose `Chip` | 6 |
| `apps/web/src/lib/components/TagEditor.svelte` | Use `Chip` (removable) | 6 |
| `apps/web/src/routes/library/+page.svelte` | Tag-rail + collection chips via `Chip`; focus | 6, 7 |
| `apps/web/src/lib/components/ReaderControls.svelte` | Lowercase labels | 5 |
| `apps/web/src/routes/read/[id]/+page.svelte` | Lowercase labels; shell-vs-measure; highlights rail; focus | 5, 8 |
| `apps/web/src/lib/components/HighlightsSidebar.svelte` | Focus rings | 7 |
| `apps/web/src/lib/components/TopBar.svelte` | Responsive collapse | 9 |
| `apps/web/src/routes/{search,collections/[slug],settings/connectors}/+page.svelte` | Width tokens | 2 |

---

## Task 1: Global reset & app-shell background (A1, A2)

Fixes the "outer border" (UA `body` margin showing through `display:contents`) and establishes `box-sizing: border-box` everywhere.

**Files:**
- Create: `apps/web/src/app.css`
- Modify: `apps/web/src/routes/+layout.svelte` (script imports + `.app`/body bg)

**Interfaces:**
- Produces: a globally-applied reset; `<body>` carries the paper background so over-scroll matches. No JS exports.

- [ ] **Step 1: Create the reset stylesheet**

Create `apps/web/src/app.css`:

```css
/* Global reset. Imported once in +layout.svelte. Keep minimal — visual
   tokens live in tokens.css; this only normalizes the box model and the
   document edges so the paper background reaches the viewport. */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  /* Match the app gradient so rubber-band/over-scroll shows paper, not canvas.
     The gradient itself is re-applied on .app for the in-flow fill. */
  background: var(--color-bg);
  min-height: 100dvh;
}
```

- [ ] **Step 2: Import the reset in the layout**

In `apps/web/src/routes/+layout.svelte`, add the import at the top of the `<script>` block, immediately after the existing token import (line ~3):

```svelte
  import "$lib/styles/fonts.css";
  import "$lib/styles/tokens.css";
  import "../app.css";
```

- [ ] **Step 3: Verify the fix in the running app**

The reset is global CSS; jsdom does not render it, so this is a visual check.

Run the app (`http://localhost:3000`, signed in, light theme). Confirm:
- The warm paper gradient reaches **all four** viewport edges — no pale border strip around the app.
- No unexpected vertical scrollbar on a short page (the old `100dvh` + 8px margin overflow is gone).
- Resize the window narrower/wider — background still fills edge-to-edge.

Expected: background is full-bleed; the framing strip described in finding A1 is gone.

- [ ] **Step 4: Typecheck**

Run from `apps/web/`: `npm run check`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app.css apps/web/src/routes/+layout.svelte
git commit -m "fix(web): full-bleed app background and global box-sizing reset"
```

---

## Task 2: Container-width tokens (A3)

Replace four ad-hoc max-widths (1100px / 900px / 56rem / 48rem) with a shared, tokenized width scale.

**Files:**
- Modify: `apps/web/src/lib/styles/tokens.css` (add tokens)
- Modify: `apps/web/src/routes/+layout.svelte` (`.page`)
- Modify: `apps/web/src/routes/collections/[slug]/+page.svelte`, `apps/web/src/routes/search/+page.svelte`, `apps/web/src/routes/settings/connectors/+page.svelte`

**Interfaces:**
- Produces tokens: `--width-page` (wide, for card grids), `--width-prose` (medium, reading-adjacent lists), `--width-narrow` (forms/settings). Consumed by every top-level page container.

- [ ] **Step 1: Add width tokens**

In `apps/web/src/lib/styles/tokens.css`, inside the `:root` PRIMITIVES space section (after the `--space-*` block, ~line 93), add:

```css
  /* ---- 1. PRIMITIVES — container widths ------------------------------- */
  --width-page:   1100px; /* card grids, library, home */
  --width-prose:  900px;  /* reading-adjacent lists, collections, search */
  --width-narrow: 768px;  /* forms, settings */
```

- [ ] **Step 2: Apply to the layout page container**

In `apps/web/src/routes/+layout.svelte` `<style>`, change `.page` `max-width`:

```css
  .page { position: relative; z-index: 1; max-width: var(--width-page); margin: 0 auto; padding: 1.5rem 1.25rem; animation: reveal var(--dur-slow) var(--ease-paper) both; }
```

- [ ] **Step 3: Apply to the three self-contained page containers**

In `apps/web/src/routes/collections/[slug]/+page.svelte` `<style>`:
```css
  .collection-view { max-width: var(--width-prose); margin: 0 auto; }
```
In `apps/web/src/routes/search/+page.svelte` `<style>` `.search-results`:
```css
    max-width: var(--width-prose);
```
In `apps/web/src/routes/settings/connectors/+page.svelte` `<style>` `.connectors`:
```css
    max-width: var(--width-narrow);
```

- [ ] **Step 4: Verify in the running app**

Navigate to `/library`, `/search?q=test`, a collection, and `/settings/connectors`. Confirm the content columns now follow a deliberate rhythm (library widest; collections/search medium; settings narrowest) and nothing looks unintentionally re-sized/broken.

Expected: consistent, intentional widths; no layout breakage.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/styles/tokens.css apps/web/src/routes/+layout.svelte apps/web/src/routes/collections/\[slug\]/+page.svelte apps/web/src/routes/search/+page.svelte apps/web/src/routes/settings/connectors/+page.svelte
git commit -m "refactor(web): tokenize container widths"
```

---

## Task 3: Card internal layout + shrinkable grid (C1, C3)

Gives `Card` a real vertical flex layout (the root cause of "messy cards" and the no-op `align-self`) and lets grid tracks shrink so long content wraps instead of overflowing.

**Files:**
- Modify: `apps/web/src/lib/components/ui/Card.svelte`
- Modify: `apps/web/src/lib/components/ui/CardGrid.svelte`

**Interfaces:**
- Produces: `.card` is now `display:flex; flex-direction:column; gap` with `min-width:0`; descendant `align-self` works. Grid tracks shrink below 240px when needed.

- [ ] **Step 1: Make the card a vertical flex container**

In `apps/web/src/lib/components/ui/Card.svelte` `<style>`, replace the `.card` rule:

```css
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0; /* allow flex/grid children to shrink so long content wraps */
    background: var(--color-surface-raised);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    padding: 1.1rem 1.2rem;
  }
```

- [ ] **Step 2: Make grid tracks shrinkable**

In `apps/web/src/lib/components/ui/CardGrid.svelte` `<style>`, replace the `.grid` rule:

```css
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: 1rem; }
```

- [ ] **Step 3: Confirm component tests still pass**

These are CSS-only changes; existing render tests must remain green.

Run from `apps/web/`: `npm run test -- src/lib/components/ArticleCard.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 4: Verify in the running app**

On `/library` and `/` (with at least one queued and one ready article): card contents are now consistently stacked with even spacing; the delete link sits at the card's bottom-right (its `align-self:flex-end` now works); cards can narrow on small windows without content escaping.

Expected: tidy, uniform card internals; no overflow.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/ui/Card.svelte apps/web/src/lib/components/ui/CardGrid.svelte
git commit -m "fix(web): give Card a flex layout and let grid tracks shrink"
```

---

## Task 4: ArticleCard URL overflow + hostname (C2)

Stops long queued URLs from spilling outside the card; shows a clean hostname for the processing state and wraps the full URL fallback.

**Files:**
- Modify: `apps/web/src/lib/components/ArticleCard.svelte`
- Test: `apps/web/src/lib/components/ArticleCard.test.ts`

**Interfaces:**
- Consumes: `article.url: string` (existing prop).
- Produces: a `hostOf(url)` local helper returning the hostname or the raw string on parse failure; the processing branch renders the hostname inside a `.url` element with `overflow-wrap: anywhere`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/components/ArticleCard.test.ts` inside the `describe` block:

```ts
  it("shows the hostname (not the full path) while processing", () => {
    render(ArticleCard, {
      article: {
        id: "a2",
        url: "https://example.com/some/very/long/path?x=1",
        expand: undefined,
      },
    });
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.queryByText(/some\/very\/long\/path/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web/`: `npm run test -- src/lib/components/ArticleCard.test.ts`
Expected: FAIL — the full URL is rendered, so `getByText("example.com")` is not found.

- [ ] **Step 3: Implement hostname + wrapping**

In `apps/web/src/lib/components/ArticleCard.svelte` `<script>`, add after the existing `$derived` lines (~line 26):

```ts
  // Show a clean hostname while processing; fall back to the raw URL if it
  // can't be parsed (e.g. malformed input mid-capture).
  function hostOf(u: string): string {
    try { return new URL(u).hostname; } catch { return u; }
  }
```

In the markup, change the processing branch (currently `<span>{article.url}</span>`, ~line 32):

```svelte
  {#if state === "processing"}
    <Spinner label="processing" />
    <span class="url">{hostOf(article.url)}</span>
  {:else}
```

Add to `<style>`:

```css
  .url {
    overflow-wrap: anywhere;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/web/`: `npm run test -- src/lib/components/ArticleCard.test.ts`
Expected: PASS (6 cases, including the processing-status test which still finds `role="status"`).

- [ ] **Step 5: Verify in the running app**

Queue a link with a long path (e.g. paste a deep article URL on `/`). The "working on it" card shows the spinner + hostname, fully inside the card.

Expected: no horizontal overflow; hostname shown.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/ArticleCard.svelte apps/web/src/lib/components/ArticleCard.test.ts
git commit -m "fix(web): show hostname and wrap URL in processing card"
```

---

## Task 5: Lowercase voice normalization (C4, E4)

Normalizes chrome copy to the lowercase playful voice. Existing tests use case-insensitive matchers, so they stay green; this task adds one guard test.

**Files:**
- Modify: `apps/web/src/lib/components/ArticleCard.svelte`, `apps/web/src/lib/components/ReaderControls.svelte`, `apps/web/src/routes/read/[id]/+page.svelte`
- Test: `apps/web/src/lib/components/ArticleCard.test.ts`

**Interfaces:**
- Produces: button/label copy lowercased: `read`, `retry`, `archive`, `light`, `dark`, `sepia`, `sans`, `serif`. Article *content* (titles, body) is untouched.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/components/ArticleCard.test.ts`:

```ts
  it("uses the lowercase voice for the read action", () => {
    render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }),
    });
    expect(screen.getByRole("button", { name: "read" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web/`: `npm run test -- src/lib/components/ArticleCard.test.ts`
Expected: FAIL — button reads "Read", so the exact-name `"read"` query misses.

- [ ] **Step 3: Lowercase the labels**

In `apps/web/src/lib/components/ArticleCard.svelte`, change the two button labels:
- `<Button variant="accent" onclick={() => onRetry?.(article.id)}>Retry</Button>` → `…>retry</Button>`
- `<Button onclick={() => onOpen?.(article.id)}>Read</Button>` → `…>read</Button>`

In `apps/web/src/lib/components/ReaderControls.svelte`, change labels: `Sans`→`sans`, `Serif`→`serif`, `Light`→`light`, `Dark`→`dark`, `Sepia`→`sepia`. (The `A−`/`A+` labels stay.)

In `apps/web/src/routes/read/[id]/+page.svelte`, change `<Button onclick={archive}>Archive</Button>` → `…>archive</Button>`.

- [ ] **Step 4: Run the affected tests to verify they pass**

Run from `apps/web/`: `npm run test -- src/lib/components/ArticleCard.test.ts src/lib/components/ReaderControls.test.ts`
Expected: PASS — ArticleCard 7 cases; ReaderControls 2 cases (its matchers are `/dark/i` and `/A\+|increase/i`, unaffected).

- [ ] **Step 5: Verify in the running app**

Reader toolbar and cards read in lowercase, consistent with "your library" / "save it".

Expected: no Title-Case chrome labels remain on these surfaces.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/ArticleCard.svelte apps/web/src/lib/components/ReaderControls.svelte apps/web/src/routes/read/\[id\]/+page.svelte apps/web/src/lib/components/ArticleCard.test.ts
git commit -m "style(web): lowercase chrome button labels for voice consistency"
```

---

## Task 6: Shared `Chip` primitive (D2a, C5)

Consolidates five duplicated chip styles into one primitive. Tag, the library tag-rail/collection chips, and the TagEditor chip compose it.

**Files:**
- Create: `apps/web/src/lib/components/ui/Chip.svelte`
- Create: `apps/web/src/lib/components/ui/chip.test.ts`
- Modify: `apps/web/src/lib/components/ui/Tag.svelte`, `apps/web/src/lib/components/TagEditor.svelte`, `apps/web/src/routes/library/+page.svelte`

**Interfaces:**
- Produces `Chip` with props: `children: Snippet` (label), `selected?: boolean` (accent fill), `trailing?: Snippet` (optional control, e.g. a remove button). Renders a `<span class="chip" data-selected={selected}>` with `display:inline-flex; gap; radius-pill; border var(--color-border)`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/components/ui/chip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Chip from "./Chip.svelte";

const text = (s: string) => createRawSnippet(() => ({ render: () => `<span>${s}</span>` }));

describe("Chip", () => {
  it("renders its label", () => {
    render(Chip, { children: text("ai") });
    expect(screen.getByText("ai")).toBeInTheDocument();
  });

  it("exposes a selected state for styling", () => {
    const { container } = render(Chip, { children: text("all"), selected: true });
    expect(container.querySelector(".chip")?.getAttribute("data-selected")).toBe("true");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web/`: `npm run test -- src/lib/components/ui/chip.test.ts`
Expected: FAIL — `Chip.svelte` does not exist (import error).

- [ ] **Step 3: Create the `Chip` primitive**

Create `apps/web/src/lib/components/ui/Chip.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  let { children, selected = false, trailing }: {
    children: Snippet;
    selected?: boolean;
    trailing?: Snippet;
  } = $props();
</script>

<span class="chip" data-selected={selected}>
  {@render children()}
  {#if trailing}{@render trailing()}{/if}
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    padding: 0.1rem 0.6rem;
  }
  .chip[data-selected="true"] {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-surface);
  }
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run from `apps/web/`: `npm run test -- src/lib/components/ui/chip.test.ts`
Expected: PASS (2 cases).

- [ ] **Step 5: Compose `Tag` from `Chip`**

Replace `apps/web/src/lib/components/ui/Tag.svelte` entirely:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  import Chip from "./Chip.svelte";
  let { children }: { children?: Snippet } = $props();
</script>

{#if children}
  <Chip {children} />
{/if}
```

- [ ] **Step 6: Retarget the library tag-rail selected/hover styles**

`Tag` now renders `Chip` (class `.chip`), so the library tag-rail's `:global(.tag)` overrides no longer match and the selected/hover highlight would silently break. In `apps/web/src/routes/library/+page.svelte` `<style>`, retarget the three selectors from `.tag` to `.chip`:

```css
  .tag-chip:hover :global(.chip) {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .tag-chip.selected :global(.chip) {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-surface);
  }
```

(The rail markup — `<button class="tag-chip"><Tag>{t.name}</Tag></button>` — is unchanged; only the selectors change.)

- [ ] **Step 7: Verify Tag + tag-rail tests still pass**

`Tag` is consumed by `primitives.test.ts` and the library tag-rail (`tag-filter.test.ts`, which clicks by accessible name, not CSS).

Run from `apps/web/`: `npm run test -- src/lib/components/ui/primitives.test.ts src/routes/library/tag-filter.test.ts`
Expected: PASS — `primitives.test.ts` still finds the "ai" label; tag-filter still filters via the `/^ml$/i` button.

- [ ] **Step 8: Use `Chip` for the library collection chips**

In `apps/web/src/routes/library/+page.svelte`, the collection link currently uses a bespoke `.collection-chip`. Wrap its label in `Chip` while keeping it a link. Import `Chip` in the `<script>`:

```svelte
  import Chip from "$lib/components/ui/Chip.svelte";
```

Change the collection link (~line 194) to compose the chip visual:

```svelte
            <a class="collection-chip" href="/collections/{col.slug}"><Chip>{col.name}</Chip></a>
```

In `<style>`, reduce `.collection-chip` to a bare link wrapper (the chip visual now comes from `Chip`), keeping its focus ring from Task 7:

```css
  .collection-chip { text-decoration: none; }
```

- [ ] **Step 9: Use `Chip` for the TagEditor chips**

Replace the chip markup in `apps/web/src/lib/components/TagEditor.svelte`. Import `Chip`:

```svelte
  import Chip from "./ui/Chip.svelte";
```

Replace the `{#each}` chip block:

```svelte
  {#each tags as t (t.id)}
    <Chip>
      {t.name}
      {#snippet trailing()}
        <button aria-label={`remove ${t.name}`} onclick={() => onremove(t.id)}>×</button>
      {/snippet}
    </Chip>
  {/each}
```

Remove the now-unused `.chip` and `.chip button` rules from TagEditor's `<style>` and add a rule targeting the trailing button:

```css
  .tag-editor :global(.chip button) { background: none; border: none; cursor: pointer; color: var(--color-text-muted); font: inherit; }
```

- [ ] **Step 10: Run the TagEditor + library tests**

Run from `apps/web/`: `npm run test -- src/lib/components/TagEditor.test.ts src/routes/library/page.test.ts src/routes/library/tag-filter.test.ts`
Expected: PASS — TagEditor still emits add/remove (the `remove ml` button label is preserved); library tests unaffected.

- [ ] **Step 11: Verify in the running app**

Tags, tag-rail, collection chips, and reader tag-editor chips now share one visual. Selected tag-rail chip still shows the accent fill.

Expected: visually unified chips; no duplicate-looking variants.

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/lib/components/ui/Chip.svelte apps/web/src/lib/components/ui/chip.test.ts apps/web/src/lib/components/ui/Tag.svelte apps/web/src/lib/components/TagEditor.svelte apps/web/src/routes/library/+page.svelte
git commit -m "refactor(web): extract shared Chip primitive and unify chip styles"
```

---

## Task 7: Focus-visible sweep (C7)

Adds a tokenized focus ring and applies it to every interactive element currently missing one.

**Files:**
- Modify: `apps/web/src/lib/styles/tokens.css` (focus-ring token)
- Modify: `apps/web/src/lib/components/ArticleCard.svelte`, `apps/web/src/routes/library/+page.svelte`, `apps/web/src/lib/components/HighlightsSidebar.svelte`, `apps/web/src/routes/search/+page.svelte`

**Interfaces:**
- Produces: a documented focus pattern — `outline: 2px solid var(--color-ring); outline-offset: 2px;` applied on `:focus-visible`. (Same values already used by `Button`/`Input`/`TopBar`, so this is consistency, not new design.)

- [ ] **Step 1: Add focus-ring tokens (optional convenience)**

In `apps/web/src/lib/styles/tokens.css`, in the lines & focus semantic block (~line 150, after `--color-ring`), add:

```css
  --focus-ring-width:  2px;
  --focus-ring-offset: 2px;
```

- [ ] **Step 2: Apply focus styles to the missing controls**

Add a `:focus-visible` rule using the existing ring color to each control below. The block to add (adapt the selector per file):

```css
  :focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
```

Apply to:
- `ArticleCard.svelte` — `.delete-btn:focus-visible`
- `library/+page.svelte` — `.action-btn:focus-visible`, `.tag-chip:focus-visible`, `.collection-chip:focus-visible`
- `HighlightsSidebar.svelte` — `.quote:focus-visible`, `.del:focus-visible`
- `search/+page.svelte` — `.result:focus-visible`

(Write each as its own selector, e.g. in `ArticleCard.svelte` add `.delete-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }`.)

- [ ] **Step 3: Verify in the running app (keyboard)**

Tab through `/library` and a reader page. Every interactive element — card delete, collection rename/delete, tag chips, collection chips, highlight quote/delete, search result links — shows a visible terracotta focus ring.

Expected: no focusable control is unringed.

- [ ] **Step 4: Typecheck**

Run from `apps/web/`: `npm run check`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/styles/tokens.css apps/web/src/lib/components/ArticleCard.svelte apps/web/src/routes/library/+page.svelte apps/web/src/lib/components/HighlightsSidebar.svelte apps/web/src/routes/search/+page.svelte
git commit -m "fix(web): add focus-visible rings to all interactive controls"
```

---

## Task 8: Reader layout — shell vs. measure + highlights rail (D1a, D1b, D1c)

Separates the reader *shell width* from the *text measure* (so prose isn't double-capped and padded down), gives the toolbar room, and places the highlights "sidebar" as an actual side rail on wide viewports (stacking below on narrow).

**Files:**
- Modify: `apps/web/src/routes/read/[id]/+page.svelte`

**Interfaces:**
- Consumes: `--reading-measure` (reader token, drives the *text* column only).
- Produces: a `.reader-layout` CSS grid (prose column + highlights rail at ≥1024px; single column below); the prose column owns the measure; the shell is wider than the measure.

- [ ] **Step 1: Decouple shell width from text measure**

In `apps/web/src/routes/read/[id]/+page.svelte` `<style>`, change `.reader-shell` so the shell is wider than the prose measure (the prose element keeps the measure):

```css
  .reader-shell { max-width: var(--width-prose); margin: 0 auto; }
```

Keep `.reader` capped at the measure but account for its own padding so the *text* width matches the intended measure:

```css
  .reader {
    background: var(--reading-bg); color: var(--reading-text);
    font-family: var(--reading-font); font-size: var(--reading-size);
    line-height: var(--reading-leading);
    max-width: calc(var(--reading-measure) + 2 * 1.5rem);
    margin: 0 auto; padding: 1.5rem; border-radius: var(--radius-lg);
  }
```

(`box-sizing: border-box` from Task 1 makes the `calc` exact: content width = measure.)

- [ ] **Step 2: Place the highlights rail beside the prose on wide viewports**

Currently `HighlightsSidebar` renders at page root, below everything. Move it into a 2-column grid with the reader content. Wrap the reader article + sections and the sidebar in a layout grid.

Replace the `{:else}` content block (the `<article>` + tag/collection sections) so it lives in a `.reader-layout` grid alongside the sidebar. Change the markup region (~lines 262–290) to:

```svelte
  {#if !content}
    <Spinner label="loading article" />
  {:else}
    <div class="reader-layout">
      <div class="reader-main">
        <article data-theme={activeTheme} class="reader" onmouseup={onMouseUp}>
          <h1>{content.title}</h1>
          <div bind:this={bodyEl}>
            {@html content.content_html}
          </div>
        </article>
        <div class="tag-section">
          <TagEditor tags={manualTags.map(t => ({ id: t.id, name: t.name }))} onadd={addTag} onremove={removeTag} />
        </div>
        <div class="collection-section">
          <AddToCollection {collections} onadd={addToCollection} oncreate={createCollection} />
        </div>
      </div>
      <HighlightsSidebar {highlights} {orphans} onjump={jumpTo} ondelete={deleteHighlight} />
    </div>
  {/if}
```

Remove the now-duplicated root-level `{#if content}<HighlightsSidebar … />{/if}` block (~lines 288–290), since the sidebar now lives inside `.reader-layout`.

- [ ] **Step 3: Add the layout styles**

In `<style>`, add:

```css
  .reader-layout { display: grid; grid-template-columns: 1fr; gap: var(--space-5); }
  @media (min-width: 1024px) {
    .reader-layout { grid-template-columns: minmax(0, 1fr) 16rem; align-items: start; }
    .reader-layout :global(.hl-sidebar) { position: sticky; top: var(--space-4); }
  }
```

Widen `.reader-shell` to fit the two columns on wide screens (override the Step 1 cap inside the breakpoint):

```css
  @media (min-width: 1024px) {
    .reader-shell { max-width: var(--width-page); }
  }
```

(Place this alongside the other `@media (min-width: 1024px)` block or merge them.)

- [ ] **Step 4: Confirm the reader page test still passes**

Run from `apps/web/`: `npm run test -- src/routes/read/\[id\]/page.test.ts`
Expected: PASS — the sidebar still renders when content is present (now nested in `.reader-layout`); assertions query by role/text, not by DOM position.

- [ ] **Step 5: Verify in the running app**

Open an article with at least one highlight, on a wide window (≥1024px): the article reads at a comfortable measure (not cramped), the toolbar has room, and highlights sit in a sticky right rail beside the text. Narrow the window below 1024px: the rail drops below the article. Change the width pref (narrow/normal/wide) — the *text* measure responds.

Expected: roomy reading column; real side rail on desktop; graceful stack on narrow.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/read/\[id\]/+page.svelte
git commit -m "fix(web): decouple reader shell from text measure and add highlights rail"
```

---

## Task 9: Responsive pass — TopBar (E1)

Adds the first real breakpoint behavior so the top bar doesn't overflow on narrow screens. (Reader-toolbar responsiveness is largely handled by Task 8's grid + the existing `flex-wrap` on controls.)

**Files:**
- Modify: `apps/web/src/lib/components/TopBar.svelte`

**Interfaces:**
- Produces: the TopBar wraps/reflows below ~640px instead of overflowing; search input goes full-width on its own row; nav + actions stay reachable.

- [ ] **Step 1: Allow the bar to wrap and the search to reflow**

In `apps/web/src/lib/components/TopBar.svelte` `<style>`, update `.topbar` and add a breakpoint:

```css
  .topbar {
    display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
    padding: 0.75rem 1.25rem;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }
  @media (max-width: 640px) {
    .topbar { gap: 0.6rem; }
    .search { order: 3; flex-basis: 100%; max-width: none; }
    .right { gap: 0.6rem; }
  }
```

- [ ] **Step 2: Verify in the running app**

Resize the window from wide to ~375px. The brand, nav, search, theme switch, and sign-out all remain visible and usable; below ~640px the search bar drops to its own full-width row; nothing overflows horizontally or gets clipped.

Expected: no horizontal scroll; all controls reachable at mobile widths.

- [ ] **Step 3: Typecheck**

Run from `apps/web/`: `npm run check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/TopBar.svelte
git commit -m "fix(web): make the top bar responsive on narrow viewports"
```

---

## Final verification

- [ ] **Run the full web test suite**

Run from `apps/web/`: `npm run test`
Expected: all suites PASS (no regressions from the chip/label/reader refactors).

- [ ] **Typecheck the package**

Run from `apps/web/`: `npm run check`
Expected: no errors.

- [ ] **Walkthrough in the running app**

Sign in; confirm against the findings: (A1) full-bleed background; (C1/C2) tidy cards, no URL overflow on a queued long link; (D2a) unified chips; (C7) visible focus rings via keyboard; (D1) roomy reader with a real highlights rail; (E1) usable TopBar at 375px. Light, dark, and sepia themes all hold (tokens-only changes).

---

## Out of scope (deferred to Track 2 — Phase 3 polish)

Per findings §F: Bits UI seam (`B`, `C6`, `C8`), icons (`G3`), materiality/motion (`G1`, `G2`), type/color/feedback polish (`G4`, `G5`), signature moments (`G6`, `G7`), reveal-animation rework (`A4`), card hover affordance (`E2`, a hover-lift is new visual design), collections-management and search-card visual polish (`D2b`, `D5`). These get their own plan after Track 1 lands.
