# Collections Surface on the Desktop Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote collection create + browse to an always-present section at the top of the library on desktop, decoupled from the filter drawer, leaving mobile behavior unchanged.

**Architecture:** A single new presentational component `LibraryCollections.svelte` owns the library's collection surface — one tile list (no DOM duplication), switched between a desktop section (header + create + wrapping tile grid) and the current mobile horizontal strip purely by a 640px CSS media query. `library/+page.svelte` swaps its inline strip for this component. `CollectionsPanel.svelte` (in the drawer) hides only its create control on desktop; rename/delete and the filter chips stay.

**Tech Stack:** SvelteKit (Svelte 5 runes), Tailwind v4 + shadcn-svelte, PocketBase, Vitest + @testing-library/svelte.

## Global Constraints

- **Breakpoint is 640px**, reusing the existing `BottomNav` boundary (`@media (max-width: 640px)` = mobile). Desktop = `>640px`. Do not introduce a new breakpoint.
- **Reuse existing primitives:** `CollectionFolder`, `Input`, `Button`. No hand-rolled equivalents.
- **Token-driven.** No hardcoded colors/fonts — reference `--color-*`, `--font-ui`, `--space-*`, `--color-accent`, `--color-danger`, focus-ring tokens.
- **Mobile-first.** Tap targets ≥44px; no horizontal page overflow (mobile strip scrolls in its own container).
- **TDD.** Failing test first, then implementation. Run tests and read output before claiming pass.
- **jsdom ignores CSS media queries** — the desktop/mobile visual toggle cannot be asserted in unit tests; it is a manual/visual check (Task 4). Unit tests cover structure + behavior only, which are viewport-independent.
- **Test runner:** whole workspace `pnpm test`; subset `pnpm exec vitest run <pattern>`. `pnpm --filter <pkg> test` does NOT work here.
- **Conventional Commits**, one logical change per commit. End each commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `apps/web/src/lib/components/LibraryCollections.svelte` — new; the library's collection surface (header + tiles + create; responsive).
- `apps/web/src/lib/components/librarycollections.test.ts` — new; unit tests.
- `apps/web/src/routes/library/+page.svelte` — replace inline strip block + `.folder-strip` CSS with `<LibraryCollections>`; move the `CollectionFolder` import out.
- `apps/web/src/routes/library/page.test.ts` — update the two strip tests for the always-present section.
- `apps/web/src/lib/components/CollectionsPanel.svelte` — hide the create control on desktop via a wrapper + media query.

---

## Task 1: LibraryCollections component

**Files:**
- Create: `apps/web/src/lib/components/LibraryCollections.svelte`
- Create: `apps/web/src/lib/components/librarycollections.test.ts`

