# UI Polish & Tighten Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the existing warm-paper design language and fix specific UX rough edges — quiet the chrome (Fredoka → wordmark only, IBM Plex Sans everywhere else), make spacing/type consistent, add wide-screen rails, make article cards clickable, and rework the reader-detail and collections UX.

**Architecture:** Frontend-only changes in `apps/web` (SvelteKit + Svelte 5 runes). CSS is token-driven (`tokens.css` is the single source of truth); components reference semantic tokens only. Layout uses CSS grid with a `@media (min-width: 1024px)` breakpoint. A shared `Rail` primitive backs both the reader side-rail and the library sidebar. No backend, worker, or schema changes.

**Tech Stack:** SvelteKit, Svelte 5 (`$props`/`$state`/`$derived`), Vitest + `@testing-library/svelte`, `@lucide/svelte` icons, self-hosted woff2 fonts, PocketBase JS SDK (client only, unchanged).

## Global Constraints

- **Fredoka (`--font-display`) is referenced by the `readmepls` wordmark ONLY.** Everything else uses `--font-ui` (IBM Plex Sans). Verify with grep at the end.
- **Palette values AND usage unchanged.** No color token edits, no accent re-tinting.
- **Radii, shadows, and motion unchanged.** No restraint dial-back.
- **No hardcoded colors or font names in components** — reference tokens (per CLAUDE.md).
- **Never invent new spacing values** — snap hardcoded rems to existing `--space-*` tokens (4px scale) or the nearest existing `--text-*`/`--radius-*`.
- **Lowercase playful voice** in all UI copy.
- **Preserve these accessible names** (tests + a11y depend on them): `aria-label="delete article"`, the confirm-dialog buttons `delete` / `cancel`, `decrease text size` / `increase text size`, `search library`.
- **Preserve injection-safe `pb.filter(...)` bindings** exactly — never string-interpolate into filters.
- **TDD where behavior exists.** Presentational-only CSS tasks (fonts, spacing, layout placement) are **verification-driven**: change, then run build + the full existing Vitest suite + lint, and confirm green. Do not fake unit tests for pure CSS.
- **Commit after each task** with Conventional Commits (`feat:`/`fix:`/`refactor:`/`docs:`/`chore:`). Do not push or open a PR.
- **Test commands** (all run from the repo root). NOTE: `test` and `lint` are
  **root** scripts, not web-scoped; `build`/`check` are web-scoped. Wherever a
  per-task step below writes `pnpm --filter web test -- <path>` or
  `pnpm --filter web lint`, use these canonical commands instead:
  - Full suite: `pnpm test` (= `vitest run`, workspace-aware, includes apps/web)
  - Single test file: `pnpm exec vitest run <filename-fragment>` — use the test
    file's basename, e.g. `pnpm exec vitest run ArticleCard`,
    `pnpm exec vitest run rail.test`, `pnpm exec vitest run ReaderControls`.
  - Lint: `pnpm lint` (prettier --check + eslint)
  - Typecheck: `pnpm --filter web check` (svelte-check)
  - Build: `pnpm --filter web build`
  - `pnpm --filter web dev` is correct as written (dev IS a web script).

Spec: `docs/superpowers/specs/2026-07-01-ui-polish-tighten-design.md`.

---

### Task 1: IBM Plex Sans font foundation

Add the UI font, define `--font-ui`, and repoint every `--font-display` reference except the wordmark. Move the article `<h1>` to the reading font and the home hero to `--font-ui`. Purely presentational → **verification-driven**.

**Files:**
- Create: `apps/web/static/fonts/ibm-plex-sans-variable.woff2` (downloaded)
- Modify: `apps/web/src/lib/styles/tokens.css` (add `--font-ui`)
- Modify: `apps/web/src/lib/styles/fonts.css` (add `@font-face`, update header comment)
- Modify (repoint `var(--font-display)` → `var(--font-ui)`): `apps/web/src/lib/components/CaptureBar.svelte`, `apps/web/src/lib/components/ui/Chip.svelte`, `apps/web/src/lib/components/ui/ConfirmDialog.svelte`, `apps/web/src/lib/components/ui/Input.svelte`, `apps/web/src/lib/components/ui/Button.svelte`, `apps/web/src/lib/components/HighlightsSidebar.svelte`, `apps/web/src/routes/search/+page.svelte`, `apps/web/src/routes/login/+page.svelte`, `apps/web/src/routes/+page.svelte`, `apps/web/src/routes/collections/[slug]/+page.svelte`, `apps/web/src/routes/read/[id]/+page.svelte`, `apps/web/src/routes/library/+page.svelte`, `apps/web/src/routes/settings/connectors/+page.svelte`, `apps/web/src/lib/components/TopBar.svelte`
- **Exception:** `TopBar.svelte` `.brand` keeps `var(--font-display)`.

**Interfaces:**
- Produces: `--font-ui` semantic token, consumed by every later task's markup.

- [ ] **Step 1: Download the woff2**

```bash
curl -fSL \
  "https://cdn.jsdelivr.net/npm/@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2" \
  -o apps/web/static/fonts/ibm-plex-sans-variable.woff2
ls -l apps/web/static/fonts/ibm-plex-sans-variable.woff2
```
Expected: a non-empty file (tens of KB). If the URL 404s, get the equivalent latin variable woff2 from https://gwfh.mranftl.com/fonts/ibm-plex-sans (weights 400/500/600) and adjust the `@font-face` in Step 3 to static weights.

- [ ] **Step 2: Add the `--font-ui` token**

In `tokens.css`, under the `PRIMITIVES — type` block right after the `--font-mono` line, add:

```css
  --font-ui:      "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
```

- [ ] **Step 3: Add the `@font-face`**

In `fonts.css`, add before the IBM Plex Mono blocks:

