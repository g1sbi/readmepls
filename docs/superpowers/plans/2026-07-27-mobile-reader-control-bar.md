# Mobile Reader Control Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile reader's top-of-page controls with a persistent bottom control bar (`text · chapters · highlights · more`) whose items open drag-to-dismiss bottom sheets, plus a floating `← library` exit — all reachable from any scroll position; desktop is untouched.

**Architecture:** Three new presentational units — `ArticleActions` (extracted so desktop Rail and the mobile "more" sheet share it), `BottomSheet` (a shadcn-svelte Drawer wrapper), and `ReaderControlBar` — are wired into the reader page. The page picks desktop vs mobile chrome with a reactive `isDesktop` matchMedia flag (NOT CSS media queries, which jsdom can't evaluate), tracks a single `activeSheet` union, and drives both the bar and the floating back-link off one `controlsVisible` flag computed with the existing `nextNavVisible` helper. The global `BottomNav` is suppressed on `/read`.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript strict, Vitest + `@testing-library/svelte`, shadcn-svelte (`Drawer`/vaul-svelte), `@lucide/svelte`, existing `tokens.css`.

## Global Constraints

- **TDD always** — failing test first, then implementation. Every unit below leads with a test.
- **Single vitest workspace** — run subsets with `pnpm exec vitest run <pattern>`. `pnpm --filter <pkg> test` does NOT work.
- **`pnpm lint` is pre-existingly RED** repo-wide (no eslint flat config; prettier can't parse `.svelte` without its plugin). Do NOT run repo-wide `pnpm lint` or treat it as a gate. Per-task gates = focused `pnpm exec vitest run <pattern>` + `pnpm typecheck`.
- **If `.svelte-kit` is missing** and web tests error about it, run `pnpm --filter @readmepls/web exec svelte-kit sync` first.
- **Isolation** — all work happens in a git worktree on branch `feat/mobile-reader-control-bar` (created via `superpowers:using-git-worktrees` at execution start, before Task 1).
- **No hardcoded colors/fonts** — reference `tokens.css` vars only. Active state = `--color-accent`.
- **Mobile-first** — usable at 360px, tap targets ≥44px, no horizontal overflow. Respect `env(safe-area-inset-bottom|top)`.
- **Lowercase playful voice** — all UI copy is lowercase ("text", "chapters", "highlights", "more", "library").
- **Reduced motion** — every slide/transform transition is disabled under `@media (prefers-reduced-motion: reduce)`.
- **Svelte 5 runes** (`$props`, `$state`, `$derived`, `$effect`); compose shadcn-svelte primitives — no direct `bits-ui`/`vaul` imports in feature components.
- **TypeScript strict** — no `any` without a written reason.
- **Desktop (`≥1024px`) reader is unchanged** — same 3-column Rail layout and behavior.
- **Conventional Commits**, one logical change per commit.
- **Verify before done** — after each task run `pnpm typecheck` and the relevant `pnpm exec vitest run <pattern>`; read the output.

---

### Task 1: Extract `ArticleActions.svelte`

Pure refactor: lift the reader page's inline article-action group (add-to-collection dropdown, archive, delete) into a reusable component and rewire the page to use it. No behavior change. This sets up the desktop-Rail / mobile-"more"-sheet reuse in Task 4.

**Files:**
- Create: `apps/web/src/lib/components/ArticleActions.svelte`
- Test: `apps/web/src/lib/components/ArticleActions.test.ts`
- Modify: `apps/web/src/routes/read/[id]/+page.svelte`

**Interfaces:**
- Produces: `ArticleActions` with props `{ collections: { id: string; name: string }[]; onAddToCollection: (id: string) => void; onArchive: () => void; onDelete: () => void }`. Renders the add-to-collection `DropdownMenu` (a `MenuItem` per collection, or an empty note), an archive button, and a delete button.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/components/ArticleActions.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ArticleActions from "./ArticleActions.svelte";

const collections = [{ id: "c1", name: "recipes" }];

describe("ArticleActions", () => {
  it("fires onArchive and onDelete from their buttons", async () => {
    const onArchive = vi.fn();
    const onDelete = vi.fn();
    render(ArticleActions, { collections, onAddToCollection: vi.fn(), onArchive, onDelete });
    await fireEvent.click(screen.getByLabelText("archive article"));
    await fireEvent.click(screen.getByLabelText("delete article"));
    expect(onArchive).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });

  it("renders the article actions group", () => {
    render(ArticleActions, { collections, onAddToCollection: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn() });
    // The group wrapper is always present (unlike the dropdown popover, which
    // only mounts its "add to collection" label when opened).
    expect(screen.getByRole("group", { name: "article actions" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/ArticleActions.test.ts`
Expected: FAIL — cannot find module `./ArticleActions.svelte`.

- [ ] **Step 3: Write the component**

`apps/web/src/lib/components/ArticleActions.svelte` (move the markup verbatim from the reader page's current `.article-actions` group, lines ~381–397):
```svelte
<script lang="ts">
  import DropdownMenu from "$lib/components/ui/DropdownMenu.svelte";
  import MenuItem from "$lib/components/ui/MenuItem.svelte";
  import { Archive, Trash2, FolderPlus } from "@lucide/svelte";

  let { collections, onAddToCollection, onArchive, onDelete }: {
    collections: { id: string; name: string }[];
    onAddToCollection: (id: string) => void;
    onArchive: () => void;
    onDelete: () => void;
  } = $props();
</script>

<div class="article-actions" role="group" aria-label="article actions">
  <DropdownMenu label="add to collection" align="start">
    {#snippet trigger()}<FolderPlus class="icon-md" aria-hidden="true" />{/snippet}
    {#snippet children()}
      <div class="menu-label">add to collection</div>
      {#if collections.length > 0}
        {#each collections as c (c.id)}
          <MenuItem onSelect={() => onAddToCollection(c.id)}>{c.name}</MenuItem>
        {/each}
      {:else}
        <div class="menu-empty">no collections yet</div>
      {/if}
    {/snippet}
  </DropdownMenu>
  <button class="action-icon" onclick={onArchive} aria-label="archive article"><Archive class="icon-md" aria-hidden="true" /></button>
  <button class="action-icon" onclick={onDelete} aria-label="delete article"><Trash2 class="icon-md" aria-hidden="true" /></button>
</div>

<style>
  .article-actions { display: flex; gap: var(--space-2); }
  .action-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 44px; height: 44px;
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-md); color: var(--color-text-muted); cursor: pointer;
  }
  .action-icon:hover { color: var(--color-accent); }
  .menu-label { font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-text-muted); padding: var(--space-1) var(--space-2); }
  .menu-empty { font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-text-muted); padding: var(--space-2); }
</style>
```
> Copy the exact `.article-actions` / `.action-icon` / `.menu-*` style rules from the reader page's current `<style>` block so the visual result is byte-identical. If the page defines `.menu-label`/`.menu-empty` differently, use its definitions.

- [ ] **Step 4: Rewire the reader page**

In `apps/web/src/routes/read/[id]/+page.svelte`:
- Add import: `import ArticleActions from "$lib/components/ArticleActions.svelte";`
- Replace the inline `.article-actions` block (the `<div class="article-actions" …>…</div>`, currently ~lines 381–397) with:
```svelte
        <ArticleActions
          {collections}
          onAddToCollection={addToCollection}
          onArchive={archive}
          onDelete={() => (confirmingDelete = true)}
        />
```
- Remove the now-unused imports `DropdownMenu`, `MenuItem`, and (if unused elsewhere in the file) `FolderPlus`, `Archive`, `Trash2`. Keep `ArrowLeft` (still used for the back link). Remove the moved `.article-actions`/`.action-icon`/`.menu-label`/`.menu-empty` style rules from the page `<style>`.
> Verify with a grep that `DropdownMenu`, `MenuItem`, `FolderPlus`, `Archive`, `Trash2` have no remaining references in the page before deleting each import.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm exec vitest run apps/web/src/lib/components/ArticleActions.test.ts "apps/web/src/routes/read/[id]/page.test.ts" && pnpm typecheck`
Expected: PASS — the extraction leaves the reader page's existing tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/ArticleActions.svelte apps/web/src/lib/components/ArticleActions.test.ts "apps/web/src/routes/read/[id]/+page.svelte"
git commit -m "refactor(web): extract ArticleActions from reader page"
```

---

### Task 2: `BottomSheet.svelte` (shadcn-svelte Drawer wrapper)

**Files:**
- Generate: `apps/web/src/lib/components/ui/drawer/` (shadcn-svelte CLI)
- Create: `apps/web/src/lib/components/ui/BottomSheet.svelte`
- Test: `apps/web/src/lib/components/ui/bottomsheet.test.ts`

**Interfaces:**
- Consumes: the generated `$lib/components/ui/drawer` primitive.
- Produces: `BottomSheet` with props `{ open: boolean; onClose: () => void; title: string; children?: Snippet }`. A bottom-anchored, drag-to-dismiss sheet with a grabber, lowercase title, close button, and scrollable body. Mirrors the existing right-edge `Sheet.svelte` wrapper contract.

- [ ] **Step 1: Add the shadcn-svelte Drawer primitive**

Run: `pnpm dlx shadcn-svelte@latest add drawer`
Expected: installs `vaul-svelte` and generates `apps/web/src/lib/components/ui/drawer/` exporting a `Drawer` namespace (`Root`, `Portal`, `Overlay`, `Content`, `Title`, …). Open `apps/web/src/lib/components/ui/drawer/index.ts` and note the exact export shape — the wrapper below must match it. Commit the generated dir in Step 5.

- [ ] **Step 2: Write the failing test**

`apps/web/src/lib/components/ui/bottomsheet.test.ts`:
```ts
import { render, fireEvent, screen } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import BottomSheet from "./BottomSheet.svelte";

describe("BottomSheet", () => {
  it("does not render its header when closed", () => {
    render(BottomSheet, { open: false, onClose: () => {}, title: "text" });
    expect(screen.queryByLabelText("close text")).toBeNull();
  });

  it("renders the title when open", async () => {
    render(BottomSheet, { open: true, onClose: () => {}, title: "chapters" });
    expect(await screen.findByText("chapters")).toBeTruthy();
  });

  it("fires onClose from the close button", async () => {
    const onClose = vi.fn();
    render(BottomSheet, { open: true, onClose, title: "text" });
    await fireEvent.click(await screen.findByLabelText("close text"));
    expect(onClose).toHaveBeenCalled();
  });
});
```
> vaul-svelte drives visibility via pointer + animation. If, in jsdom, `open` does not mount `Drawer.Content` (so `findByText`/`findByLabelText` time out), adjust the queries to what vaul actually renders when open — but do NOT weaken the assertions to nothing. The floor is: closed → header absent; open → title present; close button → `onClose`. Follow the delay/pointer tricks in `apps/web/src/lib/components/ui/sheet.test.ts` if the dismiss path needs them.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/ui/bottomsheet.test.ts`
Expected: FAIL — cannot find module `./BottomSheet.svelte`.

- [ ] **Step 4: Write the wrapper**

`apps/web/src/lib/components/ui/BottomSheet.svelte`:
```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  import * as Drawer from "$lib/components/ui/drawer";
  let { open, onClose, title, children }: {
    open: boolean; onClose: () => void; title: string; children?: Snippet;
  } = $props();
  function onOpenChange(next: boolean) { if (!next) onClose(); }
</script>

<Drawer.Root {open} {onOpenChange}>
  <Drawer.Portal>
    <Drawer.Overlay class="bottomsheet-backdrop" data-testid="bottomsheet-backdrop" />
    <Drawer.Content class="bottomsheet">
      <div class="grabber" aria-hidden="true"></div>
      <header class="bottomsheet-head">
        <Drawer.Title class="bottomsheet-title">{title}</Drawer.Title>
        <button class="close" aria-label={`close ${title}`} onclick={onClose}>✕</button>
      </header>
      <div class="bottomsheet-body">{#if children}{@render children()}{/if}</div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>

<style>
  :global(.bottomsheet-backdrop) { position: fixed; inset: 0; background: rgb(0 0 0 / 0.35); z-index: 40; }
  :global(.bottomsheet) {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
    max-height: 85vh; display: flex; flex-direction: column;
    background: var(--color-surface);
    border-top-left-radius: var(--radius-lg); border-top-right-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    padding: var(--space-3) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
    overflow-y: auto;
  }
  :global(.bottomsheet):focus-visible { outline: none; }
  .grabber { width: 2.5rem; height: 0.25rem; border-radius: var(--radius-pill); background: var(--color-border); margin: 0 auto var(--space-3); }
  .bottomsheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
  :global(.bottomsheet-title) { font-family: var(--font-ui); font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--color-text); margin: 0; }
  .close { background: none; border: none; cursor: pointer; color: var(--color-text-muted); font-size: var(--text-lg); }
  .close:hover { color: var(--color-accent); }
</style>
```
> Match `<Drawer.Root>`/`<Drawer.Portal>`/… to whatever `ui/drawer/index.ts` actually exports (Step 1). If the generated Drawer requires a different open-binding (e.g. `bind:open` instead of `open`/`onOpenChange`), use its documented API — keep the `{ open, onClose, title, children }` prop surface of `BottomSheet` unchanged.

- [ ] **Step 5: Run tests + typecheck, then commit**

Run: `pnpm exec vitest run apps/web/src/lib/components/ui/bottomsheet.test.ts && pnpm typecheck`
Expected: PASS.
```bash
git add apps/web/src/lib/components/ui/drawer apps/web/src/lib/components/ui/BottomSheet.svelte apps/web/src/lib/components/ui/bottomsheet.test.ts
git commit -m "feat(web): add BottomSheet drawer wrapper"
```

---

### Task 3: `ReaderControlBar.svelte` + `SheetKey` type

**Files:**
- Create: `apps/web/src/lib/reader/control-bar.ts`
- Create: `apps/web/src/lib/components/ReaderControlBar.svelte`
- Test: `apps/web/src/lib/components/ReaderControlBar.test.ts`

**Interfaces:**
- Produces:
  - `type SheetKey = "type" | "chapters" | "highlights" | "more"` (from `control-bar.ts`).
  - `ReaderControlBar` with props `{ hasChapters: boolean; hidden?: boolean; active?: SheetKey | null; onOpen: (sheet: SheetKey) => void }`. Renders `<nav aria-label="reader controls">` fixed to the bottom with four labelled icon buttons (`text`, `chapters`, `highlights`, `more`); the `chapters` button is omitted when `!hasChapters`; the button matching `active` gets `aria-current="true"`; `hidden` toggles a `translateY(100%)` transform.

- [ ] **Step 1: Write the `SheetKey` module**

`apps/web/src/lib/reader/control-bar.ts`:
```ts
// The mobile reader bottom bar opens one sheet at a time; this is that set.
export type SheetKey = "type" | "chapters" | "highlights" | "more";
```

- [ ] **Step 2: Write the failing test**

`apps/web/src/lib/components/ReaderControlBar.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ReaderControlBar from "./ReaderControlBar.svelte";

describe("ReaderControlBar", () => {
  it("renders all four items when hasChapters is true", () => {
    render(ReaderControlBar, { hasChapters: true, onOpen: vi.fn() });
    expect(screen.getByRole("navigation", { name: "reader controls" })).toBeTruthy();
    for (const label of ["text", "chapters", "highlights", "more"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("omits chapters when hasChapters is false", () => {
    render(ReaderControlBar, { hasChapters: false, onOpen: vi.fn() });
    expect(screen.queryByText("chapters")).toBeNull();
    expect(screen.getByText("text")).toBeTruthy();
  });

  it("fires onOpen with the item key on click", async () => {
    const onOpen = vi.fn();
    render(ReaderControlBar, { hasChapters: true, onOpen });
    await fireEvent.click(screen.getByText("highlights"));
    expect(onOpen).toHaveBeenCalledWith("highlights");
  });

  it("marks the active item with aria-current", () => {
    render(ReaderControlBar, { hasChapters: true, active: "more", onOpen: vi.fn() });
    expect(screen.getByText("more").closest("button")!.getAttribute("aria-current")).toBe("true");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/ReaderControlBar.test.ts`
Expected: FAIL — cannot find module `./ReaderControlBar.svelte`.

- [ ] **Step 4: Write the component**

`apps/web/src/lib/components/ReaderControlBar.svelte`:
```svelte
<script lang="ts">
  import type { Component } from "svelte";
  import { Type, List, Highlighter, MoreHorizontal } from "@lucide/svelte";
  import type { SheetKey } from "$lib/reader/control-bar.js";

  let { hasChapters, hidden = false, active = null, onOpen }: {
    hasChapters: boolean;
    hidden?: boolean;
    active?: SheetKey | null;
    onOpen: (sheet: SheetKey) => void;
  } = $props();

  const items: { key: SheetKey; label: string; icon: Component }[] = [
    { key: "type", label: "text", icon: Type },
    { key: "chapters", label: "chapters", icon: List },
    { key: "highlights", label: "highlights", icon: Highlighter },
    { key: "more", label: "more", icon: MoreHorizontal },
  ];
  const shown = $derived(items.filter((it) => it.key !== "chapters" || hasChapters));
</script>

<nav class="control-bar" aria-label="reader controls" data-hidden={hidden}>
  {#each shown as it (it.key)}
    {@const Icon = it.icon}
    <button
      class="bar-btn"
      class:active={active === it.key}
      aria-current={active === it.key ? "true" : undefined}
      onclick={() => onOpen(it.key)}
    >
      <Icon class="icon-sm" aria-hidden="true" />
      <span>{it.label}</span>
    </button>
  {/each}
</nav>

<style>
  .control-bar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
    display: flex; justify-content: space-around; align-items: stretch;
    background: var(--color-surface); border-top: 1px solid var(--color-border);
    padding-bottom: env(safe-area-inset-bottom);
    transition: transform var(--dur-base) var(--ease-paper);
  }
  .control-bar[data-hidden="true"] { transform: translateY(100%); }
  .bar-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px; min-height: 56px; padding: 0.4rem 0;
    font-family: var(--font-ui); font-size: 0.7rem;
    color: var(--color-text-muted); background: none; border: none; cursor: pointer;
  }
  .bar-btn.active { color: var(--color-accent); }
  .bar-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: var(--focus-ring-offset); }
  @media (prefers-reduced-motion: reduce) { .control-bar { transition: none; } }
</style>
```
> The bar is rendered only on mobile by the page (Task 4), so it needs no `@media (min-width:1024px){display:none}` of its own. `@lucide/svelte` icons are Svelte `Component`s; if the `{@const Icon = it.icon}` render trips strict typing, annotate the array as `{ …; icon: Component<any> }[]` with the comment `// lucide icon component` — this is the one allowed `any`.

- [ ] **Step 5: Run tests + typecheck, then commit**

Run: `pnpm exec vitest run apps/web/src/lib/components/ReaderControlBar.test.ts && pnpm typecheck`
Expected: PASS.
```bash
git add apps/web/src/lib/reader/control-bar.ts apps/web/src/lib/components/ReaderControlBar.svelte apps/web/src/lib/components/ReaderControlBar.test.ts
git commit -m "feat(web): add ReaderControlBar bottom bar component"
```

---

### Task 4: Wire the mobile control chrome into the reader page

Swap the mobile top-Rail + top-bar chapters button for: a reactive desktop/mobile split, the bottom `ReaderControlBar`, four `BottomSheet`s reusing existing feature components, and a floating `← library` exit — all driven by `activeSheet` and `controlsVisible`.

**Files:**
- Modify: `apps/web/src/routes/read/[id]/+page.svelte`
- Modify: `apps/web/src/routes/read/[id]/page.test.ts`

**Interfaces:**
- Consumes: `ReaderControlBar` + `SheetKey` (Task 3), `BottomSheet` (Task 2), `ArticleActions` (Task 1), existing `ReaderControls`/`ChaptersSidebar`/`HighlightsSidebar`/`TagEditor`/`Rail`, and `nextNavVisible` from `$lib/components/bottom-nav-scroll.js`.
- Produces: the finished mobile reader chrome. Desktop path unchanged.

- [ ] **Step 1: Write the failing test**

Extend `apps/web/src/routes/read/[id]/page.test.ts`. Reuse the file's existing harness (mocked `browserPb`, the `IntersectionObserver` stub already present, and however it renders the reader page). **Add a `matchMedia` stub** near the other global stubs so the page's `isDesktop` reads mobile:
```ts
// Reader page reads matchMedia for the desktop/mobile split; default to mobile.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }),
  });
});
```
Then add a mobile-chrome case (mirror the existing chapters test's article/content fixture, whose `content_html` includes `<h2>First Chapter</h2>…<h2>Second Chapter</h2>` and no `content.toc`):
```ts
it("shows the mobile control bar and opens chapters from it", async () => {
  render(Page); // however this file mounts the reader page
  // bar present
  expect(await screen.findByRole("navigation", { name: "reader controls" })).toBeTruthy();
  // floating exit present
  expect(screen.getByRole("link", { name: "library" })).toBeTruthy();
  // no visible chapters nav until the bar item is tapped
  await fireEvent.click(screen.getByText("chapters"));
  expect(await screen.findByRole("navigation", { name: "chapters" })).toBeTruthy();
  expect(screen.getByText("First Chapter")).toBeTruthy();
});
```
> Update/remove any existing assertions that reference the old `.toc-trigger` button, `mobileTocOpen`, or the right-edge chapters `Sheet` — they no longer exist. If the existing chapters test asserted `findByRole("navigation", { name: "chapters" })` on mount, change it to assert after the `chapters` bar tap (as above), since on mobile the toc now lives in a sheet. Import `fireEvent`/`screen` if not already imported.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run "apps/web/src/routes/read/[id]/page.test.ts"`
Expected: FAIL — no `navigation` named "reader controls".

- [ ] **Step 3: Script — imports, state, matchMedia, scroll visibility, jump**

In `apps/web/src/routes/read/[id]/+page.svelte` `<script>`:

Add imports:
```ts
  import ReaderControlBar from "$lib/components/ReaderControlBar.svelte";
  import BottomSheet from "$lib/components/ui/BottomSheet.svelte";
  import { nextNavVisible } from "$lib/components/bottom-nav-scroll.js";
  import type { SheetKey } from "$lib/reader/control-bar.js";
```
Remove the now-unused right-edge `Sheet` import (`import Sheet from "$lib/components/ui/Sheet.svelte";`).

Replace the `let mobileTocOpen = $state(false);` line with:
```ts
  let activeSheet = $state<SheetKey | null>(null);
  let controlsVisible = $state(true);
  let prevScrollY = 0;
  let isDesktop = $state(false);
  let desktopMq: MediaQueryList | null = null;
  const hasChapters = $derived(toc.length > 0);
  function onDesktopChange(e: MediaQueryListEvent) { isDesktop = e.matches; }
```

In `jumpToHeading`, change `mobileTocOpen = false;` to `activeSheet = null;`.

Extend `onScroll` — add these two lines at the very top of the function (before `pendingProgress = computeProgress();`):
```ts
    const curY = window.scrollY;
    controlsVisible = nextNavVisible(prevScrollY, curY, controlsVisible);
    prevScrollY = curY;
```

- [ ] **Step 4: Script — lifecycle wiring**

In `onMount`, immediately before `window.addEventListener("scroll", onScroll, { passive: true });`, add:
```ts
    prevScrollY = window.scrollY;
    desktopMq = window.matchMedia("(min-width: 1024px)");
    isDesktop = desktopMq.matches;
    desktopMq.addEventListener("change", onDesktopChange);
```
In `onDestroy`, add (next to `tocObserver?.disconnect();`):
```ts
    desktopMq?.removeEventListener("change", onDesktopChange);
```

- [ ] **Step 5: Template — desktop Rail becomes conditional**

Wrap the top `.bar` (the `<div class="bar">…</div>`, back link only) so it renders on desktop:
```svelte
  {#if isDesktop}
    <div class="bar">
      <a class="back" href="/library"><ArrowLeft class="icon-sm" aria-hidden="true" /> library</a>
    </div>
  {/if}
```
Remove the old `.toc-trigger` `{#if toc.length}<button …>chapters</button>{/if}` from inside that bar.

Wrap the `<Rail label="reading tools">…</Rail>` in `{#if isDesktop}`, and its `HighlightsSidebar` sibling too. The `reader-layout` block becomes:
```svelte
    <div class="reader-layout">
      {#if isDesktop}
        <Rail label="reading tools">
          {#if toc.length}
            <section class="rail-chapters">
              <h2 class="rail-heading">chapters</h2>
              <ChaptersSidebar {toc} activeId={activeHeadingId} onjump={jumpToHeading} />
            </section>
          {/if}
          <ReaderControls {prefs} onChange={savePrefs} />
          <TagEditor tags={manualTags.map((t) => ({ id: t.id, name: t.name }))} onadd={addTag} onremove={removeTag} />
          <ArticleActions {collections} onAddToCollection={addToCollection} onArchive={archive} onDelete={() => (confirmingDelete = true)} />
        </Rail>
      {/if}

      <div class="reader-main">
        <!-- unchanged article markup -->
      </div>

      {#if isDesktop}
        <HighlightsSidebar {highlights} {orphans} onjump={jumpTo} ondelete={deleteHighlight} />
      {/if}
    </div>
```
> Keep the `<article>`/`reader-main` markup exactly as-is. `.rail-chapters` no longer needs its `display:none`/`@media` desktop toggle (the Rail only renders on desktop now) — delete the `.rail-chapters { display:none }` rule and the `@media (min-width:1024px){ .rail-chapters{display:block}; .toc-trigger{display:none} }` block and the `.toc-trigger` rule from the page `<style>`.

- [ ] **Step 6: Template — mobile chrome (bar, sheets, floating back)**

Add a mobile-only block. Place it just after the `<div class="reader-shell">…</div>` closes (top-level, next to `ConfirmDialog`), guarded by content + `!isDesktop`:
```svelte
{#if content && !isDesktop}
  <a class="back-floating" href="/library" data-hidden={!controlsVisible}>
    <ArrowLeft class="icon-sm" aria-hidden="true" /> library
  </a>

  <ReaderControlBar
    hasChapters={hasChapters}
    hidden={!controlsVisible}
    active={activeSheet}
    onOpen={(s) => (activeSheet = s)}
  />

  <BottomSheet open={activeSheet === "type"} onClose={() => (activeSheet = null)} title="text">
    <ReaderControls {prefs} onChange={savePrefs} />
  </BottomSheet>

  {#if hasChapters}
    <BottomSheet open={activeSheet === "chapters"} onClose={() => (activeSheet = null)} title="chapters">
      <ChaptersSidebar {toc} activeId={activeHeadingId} onjump={jumpToHeading} />
    </BottomSheet>
  {/if}

  <BottomSheet open={activeSheet === "highlights"} onClose={() => (activeSheet = null)} title="highlights">
    <HighlightsSidebar {highlights} {orphans} onjump={(id) => { jumpTo(id); activeSheet = null; }} ondelete={deleteHighlight} />
  </BottomSheet>

  <BottomSheet open={activeSheet === "more"} onClose={() => (activeSheet = null)} title="more">
    <TagEditor tags={manualTags.map((t) => ({ id: t.id, name: t.name }))} onadd={addTag} onremove={removeTag} />
    <ArticleActions {collections} onAddToCollection={addToCollection} onArchive={archive} onDelete={() => (confirmingDelete = true)} />
  </BottomSheet>
{/if}
```
Remove the old top-level `<Sheet open={mobileTocOpen} …>` chapters drawer entirely.

- [ ] **Step 7: Template — styles for the floating back-link + mobile content padding**

Add to the page `<style>`:
```css
  .back-floating {
    display: inline-flex; align-items: center; gap: var(--space-1);
    position: fixed; z-index: 30;
    top: calc(env(safe-area-inset-top) + var(--space-2)); left: var(--space-2);
    min-height: 44px; padding: 0 var(--space-3);
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-pill); box-shadow: var(--shadow-lg);
    font-family: var(--font-ui); font-size: var(--text-sm);
    color: var(--color-text-muted); text-decoration: none;
    transition: transform var(--dur-base) var(--ease-paper), opacity var(--dur-base) var(--ease-paper);
  }
  .back-floating:hover { color: var(--color-accent); }
  .back-floating[data-hidden="true"] { transform: translateY(calc(-100% - var(--space-4))); opacity: 0; pointer-events: none; }
  /* Keep the last lines of prose clear of the fixed bottom bar on mobile. */
  @media (max-width: 1023.98px) { .reader-shell { padding-bottom: 72px; } }
  @media (prefers-reduced-motion: reduce) { .back-floating { transition: none; } }
```

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm exec vitest run "apps/web/src/routes/read/[id]/page.test.ts" && pnpm typecheck`
Expected: PASS. If the page test now double-matches a role, confirm the desktop Rail is not rendering (matchMedia stub returns `matches:false`).

- [ ] **Step 9: Full suite + manual smoke**

Run: `pnpm test`
Expected: whole workspace green.

Manual (recommended): start PocketBase + web dev server, open a long article on a ≤640px viewport. Confirm: bottom bar with `text · chapters · highlights · more`; each opens its bottom sheet; drag-down / backdrop / close-✕ dismiss; chapters jump closes the sheet; the bar and the floating `← library` hide on scroll-down and return on scroll-up; the global bottom nav is gone on this page (after Task 5); an article with no headings shows no `chapters` item; at ≥1024px the desktop Rail layout is unchanged.

- [ ] **Step 10: Commit**

```bash
git add "apps/web/src/routes/read/[id]/+page.svelte" "apps/web/src/routes/read/[id]/page.test.ts"
git commit -m "feat(web): mobile reader bottom control bar, sheets, and floating exit"
```

---

### Task 5: Suppress the global `BottomNav` on `/read`

**Files:**
- Modify: `apps/web/src/lib/components/bottom-nav-scroll.ts`
- Test: `apps/web/src/lib/components/bottom-nav-scroll.test.ts`
- Modify: `apps/web/src/routes/+layout.svelte`

**Interfaces:**
- Produces: `showsGlobalNav(pathname: string): boolean` — `false` on reader routes, `true` elsewhere. The layout gates `<BottomNav>` on it so the reader's own bottom bar is the only bottom chrome on `/read`.

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/lib/components/bottom-nav-scroll.test.ts` (create the file if absent, importing the existing helpers to match the module's style):
```ts
import { describe, it, expect } from "vitest";
import { showsGlobalNav } from "./bottom-nav-scroll.js";

describe("showsGlobalNav", () => {
  it("hides the global nav on reader routes", () => {
    expect(showsGlobalNav("/read/abc123")).toBe(false);
  });
  it("shows the global nav elsewhere", () => {
    expect(showsGlobalNav("/library")).toBe(true);
    expect(showsGlobalNav("/collections")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/bottom-nav-scroll.test.ts`
Expected: FAIL — `showsGlobalNav` is not exported.

- [ ] **Step 3: Add the helper**

Append to `apps/web/src/lib/components/bottom-nav-scroll.ts`:
```ts
// The reader route renders its own bottom control bar, so the global bottom
// nav is suppressed there to avoid two stacked bottom bars.
export function showsGlobalNav(pathname: string): boolean {
  return !pathname.startsWith("/read/");
}
```

- [ ] **Step 4: Gate the layout**

In `apps/web/src/routes/+layout.svelte`, add the import (with the other `$lib` imports):
```ts
  import { showsGlobalNav } from "$lib/components/bottom-nav-scroll.js";
```
Change the `<BottomNav>` render from:
```svelte
    <BottomNav pathname={$page.url.pathname} />
```
to:
```svelte
    {#if showsGlobalNav($page.url.pathname)}
      <BottomNav pathname={$page.url.pathname} />
    {/if}
```
> `SearchPalette` and the rest of the `{#if chrome}` block are unchanged — only `<BottomNav>` is gated.

- [ ] **Step 5: Run tests + typecheck, then commit**

Run: `pnpm exec vitest run apps/web/src/lib/components/bottom-nav-scroll.test.ts && pnpm typecheck`
Expected: PASS.
```bash
git add apps/web/src/lib/components/bottom-nav-scroll.ts apps/web/src/lib/components/bottom-nav-scroll.test.ts apps/web/src/routes/+layout.svelte
git commit -m "feat(web): suppress global bottom nav on the reader route"
```

---

## Post-implementation

- [ ] Run `pnpm test` and `pnpm typecheck` — all green. (Skip repo-wide `pnpm lint` — pre-existingly red.)
- [ ] Use `superpowers:finishing-a-development-branch` to squash and integrate `feat/mobile-reader-control-bar`.
- [ ] Delete this plan and the paired spec (`docs/superpowers/specs/2026-07-27-mobile-reader-control-bar-design.md`) once merged, per the working agreements.

## Self-review notes (spec coverage)

- Unified mobile control surface, bottom bar + sheets (spec §Architecture, §Decisions) → Tasks 2, 3, 4.
- Bar items `text · chapters · highlights · more`; chapters conditional (spec §Decisions 3) → Task 3 + Task 4 sheets.
- Auto-hide via `nextNavVisible`, bound to bar + floating back-link (spec §State) → Task 4 Steps 3–4, 6–7.
- Drag-to-dismiss bottom sheets / shadcn-svelte Drawer (spec §Decisions 5) → Task 2.
- Global `BottomNav` swap on `/read` (spec §Decisions 6) → Task 5.
- Floating `← library`, in-flow back-link desktop-only (spec §Decisions 7, §Template restructure) → Task 4 Steps 5–7.
- `ArticleActions` extraction for desktop/mobile reuse (spec §Components) → Task 1.
- `Rail` desktop-only via `isDesktop` conditional render (spec §Template restructure; jsdom can't evaluate `@media`) → Task 4 Steps 4–5.
- Desktop unchanged (spec §Non-goals) → Task 4 keeps the `isDesktop` desktop branch identical.
- Tokens-only, 44px targets, safe areas, reduced motion (spec §Styling) → Tasks 2, 3, 4.
- Testing matrix (spec §Testing) → tests in Tasks 1–5.
