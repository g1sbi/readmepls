# Latest-pass Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six UI fixes — add-to-collection menu on cards and in the reader, segmented font controls, remove collection-management from the reader, a working archive flow, dark-theme title color, and a sticky header.

**Architecture:** Introduce one shared `DropdownMenu` primitive (a thin styled wrapper over bits-ui's already-vendored `DropdownMenu`, which portals out of the card's `overflow:hidden`/transform clip and gives keyboard/Escape/outside-click for free). The `ArticleCard` ⋯ menu and the reader add-to-collection button both compose it. The archive flow is wiring only — `articles.status` already accepts `"archived"`; the library filters it out by default and exposes an archived toggle. Two fixes are pure CSS.

**Tech Stack:** SvelteKit (Svelte 5 runes), bits-ui 2.18, `@lucide/svelte`, Vitest + `@testing-library/svelte`, PocketBase JS SDK.

**Status (reconciled 2026-07-02):** Task 1 is done and committed (`bad3231`). The
phase-8 tiering merge (`8c3c7c3`) landed after this plan was written and touched
`ArticleCard.svelte`/`ArticleCard.test.ts` (Pro-gated AI tags) and `TopBar.svelte`
(profile nav link). Task 2 below is updated to **merge into** the tier-aware card
rather than wholesale-rewrite it — the `isPro` tag-gating and its two tier tests
are preserved. Tasks 6/7 apply cleanly over the merged files.

## Global Constraints

- **TDD always** — failing test first, then minimal implementation (`superpowers:test-driven-development`).
- **Tokens only** — never hardcode a color/font/radius in a component; reference a `tokens.css` variable.
- **Reusable primitives** live in `$lib/components/ui/`; feature components compose them.
- **No `any` without a written reason** (TypeScript strict). The existing `article.expand.content` `any` already carries such a comment — keep it.
- **`pb.filter` binding for all filters** — never raw string interpolation.
- **Conventional Commits**, one logical change per commit. Do not push or open a PR.
- **Test runner:** all commands run from `apps/web/`. Full suite: `npx vitest run`. Single file: `npx vitest run <path>`.
- Lowercase playful voice for user-facing copy (e.g. "no collections yet", "archived").

---

### Task 1: `DropdownMenu` + `MenuItem` primitives — ✅ DONE (`bad3231`)

A styled bits-ui wrapper. `DropdownMenu` renders the trigger and a portaled panel; `MenuItem` is a styled selectable row. Section labels, separators, and empty states are plain `<div>`s with global classes the primitive defines — no bits imports needed in consumers.

**Files:**
- Create: `apps/web/src/lib/components/ui/DropdownMenu.svelte`
- Create: `apps/web/src/lib/components/ui/MenuItem.svelte`
- Create: `apps/web/src/lib/components/ui/__fixtures__/DropdownMenuHarness.svelte`
- Test: `apps/web/src/lib/components/ui/DropdownMenu.test.ts`

**Interfaces:**
- Produces `DropdownMenu.svelte` props:
  - `label: string` — trigger's accessible name (applied as `aria-label` on the trigger button).
  - `trigger: Snippet` — trigger button contents (usually an icon).
  - `children: Snippet` — panel contents.
  - `align?: "start" | "center" | "end"` (default `"end"`).
- Produces `MenuItem.svelte` props:
  - `children: Snippet` — row contents.
  - `onSelect: () => void` — fired on click/Enter/Space; the menu auto-closes after.
  - `variant?: "default" | "danger"` (default `"default"`).
- Produces global CSS classes for consumers: `.menu-label`, `.menu-empty`, `.menu-sep`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/components/ui/__fixtures__/DropdownMenuHarness.svelte`:

```svelte
<script lang="ts">
  import DropdownMenu from "../DropdownMenu.svelte";
  import MenuItem from "../MenuItem.svelte";
  let { onpick }: { onpick: () => void } = $props();
</script>

