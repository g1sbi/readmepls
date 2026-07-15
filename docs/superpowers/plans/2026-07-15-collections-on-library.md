# Collections on the Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface collections as folder tiles — a strip on top of the library grid (desktop) and a `/collections` index page reached from a new mobile nav tab — each folder showing name + article count and linking to the existing `/collections/[slug]` page.

**Architecture:** A core helper counts articles per collection and feeds both the library facets and the new index page's server load. A single shared `CollectionFolder` primitive (composed from shadcn-svelte `button` + `badge`) renders every folder tile. The library page adds a horizontal strip above its toolbar; a new `/collections` route renders a wrapping grid; `BottomNav` gains a 4th tab. Collection filtering (FilterDrawer) and CRUD (CollectionsPanel) are untouched.

**Tech Stack:** SvelteKit (Svelte 5 runes), Tailwind v4 + shadcn-svelte, PocketBase, Vitest + @testing-library/svelte, `@readmepls/core` (TS source, no build step).

## Global Constraints

- **shadcn-svelte for new UI.** `CollectionFolder` composes the installed `ui/button/` and `ui/badge/` primitives — no hand-rolled equivalents, no new shadcn-svelte deps.
- **Mobile-first.** Tap targets ≥44px; no horizontal page overflow (the strip scrolls inside its own container).
- **Token-driven.** No hardcoded colors/fonts in components — reference tokens or shadcn-svelte variants.
- **TDD.** Failing test first, then implementation. Run tests and read output before claiming pass.
- **Tenant isolation.** Counts are per-user; another user's `collection_items` must never be counted.
- **Test runner:** whole workspace `pnpm test`; subset `pnpm exec vitest run <pattern>`. `pnpm --filter <pkg> test` does NOT work here.
- **Conventional Commits**, one logical change per commit.

---

## File Structure

- `packages/core/src/library/fetch.ts` — add `tallyCollectionCounts` (pure) + `fetchCollections` (IO); change `fetchFacetOptions` collections type to include `count`. Exported via existing `export * from "./library/fetch.js"`.
- `packages/core/src/library/fetch.integration.test.ts` — add `fetchCollections` integration cases.
- `packages/core/src/library/collections.test.ts` — new, unit tests for `tallyCollectionCounts`.
- `apps/web/src/lib/components/ui/CollectionFolder.svelte` — new shared primitive.
- `apps/web/src/lib/components/ui/collection-folder.test.ts` — new.
- `apps/web/src/routes/library/+page.svelte` — strip above `LibraryToolbar`.
- `apps/web/src/routes/library/page.test.ts` — add strip assertions; update fixture with `count`.
- `apps/web/src/routes/collections/+page.svelte` — new index page.
- `apps/web/src/routes/collections/+page.server.ts` — new load.
- `apps/web/src/routes/collections/collections-index.test.ts` — new.
- `apps/web/src/lib/components/BottomNav.svelte` — 4th tab.
- `apps/web/src/lib/components/bottomnav.test.ts` — assert new tab.

---

## Task 1: Collection counts in core

**Files:**
- Modify: `packages/core/src/library/fetch.ts`
- Create: `packages/core/src/library/collections.test.ts`
- Test: `packages/core/src/library/fetch.integration.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `tallyCollectionCounts(collections: { id: string; name: string; slug: string }[], items: { collection: string }[]): { id: string; name: string; slug: string; count: number }[]`
  - `fetchCollections(pb: PocketBase): Promise<{ id: string; name: string; slug: string; count: number }[]>`
  - `fetchFacetOptions`'s return `collections` field is now `{ id: string; name: string; slug: string; count: number }[]`.

- [ ] **Step 1: Write the failing unit test for the pure tally**

Create `packages/core/src/library/collections.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tallyCollectionCounts } from "./fetch.js";

const cols = [
  { id: "c1", name: "recipes", slug: "recipes" },
  { id: "c2", name: "work", slug: "work" },
  { id: "c3", name: "empty", slug: "empty" },
];