**Interfaces:**
- Consumes: `CollectionFolder` (`./ui/CollectionFolder.svelte`, props `{ name, slug, count }`), `Input` (`./ui/Input.svelte`, `bind:value`, `aria-label`, `placeholder`), `Button` (`./ui/Button.svelte`, `type`).
- Produces: `LibraryCollections` with props
  `{ collections: { id: string; name: string; slug: string; count: number }[]; error?: string; onCreate: (name: string) => void }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/components/librarycollections.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import LibraryCollections from "./LibraryCollections.svelte";

const cols = [
  { id: "c1", name: "recipes", slug: "recipes", count: 12 },
  { id: "c2", name: "work", slug: "work", count: 0 },
];

describe("LibraryCollections", () => {
  it("always renders the collections heading, even when empty", () => {
    render(LibraryCollections, { collections: [], onCreate: vi.fn() });
    expect(screen.getByRole("heading", { name: /collections/i })).toBeInTheDocument();
  });

  it("renders a folder tile per collection linking to its page with count", () => {
    render(LibraryCollections, { collections: cols, onCreate: vi.fn() });
    expect(screen.getByRole("link", { name: /recipes/i })).toHaveAttribute("href", "/collections/recipes");
    expect(screen.getByRole("link", { name: /work/i })).toHaveAttribute("href", "/collections/work");
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("reveals the input and creates a collection with a trimmed name", async () => {
    const onCreate = vi.fn();
    render(LibraryCollections, { collections: cols, onCreate });
    await fireEvent.click(screen.getByRole("button", { name: /new collection/i }));
    const input = screen.getByLabelText(/new collection name/i);
    await fireEvent.input(input, { target: { value: "  travel  " } });
    await fireEvent.submit(input.closest("form")!);
    expect(onCreate).toHaveBeenCalledWith("travel");
  });

  it("does not create on a blank name", async () => {
    const onCreate = vi.fn();
    render(LibraryCollections, { collections: cols, onCreate });
    await fireEvent.click(screen.getByRole("button", { name: /new collection/i }));
    const input = screen.getByLabelText(/new collection name/i);
    await fireEvent.submit(input.closest("form")!);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows an empty-state hint and no tile links with no collections", () => {
    render(LibraryCollections, { collections: [], onCreate: vi.fn() });
    expect(screen.getByText(/no collections yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("surfaces a create error", () => {
    render(LibraryCollections, {
      collections: cols,
      error: "a collection with that name already exists",
      onCreate: vi.fn(),
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run librarycollections`
Expected: FAIL — cannot resolve `./LibraryCollections.svelte`.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/lib/components/LibraryCollections.svelte`:

```svelte
<script lang="ts">
  import Input from "./ui/Input.svelte";
  import Button from "./ui/Button.svelte";
  import CollectionFolder from "./ui/CollectionFolder.svelte";
  import { Plus } from "@lucide/svelte";

  let {
    collections,
    error = "",
    onCreate,
  }: {
    collections: { id: string; name: string; slug: string; count: number }[];
    error?: string;
    onCreate: (name: string) => void;
  } = $props();

  let creating = $state(false);
  let draft = $state("");

  function submitCreate(e: SubmitEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    onCreate(name);
    draft = "";
    creating = false;
  }
</script>

<section class="collections" aria-label="collections">
  <h2 class="heading">collections</h2>

  {#if collections.length}
    <nav class="tiles" aria-label="your collections">
      {#each collections as c (c.id)}
        <CollectionFolder name={c.name} slug={c.slug} count={c.count} />
      {/each}
    </nav>
  {:else}
    <p class="empty-hint">no collections yet — group articles into folders to find them fast.</p>
  {/if}

  <div class="create">
    {#if creating}
      <form class="create-form" onsubmit={submitCreate}>
        <Input bind:value={draft} placeholder="new collection…" aria-label="new collection name" />
        <Button type="submit"><Plus class="icon-sm" aria-hidden="true" /> create</Button>
      </form>
    {:else}
      <button class="new-btn" onclick={() => (creating = true)}>
        <Plus class="icon-sm" aria-hidden="true" /> new collection
      </button>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
</section>

<style>
  .collections { margin: 0 0 var(--space-4); }
  .heading { font-family: var(--font-ui); font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--color-text-muted); margin: 0 0 var(--space-2); }
  .tiles { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0 0 var(--space-2); }
  .empty-hint { color: var(--color-text-muted); font-family: var(--font-ui); font-size: var(--text-sm); margin: 0 0 var(--space-2); }
  .create { display: flex; flex-direction: column; gap: var(--space-1); }
  .create-form { display: flex; align-items: center; gap: var(--space-1); }
  .new-btn { display: inline-flex; align-items: center; gap: var(--space-1); align-self: flex-start; background: none; border: none; cursor: pointer; font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-accent); padding: var(--space-2); }
  .new-btn:hover { color: var(--color-accent-hover); }
  .new-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  .error { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--color-danger); }

  /* Mobile (≤640px): current strip behavior. Hide header + create + empty hint;
     tiles become a horizontal scroll strip; collapse to no footprint when empty. */
  @media (max-width: 640px) {
    .collections { margin: 0; }
    .heading, .create, .empty-hint { display: none; }
    .tiles { flex-wrap: nowrap; overflow-x: auto; margin: 0 0 var(--space-3); padding-bottom: var(--space-2); scrollbar-width: thin; }
    .tiles > :global(*) { flex: none; }
  }
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run librarycollections`
Expected: PASS (all six cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/LibraryCollections.svelte apps/web/src/lib/components/librarycollections.test.ts
git commit -m "feat(web): add LibraryCollections surface component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Wire LibraryCollections into the library page

**Files:**
- Modify: `apps/web/src/routes/library/+page.svelte`
- Test: `apps/web/src/routes/library/page.test.ts`

**Interfaces:**
- Consumes: `LibraryCollections` (Task 1); existing `data.facets.collections` (`{id,name,slug,count}[]`), `collectionError` state, `createCollection` handler in `+page.svelte`.
- Produces: no new exports.

- [ ] **Step 1: Update the strip tests to the always-present section**

In `apps/web/src/routes/library/page.test.ts`, the "renders a folder strip linking to each collection" test is unchanged (a single tile link still resolves). Replace the "hides the strip when there are no collections" test with a test of the new always-present behavior. Find:

```ts
  it("hides the strip when there are no collections", () => {
    render(Library, {
      data: { ...data, facets: { ...data.facets, collections: [] } },
    } as never);
    expect(screen.queryByRole("link", { name: /reading list/i })).toBeNull();
  });