<DropdownMenu label="open menu">
  {#snippet trigger()}<span>⋯</span>{/snippet}
  {#snippet children()}
    <div class="menu-label">actions</div>
    <MenuItem onSelect={onpick}>pick me</MenuItem>
  {/snippet}
</DropdownMenu>
```

`apps/web/src/lib/components/ui/DropdownMenu.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import Harness from "./__fixtures__/DropdownMenuHarness.svelte";

describe("DropdownMenu", () => {
  it("keeps the panel closed until the trigger is clicked", () => {
    render(Harness, { onpick: vi.fn() });
    expect(screen.queryByText("pick me")).not.toBeInTheDocument();
  });

  it("opens the panel and fires an item's onSelect", async () => {
    const onpick = vi.fn();
    render(Harness, { onpick });
    await fireEvent.click(screen.getByRole("button", { name: "open menu" }));
    await waitFor(() => expect(screen.getByText("pick me")).toBeInTheDocument());
    await fireEvent.click(screen.getByText("pick me"));
    expect(onpick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/ui/DropdownMenu.test.ts`
Expected: FAIL — `DropdownMenu.svelte` / `MenuItem.svelte` do not resolve.

- [ ] **Step 3: Write the primitives**

`apps/web/src/lib/components/ui/DropdownMenu.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  import { DropdownMenu } from "bits-ui";

  let {
    label,
    trigger,
    children,
    align = "end",
  }: {
    label: string;
    trigger: Snippet;
    children: Snippet;
    align?: "start" | "center" | "end";
  } = $props();
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class="dropdown__trigger" aria-label={label}>
    {@render trigger()}
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class="dropdown__panel" {align} sideOffset={6}>
      {@render children()}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  /* bits-ui applies these classes to its portaled parts; tokens only. */
  :global(.dropdown__panel) {
    display: flex; flex-direction: column;
    min-width: 12rem;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    padding: var(--space-1);
    z-index: var(--z-modal, 100);
  }
  :global(.dropdown__panel:focus-visible) { outline: none; }
  :global(.menu-item) {
    display: flex; align-items: center; gap: var(--space-2);
    width: 100%; text-align: left;
    font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--color-text); background: none; border: none; cursor: pointer;
    padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
  }
  :global(.menu-item:hover),
  :global(.menu-item[data-highlighted]) { background: var(--color-accent-wash); }
  :global(.menu-item[data-variant="danger"]) { color: var(--color-accent); }
  :global(.menu-item:focus-visible) {
    outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: -2px;
  }
  :global(.menu-label) {
    font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--color-text-subtle);
    padding: var(--space-2) var(--space-3) var(--space-1);
  }
  :global(.menu-empty) {
    font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--color-text-subtle); padding: var(--space-2) var(--space-3);
  }
  :global(.menu-sep) { height: 1px; background: var(--color-border); margin: var(--space-1) 0; }
</style>
```

`apps/web/src/lib/components/ui/MenuItem.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  import { DropdownMenu } from "bits-ui";

  let {
    children,
    onSelect,
    variant = "default",
  }: {
    children: Snippet;
    onSelect: () => void;
    variant?: "default" | "danger";
  } = $props();
</script>

<DropdownMenu.Item class="menu-item" data-variant={variant} onSelect={() => onSelect()}>
  {@render children()}
</DropdownMenu.Item>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/components/ui/DropdownMenu.test.ts`
Expected: PASS (2 tests). A `[svelte] derived_inert` teardown warning may print to stderr — harmless.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/ui/DropdownMenu.svelte \
        apps/web/src/lib/components/ui/MenuItem.svelte \
        apps/web/src/lib/components/ui/__fixtures__/DropdownMenuHarness.svelte \
        apps/web/src/lib/components/ui/DropdownMenu.test.ts
git commit -m "feat(web): add DropdownMenu + MenuItem ui primitives"
```

---

### Task 2: `ArticleCard` ⋯ menu (add-to-collection, archive, delete)

Replace the hover trash button with a consolidated ⋯ menu. The menu renders whenever any of the new handlers is provided; the `processing`/`failed` card branches are untouched (the menu sits outside the state `if/else`, exactly where the trash button used to).

**Files:**
- Modify: `apps/web/src/lib/components/ArticleCard.svelte`
- Test: `apps/web/src/lib/components/ArticleCard.test.ts`

**Interfaces:**
- Consumes: `DropdownMenu`, `MenuItem` from Task 1; `.menu-label`/`.menu-empty`/`.menu-sep` classes.
- Produces `ArticleCard` props (additions to existing `article`, `onRetry`, `onDelete`):
  - `collections?: { id: string; name: string }[]`
  - `onAddToCollection?: (articleId: string, collectionId: string) => void`
  - `onArchive?: (id: string) => void`
  - `onUnarchive?: (id: string) => void`
  - `article` type gains an optional `status?: string`.

- [ ] **Step 1: Write the failing tests**

Replace the whole body of `apps/web/src/lib/components/ArticleCard.test.ts` with the
following. **Note:** the card reads `$page.data.tier` to gate AI tags (from the
tiering merge). The harness seeds the `page` store to `pro` by default so the
action/menu cases are unaffected, and the last two cases pin the tier behavior —
keep them.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { page } from "$app/stores";
import ArticleCard from "./ArticleCard.svelte";

const article = (content: unknown, extra: Record<string, unknown> = {}) => ({
  id: "a1",
  url: "https://example.com/p",
  expand: content ? { content } : undefined,
  ...extra,
});

const ready = () => article({ extract_status: "ok", title: "Hello", ai_tags_json: ["ai"] });

const basePageValue = {
  params: {} as Record<string, string>,
  url: new URL("http://localhost/"),
  route: { id: null as string | null },
  status: 200,
  error: null,
  data: {} as Record<string, unknown>,
  form: null,
  state: {} as Record<string, unknown>,
};

// Default to pro so tag/action assertions are unaffected by tiering.
beforeEach(() => page.set({ ...basePageValue, data: { tier: "pro" } }));

describe("ArticleCard", () => {
  it("links the whole card to the reader when ready", () => {
    render(ArticleCard, { article: ready() });
    const link = screen.getByRole("link", { name: /hello/i });
    expect(link).toHaveAttribute("href", "/read/a1");
    expect(screen.getByText("ai")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /read/i })).not.toBeInTheDocument();
  });

  it("shows a processing indicator when not yet extracted", () => {
    render(ArticleCard, { article: article(null) });
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the reason and a retry button when failed", async () => {
    const onRetry = vi.fn();
    render(ArticleCard, {
      article: article({ extract_status: "failed", title: "X", failure_reason: "boom" }),
      onRetry,
    });
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledWith("a1");
  });

  it("renders no actions menu when no handlers are provided", () => {
    render(ArticleCard, { article: ready() });
    expect(screen.queryByRole("button", { name: "article actions" })).not.toBeInTheDocument();
  });

  it("adds the article to a collection from the menu", async () => {
    const onAddToCollection = vi.fn();
    render(ArticleCard, {
      article: ready(),
      collections: [{ id: "c1", name: "read later" }],
      onAddToCollection,
    });
    await fireEvent.click(screen.getByRole("button", { name: "article actions" }));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: /read later/i })).toBeInTheDocument());
    await fireEvent.click(screen.getByRole("menuitem", { name: /read later/i }));
    expect(onAddToCollection).toHaveBeenCalledWith("a1", "c1");
  });

  it("shows an empty hint when there are no collections", async () => {
    render(ArticleCard, { article: ready(), collections: [], onAddToCollection: vi.fn() });
    await fireEvent.click(screen.getByRole("button", { name: "article actions" }));
    await waitFor(() => expect(screen.getByText(/no collections yet/i)).toBeInTheDocument());
  });

  it("archives an unarchived article from the menu", async () => {
    const onArchive = vi.fn();
    render(ArticleCard, { article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }, { status: "unread" }), onArchive });
    await fireEvent.click(screen.getByRole("button", { name: "article actions" }));
    await fireEvent.click(await screen.findByRole("menuitem", { name: /^archive$/i }));
    expect(onArchive).toHaveBeenCalledWith("a1");
  });

  it("offers unarchive for an archived article", async () => {
    const onUnarchive = vi.fn();
    render(ArticleCard, { article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }, { status: "archived" }), onUnarchive });
    await fireEvent.click(screen.getByRole("button", { name: "article actions" }));
    await fireEvent.click(await screen.findByRole("menuitem", { name: /unarchive/i }));
    expect(onUnarchive).toHaveBeenCalledWith("a1");
  });

  it("deletes via the menu after confirming", async () => {
    const onDelete = vi.fn();
    render(ArticleCard, { article: ready(), onDelete });
    await fireEvent.click(screen.getByRole("button", { name: "article actions" }));
    await fireEvent.click(await screen.findByRole("menuitem", { name: /delete/i }));
    await waitFor(() => expect(screen.getByText(/can't be undone/i)).toBeInTheDocument());
    await fireEvent.click(screen.getByRole("button", { name: "delete" }));
    expect(onDelete).toHaveBeenCalledWith("a1");
  });

  it("shows the hostname (not the full path) while processing", () => {
    render(ArticleCard, {
      article: { id: "a2", url: "https://example.com/some/very/long/path?x=1", expand: undefined },
    });
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.queryByText(/some\/very\/long\/path/)).not.toBeInTheDocument();
  });

  it("hides AI tags for a standard-tier viewer even when content has them", () => {
    page.set({ ...basePageValue, data: { tier: "standard" } });
    render(ArticleCard, { article: article({ extract_status: "ok", title: "Hello", ai_tags_json: ["ai", "ml"] }) });
    expect(screen.queryByText("ai")).not.toBeInTheDocument();
    expect(screen.queryByText("ml")).not.toBeInTheDocument();
  });

  it("shows AI tags for a pro-tier viewer", () => {
    page.set({ ...basePageValue, data: { tier: "pro" } });
    render(ArticleCard, { article: ready() });
    expect(screen.getByText("ai")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/components/ArticleCard.test.ts`
Expected: FAIL — no `article actions` trigger; menu items not found. The two tier
cases already pass against the current card.

- [ ] **Step 3: Rewrite `ArticleCard.svelte`**

```svelte
<script lang="ts">
  import Card from "./ui/Card.svelte";
  import Tag from "./ui/Tag.svelte";
  import Button from "./ui/Button.svelte";
  import Spinner from "./ui/Spinner.svelte";
  import ConfirmDialog from "./ui/ConfirmDialog.svelte";
  import DropdownMenu from "./ui/DropdownMenu.svelte";
  import MenuItem from "./ui/MenuItem.svelte";
  import { RotateCw, Trash2, MoreHorizontal, Archive, ArchiveRestore, FolderPlus } from "@lucide/svelte";
  import { deriveCardState } from "$lib/article/card-state.js";
  import { page } from "$app/stores";

  let {
    article,
    onRetry,
    onDelete,
    collections,
    onAddToCollection,
    onArchive,
    onUnarchive,
  }: {
    // any: PocketBase SDK returns expand records as loosely-typed RecordModel; narrowing here would duplicate the full content schema.
    article: { id: string; url: string; status?: string; expand?: { content?: any } };
    onRetry?: (id: string) => void;
    onDelete?: (id: string) => void;
    collections?: { id: string; name: string }[];
    onAddToCollection?: (articleId: string, collectionId: string) => void;
    onArchive?: (id: string) => void;
    onUnarchive?: (id: string) => void;
  } = $props();

  let confirming = $state(false);

  const content = $derived(article.expand?.content ?? null);
  const state = $derived(deriveCardState(content));
  // AI tags are a Pro feature — a standard-tier viewer never sees them, even if
  // this shared content row has them (a pro-tier user may have captured the URL
  // first). Preserved from the tiering merge; see
  // docs/superpowers/specs/2026-07-02-phase-8-tiering-entitlements-design.md §3.
  const isPro = $derived($page.data.tier === "pro");
  const tags = $derived<string[]>(isPro ? (content?.ai_tags_json ?? []) : []);
  const isArchived = $derived(article.status === "archived");
  const hasMenu = $derived(!!(onAddToCollection || onArchive || onUnarchive || onDelete));

  // Show a clean hostname while processing; fall back to the raw URL if it
  // can't be parsed (e.g. malformed input mid-capture).
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

  {#if hasMenu}
    <div class="card-menu">
      <DropdownMenu label="article actions">
        {#snippet trigger()}<MoreHorizontal class="icon-sm" aria-hidden="true" />{/snippet}
        {#snippet children()}
          {#if onAddToCollection}
            <div class="menu-label">add to collection</div>
            {#if collections && collections.length > 0}
              {#each collections as c (c.id)}
                <MenuItem onSelect={() => onAddToCollection?.(article.id, c.id)}>
                  <FolderPlus class="icon-sm" aria-hidden="true" /> {c.name}
                </MenuItem>
              {/each}
            {:else}
              <div class="menu-empty">no collections yet</div>
            {/if}
          {/if}
          {#if onArchive || onUnarchive}
            {#if onAddToCollection}<div class="menu-sep"></div>{/if}
            {#if isArchived}
              <MenuItem onSelect={() => onUnarchive?.(article.id)}>
                <ArchiveRestore class="icon-sm" aria-hidden="true" /> unarchive
              </MenuItem>
            {:else}
              <MenuItem onSelect={() => onArchive?.(article.id)}>
                <Archive class="icon-sm" aria-hidden="true" /> archive
              </MenuItem>
            {/if}
          {/if}
          {#if onDelete}
            {#if onAddToCollection || onArchive || onUnarchive}<div class="menu-sep"></div>{/if}
            <MenuItem variant="danger" onSelect={() => (confirming = true)}>
              <Trash2 class="icon-sm" aria-hidden="true" /> delete
            </MenuItem>
          {/if}
        {/snippet}
      </DropdownMenu>
    </div>
    {#if onDelete}
      <ConfirmDialog
        open={confirming}
        title="delete this article?"
        message="this can't be undone."
        onConfirm={() => { confirming = false; onDelete?.(article.id); }}
        onCancel={() => (confirming = false)}
      />
    {/if}
  {/if}
</Card>

<style>
  .card-link { position: absolute; inset: 0; z-index: 1; border-radius: inherit; }
  .card-link:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: 2px; }
  h3, .tags { position: relative; z-index: 2; pointer-events: none; } /* text/tags don't block the overlay */

  .card-menu { position: relative; z-index: 3; align-self: flex-end; }
  .card-menu :global(.dropdown__trigger) {
    display: inline-flex; align-items: center; justify-content: center;
    background: none; border: none; cursor: pointer;
    color: var(--color-text-muted); padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    opacity: 0; transition: opacity var(--dur-fast) var(--ease-out);
  }
  :global(.card):hover .card-menu :global(.dropdown__trigger),
  :global(.card):focus-within .card-menu :global(.dropdown__trigger),
  .card-menu :global(.dropdown__trigger[data-state="open"]) { opacity: 1; }
  .card-menu :global(.dropdown__trigger):hover { color: var(--color-accent); }
  .card-menu :global(.dropdown__trigger):focus-visible {
    outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); opacity: 1;
  }
  @media (hover: none) { .card-menu :global(.dropdown__trigger) { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .card-menu :global(.dropdown__trigger) { transition: none; } }

  .url {
    overflow-wrap: anywhere;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/components/ArticleCard.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/ArticleCard.svelte apps/web/src/lib/components/ArticleCard.test.ts
git commit -m "feat(web): consolidate article-card actions into a ⋯ menu"
```

---

### Task 3: Library — archived filter, archived toggle, card wiring

Default library view excludes archived. A toggle chip in the rail swaps the grid to archived items. Each card receives collections + add/archive/unarchive handlers.

**Files:**
- Modify: `apps/web/src/routes/library/+page.svelte`
- Test: `apps/web/src/routes/library/archived-filter.test.ts` (create)

**Interfaces:**
- Consumes: `ArticleCard` props from Task 2.
- Produces (internal handlers, no external interface): `addToCollection(articleId, collectionId)`, `archiveArticle(id)`, `unarchiveArticle(id)`, `toggleArchived()`, `archived` state.

- [ ] **Step 1: Write the failing test**

`apps/web/src/routes/library/archived-filter.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

const activeItems = [
  { id: "a1", url: "https://example.com/a", status: "unread", progress: 0,
    expand: { content: { title: "Active one", extract_status: "ok", ai_tags_json: [] } } },
];
const archivedItems = [
  { id: "a2", url: "https://example.com/b", status: "archived", progress: 0,
    expand: { content: { title: "Archived one", extract_status: "ok", ai_tags_json: [] } } },
];

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: { model: { id: "u1" }, token: "tok" },
    filter: (expr: string, params: Record<string, unknown>) =>
      expr.replace(/\{:(\w+)\}/g, (_, k) => String(params[k])),
    collection: (name: string) => {
      if (name === "articles") {
        return {
          // return archived vs active based on the operator in the filter string
          getList: vi.fn((_p: number, _pp: number, opts: { filter: string }) =>
            Promise.resolve({ items: opts.filter.includes("!=") ? activeItems : archivedItems })),
          subscribe: vi.fn().mockResolvedValue(() => {}),
          update: vi.fn().mockResolvedValue({}),
        };
      }
      // tags + collections
      return { getFullList: vi.fn().mockResolvedValue([]) };
    },
  }),
}));

import Library from "./+page.svelte";

describe("library archived filter", () => {
  it("shows active articles by default and hides archived", async () => {
    render(Library);
    await waitFor(() => expect(screen.getByText("Active one")).toBeInTheDocument());
    expect(screen.queryByText("Archived one")).not.toBeInTheDocument();
  });

  it("swaps to archived articles when the toggle is pressed", async () => {
    render(Library);
    await waitFor(() => expect(screen.getByText("Active one")).toBeInTheDocument());
    await fireEvent.click(screen.getByRole("button", { name: /archived/i }));
    await waitFor(() => expect(screen.getByText("Archived one")).toBeInTheDocument());
    expect(screen.queryByText("Active one")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/library/archived-filter.test.ts`
Expected: FAIL — no `archived` toggle button; `getList` currently called without a `filter`, so `opts.filter` is `undefined` and `.includes` throws.

- [ ] **Step 3: Update the library page**

In `apps/web/src/routes/library/+page.svelte`:

Add archived state near the other state (after the `articleError` declaration, around line 33):

```ts
  // Archived view toggle — library shows non-archived by default.
  let archived = $state(false);
```

Replace `load()` (lines 39-43) with a filtered version:

```ts
  async function load() {
    const filter = archived
      ? pb.filter("status = {:s}", { s: "archived" })
      : pb.filter("status != {:s}", { s: "archived" });
    const list = await pb.collection("articles").getList(1, 100, { sort: "-created", expand: "content", filter });
    articles = list.items as ArticleRecord[];
    loading = false;
  }

  async function toggleArchived() {
    archived = !archived;
    loading = true;
    await load();
  }

  async function addToCollection(articleId: string, collectionId: string) {
    await pb.collection("collection_items").create({ collection: collectionId, article: articleId, order: 0 });
  }

  async function archiveArticle(id: string) {
    await pb.collection("articles").update(id, { status: "archived" });
    await load();
  }

  async function unarchiveArticle(id: string) {
    await pb.collection("articles").update(id, { status: "unread" });
    await load();
  }
```

Add the archived toggle inside the `<Rail>`, immediately after the `{#if tags.length > 0} … {/if}` tag-rail block (before `<CollectionsPanel …>`, around line 140):

```svelte
    <button
      class="tag-chip archived-toggle"
      class:selected={archived}
      aria-pressed={archived}
      onclick={toggleArchived}
    >
      <Tag>archived</Tag>
    </button>
```

Wire the handlers into `ArticleCard` (replace the existing `<ArticleCard … />` at line 166):

```svelte
            <ArticleCard
              article={a}
              {collections}
              onAddToCollection={addToCollection}
              onArchive={archiveArticle}
              onUnarchive={unarchiveArticle}
              onDelete={handleDelete}
            />
```

Add a small style for the toggle at the end of the `<style>` block:

```css
  .archived-toggle { margin: 0.25rem 0 1.25rem; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routes/library/archived-filter.test.ts src/routes/library/tag-filter.test.ts`
Expected: PASS. The tag-filter test's `getList` mock ignores its options, so the added `filter` argument does not break it.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/library/+page.svelte apps/web/src/routes/library/archived-filter.test.ts
git commit -m "feat(web): archived library view + wire card collection/archive actions"
```

---

### Task 4: Reader detail — drop collection management, add menu button, working archive

Remove the inline `AddToCollection` (list + create input). Add an "add to collection" `DropdownMenu` button to the reader's action group (existing collections only). Make archive navigate to the library on success and surface an inline error on failure.

**Files:**
- Modify: `apps/web/src/routes/read/[id]/+page.svelte`
- Delete: `apps/web/src/lib/components/AddToCollection.svelte`
- Delete: `apps/web/src/lib/components/AddToCollection.test.ts`
- Test: `apps/web/src/routes/read/[id]/page.test.ts` (extend)

**Interfaces:**
- Consumes: `DropdownMenu`, `MenuItem` from Task 1.
- Reuses existing reader `collections` state, `loadCollections()`, `addToCollection(collectionId)`.

- [ ] **Step 1: Write the failing tests**

Append these two cases inside the existing `describe("reader page …")` block in `apps/web/src/routes/read/[id]/page.test.ts` (the mocks, `goto` import, and `beforeEach(vi.clearAllMocks)` already exist):

```ts
  it("no longer offers to create collections from the reader", async () => {
    render(ReaderPage);
    await waitFor(() => expect(screen.getByText("Test Article")).toBeInTheDocument());
    expect(screen.queryByLabelText(/new collection/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "add to collection" })).toBeInTheDocument();
  });

  it("archives the article and navigates to the library", async () => {
    render(ReaderPage);
    await waitFor(() => expect(screen.getByText("Test Article")).toBeInTheDocument());
    await fireEvent.click(screen.getByRole("button", { name: "archive article" }));
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/library"));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/routes/read/[id]/page.test.ts"`
Expected: FAIL — "add to collection" trigger absent; archive does not call `goto`.

- [ ] **Step 3: Edit the reader page**

In `apps/web/src/routes/read/[id]/+page.svelte`:

**3a.** Swap imports. Remove:

```ts
  import AddToCollection from "$lib/components/AddToCollection.svelte";
```

Add `FolderPlus` to the existing lucide import and add the two primitives:

```ts
  import { ArrowLeft, Archive, Trash2, FolderPlus } from "@lucide/svelte";
  import DropdownMenu from "$lib/components/ui/DropdownMenu.svelte";
  import MenuItem from "$lib/components/ui/MenuItem.svelte";
```

**3b.** Rename the delete error state to a shared action-error. Replace line 51:

```ts
  let actionError = $state("");
```

Update `confirmDelete()` to use it (replace the `deleteError = …` lines at ~239 and ~244):

```ts
  async function confirmDelete() {
    if (!article) return;
    confirmingDelete = false;
    actionError = "";
    try {
      await deleteArticle(pb, article.id);
      await goto("/library");
    } catch {
      actionError = "couldn't delete that. try again.";
    }
  }
```

**3c.** Replace `archive()` (lines 210-212) with a navigating, error-handling version:

```ts
  async function archive() {
    if (!article) return;
    actionError = "";
    try {
      await pb.collection("articles").update(article.id, { status: "archived" });
      await goto("/library");
    } catch {
      actionError = "couldn't archive that. try again.";
    }
  }
```

**3d.** Delete the now-unused `createCollection()` function (lines 226-234). Keep `loadCollections()` and `addToCollection()`.

**3e.** Update the error paragraph (line 256-258) to read `actionError`:

```svelte
  {#if actionError}
    <p class="delete-error" role="alert">{actionError}</p>
  {/if}
```

**3f.** In the rail, remove the `<AddToCollection … />` line (267) and prepend an add-to-collection menu to the action group. Replace the `article-actions` block (lines 268-271) with:

```svelte
        <div class="article-actions" role="group" aria-label="article actions">
          <DropdownMenu label="add to collection" align="start">
            {#snippet trigger()}<FolderPlus class="icon-md" aria-hidden="true" />{/snippet}
            {#snippet children()}
              <div class="menu-label">add to collection</div>
              {#if collections.length > 0}
                {#each collections as c (c.id)}
                  <MenuItem onSelect={() => addToCollection(c.id)}>{c.name}</MenuItem>
                {/each}
              {:else}
                <div class="menu-empty">no collections yet</div>
              {/if}
            {/snippet}
          </DropdownMenu>
          <button class="action-icon" onclick={archive} aria-label="archive article"><Archive class="icon-md" aria-hidden="true" /></button>
          <button class="action-icon" onclick={() => (confirmingDelete = true)} aria-label="delete article"><Trash2 class="icon-md" aria-hidden="true" /></button>
        </div>
```

**3g.** Style the menu trigger to match `.action-icon`. Replace the `.action-icon { … }` selector (lines 321-327) so the trigger shares the rules:

```css
  .article-actions :global(.dropdown__trigger),
  .action-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 2.25rem; height: 2.25rem; padding: 0;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-md); color: var(--color-text-muted); cursor: pointer;
    transition: color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
  }
  .article-actions :global(.dropdown__trigger):hover,
  .action-icon:hover { color: var(--color-accent); box-shadow: var(--shadow-sm); }
  .article-actions :global(.dropdown__trigger):focus-visible,
  .action-icon:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  @media (prefers-reduced-motion: reduce) {
    .article-actions :global(.dropdown__trigger), .action-icon { transition: none; }
  }
```

**3h.** Delete the component + its test:

```bash
git rm apps/web/src/lib/components/AddToCollection.svelte apps/web/src/lib/components/AddToCollection.test.ts
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/routes/read/[id]/page.test.ts"`
Expected: PASS — including the pre-existing "surfaces an error … when delete rejects" case (still asserts the `alert` text and that `goto` was not called; `actionError` carries the same message).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/read/[id]/+page.svelte apps/web/src/routes/read/[id]/page.test.ts apps/web/src/lib/components/AddToCollection.svelte apps/web/src/lib/components/AddToCollection.test.ts
git commit -m "feat(web): reader add-to-collection menu, working archive, drop inline collection mgmt"
```

---

### Task 5: Font controls as a unified segmented control (frontend-design)

Replace the pill-in-pill with one bordered container whose three buttons are flush segments with hairline dividers. Preserve all a11y names and behavior so existing tests keep passing.

**REQUIRED SUB-SKILL:** Use `frontend-design:frontend-design` to settle segment proportions, divider weight, and hover treatment. The code below is the structural baseline; the skill refines visual detail within the token system (no hardcoded colors/radii).

**Files:**
- Modify: `apps/web/src/lib/components/ReaderControls.svelte`
- Modify: `apps/web/src/routes/read/[id]/+page.svelte` (remove the pill wrap)
- Test: `apps/web/src/lib/components/ReaderControls.test.ts` (add one structural assertion)

- [ ] **Step 1: Write the failing test**

Add this case to `apps/web/src/lib/components/ReaderControls.test.ts`:

```ts
  it("renders the three controls as one segmented group", () => {
    const { container } = render(ReaderControls, { prefs, onChange: vi.fn() });
    const group = container.querySelector(".controls");
    expect(group).not.toBeNull();
    expect(group!.querySelectorAll("button.seg")).toHaveLength(3);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/components/ReaderControls.test.ts`
Expected: FAIL — no `button.seg` elements (current controls use the shared pill `Button`).

- [ ] **Step 3: Rewrite `ReaderControls.svelte`**

```svelte
<script lang="ts">
  import type { ReaderPrefs } from "@readmepls/types";
  import { AArrowDown, AArrowUp, Type } from "@lucide/svelte";

  let { prefs, onChange }: { prefs: ReaderPrefs; onChange?: (p: ReaderPrefs) => void } = $props();
  const emit = (patch: Partial<ReaderPrefs>) => onChange?.({ ...prefs, ...patch });
  const clampSize = (n: number) => Math.min(24, Math.max(14, n));
</script>

<div class="controls" role="group" aria-label="reading controls">
  <button class="seg" onclick={() => emit({ size: clampSize(prefs.size - 1) })} aria-label="decrease text size">
    <AArrowDown class="icon-sm" aria-hidden="true" />
  </button>
  <button class="seg" onclick={() => emit({ size: clampSize(prefs.size + 1) })} aria-label="increase text size">
    <AArrowUp class="icon-sm" aria-hidden="true" />
  </button>
  <button class="seg seg--text" onclick={() => emit({ font: prefs.font === "serif" ? "sans" : "serif" })}>
    <Type class="icon-sm" aria-hidden="true" /> {prefs.font === "serif" ? "sans" : "serif"}
  </button>
</div>

<style>
  .controls {
    display: inline-flex; align-items: stretch;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }
  .seg {
    display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1);
    font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--color-text-muted);
    background: none; border: none; cursor: pointer;
    padding: var(--space-2) var(--space-3);
    transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
  }
  .seg + .seg { border-left: 1px solid var(--color-border); }
  .seg:hover { background: var(--color-accent-wash); color: var(--color-text); }
  .seg:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: -2px; }
  .seg--text { min-width: 4.5rem; }
  @media (prefers-reduced-motion: reduce) { .seg { transition: none; } }
</style>
```

- [ ] **Step 4: Remove the pill wrap in the reader page**

In `apps/web/src/routes/read/[id]/+page.svelte`, delete this rule from the `<style>` block (lines 314-318):

```css
  /* controls read as a pill inside the rail */
  .reader-layout :global(.controls) {
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface); border-radius: var(--radius-pill); box-shadow: var(--shadow-sm);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/components/ReaderControls.test.ts`
Expected: PASS — the size-stepper (`aria-label`) and font-toggle (visible text) names are unchanged, so the existing cases still pass alongside the new one.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/ReaderControls.svelte apps/web/src/lib/components/ReaderControls.test.ts apps/web/src/routes/read/[id]/+page.svelte
git commit -m "feat(web): reader font controls as a unified segmented control"
```

---

### Task 6: Dark-theme titles — bind body text color

Root cause: base tokens define `--color-text` but nothing applies it to the document, so unstyled headings (e.g. `ArticleCard` `<h3>`) fall back to the UA default (black), invisible on dark surfaces. Bind it once on `body`.

**Files:**
- Modify: `apps/web/src/app.css`

- [ ] **Step 1: Apply the token to body**

In `apps/web/src/app.css`, extend the `body` rule (lines 16-21) to set the color:

```css
body {
  /* Match the app gradient so rubber-band/over-scroll shows paper, not canvas.
     The gradient itself is re-applied on .app for the in-flow fill. */
  background: var(--color-bg);
  /* Bind the themed text color so otherwise-unstyled text (e.g. card titles)
     follows light/dark/sepia instead of falling back to the UA default. */
  color: var(--color-text);
  min-height: 100dvh;
}
```

- [ ] **Step 2: Verify the existing suite is unaffected**

Run: `npx vitest run`
Expected: PASS (whole suite). The reader sets its own `color: var(--reading-text)` on `.reader`, so this change does not alter reader typography.

- [ ] **Step 3: Manual visual check**

Run the app (`npm run dev` from `apps/web/`, or the repo's documented dev command), open `/library`, switch the header theme to **dark**. Confirm card titles render light (readable), not black. Toggle back to light and sepia to confirm no regression.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app.css
git commit -m "fix(web): bind body text color to the theme so dark-mode titles are visible"
```

---

### Task 7: Sticky header

Keep the top bar pinned to the viewport top while the page scrolls.

**Files:**
- Modify: `apps/web/src/lib/components/TopBar.svelte`

- [ ] **Step 1: Make `.topbar` sticky**

In `apps/web/src/lib/components/TopBar.svelte`, extend the `.topbar` rule (lines 38-43) with sticky positioning:

```css
  .topbar {
    display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap;
    padding: var(--space-3) var(--space-5);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    position: sticky; top: 0; z-index: 20; /* above the reader progress bar (z-index: 10) */
  }
```

- [ ] **Step 2: Verify the existing suite is unaffected**

Run: `npx vitest run src/lib/components/topbar.test.ts`
Expected: PASS.

- [ ] **Step 3: Manual visual check**

Run the app, open `/library` (and a `/read/:id` article), scroll down. Confirm the header stays pinned at the top with an opaque background, and the reader progress bar does not overlap it.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/TopBar.svelte
git commit -m "fix(web): keep the top header sticky"
```

---

## Final Verification

- [ ] Run the whole web suite: `npx vitest run` — expected: all green.
- [ ] Manual pass in the running app: card ⋯ menu (add-to-collection / archive / delete), archived toggle in the library, reader add-to-collection button, reader archive → returns to library, segmented font controls, dark-theme card titles, sticky header on scroll.