describe("tallyCollectionCounts", () => {
  it("counts items per collection and zero-fills the rest", () => {
    const items = [{ collection: "c1" }, { collection: "c1" }, { collection: "c2" }];
    expect(tallyCollectionCounts(cols, items)).toEqual([
      { id: "c1", name: "recipes", slug: "recipes", count: 2 },
      { id: "c2", name: "work", slug: "work", count: 1 },
      { id: "c3", name: "empty", slug: "empty", count: 0 },
    ]);
  });

  it("ignores items whose collection is not in the list", () => {
    const items = [{ collection: "cX" }, { collection: "c1" }];
    expect(tallyCollectionCounts(cols, items).find((c) => c.id === "c1")?.count).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run collections.test`
Expected: FAIL — `tallyCollectionCounts` is not exported.

- [ ] **Step 3: Add `tallyCollectionCounts` and `fetchCollections` to `fetch.ts`**

Add near the top (after imports) the pure helper, and a new IO function. Insert both above `fetchFacetOptions`:

```ts
export function tallyCollectionCounts(
  collections: { id: string; name: string; slug: string }[],
  items: { collection: string }[],
): { id: string; name: string; slug: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.collection, (counts.get(it.collection) ?? 0) + 1);
  return collections.map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }));
}

export async function fetchCollections(
  pb: PocketBase,
): Promise<{ id: string; name: string; slug: string; count: number }[]> {
  const colRows = await pb.collection("collections").getFullList({ sort: "name", requestKey: null });
  const collections = colRows.map((c) => ({ id: c.id, name: c.name as string, slug: c.slug as string }));
  // Count query is a secondary read: degrade to zero counts rather than failing the
  // whole facet/index load if it errors (matches the repo's graceful-degrade convention).
  let items: { collection: string }[] = [];
  try {
    const rows = await pb.collection("collection_items").getFullList({ fields: "collection", requestKey: null });
    items = rows.map((r) => ({ collection: r.collection as string }));
  } catch {
    items = [];
  }
  return tallyCollectionCounts(collections, items);
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `pnpm exec vitest run collections.test`
Expected: PASS (both cases).

- [ ] **Step 5: Wire `fetchCollections` into `fetchFacetOptions` and update its type**

In `fetch.ts`, change the `fetchFacetOptions` signature's `collections` type and replace the inline collections query with `fetchCollections`. Replace the existing `Promise.all` destructure + return:

```ts
export async function fetchFacetOptions(pb: PocketBase): Promise<{
  tags: { id: string; name: string }[];
  collections: { id: string; name: string; slug: string; count: number }[];
  options: FacetOptions;
}> {
  // requestKey: null on the concurrent calls -- fetchLibraryPage queries some of the
  // same collections on the same pb client; the SDK's default auto-cancellation would
  // otherwise abort whichever request loses the race.
  const [tagRows, collections, favRows, artRows] = await Promise.all([
    pb.collection("tags").getFullList({ sort: "name" }),
    fetchCollections(pb),
    pb.collection("source_favorites").getFullList({ requestKey: null }),
    pb.collection("articles").getFullList({
      expand: "content.source",
      fields:
        "id,expand.content.lang,expand.content.author," +
        "expand.content.expand.source.id,expand.content.expand.source.host," +
        "expand.content.expand.source.name,expand.content.expand.source.favicon," +
        "expand.content.expand.source.favicon_status",
      requestKey: null,
    }),
  ]);
  const favoriteIds = new Set(favRows.map((f) => f.source as string));
  return {
    tags: tagRows.map((t) => ({ id: t.id, name: t.name as string })),
    collections,
    options: deriveFacetOptions(artRows as unknown as ArticleFacetRow[], favoriteIds),
  };
}
```

- [ ] **Step 6: Write the failing integration test for `fetchCollections`**

In `packages/core/src/library/fetch.integration.test.ts`, add the import and a new describe block. Update the import line:

```ts
import { fetchLibraryPage, fetchFacetOptions, fetchCollections } from "./fetch.js";
```

Add at the end of the file (helpers `user`, `content`, `article` already exist above):

```ts
async function collection(pb: PocketBase, uid: string, name: string) {
  return pb.collection("collections").create({ user: uid, name, slug: name, parent: "", order: 0 });
}

describe("fetchCollections", () => {
  it("returns per-collection article counts, zero-filling empties", async () => {
    const a = await user(`fc-a${Date.now()}@t.local`);
    const recipes = await collection(a.pb, a.id, "recipes");
    await collection(a.pb, a.id, "empty");
    const c1 = await content({ title: "One" });
    const c2 = await content({ title: "Two" });
    const art1 = await article(a.pb, a.id, c1.id);
    const art2 = await article(a.pb, a.id, c2.id);
    await a.pb.collection("collection_items").create({ collection: recipes.id, article: art1.id, order: 0 });
    await a.pb.collection("collection_items").create({ collection: recipes.id, article: art2.id, order: 0 });

    const cols = await fetchCollections(a.pb);
    expect(cols.find((c) => c.slug === "recipes")?.count).toBe(2);
    expect(cols.find((c) => c.slug === "empty")?.count).toBe(0);
  });

  it("does not count another user's collection_items", async () => {
    const a = await user(`fc-b${Date.now()}@t.local`);
    const b = await user(`fc-c${Date.now()}@t.local`);
    const bCol = await collection(b.pb, b.id, "bwork");
    const c = await content({ title: "Secret" });
    const art = await article(b.pb, b.id, c.id);
    await b.pb.collection("collection_items").create({ collection: bCol.id, article: art.id, order: 0 });

    // User a has no collections; their fetch sees nothing of b's.
    const cols = await fetchCollections(a.pb);
    expect(cols).toEqual([]);
  });
});
```

- [ ] **Step 7: Run the integration test to verify it passes**

Run: `pnpm exec vitest run fetch.integration`
Expected: PASS — new `fetchCollections` block green, existing cases still green.

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (the `fetchFacetOptions` collections type change is consumed only where fixtures are updated in later tasks; core itself compiles).

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/library/fetch.ts packages/core/src/library/collections.test.ts packages/core/src/library/fetch.integration.test.ts
git commit -m "feat(core): count articles per collection in facets"
```

---

## Task 2: CollectionFolder primitive

**Files:**
- Create: `apps/web/src/lib/components/ui/CollectionFolder.svelte`
- Test: `apps/web/src/lib/components/ui/collection-folder.test.ts`

**Interfaces:**
- Consumes: shadcn-svelte `Button` (`./button/index.js`, supports `href`, `variant`, `class`), `Badge` (`./badge/index.js`).
- Produces: `CollectionFolder` component with props `{ name: string; slug: string; count: number }`, rendering an anchor to `/collections/{slug}`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/components/ui/collection-folder.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import CollectionFolder from "./CollectionFolder.svelte";

describe("CollectionFolder", () => {
  it("links to the collection page and shows name + count", () => {
    render(CollectionFolder, { name: "recipes", slug: "recipes", count: 12 });
    const link = screen.getByRole("link", { name: /recipes/i });
    expect(link).toHaveAttribute("href", "/collections/recipes");
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders a zero count", () => {
    render(CollectionFolder, { name: "empty", slug: "empty", count: 0 });
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run collection-folder`
Expected: FAIL — cannot resolve `./CollectionFolder.svelte`.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/lib/components/ui/CollectionFolder.svelte`:

```svelte
<script lang="ts">
  import { Button } from "./button/index.js";
  import { Badge } from "./badge/index.js";
  import { FolderOpen } from "@lucide/svelte";

  let { name, slug, count }: { name: string; slug: string; count: number } = $props();
</script>

<Button
  href={`/collections/${slug}`}
  variant="outline"
  class="min-h-11 justify-start gap-2 px-3"
>
  <FolderOpen class="icon-sm" aria-hidden="true" />
  <span class="truncate">{name}</span>
  <Badge variant="secondary">{count}</Badge>
</Button>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run collection-folder`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/ui/CollectionFolder.svelte apps/web/src/lib/components/ui/collection-folder.test.ts
git commit -m "feat(web): add CollectionFolder tile primitive"
```

---

## Task 3: Library folder strip

**Files:**
- Modify: `apps/web/src/routes/library/+page.svelte`
- Test: `apps/web/src/routes/library/page.test.ts`

**Interfaces:**
- Consumes: `CollectionFolder` (Task 2); `data.facets.collections` now `{ id, name, slug, count }[]` (Task 1).
- Produces: no new exports — a strip in the library page.

- [ ] **Step 1: Update the test fixture and add the failing strip assertions**

In `apps/web/src/routes/library/page.test.ts`, update the collections fixture to include `count`:

```ts
    collections: [{ id: "c1", name: "reading list", slug: "reading-list", count: 3 }],
```

Then add a new test inside the top-level `describe`:

```ts
it("renders a folder strip linking to each collection", () => {
  render(Library, { data });
  const link = screen.getByRole("link", { name: /reading list/i });
  expect(link).toHaveAttribute("href", "/collections/reading-list");
});

it("hides the strip when there are no collections", () => {
  render(Library, { data: { ...data, facets: { ...data.facets, collections: [] } } });
  expect(screen.queryByRole("link", { name: /reading list/i })).toBeNull();
});
```

- [ ] **Step 2: Run it to verify the strip test fails**

Run: `pnpm exec vitest run library/page.test`
Expected: FAIL — no link with name "reading list" (strip not rendered yet). The "hides" test may pass vacuously; the "renders" test must fail.

- [ ] **Step 3: Add the strip to the library page**

In `apps/web/src/routes/library/+page.svelte`, add the import alongside the other component imports:

```ts
  import CollectionFolder from "$lib/components/ui/CollectionFolder.svelte";
```

Insert the strip immediately after the `<h1>your library</h1>` line and before the `{#if articleError}` block:

```svelte
{#if data.facets.collections.length}
  <nav class="folder-strip" aria-label="collections">
    {#each data.facets.collections as c (c.id)}
      <CollectionFolder name={c.name} slug={c.slug} count={c.count} />
    {/each}
  </nav>
{/if}
```

Add to the `<style>` block:

```css
  .folder-strip { display: flex; gap: var(--space-2); overflow-x: auto; padding-bottom: var(--space-2); margin: 0 0 var(--space-4); scrollbar-width: thin; }
  .folder-strip > :global(*) { flex: none; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run library/page.test`
Expected: PASS — both new tests plus the existing suite.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/library/+page.svelte apps/web/src/routes/library/page.test.ts
git commit -m "feat(web): show collection folder strip on library"
```

---

## Task 4: /collections index page

**Files:**
- Create: `apps/web/src/routes/collections/+page.server.ts`
- Create: `apps/web/src/routes/collections/+page.svelte`
- Test: `apps/web/src/routes/collections/collections-index.test.ts`

**Interfaces:**
- Consumes: `fetchCollections` (Task 1); `CollectionFolder` (Task 2); `locals.pb` (SvelteKit server load, per existing `library/+page.server.ts`).
- Produces: `/collections` route returning `{ collections: { id, name, slug, count }[] }`.

- [ ] **Step 1: Write the server load**

Create `apps/web/src/routes/collections/+page.server.ts`:

```ts
import type { PageServerLoad } from "./$types";
import { fetchCollections } from "@readmepls/core";

export const load: PageServerLoad = async ({ locals }) => {
  const collections = await fetchCollections(locals.pb);
  return { collections };
};
```

- [ ] **Step 2: Write the failing component test**

Create `apps/web/src/routes/collections/collections-index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Collections from "./+page.svelte";

describe("collections index", () => {
  it("renders a folder per collection with counts", () => {
    render(Collections, { data: { collections: [
      { id: "c1", name: "recipes", slug: "recipes", count: 12 },
      { id: "c2", name: "work", slug: "work", count: 0 },
    ] } });
    expect(screen.getByRole("link", { name: /recipes/i })).toHaveAttribute("href", "/collections/recipes");
    expect(screen.getByRole("link", { name: /work/i })).toHaveAttribute("href", "/collections/work");
  });

  it("shows an empty state when there are no collections", () => {
    render(Collections, { data: { collections: [] } });
    expect(screen.getByText(/no collections yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm exec vitest run collections-index`
Expected: FAIL — cannot resolve `./+page.svelte`.

- [ ] **Step 4: Implement the index page**

Create `apps/web/src/routes/collections/+page.svelte`:

```svelte
<script lang="ts">
  import type { PageData } from "./$types";
  import CollectionFolder from "$lib/components/ui/CollectionFolder.svelte";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>collections</title></svelte:head>

<h1>collections</h1>

{#if data.collections.length === 0}
  <p class="empty-note">no collections yet. create one from the filters on your <a href="/library">library</a>.</p>
{:else}
  <div class="folder-grid">
    {#each data.collections as c (c.id)}
      <CollectionFolder name={c.name} slug={c.slug} count={c.count} />
    {/each}
  </div>
{/if}

<style>
  h1 { font-family: var(--font-ui); font-size: var(--text-xl); font-weight: var(--weight-semibold); color: var(--color-text); margin: 0 0 var(--space-5); }
  .folder-grid { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .empty-note { color: var(--color-text-muted); font-family: var(--font-ui); }
  .empty-note a { color: var(--color-accent); }
</style>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run collections-index`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/collections/+page.server.ts apps/web/src/routes/collections/+page.svelte apps/web/src/routes/collections/collections-index.test.ts
git commit -m "feat(web): add /collections index page"
```

---

## Task 5: Collections tab in BottomNav

**Files:**
- Modify: `apps/web/src/lib/components/BottomNav.svelte`
- Test: `apps/web/src/lib/components/bottomnav.test.ts`

**Interfaces:**
- Consumes: `/collections` route (Task 4).
- Produces: no new exports — a 4th nav tab.

- [ ] **Step 1: Add the failing test assertions**

In `apps/web/src/lib/components/bottomnav.test.ts`, add two tests inside the `describe`:

```ts
it("renders the collections tab", () => {
  const { getByRole } = render(BottomNav, { pathname: "/library" });
  expect(getByRole("link", { name: /collections/i })).toHaveAttribute("href", "/collections");
});

it("marks collections active on a collection route", () => {
  const { getByRole } = render(BottomNav, { pathname: "/collections/recipes" });
  expect(getByRole("link", { name: /collections/i })).toHaveAttribute("aria-current", "page");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run bottomnav`
Expected: FAIL — no link named "collections".

- [ ] **Step 3: Add the tab**

In `apps/web/src/lib/components/BottomNav.svelte`, add `FolderOpen` to the lucide import:

```ts
  import { Library, Search, FolderOpen, User } from "@lucide/svelte";
```

Insert the collections tab into `TABS`, between `search` and `profile`:

```ts
    { href: "/collections", label: "collections", icon: FolderOpen, match: (p: string) => p.startsWith("/collections") },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run bottomnav`
Expected: PASS — including the existing tab tests.

- [ ] **Step 5: Verify 4 tabs still fit at 360px (manual check)**

Run: `pnpm --filter @readmepls/web dev`, open the library page at 360px width in devtools, confirm the four tabs (library / search / collections / profile) render without overflow, then stop the server.
Expected: no horizontal overflow; all four labels legible.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/BottomNav.svelte apps/web/src/lib/components/bottomnav.test.ts
git commit -m "feat(web): add collections tab to mobile nav"
```

---

## Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole suite**

Run: `pnpm test`
Expected: PASS across the workspace.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Manual smoke on desktop**

Run: `pnpm --filter @readmepls/web dev`. On `/library`, confirm the folder strip appears above the toolbar with counts and each folder navigates to `/collections/[slug]`. Visit `/collections` and confirm the grid + empty state behave. Stop the server.
Expected: strip and index render, counts correct, links navigate.

- [ ] **Step 4: Delete this plan**

Once merged, per CLAUDE.md working agreements:

```bash
git rm docs/superpowers/plans/2026-07-15-collections-on-library.md docs/superpowers/specs/2026-07-15-collections-on-library-design.md
git commit -m "chore: remove shipped collections-on-library plan and spec"
```