```css
@font-face {
  font-family: "IBM Plex Sans";
  src: url("/fonts/ibm-plex-sans-variable.woff2") format("woff2");
  font-weight: 400 600;
  font-style: normal;
  font-display: swap;
}
```
Also update the header comment list to include `IBM Plex Sans — UI chrome (variable 400–600)`.

- [ ] **Step 4: Repoint components**

In every file in the "Modify (repoint …)" list, replace each `var(--font-display)` with `var(--font-ui)`. Then **re-open `TopBar.svelte` and restore `.brand` to `var(--font-display)`** (it must remain Fredoka — see its rule `.brand { font-family: var(--font-display); … }`).

- [ ] **Step 5: Special cases — article title & hero**

In `read/[id]/+page.svelte` style block, change the article heading rule:

```css
.reader :global(h1) { font-family: var(--font-reading); line-height: 1.15; }
```

In `+page.svelte` (home) style block, the hero already becomes `--font-ui` via Step 4 (it currently uses `--font-display`); confirm `.hero h1 { font-family: var(--font-ui); … }`.

- [ ] **Step 6: Verify wordmark is the only Fredoka reference**

```bash
grep -rn "var(--font-display)" apps/web/src
```
Expected: exactly ONE match — `TopBar.svelte` `.brand`. (The `--font-display:` *definition* line in `tokens.css` is a definition, not a `var(...)` use, so it won't match.) If any other match remains, repoint it.

- [ ] **Step 7: Build + full suite + lint**

```bash
pnpm --filter web build && pnpm --filter web test && pnpm --filter web lint
```
Expected: build succeeds, all existing tests PASS, lint clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/static/fonts/ibm-plex-sans-variable.woff2 apps/web/src/lib/styles apps/web/src
git commit -m "feat(web): quiet the chrome — Fredoka for the wordmark, IBM Plex Sans everywhere else"
```

---

### Task 2: Type-size & spacing consistency

Unify page-title/section-heading sizes and snap hardcoded rem paddings/gaps to the space scale. Presentational → **verification-driven**.

**Files:**
- Modify: `apps/web/src/lib/components/TopBar.svelte`, `apps/web/src/lib/components/ui/Card.svelte`, `apps/web/src/lib/components/ui/CardGrid.svelte`, `apps/web/src/routes/+page.svelte`, `apps/web/src/routes/library/+page.svelte`, `apps/web/src/routes/search/+page.svelte`, `apps/web/src/routes/collections/[slug]/+page.svelte`

**Interfaces:**
- Produces: consistent heading conventions consumed by later layout tasks.

- [ ] **Step 1: Standardize page titles**

Apply to each top-level page `h1` (`library`, `search`, `collections/[slug]`):

```css
h1 {
  font-family: var(--font-ui);
  font-size: var(--text-xl);
  font-weight: var(--weight-semibold);
  color: var(--color-text);
  margin: 0 0 var(--space-5);
}
```
(Replace the ad-hoc `1.6rem`, `--text-xl`+`margin-bottom`, etc. Keep each page's existing surrounding layout.)

- [ ] **Step 2: Standardize section headings**

Apply to section `h2` (home `.block h2`, library `.collections-heading`):

```css
/* section heading */
font-family: var(--font-ui);
font-size: var(--text-lg);
font-weight: var(--weight-medium);
color: var(--color-text-muted);
margin: 0 0 var(--space-4);
```

Home hero `h1` stays larger and marketing-flavored:

```css
.hero h1 { font-family: var(--font-ui); font-size: var(--text-2xl); color: var(--color-text); margin: 0 0 var(--space-5); }
.hero h1 span { color: var(--color-accent); }
```

- [ ] **Step 3: Snap hardcoded spacing to tokens**

Replace, at minimum:
- `TopBar.svelte`: `padding: 0.75rem 1.25rem` → `var(--space-3) var(--space-5)`; `gap: 1rem` → `var(--space-4)`; the `.right`/`nav` `gap: 1rem` → `var(--space-4)`.
- `Card.svelte`: `padding: 1.1rem 1.2rem` → `var(--space-4)`.
- `CardGrid.svelte`: `gap: 1rem` → `var(--space-4)`.
- `+page.svelte` (home): `.block { margin-top: 2.5rem }` → `var(--space-6)`; `.hero { padding: 2.5rem 0 2rem }` → `var(--space-6) 0`.

For any other bare rem gap/padding you touch in these files, map to the nearest `--space-*` (`0.25→1, 0.5→2, 0.75→3, 1→4, 1.5→5, 2→6, 3→7`). Do not change values that would visibly shift a layout without a matching token — if unsure, keep and note it.

- [ ] **Step 4: Verify**

```bash
pnpm --filter web build && pnpm --filter web test && pnpm --filter web lint
```
Expected: green. Eyeball the app (`pnpm --filter web dev`) — titles consistent, spacing even.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "refactor(web): unify heading sizes and snap spacing to the token scale"
```

---

### Task 3: Shared `Rail` primitive

A reusable sticky side-rail container used by the reader (Task 7) and library (Task 9), so the two read as one system.

**Files:**
- Create: `apps/web/src/lib/components/ui/Rail.svelte`
- Test: `apps/web/src/lib/components/ui/rail.test.ts`

**Interfaces:**
- Produces: `Rail` Svelte component. Props: `{ children: Snippet, label?: string }`. Renders `<aside class="rail" aria-label={label}>`; sticky at `top: var(--space-4)` when its grid column allows; token-driven internal padding/gap. Consumed by Task 7 and Task 9.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/components/ui/rail.test.ts
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import Rail from "./Rail.svelte";

const child = createRawSnippet(() => ({ render: () => `<p>rail content</p>` }));

describe("Rail", () => {
  it("renders children inside a labelled aside", () => {
    render(Rail, { children: child, label: "reading controls" });
    const region = screen.getByRole("complementary", { name: "reading controls" });
    expect(region).toBeInTheDocument();
    expect(screen.getByText("rail content")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- src/lib/components/ui/rail.test.ts`
Expected: FAIL — `Rail.svelte` does not exist.

- [ ] **Step 3: Implement `Rail.svelte`**

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  let { children, label }: { children: Snippet; label?: string } = $props();
</script>

<aside class="rail" aria-label={label}>{@render children()}</aside>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-width: 0;
  }
  @media (min-width: 1024px) {
    .rail { position: sticky; top: var(--space-4); align-self: start; }
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- src/lib/components/ui/rail.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/ui/Rail.svelte apps/web/src/lib/components/ui/rail.test.ts
git commit -m "feat(web): add shared sticky Rail primitive"
```

---

### Task 4: Clickable ArticleCard with hover-reveal delete

Whole card links to the article; remove the "read" button; delete reveals on hover/focus (stays in DOM for a11y + tests); retry unchanged.

**Files:**
- Modify: `apps/web/src/lib/components/ArticleCard.svelte`
- Modify (call sites — drop `onOpen`): `apps/web/src/routes/+page.svelte`, `apps/web/src/routes/library/+page.svelte`
- Test: `apps/web/src/lib/components/ArticleCard.test.ts`

**Interfaces:**
- Consumes: `Card` primitive, `deriveCardState` (unchanged).
- Produces: `ArticleCard` props become `{ article, onRetry?, onDelete? }` — **`onOpen` removed**; navigation is now an `<a href="/read/{article.id}">`.

- [ ] **Step 1: Update the failing tests**

In `ArticleCard.test.ts`, replace the "shows the title and tags" test and add link/no-read-button assertions:

```ts
it("links the whole card to the reader when ready", () => {
  render(ArticleCard, {
    article: article({ extract_status: "ok", title: "Hello", ai_tags_json: ["ai"] }),
  });
  const link = screen.getByRole("link", { name: /hello/i });
  expect(link).toHaveAttribute("href", "/read/a1");
  expect(screen.getByText("ai")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /read/i })).not.toBeInTheDocument();
});
```
Keep the processing, failed/retry, no-delete-without-handler, delete-confirm, and hostname tests as-is (delete stays in DOM, so `getByRole("button", { name: "delete article" })` still resolves).

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `pnpm --filter web test -- src/lib/components/ArticleCard.test.ts`
Expected: FAIL — currently there is a `read` button and no link.

- [ ] **Step 3: Implement the card**

Rewrite the ready-state block and remove `onOpen`/`BookOpen`. Use a link-overlay so the anchor covers the card while delete/retry stay clickable above it:

```svelte
<script lang="ts">
  import Card from "./ui/Card.svelte";
  import Tag from "./ui/Tag.svelte";
  import Button from "./ui/Button.svelte";
  import Spinner from "./ui/Spinner.svelte";
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
  import { RotateCw, Trash2 } from "@lucide/svelte";
  import { deriveCardState } from "$lib/article/card-state.js";

  let {
    article,
    onRetry,
    onDelete,
  }: {
    article: { id: string; url: string; expand?: { content?: any } };
    onRetry?: (id: string) => void;
    onDelete?: (id: string) => void;
  } = $props();

  let confirming = $state(false);
  const content = $derived(article.expand?.content ?? null);
  const state = $derived(deriveCardState(content));
  const tags = $derived<string[]>(content?.ai_tags_json ?? []);

  function hostOf(u: string): string {
    try { return new URL(u).hostname; } catch { return u; }
  }
</script>

<Card>
  {#if state === "processing"}
    <Spinner label="Processing" />
    <span class="url">{hostOf(article.url)}</span>
  {:else if state === "failed" || state === "partial"}
    <h3>{content?.title ?? article.url}</h3>
    <p data-state={state}>{content?.failure_reason ?? "extraction problem"}</p>
    <Button variant="accent" onclick={() => onRetry?.(article.id)}><RotateCw class="icon-sm" aria-hidden="true" /> retry</Button>
  {:else}
    <!-- link-overlay: anchor covers the card; its aria-label is the title so the
         link's accessible name is the article title, not generic "open" -->
    <a class="card-link" href={`/read/${article.id}`} aria-label={content?.title ?? article.url}></a>
    <h3>{content?.title ?? article.url}</h3>
    <div class="tags">
      {#each tags as t}<Tag>{t}</Tag>{/each}
    </div>
  {/if}

  {#if onDelete}
    <button class="delete-btn" onclick={() => (confirming = true)} aria-label="delete article"><Trash2 class="icon-sm" aria-hidden="true" /></button>
    <ConfirmDialog
      open={confirming}
      title="delete this article?"
      message="this can't be undone."
      onConfirm={() => { confirming = false; onDelete?.(article.id); }}
      onCancel={() => (confirming = false)}
    />
  {/if}
</Card>

<style>
  .card-link { position: absolute; inset: 0; z-index: 1; border-radius: inherit; }
  .card-link:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: 2px; }
  h3, .tags { position: relative; z-index: 2; pointer-events: none; } /* text/tags don't block the overlay */
  .delete-btn {
    position: relative; z-index: 3; align-self: flex-end;
    display: inline-flex; align-items: center;
    background: none; border: none; cursor: pointer; font: inherit;
    font-size: var(--text-sm); color: var(--color-text-muted); padding: var(--space-1) var(--space-2);
    opacity: 0; transition: opacity var(--dur-fast) var(--ease-out);
  }
  :global(.card):hover .delete-btn,
  :global(.card):focus-within .delete-btn { opacity: 1; }
  .delete-btn:hover { color: var(--color-accent); }
  .delete-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); opacity: 1; }
  @media (hover: none) { .delete-btn { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .delete-btn { transition: none; } }
  .url { overflow-wrap: anywhere; color: var(--color-text-muted); font-size: var(--text-sm); }
</style>
```
(If `--focus-ring-width`/`--focus-ring-offset` aren't defined globally, they're already used elsewhere in the repo — reuse the same tokens.)

- [ ] **Step 4: Update call sites**

In `+page.svelte` (home) and `library/+page.svelte`, remove the `onOpen={(id) => goto(...)}` prop from every `<ArticleCard … />`. In the home page you may drop the now-unused `goto` import if nothing else uses it (the library still uses `goto` elsewhere — check before removing).

- [ ] **Step 5: Run tests**

Run: `pnpm --filter web test -- src/lib/components/ArticleCard.test.ts`
Expected: PASS (all cases). Then run the home + library page suites:
`pnpm --filter web test -- src/routes/library/page.test.ts`
Expected: PASS (`delete article` + `delete` labels intact).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/ArticleCard.svelte apps/web/src/lib/components/ArticleCard.test.ts apps/web/src/routes/+page.svelte apps/web/src/routes/library/+page.svelte
git commit -m "feat(web): make article cards fully clickable, reveal delete on hover"
```

---

### Task 5: Nav hygiene — drop the redundant extract link

**Files:**
- Modify: `apps/web/src/lib/components/TopBar.svelte`
- Modify: `apps/web/src/routes/library/+page.svelte` (empty-state copy)
- Test: `apps/web/src/lib/components/topbar.test.ts` (new)

**Interfaces:**
- Produces: nav with a single `library` link; brand still routes to `/`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/components/topbar.test.ts
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import TopBar from "./TopBar.svelte";

describe("TopBar", () => {
  it("has a library link but no redundant extract link", () => {
    render(TopBar, { theme: "light", onTheme: () => {}, onSignOut: () => {} });
    expect(screen.getByRole("link", { name: /library/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /extract/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /readmepls/i })).toHaveAttribute("href", "/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- src/lib/components/topbar.test.ts`
Expected: FAIL — the `extract` link still renders.

- [ ] **Step 3: Remove the extract link**

In `TopBar.svelte`, delete the extract nav anchor and drop the now-unused `Sparkles` import:

```svelte
  <nav>
    <a href="/library"><Library class="icon-sm" aria-hidden="true" />library</a>
  </nav>
```

- [ ] **Step 4: Fix the library empty-state copy**

In `library/+page.svelte`:

```svelte
<p>nothing saved yet. paste a link on your <a href="/">home page</a> ☝</p>
```

- [ ] **Step 5: Run tests + lint**

Run: `pnpm --filter web test -- src/lib/components/topbar.test.ts && pnpm --filter web lint`
Expected: PASS, and lint clean (no unused `Sparkles`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/TopBar.svelte apps/web/src/lib/components/topbar.test.ts apps/web/src/routes/library/+page.svelte
git commit -m "refactor(web): drop redundant extract nav link, fix empty-state copy"
```

---

### Task 6: ReaderControls — drop the theme selector

Controls become size − / size + / font only. Theme lives in the header.

**Files:**
- Modify: `apps/web/src/lib/components/ReaderControls.svelte`
- Test: `apps/web/src/lib/components/ReaderControls.test.ts`

**Interfaces:**
- Produces: `ReaderControls` still `{ prefs, onChange? }`, emits `size`/`font` patches only. No `theme` buttons.

- [ ] **Step 1: Update the test (remove theme, keep size/font)**

Replace the theme test; keep the size + label tests:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ReaderControls from "./ReaderControls.svelte";

const prefs = { font: "sans", size: 18, lineHeight: 1.6, width: "normal", theme: "light" } as const;

describe("ReaderControls", () => {
  it("does not render theme buttons (theme lives in the header)", () => {
    render(ReaderControls, { prefs, onChange: vi.fn() });
    expect(screen.queryByRole("button", { name: /dark/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sepia/i })).not.toBeInTheDocument();
  });

  it("emits a larger size when increasing font size", async () => {
    const onChange = vi.fn();
    render(ReaderControls, { prefs, onChange });
    await fireEvent.click(screen.getByRole("button", { name: "increase text size" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ size: 19 }));
  });

  it("toggles the font family", async () => {
    const onChange = vi.fn();
    render(ReaderControls, { prefs, onChange });
    await fireEvent.click(screen.getByRole("button", { name: /serif|sans/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ font: "serif" }));
  });

  it("labels the size steppers for assistive tech", () => {
    render(ReaderControls, { prefs, onChange: vi.fn() });
    expect(screen.getByRole("button", { name: "decrease text size" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "increase text size" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- src/lib/components/ReaderControls.test.ts`
Expected: FAIL — theme buttons still present.

- [ ] **Step 3: Remove theme buttons + separator**

New `ReaderControls.svelte` body:

```svelte
<script lang="ts">
  import type { ReaderPrefs } from "@readmepls/types";
  import Button from "./ui/Button.svelte";
  import { AArrowDown, AArrowUp, Type } from "@lucide/svelte";

  let { prefs, onChange }: { prefs: ReaderPrefs; onChange?: (p: ReaderPrefs) => void } = $props();
  const emit = (patch: Partial<ReaderPrefs>) => onChange?.({ ...prefs, ...patch });
  const clampSize = (n: number) => Math.min(24, Math.max(14, n));
</script>

<div class="controls" role="group" aria-label="reading controls">
  <Button onclick={() => emit({ size: clampSize(prefs.size - 1) })}><AArrowDown class="icon-sm" aria-hidden="true" /><span class="sr-only">decrease text size</span></Button>
  <Button onclick={() => emit({ size: clampSize(prefs.size + 1) })}><AArrowUp class="icon-sm" aria-hidden="true" /><span class="sr-only">increase text size</span></Button>
  <Button onclick={() => emit({ font: prefs.font === "serif" ? "sans" : "serif" })}>
    <Type class="icon-sm" aria-hidden="true" /> {prefs.font === "serif" ? "sans" : "serif"}
  </Button>
</div>

<style>
  .controls {
    display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center;
  }
</style>
```
(The sticky-pill styling moves to the reader layout in Task 7; here the component is layout-agnostic.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- src/lib/components/ReaderControls.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/ReaderControls.svelte apps/web/src/lib/components/ReaderControls.test.ts
git commit -m "refactor(web): drop reader theme selector, header owns theme"
```

---

### Task 7: Reader detail layout rework

Three columns on wide (left rail: controls + tags + collections + grouped archive/delete · article · right rail: highlights). Remove the dog-ear. On narrow, actions sit **above** the article, not at the bottom. Presentational + markup move → **verification-driven**; the existing `page.test.ts` must stay green.

**Files:**
- Modify: `apps/web/src/routes/read/[id]/+page.svelte`
- Test (must stay green): `apps/web/src/routes/read/[id]/page.test.ts`

**Interfaces:**
- Consumes: `Rail` (Task 3), `ReaderControls` (Task 6, theme-free).

- [ ] **Step 1: Simplify `savePrefs` theme handling**

Theme is no longer emitted by `ReaderControls`, but `themeCtx` still syncs from the header. Leave `savePrefs` persisting `reader_prefs` (size/font/etc). Keep the `if (next.theme !== prefs.theme && themeCtx) themeCtx.set(next.theme);` guard — it's now effectively dead for theme but harmless and keeps the prefs object whole. (Do not remove `themeCtx`; the article still reads `activeTheme` from it.)

- [ ] **Step 2: Remove the dog-ear and restructure the bar**

Replace the `.bar` block: drop `<PaperCorner size={36} />` (and its import if unused elsewhere on the page — it is only used here, so remove the import). The bar becomes just the back link:

```svelte
  <div class="bar">
    <a class="back" href="/library"><ArrowLeft class="icon-sm" aria-hidden="true" /> library</a>
  </div>
```

- [ ] **Step 3: Build the left rail + article + right rail layout**

Replace the `.reader-layout` block. Move `ReaderControls`, the tag section, the collection section, and a **grouped archive/delete cluster** into a left `Rail`; keep the article centered; keep `HighlightsSidebar` as the right rail. Import `Rail`:

```svelte
  <script lang="ts">
    // …existing imports…
    import Rail from "$lib/components/ui/Rail.svelte";
    // remove: import PaperCorner … (no longer used)
  </script>

  …

  {#if !content}
    <Skeleton lines={8} />
  {:else}
    <div class="reader-layout">
      <Rail label="reading tools">
        <ReaderControls {prefs} onChange={savePrefs} />
        <TagEditor tags={manualTags.map(t => ({ id: t.id, name: t.name }))} onadd={addTag} onremove={removeTag} />
        <AddToCollection {collections} onadd={addToCollection} oncreate={createCollection} />
        <div class="article-actions" role="group" aria-label="article actions">
          <button class="action-icon" onclick={archive} aria-label="archive article"><Archive class="icon-md" aria-hidden="true" /></button>
          <button class="action-icon" onclick={() => (confirmingDelete = true)} aria-label="delete article"><Trash2 class="icon-md" aria-hidden="true" /></button>
        </div>
      </Rail>

      <div class="reader-main">
        <article data-theme={activeTheme} class="reader" onmouseup={onMouseUp}>
          <h1>{content.title}</h1>
          <div bind:this={bodyEl}>
            {@html content.content_html}
          </div>
        </article>
      </div>

      <HighlightsSidebar {highlights} {orphans} onjump={jumpTo} ondelete={deleteHighlight} />
    </div>
  {/if}
```
Notes:
- `archive` was a `<Button>`; it's now an `.action-icon` matching delete (grouped + standardized per spec §4.3). The `Button` import may become unused on this page — remove it if so.
- Keep `aria-label="delete article"` (test depends on it). `archive article` is new and fine.
- The old `.reader-delete` bare button is gone (folded into the cluster).

- [ ] **Step 4: Update the styles**

```css
  .bar { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); }
  .bar .back { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-ui); color: var(--color-text-muted); text-decoration: none; }
  .bar .back:hover { color: var(--color-text); }

  /* controls read as a pill inside the rail */
  .reader-layout :global(.controls) {
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface); border-radius: var(--radius-pill); box-shadow: var(--shadow-sm);
  }

  .article-actions { display: flex; gap: var(--space-2); }
  .action-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 2.25rem; height: 2.25rem; padding: 0;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-md); color: var(--color-text-muted); cursor: pointer;
    transition: color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
  }
  .action-icon:hover { color: var(--color-accent); box-shadow: var(--shadow-sm); }
  .action-icon:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  @media (prefers-reduced-motion: reduce) { .action-icon { transition: none; } }

  /* single-column by default: rail (controls+actions) above article, highlights below */
  .reader-layout { display: grid; grid-template-columns: 1fr; gap: var(--space-5); }
  @media (min-width: 1024px) {
    .reader-shell { max-width: var(--width-page); }
    .reader-layout { grid-template-columns: 14rem minmax(0, 1fr) 16rem; align-items: start; }
  }
```
Delete the old `.tag-section`/`.collection-section`/`.reader-delete` rules and the old `.reader-layout` sticky-hl-sidebar override (the `Rail` and `HighlightsSidebar` handle their own sticky at ≥1024px; verify the highlights sidebar still sticks — if it relied on the removed `.reader-layout :global(.hl-sidebar)` rule, re-add a `@media (min-width:1024px){ .reader-layout :global(.hl-sidebar){ position: sticky; top: var(--space-4);} }`).

- [ ] **Step 5: Verify the existing reader test stays green**

Run: `pnpm --filter web test -- src/routes/read/[id]/page.test.ts`
Expected: PASS — the delete flow (`delete article` → `delete`) and archive still work. If the test referenced the removed theme buttons or `PaperCorner`, update those assertions minimally to match the new structure (it should not — it exercises delete/archive, not theme UI).

- [ ] **Step 6: Full build + suite + lint, and eyeball**

```bash
pnpm --filter web build && pnpm --filter web test && pnpm --filter web lint
```
Run `pnpm --filter web dev`, open an article: confirm on wide screens the left rail (controls, tags, collections, archive/delete) and right highlights rail; no dog-ear; on a narrow window the rail content sits above the article and highlights below.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/read/[id]/+page.svelte apps/web/src/routes/read/[id]/page.test.ts
git commit -m "feat(web): reader detail — side rails, grouped actions, no dog-ear, controls up top on mobile"
```

---

### Task 8: CollectionsPanel — first-class nav list

Extract collections into a focused, testable component: folder-icon rows, whole-row link, hover-reveal rename/delete, expanding "+ new collection" input.

**Files:**
- Create: `apps/web/src/lib/components/CollectionsPanel.svelte`
- Test: `apps/web/src/lib/components/CollectionsPanel.test.ts`

**Interfaces:**
- Consumes: `Chip`? no — plain rows; `Input`, `Button` primitives; `@lucide/svelte` `Folder`, `Pencil`, `Trash2`, `Check`, `X`, `Plus`.
- Produces: `CollectionsPanel` component. Props:
  ```ts
  {
    collections: { id: string; name: string; slug: string }[];
    error?: string;                       // duplicate-name error text
    oncreate: (name: string) => void;
    onrename: (id: string, name: string) => void;
    ondelete: (id: string) => void;
  }
  ```
  Rows link to `/collections/{slug}`. The panel owns only *local UI* state (which row is renaming, the new-collection draft, whether the new-collection input is expanded); all persistence stays in the parent via the callbacks. Consumed by Task 9.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/components/CollectionsPanel.test.ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import CollectionsPanel from "./CollectionsPanel.svelte";

const cols = [{ id: "c1", name: "reading list", slug: "reading-list" }];

describe("CollectionsPanel", () => {
  it("renders each collection as a row linking to its page", () => {
    render(CollectionsPanel, { collections: cols, oncreate: vi.fn(), onrename: vi.fn(), ondelete: vi.fn() });
    const link = screen.getByRole("link", { name: /reading list/i });
    expect(link).toHaveAttribute("href", "/collections/reading-list");
  });

  it("creates a collection through the expanding input", async () => {
    const oncreate = vi.fn();
    render(CollectionsPanel, { collections: cols, oncreate, onrename: vi.fn(), ondelete: vi.fn() });
    await fireEvent.click(screen.getByRole("button", { name: /new collection/i }));
    const input = screen.getByLabelText(/new collection name/i);
    await fireEvent.input(input, { target: { value: "later reads" } });
    await fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(oncreate).toHaveBeenCalledWith("later reads");
  });

  it("renames a collection", async () => {
    const onrename = vi.fn();
    render(CollectionsPanel, { collections: cols, oncreate: vi.fn(), onrename, ondelete: vi.fn() });
    await fireEvent.click(screen.getByRole("button", { name: /rename reading list/i }));
    const input = screen.getByLabelText(/rename collection/i);
    await fireEvent.input(input, { target: { value: "to read" } });
    await fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onrename).toHaveBeenCalledWith("c1", "to read");
  });

  it("deletes a collection", async () => {
    const ondelete = vi.fn();
    render(CollectionsPanel, { collections: cols, oncreate: vi.fn(), onrename: vi.fn(), ondelete });
    await fireEvent.click(screen.getByRole("button", { name: /delete reading list/i }));
    expect(ondelete).toHaveBeenCalledWith("c1");
  });

  it("shows a duplicate-name error", () => {
    render(CollectionsPanel, { collections: cols, error: "a collection with that name already exists", oncreate: vi.fn(), onrename: vi.fn(), ondelete: vi.fn() });
    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- src/lib/components/CollectionsPanel.test.ts`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement `CollectionsPanel.svelte`**

```svelte
<script lang="ts">
  import Input from "./ui/Input.svelte";
  import Button from "./ui/Button.svelte";
  import { Folder, Pencil, Trash2, Check, X, Plus } from "@lucide/svelte";

  let {
    collections,
    error = "",
    oncreate,
    onrename,
    ondelete,
  }: {
    collections: { id: string; name: string; slug: string }[];
    error?: string;
    oncreate: (name: string) => void;
    onrename: (id: string, name: string) => void;
    ondelete: (id: string) => void;
  } = $props();

  let renameTarget = $state<string | null>(null);
  let renameDraft = $state("");
  let creating = $state(false);
  let draft = $state("");

  function startRename(id: string, name: string) { renameTarget = id; renameDraft = name; }
  function submitRename(e: SubmitEvent) {
    e.preventDefault();
    const name = renameDraft.trim();
    if (name) onrename(renameTarget!, name);
    renameTarget = null;
  }
  function submitCreate(e: SubmitEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    oncreate(name);
    draft = ""; creating = false;
  }
</script>

<section class="panel" aria-label="collections">
  <h2 class="panel-heading">collections</h2>
  <ul class="list">
    {#each collections as col (col.id)}
      <li class="row">
        {#if renameTarget === col.id}
          <form class="edit" onsubmit={submitRename}>
            <Input bind:value={renameDraft} placeholder="collection name" aria-label="rename collection" />
            <button type="submit" class="icon-btn" aria-label="save"><Check class="icon-sm" aria-hidden="true" /></button>
            <button type="button" class="icon-btn" aria-label="cancel" onclick={() => (renameTarget = null)}><X class="icon-sm" aria-hidden="true" /></button>
          </form>
        {:else}
          <a class="row-link" href={`/collections/${col.slug}`}>
            <Folder class="icon-sm folder" aria-hidden="true" />
            <span class="name">{col.name}</span>
          </a>
          <div class="row-actions">
            <button class="icon-btn" aria-label={`rename ${col.name}`} onclick={() => startRename(col.id, col.name)}><Pencil class="icon-sm" aria-hidden="true" /></button>
            <button class="icon-btn danger" aria-label={`delete ${col.name}`} onclick={() => ondelete(col.id)}><Trash2 class="icon-sm" aria-hidden="true" /></button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  {#if creating}
    <form class="create" onsubmit={submitCreate}>
      <Input bind:value={draft} placeholder="new collection…" aria-label="new collection name" />
      <Button type="submit"><Plus class="icon-sm" aria-hidden="true" /> create</Button>
    </form>
  {:else}
    <button class="new-btn" onclick={() => (creating = true)}><Plus class="icon-sm" aria-hidden="true" /> new collection</button>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  .panel { display: flex; flex-direction: column; gap: var(--space-2); }
  .panel-heading { font-family: var(--font-ui); font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--color-text-muted); margin: 0 0 var(--space-2); }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); border-radius: var(--radius-sm); }
  .row-link { display: inline-flex; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; padding: var(--space-2); text-decoration: none; color: var(--color-text); font-family: var(--font-ui); font-size: var(--text-sm); border-radius: var(--radius-sm); }
  .row-link:hover { background: var(--color-surface-sunken); }
  .row-link:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .row-link :global(.folder) { color: var(--color-text-subtle); flex: none; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-actions { display: flex; gap: var(--space-1); opacity: 0; transition: opacity var(--dur-fast) var(--ease-out); }
  .row:hover .row-actions, .row:focus-within .row-actions { opacity: 1; }
  @media (hover: none) { .row-actions { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .row-actions { transition: none; } }
  .icon-btn { display: inline-flex; align-items: center; background: none; border: none; cursor: pointer; color: var(--color-text-muted); padding: var(--space-1); border-radius: var(--radius-xs); }
  .icon-btn:hover { color: var(--color-text); }
  .icon-btn.danger:hover { color: var(--color-accent); }
  .icon-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .edit, .create { display: flex; align-items: center; gap: var(--space-1); flex: 1; }
  .new-btn { display: inline-flex; align-items: center; gap: var(--space-1); background: none; border: none; cursor: pointer; font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-accent); padding: var(--space-2); }
  .new-btn:hover { color: var(--color-accent-hover); }
  .new-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .error { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--color-accent); }
</style>
```
(`Input` must forward `aria-label`. Confirm `Input.svelte` passes arbitrary attrs; the current `Input.svelte` does **not** spread `...rest`. If `getByLabelText` fails, add `aria-label` support to `Input` — see Step 4.)

- [ ] **Step 4: If needed, let `Input` accept `aria-label`**

If the create/rename tests can't find inputs by label, extend `Input.svelte` to accept and forward an `aria-label`:

```svelte
<script lang="ts">
  let {
    value = $bindable(""), placeholder = "", type = "text", oninput,
    "aria-label": ariaLabel,
  }: { value?: string; placeholder?: string; type?: string; oninput?: (e: Event) => void; "aria-label"?: string } = $props();
</script>

<input {type} {placeholder} bind:value {oninput} aria-label={ariaLabel} />
```
(Keep the existing `<style>`. Update `primitives.test.ts` only if it asserts prop shape — it likely doesn't.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter web test -- src/lib/components/CollectionsPanel.test.ts`
Expected: PASS (all five cases).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/CollectionsPanel.svelte apps/web/src/lib/components/CollectionsPanel.test.ts apps/web/src/lib/components/ui/Input.svelte
git commit -m "feat(web): first-class collections panel with folder rows and expanding create"
```

---

### Task 9: Library sidebar layout

Wire the tag filter + `CollectionsPanel` into a left `Rail` on wide screens; grid on the right. Keep the existing library tests green (delete flow, tag filter).

**Files:**
- Modify: `apps/web/src/routes/library/+page.svelte`
- Test (must stay green): `apps/web/src/routes/library/page.test.ts`, `apps/web/src/routes/library/tag-filter.test.ts`

**Interfaces:**
- Consumes: `Rail` (Task 3), `CollectionsPanel` (Task 8).

- [ ] **Step 1: Swap collections markup for `CollectionsPanel`**

In `library/+page.svelte`, remove the entire inline `<section class="collections-section">…</section>` and its collections-specific styles, plus the now-unused `Chip`, `Pencil`, `Check`, `X`, `Plus` imports and the `renameTarget`/`renameDraft`/`startRename`/`submitRename` local state (that logic now lives in `CollectionsPanel`). Keep `createCollection`, `deleteCollection`, `collectionError`, `loadCollections`, `slugify`, and `ClientResponseError`.

Adapt the callbacks to the panel's prop shape (which passes plain names, not events):

```svelte
<script lang="ts">
  // …existing imports minus the removed icons/Chip…
  import Rail from "$lib/components/ui/Rail.svelte";
  import CollectionsPanel from "$lib/components/CollectionsPanel.svelte";

  // replace createCollection(e: SubmitEvent) with a name-taking version:
  async function createCollection(name: string) {
    const uid = pb.authStore.model?.id;
    if (!uid) return;
    const slug = slugify(name);
    collectionError = "";
    try {
      await pb.collection("collections").create({ user: uid, name, slug, parent: "", order: 0 });
      await loadCollections();
    } catch (err) {
      if (!(err instanceof ClientResponseError)) throw err;
      collectionError = "a collection with that name already exists";
    }
  }

  async function renameCollection(id: string, name: string) {
    await pb.collection("collections").update(id, { name, slug: slugify(name) });
    await loadCollections();
  }
  // deleteCollection(id) stays as-is
</script>
```

- [ ] **Step 2: Restructure the page into sidebar + grid**

Wrap the tag rail + collections in a `Rail`, and the grid in a main column:

```svelte
<h1>your library</h1>

{#if articleError}<p class="article-error" role="alert">{articleError}</p>{/if}

<div class="library-layout">
  <Rail label="filters and collections">
    {#if tags.length > 0}
      <nav class="tag-rail" aria-label="Filter by tag">
        <button class="tag-chip" class:selected={selectedTag === null} onclick={() => selectTag(null)} aria-pressed={selectedTag === null}><Tag>all</Tag></button>
        {#each tags as t (t.id)}
          <button class="tag-chip" class:selected={selectedTag === t.id} onclick={() => selectTag(t.id)} aria-pressed={selectedTag === t.id}><Tag>{t.name}</Tag></button>
        {/each}
      </nav>
    {/if}
    <CollectionsPanel
      {collections}
      error={collectionError}
      oncreate={createCollection}
      onrename={renameCollection}
      ondelete={deleteCollection}
    />
  </Rail>

  <div class="library-main">
    {#if loading}
      <CardGrid>{#each Array(6) as _}<Card><Skeleton lines={3} /></Card>{/each}</CardGrid>
    {:else if articles.length === 0}
      <div class="empty">
        <PaperCorner />
        <p>nothing saved yet. paste a link on your <a href="/">home page</a> ☝</p>
      </div>
    {:else}
      <CardGrid>
        {#each visible as a, i (a.id)}
          <div use:reveal={{ delay: Math.min(i, 8) * 40 }}>
            <ArticleCard article={a} onDelete={handleDelete} />
          </div>
        {/each}
      </CardGrid>
    {/if}
  </div>
</div>
```
(Note the `ArticleCard` no longer takes `onOpen` — already handled in Task 4. Keep `use:reveal`.)

- [ ] **Step 3: Layout styles**

```css
  .library-layout { display: grid; grid-template-columns: 1fr; gap: var(--space-5); }
  @media (min-width: 1024px) {
    .library-layout { grid-template-columns: 16rem minmax(0, 1fr); align-items: start; }
  }
```
Keep the existing `.tag-rail`/`.tag-chip`/`.empty`/`.article-error` styles; delete the removed `.collections-*`/`.rename-*`/`.new-collection-*`/`.action-btn`/`.collection-error` rules (now in `CollectionsPanel`). On narrow, the single-column grid naturally puts filters/collections above the grid — acceptable per spec.

- [ ] **Step 4: Keep existing library tests green**

Run: `pnpm --filter web test -- src/routes/library/page.test.ts src/routes/library/tag-filter.test.ts`
Expected: PASS. The delete test still finds `delete article` (on the card) and `delete` (confirm); the tag-filter test still finds the `all`/tag buttons. If `tag-filter.test.ts` asserts DOM order that changed, adjust the query minimally (prefer role/name queries over positional ones).

- [ ] **Step 5: Full build + suite + lint + eyeball**

```bash
pnpm --filter web build && pnpm --filter web test && pnpm --filter web lint
```
`pnpm --filter web dev` → `/library`: wide screen shows a left sidebar (tags + first-class collections) beside the grid; collections are folder rows with hover actions and an expanding "new collection"; narrow stacks them above the grid.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/library/+page.svelte
git commit -m "feat(web): library sidebar — tag filter and collections rail beside the grid"
```

---

### Task 10: Final polish sweep + full verification

Normalize alignment/spacing on the remaining shared primitives and confirm the whole suite + build + lint are green and the Fredoka-only constraint holds.

**Files:**
- Modify (as needed): `apps/web/src/lib/components/ui/Button.svelte`, `apps/web/src/lib/components/ui/Chip.svelte`, `apps/web/src/lib/components/CaptureBar.svelte`, `apps/web/src/routes/search/+page.svelte`

- [ ] **Step 1: Normalize remaining hardcoded spacing**

In the four files, snap any remaining bare-rem `gap`/`padding`/`margin` to `--space-*` (per Task 2 mapping). Examples: `CaptureBar` `form { gap: 0.6rem }` → `var(--space-2)`, `margin-top: 0.5rem` → `var(--space-2)`; `Button` `padding: 0.5rem 1.1rem` → `var(--space-2) var(--space-4)` (verify the pill still looks right — adjust to `var(--space-2) var(--space-5)` if it reads cramped); search `.result` paddings already use tokens — leave. Do not alter radii/shadows/motion.

- [ ] **Step 2: Verify the Fredoka-only invariant again**

```bash
grep -rn "var(--font-display)" apps/web/src
```
Expected: exactly one match — `TopBar.svelte` `.brand`.

- [ ] **Step 3: Full verification**

```bash
pnpm --filter web build && pnpm --filter web test && pnpm --filter web lint
```
Expected: build succeeds, **all** tests PASS, lint clean. Read the output — do not claim success without seeing it.

- [ ] **Step 4: Manual smoke (dev server)**

`pnpm --filter web dev`, then check each surface: home (hero in Plex Sans, wordmark in Fredoka, no extract nav link, cards clickable + hover-delete), library (sidebar, folder-row collections, expanding create), reader (side rails, grouped archive/delete, no dog-ear, no theme buttons, header theme still works and retones the article), search results, login. Toggle a narrow window to confirm nothing is buried at the bottom.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "refactor(web): final spacing/alignment normalization across shared primitives"
```

---

## Notes for the implementer

- **Runner:** confirm `pnpm --filter web …` is correct before Task 1 (check root + `apps/web` `package.json`). If the repo uses plain `npm`/`vitest` directly, substitute consistently throughout.
- **Svelte 5 runes:** components use `$props`/`$state`/`$derived`. Follow the existing style; don't reintroduce Svelte 4 patterns.
- **jsdom can't compute fonts** — font correctness is verified by grep + build + manual smoke, not unit assertions. That's intentional, not a skipped test.
- **Do not** touch PocketBase rules, migrations, the worker, or `@readmepls/core`/`types`. This pass is presentational + client-only.
- **TDD discipline:** Tasks 3, 4, 5, 6, 8 are test-first. Tasks 1, 2, 7, 9, 10 are presentational/layout — verification-driven, but every existing test named in them must stay green.