```

Replace it with:

```ts
  it("keeps the collections section with a create control when there are none", () => {
    render(Library, {
      data: { ...data, facets: { ...data.facets, collections: [] } },
    } as never);
    // No collection tile links...
    expect(screen.queryByRole("link", { name: /reading list/i })).toBeNull();
    // ...but the always-present section header and create affordance remain.
    expect(screen.getByRole("heading", { name: /collections/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new collection/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to verify the new assertions fail**

Run: `pnpm exec vitest run library/page.test`
Expected: FAIL — no heading "collections" / no "new collection" button (section not wired yet).

- [ ] **Step 3: Swap the inline strip for LibraryCollections**

In `apps/web/src/routes/library/+page.svelte`:

Replace the `CollectionFolder` import line:

```ts
  import CollectionFolder from "$lib/components/ui/CollectionFolder.svelte";
```

with:

```ts
  import LibraryCollections from "$lib/components/LibraryCollections.svelte";
```

Replace the strip block:

```svelte
{#if data.facets.collections.length}
  <nav class="folder-strip" aria-label="collections">
    {#each data.facets.collections as c (c.id)}
      <CollectionFolder name={c.name} slug={c.slug} count={c.count} />
    {/each}
  </nav>
{/if}
```

with:

```svelte
<LibraryCollections
  collections={data.facets.collections}
  error={collectionError}
  onCreate={createCollection}
/>
```

Remove the now-unused `.folder-strip` rules from the `<style>` block:

```css
  .folder-strip { display: flex; gap: var(--space-2); overflow-x: auto; padding-bottom: var(--space-2); margin: 0 0 var(--space-4); scrollbar-width: thin; }
  .folder-strip > :global(*) { flex: none; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run library/page.test`
Expected: PASS — including the "renders a folder strip linking to each collection" and the new "keeps the collections section…" tests, plus the existing drawer/pager/delete suite.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/library/+page.svelte apps/web/src/routes/library/page.test.ts
git commit -m "feat(web): surface collections section atop the library

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Hide the drawer create control on desktop

**Files:**
- Modify: `apps/web/src/lib/components/CollectionsPanel.svelte`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature change — `oncreate` prop and create state remain (mobile still creates here).

**Note:** This is a CSS-only visibility change. jsdom ignores media queries, so create stays in the DOM in tests — the existing `CollectionsPanel.test.ts` and the library drawer test remain green precisely because nothing is conditionally removed. Desktop hiding is verified visually in Task 4.

- [ ] **Step 1: Confirm the current create block still passes its tests**

Run: `pnpm exec vitest run CollectionsPanel`
Expected: PASS (baseline before the edit).

- [ ] **Step 2: Wrap the create control and hide it on desktop**

In `apps/web/src/lib/components/CollectionsPanel.svelte`, replace this block:

```svelte
  {#if creating}
    <form class="create" onsubmit={submitCreate}>
      <Input bind:value={draft} placeholder="new collection…" aria-label="new collection name" />
      <Button type="submit"><Plus class="icon-sm" aria-hidden="true" /> create</Button>
    </form>
  {:else}
    <button class="new-btn" onclick={() => (creating = true)}><Plus class="icon-sm" aria-hidden="true" /> new collection</button>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
```

with (wrap in a `.create-area` container):

```svelte
  <div class="create-area">
    {#if creating}
      <form class="create" onsubmit={submitCreate}>
        <Input bind:value={draft} placeholder="new collection…" aria-label="new collection name" />
        <Button type="submit"><Plus class="icon-sm" aria-hidden="true" /> create</Button>
      </form>
    {:else}
      <button class="new-btn" onclick={() => (creating = true)}><Plus class="icon-sm" aria-hidden="true" /> new collection</button>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
```

Add to the `<style>` block (create now lives in the top-of-library section on desktop; the drawer keeps only rename/delete):

```css
  /* Desktop: create moves to the always-present LibraryCollections section at the
     top of the library; the drawer panel keeps rename/delete only. */
  @media (min-width: 641px) { .create-area { display: none; } }
```

- [ ] **Step 3: Run the panel + library tests to verify nothing broke**

Run: `pnpm exec vitest run CollectionsPanel library/page.test`
Expected: PASS — create is still in the DOM (media queries no-op in jsdom), so the drawer-create flow test still passes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/CollectionsPanel.svelte
git commit -m "feat(web): hide drawer collection-create on desktop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole suite**

Run: `pnpm test`
Expected: PASS across the workspace.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Manual/visual — desktop (>640px)**

Run: `pnpm --filter @readmepls/web dev`. On `/library` at a wide viewport:
- The `collections` section sits at the top, always visible.
- With zero collections: header + hint + "new collection" button; clicking it reveals an input; creating adds a collection (and it appears as a tile).
- With collections: wrapping grid of folder tiles with counts, each linking to `/collections/{slug}`; the "new collection" control still present.
- Open the filter drawer: the collections **filter chips** are present; there is **no** create control; rename/delete on existing collections still work.
Expected: create/browse up top; no strip; drawer has rename/delete + chips only.

- [ ] **Step 4: Manual/visual — mobile (≤640px, check at 360px)**

Resize to 360px (devtools). On `/library`:
- No collections header or create control at the top.
- With collections: tiles render as a horizontal-scroll strip (current behavior); no horizontal page overflow; tap targets ≥44px.
- With zero collections: no blank band at the top.
- Open the filter drawer: create + rename + delete all present (unchanged); `/collections` bottom-nav tab still works.
Stop the server.
Expected: mobile identical to prior behavior.

- [ ] **Step 5: Update the shipped collections-on-library plan status (if still present)**

This work extends the already-shipped collections-on-library branch. No plan deletion here — deletion happens at branch merge per CLAUDE.md. Leave this plan and its spec in place until merged.

---

## Self-Review Notes (author)

- **Spec coverage:** desktop always-present section (Task 1/2), create+browse only up top (Task 1), rename/delete stay in drawer (Task 3 leaves them, hides only create), filter chips untouched (no change to `FilterDrawer` fieldset), mobile unchanged (Task 1 CSS + Task 3 keeps mobile create), empty-state prompt (Task 1). Covered.
- **Type consistency:** `collections` element type `{id,name,slug,count}` matches `data.facets.collections` and `CollectionFolder` props across all tasks; `onCreate: (name: string) => void` matches `createCollection` in `+page.svelte`.
- **Non-unit-testable:** the 640px visual toggle and the drawer-create-hidden-on-desktop are manual (Task 4) — called out because jsdom ignores media queries.
