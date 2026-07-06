# Mobile Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the buggy mobile app chrome — replace the wrapping TopBar with a clean single-row header + a thumb-zone bottom tab bar that auto-hides on scroll, and de-duplicate the search.

**Architecture:** Additive, mobile-first. A new `BottomNav` component owns primary navigation on mobile; the `TopBar` collapses to brand + a Sheet-based menu (theme + sign out) on mobile and keeps its inline layout on desktop. Scroll-direction visibility lives in a pure, unit-tested helper. Search de-dupes via a URL `focus=search` flag consumed by `LibraryToolbar`. Desktop layout is unchanged.

**Tech Stack:** SvelteKit (Svelte 5 runes), Vitest + @testing-library/svelte, `@lucide/svelte` icons, existing `Sheet` primitive, CSS tokens in `tokens.css`.

## Global Constraints

- **Breakpoint:** mobile = `max-width: 640px` (existing repo convention; CSS media queries cannot read `var()` here). Copy this exact value into every media query.
- **Touch targets:** every interactive control on mobile ≥ 44px (bottom-nav tabs use `min-height: 56px`; menu button, Sheet rows use `min-height: 44px`).
- **Never hardcode a color/font** — reference tokens (`--color-*`, `--font-*`, `--dur-*`, `--ease-*`). Available: `--dur-base: 200ms`, `--ease-paper`.
- **TDD:** failing test first, then minimal implementation. All existing web tests (42 files, 144 tests) stay green: run `npx vitest run apps/web` from repo root.
- **Reduced motion:** any transition guarded by `@media (prefers-reduced-motion: reduce)`.
- **Commits:** Conventional Commits, one logical change per task. End messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Working dir:** worktree at `.claude/worktrees/mobile-topbar`. Run test commands from `apps/web`'s repo root (`cd` to the worktree root). `.svelte-kit` is already synced.

---

## File Structure

- **Create** `apps/web/src/lib/components/bottom-nav-scroll.ts` — pure scroll-direction visibility helper.
- **Create** `apps/web/src/lib/components/bottom-nav-scroll.test.ts` — unit tests for the helper.
- **Create** `apps/web/src/lib/components/BottomNav.svelte` — mobile-only fixed bottom tab bar.
- **Create** `apps/web/src/lib/components/bottomnav.test.ts` — component tests (links, active, href).
- **Modify** `apps/web/src/routes/+layout.svelte` — mount `BottomNav`, add mobile page bottom padding.
- **Modify** `apps/web/src/lib/components/TopBar.svelte` — mobile menu button + Sheet; hide nav/search on mobile; DRY theme/signout via snippets.
- **Modify** `apps/web/src/lib/components/topbar.test.ts` — add mobile-menu test.
- **Modify** `apps/web/src/routes/library/+page.server.ts` — return `focusSearch` from the URL.
- **Modify** `apps/web/src/routes/library/+page.svelte` — pass `focusSearch` to `LibraryToolbar`.
- **Modify** `apps/web/src/lib/components/LibraryToolbar.svelte` — `focusSearch` prop + autofocus; mobile row layout + 44px targets.
- **Modify** `apps/web/src/lib/components/library-toolbar.test.ts` — add focus test.

---

## Task 1: Pure scroll-direction helper

**Files:**
- Create: `apps/web/src/lib/components/bottom-nav-scroll.ts`
- Test: `apps/web/src/lib/components/bottom-nav-scroll.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `nextNavVisible(prevY: number, curY: number, wasVisible: boolean, threshold?: number): boolean`; constants `NAV_SCROLL_THRESHOLD = 8`, `NAV_TOP_ZONE = 24`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/components/bottom-nav-scroll.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nextNavVisible, NAV_SCROLL_THRESHOLD, NAV_TOP_ZONE } from "./bottom-nav-scroll.js";

describe("nextNavVisible", () => {
  it("is always visible near the top of the page", () => {
    expect(nextNavVisible(500, NAV_TOP_ZONE, false)).toBe(true);
    expect(nextNavVisible(500, 0, false)).toBe(true);
  });

  it("hides when scrolling down past the threshold", () => {
    expect(nextNavVisible(200, 200 + NAV_SCROLL_THRESHOLD + 1, true)).toBe(false);
  });

  it("reveals when scrolling up past the threshold", () => {
    expect(nextNavVisible(400, 400 - NAV_SCROLL_THRESHOLD - 1, false)).toBe(true);
  });

  it("ignores sub-threshold jitter, keeping the previous state", () => {
    expect(nextNavVisible(300, 302, true)).toBe(true);
    expect(nextNavVisible(300, 302, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/components/bottom-nav-scroll.test.ts`
Expected: FAIL — `Failed to resolve import "./bottom-nav-scroll.js"` / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/lib/components/bottom-nav-scroll.ts`:

```ts
// Pure scroll-direction visibility for the mobile bottom nav.
// Hide when scrolling down; reveal when scrolling up; always show near the top.
export const NAV_SCROLL_THRESHOLD = 8;
export const NAV_TOP_ZONE = 24;

export function nextNavVisible(
  prevY: number,
  curY: number,
  wasVisible: boolean,
  threshold: number = NAV_SCROLL_THRESHOLD,
): boolean {
  if (curY <= NAV_TOP_ZONE) return true; // always visible near the top
  const delta = curY - prevY;
  if (Math.abs(delta) < threshold) return wasVisible; // ignore jitter
  return delta < 0; // scrolling up → visible, down → hidden
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/components/bottom-nav-scroll.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/bottom-nav-scroll.ts apps/web/src/lib/components/bottom-nav-scroll.test.ts
git commit -m "feat(web): pure scroll-direction helper for the mobile bottom nav

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: BottomNav component

**Files:**
- Create: `apps/web/src/lib/components/BottomNav.svelte`
- Test: `apps/web/src/lib/components/bottomnav.test.ts`

**Interfaces:**
- Consumes: `nextNavVisible` from Task 1.
- Produces: `BottomNav` Svelte component with prop `{ pathname: string }`. Renders three `<a>` tabs (library `/library`, search `/library?focus=search`, profile `/profile`); active tab has `aria-current="page"`; reader routes (`/read...`) count as within library.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/components/bottomnav.test.ts`:

```ts
import { render } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import BottomNav from "./BottomNav.svelte";

describe("BottomNav", () => {
  it("renders the three primary tabs with correct hrefs", () => {
    const { getByRole } = render(BottomNav, { pathname: "/library" });
    expect(getByRole("link", { name: /library/i })).toHaveAttribute("href", "/library");
    expect(getByRole("link", { name: /search/i })).toHaveAttribute("href", "/library?focus=search");
    expect(getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/profile");
  });

  it("marks the active tab from the pathname", () => {
    const { getByRole } = render(BottomNav, { pathname: "/profile" });
    expect(getByRole("link", { name: /profile/i })).toHaveAttribute("aria-current", "page");
    expect(getByRole("link", { name: /library/i })).not.toHaveAttribute("aria-current");
  });

  it("treats the reader route as within the library tab", () => {
    const { getByRole } = render(BottomNav, { pathname: "/read/abc123" });
    expect(getByRole("link", { name: /library/i })).toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/components/bottomnav.test.ts`
Expected: FAIL — cannot resolve `./BottomNav.svelte`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/lib/components/BottomNav.svelte`:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { Library, Search, User } from "@lucide/svelte";
  import { nextNavVisible } from "./bottom-nav-scroll.js";

  let { pathname }: { pathname: string } = $props();

  const TABS = [
    { href: "/library", label: "library", icon: Library, match: (p: string) => p === "/library" || p.startsWith("/read") },
    { href: "/library?focus=search", label: "search", icon: Search, match: (_p: string) => false },
    { href: "/profile", label: "profile", icon: User, match: (p: string) => p === "/profile" },
  ];

  let visible = $state(true);

  onMount(() => {
    let prevY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const curY = window.scrollY;
        visible = nextNavVisible(prevY, curY, visible);
        prevY = curY;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  });
</script>

<nav class="bottom-nav" data-visible={visible} aria-label="primary">
  {#each TABS as tab (tab.label)}
    {@const Icon = tab.icon}
    <a href={tab.href} aria-current={tab.match(pathname) ? "page" : undefined}>
      <Icon class="icon-sm" aria-hidden="true" />
      <span>{tab.label}</span>
    </a>
  {/each}
</nav>

<style>
  .bottom-nav {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
    display: none; /* desktop: hidden */
    justify-content: space-around; align-items: stretch;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
    padding-bottom: env(safe-area-inset-bottom);
    transition: transform var(--dur-base) var(--ease-paper);
  }
  .bottom-nav[data-visible="false"] { transform: translateY(100%); }
  .bottom-nav a {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2px; min-height: 56px; padding: 0.4rem 0;
    font-family: var(--font-ui); font-size: 0.7rem;
    color: var(--color-text-muted); text-decoration: none;
  }
  .bottom-nav a[aria-current="page"] { color: var(--color-accent); }
  @media (max-width: 640px) { .bottom-nav { display: flex; } }
  @media (prefers-reduced-motion: reduce) { .bottom-nav { transition: none; } }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/components/bottomnav.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/BottomNav.svelte apps/web/src/lib/components/bottomnav.test.ts
git commit -m "feat(web): mobile bottom tab bar with scroll-direction auto-hide

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Mount BottomNav in layout + mobile page padding

**Files:**
- Modify: `apps/web/src/routes/+layout.svelte`

**Interfaces:**
- Consumes: `BottomNav` (prop `pathname`) from Task 2; `chrome` derived and `$page` already present in the layout.
- Produces: nothing new (integration only).

- [ ] **Step 1: Add the import**

In `apps/web/src/routes/+layout.svelte`, after the existing `import TopBar ...` line (currently line 11), add:

```svelte
  import BottomNav from "$lib/components/BottomNav.svelte";
```

- [ ] **Step 2: Render BottomNav in the app shell**

Replace the current markup block:

```svelte
<div class="app">
  {#if chrome}
    <TopBar {theme} onTheme={setTheme} onSignOut={signOut} />
  {/if}
  <div class="page">{@render children()}</div>
</div>
```

with:

```svelte
<div class="app">
  {#if chrome}
    <TopBar {theme} onTheme={setTheme} onSignOut={signOut} />
  {/if}
  <div class="page">{@render children()}</div>
  {#if chrome}
    <BottomNav pathname={$page.url.pathname} />
  {/if}
</div>
```

- [ ] **Step 3: Add mobile bottom padding so the fixed bar never covers content**

In the `<style>` block, append (after the existing `@media (prefers-reduced-motion: reduce)` rule):

```svelte
  @media (max-width: 640px) {
    .page { padding-bottom: calc(56px + env(safe-area-inset-bottom) + 1rem); }
  }
```

- [ ] **Step 4: Verify the full web suite still passes**

Run: `cd apps/web && npx vitest run` (or from repo root: `npx vitest run apps/web`)
Expected: PASS — 42 files, 144 tests, 0 failures (unchanged; layout has no direct test but nothing regressed).

- [ ] **Step 5: Type-check the layout**

Run: `cd apps/web && npx svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors in `+layout.svelte` (pre-existing warnings elsewhere are acceptable — do not introduce new errors).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/+layout.svelte
git commit -m "feat(web): mount bottom nav and reserve mobile bottom padding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: TopBar mobile menu (Sheet) + hide nav/search on mobile

**Files:**
- Modify: `apps/web/src/lib/components/TopBar.svelte`
- Test: `apps/web/src/lib/components/topbar.test.ts`

**Interfaces:**
- Consumes: existing `Sheet` (`$lib/components/ui/Sheet.svelte`, props `{ open, onClose, title, children }`); existing props `theme`, `onTheme`, `onSignOut`.
- Produces: a mobile menu button (`aria-label="menu"`) that opens a `Sheet` (role `dialog`, `aria-label="menu"`) containing the theme switcher and sign-out. Theme/sign-out markup is shared with the desktop cluster via snippets (no duplication in source).

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/components/topbar.test.ts`. Change the top import line to include `render`, `fireEvent`, `within`, and add the new test inside the `describe` block:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/svelte";
import TopBar from "./TopBar.svelte";
```

New test (add inside `describe("TopBar", ...)`):

```ts
  it("opens a mobile menu with theme controls and sign out", async () => {
    const onTheme = vi.fn();
    const onSignOut = vi.fn();
    render(TopBar, { theme: "light", onTheme, onSignOut });

    await fireEvent.click(screen.getByRole("button", { name: /^menu$/i }));
    const dialog = screen.getByRole("dialog", { name: /menu/i });

    await fireEvent.click(within(dialog).getByRole("button", { name: /dark/i }));
    expect(onTheme).toHaveBeenCalledWith("dark");

    await fireEvent.click(within(dialog).getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/components/topbar.test.ts`
Expected: FAIL — no button named "menu" / no dialog.

- [ ] **Step 3: Rewrite TopBar with snippets, menu button, and Sheet**

Replace the entire contents of `apps/web/src/lib/components/TopBar.svelte` with:

```svelte
<script lang="ts">
  import { goto } from "$app/navigation";
  import { THEMES, type Theme } from "$lib/theme/theme.js";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import { Search, Library, User, Sun, Moon, Coffee, LogOut, Menu } from "@lucide/svelte";

  // Theme → icon map; theme text label stays the accessible name.
  const themeIcon = { light: Sun, dark: Moon, sepia: Coffee } as const;

  let { theme, onTheme, onSignOut }: { theme: Theme; onTheme: (t: Theme) => void; onSignOut: () => void } = $props();
  let q = $state("");
  let menuOpen = $state(false);
</script>

{#snippet themeControls()}
  <div class="themes" role="group" aria-label="theme">
    {#each THEMES as t}
      {@const Icon = themeIcon[t]}
      <button
        type="button"
        aria-pressed={theme === t}
        data-active={theme === t}
        onclick={() => onTheme(t)}><Icon class="icon-sm" aria-hidden="true" /><span class="label">{t}</span></button>
    {/each}
  </div>
{/snippet}

{#snippet signOutButton()}
  <button type="button" class="signout" onclick={onSignOut}><LogOut class="icon-sm" aria-hidden="true" />sign out</button>
{/snippet}

<header class="topbar">
  <a class="brand" href="/">readme<span>pls</span></a>
  <nav>
    <a href="/library"><Library class="icon-sm" aria-hidden="true" />library</a>
    <a href="/profile"><User class="icon-sm" aria-hidden="true" />profile</a>
  </nav>
  <form class="search" onsubmit={(e) => { e.preventDefault(); if (q.trim()) goto(`/search?q=${encodeURIComponent(q)}`); }}>
    <Search class="icon-sm search-icon" aria-hidden="true" />
    <input bind:value={q} placeholder="search…" aria-label="search library" />
  </form>
  <div class="right">
    {@render themeControls()}
    {@render signOutButton()}
  </div>
  <button type="button" class="menu-btn" aria-label="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = true)}>
    <Menu class="icon-sm" aria-hidden="true" />
  </button>
</header>

<Sheet open={menuOpen} onClose={() => (menuOpen = false)} title="menu">
  <div class="sheet-menu">
    {@render themeControls()}
    {@render signOutButton()}
  </div>
</Sheet>

<style>
  .topbar {
    display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap;
    padding: var(--space-3) var(--space-5);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    position: sticky; top: 0; z-index: 20; /* above the reader progress bar (z-index: 10) */
  }
  .brand { font-family: var(--font-display); font-size: 1.3rem; font-weight: 600; color: var(--color-text); text-decoration: none; }
  .brand span { color: var(--color-accent); }
  nav { display: flex; gap: var(--space-4); }
  nav a { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-ui); color: var(--color-text-muted); text-decoration: none; }
  nav a:hover { color: var(--color-text); }
  .right { margin-left: auto; display: flex; align-items: center; gap: var(--space-4); }
  .themes { display: inline-flex; border: 1px solid var(--color-border); border-radius: var(--radius-pill); overflow: hidden; }
  .themes button { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-ui); font-size: 0.8rem; padding: 0.25rem 0.6rem; border: none; background: transparent; color: var(--color-text-muted); cursor: pointer; }
  .themes button[data-active="true"] { background: var(--color-accent-wash); color: var(--color-text); }
  .themes button:focus-visible, .signout:focus-visible, .menu-btn:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  .signout { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-ui); font-size: 0.85rem; background: none; border: none; color: var(--color-text-muted); cursor: pointer; }
  .signout:hover { color: var(--color-text); }
  .search { display: flex; flex: 1; max-width: 20rem; position: relative; align-items: center; }
  .search :global(.search-icon) { position: absolute; left: 0.6rem; color: var(--color-text-subtle); pointer-events: none; }
  .search input {
    width: 100%;
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    padding: 0.3rem 0.65rem 0.3rem 1.9rem; /* left pad for the icon */
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-text);
    outline: none;
  }
  .search input::placeholder { color: var(--color-text-subtle); }
  .search input:focus { border-color: var(--color-ring); box-shadow: 0 0 0 2px var(--color-accent-wash); }

  /* Menu button is desktop-hidden; revealed on mobile. */
  .menu-btn { display: none; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; margin-left: auto; background: none; border: none; color: var(--color-text-muted); cursor: pointer; }

  /* Mobile menu (Sheet) rows are full-size touch targets with visible labels. */
  .sheet-menu { display: flex; flex-direction: column; gap: var(--space-3); }
  .sheet-menu .themes { flex-direction: column; border-radius: var(--radius-md); }
  .sheet-menu .themes button { min-height: 44px; justify-content: flex-start; font-size: var(--text-sm); padding: 0 var(--space-3); }
  .sheet-menu .signout { min-height: 44px; justify-content: flex-start; font-size: var(--text-sm); }

  @media (max-width: 640px) {
    .topbar { gap: 0.6rem; flex-wrap: nowrap; }
    nav, .search, .right { display: none; } /* moved to bottom nav / menu sheet */
    .menu-btn { display: inline-flex; }
    /* Keep labels visible inside the menu sheet even on mobile. */
    .sheet-menu .themes button .label { position: static; width: auto; height: auto; clip: auto; margin: 0; }
  }
</style>
```

- [ ] **Step 4: Run the TopBar tests**

Run: `cd apps/web && npx vitest run src/lib/components/topbar.test.ts`
Expected: PASS (3 tests — the 2 existing link tests + the new mobile-menu test). Note: the theme buttons exist in both the desktop `.right` cluster and the Sheet, which is why the new test scopes queries with `within(dialog)`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/TopBar.svelte apps/web/src/lib/components/topbar.test.ts
git commit -m "feat(web): collapse TopBar to a Sheet menu on mobile

Hide the inline nav and search on mobile (they move to the bottom nav and
the menu sheet); expose theme + sign out via a menu button that opens the
existing Sheet. Theme/sign-out markup is shared with desktop via snippets.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: De-duplicate search — LibraryToolbar focus + mobile layout

**Files:**
- Modify: `apps/web/src/routes/library/+page.server.ts`
- Modify: `apps/web/src/routes/library/+page.svelte`
- Modify: `apps/web/src/lib/components/LibraryToolbar.svelte`
- Test: `apps/web/src/lib/components/library-toolbar.test.ts`

**Interfaces:**
- Consumes: BottomNav's Search tab links to `/library?focus=search` (Task 2).
- Produces: `LibraryToolbar` gains a `focusSearch?: boolean` prop; when true it autofocuses its search `<input>`. The library server load returns `focusSearch: boolean`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/components/library-toolbar.test.ts` (inside the `describe` block). The file already imports `render`, `fireEvent` from `@testing-library/svelte` and `base = LibraryParams.parse({})`:

```ts
  it("autofocuses the search input when focusSearch is set", () => {
    const { getByLabelText } = render(LibraryToolbar, {
      params: base, total: 0, focusSearch: true,
      onSearch: () => {}, onSort: () => {}, onOpenFilters: () => {},
    });
    expect(document.activeElement).toBe(getByLabelText("search your library"));
  });

  it("does not steal focus when focusSearch is absent", () => {
    const { getByLabelText } = render(LibraryToolbar, {
      params: base, total: 0,
      onSearch: () => {}, onSort: () => {}, onOpenFilters: () => {},
    });
    expect(document.activeElement).not.toBe(getByLabelText("search your library"));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/components/library-toolbar.test.ts`
Expected: FAIL — the input is not focused (no `focusSearch` handling yet).

- [ ] **Step 3: Add focusSearch prop + autofocus to LibraryToolbar**

In `apps/web/src/lib/components/LibraryToolbar.svelte`:

Change the `<script>` prop destructuring and add an input ref + focus effect. Replace:

```svelte
  let { params, total, onSearch, onSort, onOpenFilters }: {
    params: LibraryParams; total: number;
    onSearch: (q: string) => void; onSort: (s: Sort) => void; onOpenFilters: () => void;
  } = $props();

  let query = $state(untrack(() => params.q));
  $effect(() => { query = params.q; });
```

with:

```svelte
  let { params, total, focusSearch = false, onSearch, onSort, onOpenFilters }: {
    params: LibraryParams; total: number; focusSearch?: boolean;
    onSearch: (q: string) => void; onSort: (s: Sort) => void; onOpenFilters: () => void;
  } = $props();

  let query = $state(untrack(() => params.q));
  $effect(() => { query = params.q; });

  let searchEl = $state<HTMLInputElement | null>(null);
  $effect(() => { if (focusSearch) searchEl?.focus(); });
```

Add `bind:this={searchEl}` to the search input. Replace:

```svelte
  <input
    class="search"
    type="search"
    aria-label="search your library"
    placeholder="search…"
    bind:value={query}
    onkeydown={(e) => { if (e.key === "Enter") onSearch(query.trim()); }}
  />
```

with:

```svelte
  <input
    class="search"
    type="search"
    aria-label="search your library"
    placeholder="search…"
    bind:this={searchEl}
    bind:value={query}
    onkeydown={(e) => { if (e.key === "Enter") onSearch(query.trim()); }}
  />
```

- [ ] **Step 4: Add the mobile row layout + 44px targets to LibraryToolbar**

In the `<style>` block of `LibraryToolbar.svelte`, append at the end (before `</style>`):

```svelte
  @media (max-width: 640px) {
    .search { flex-basis: 100%; order: 1; min-height: 44px; }
    .filters-btn { order: 2; min-height: 44px; }
    select { order: 3; min-height: 44px; }
    .count { order: 4; }
  }
```

- [ ] **Step 5: Run the LibraryToolbar tests**

Run: `cd apps/web && npx vitest run src/lib/components/library-toolbar.test.ts`
Expected: PASS (6 tests — 4 existing + 2 new).

- [ ] **Step 6: Return focusSearch from the library server load**

In `apps/web/src/routes/library/+page.server.ts`, the load currently reads `url` and returns `{ params, page, facets }`. Add the flag. Change the return line:

```ts
  return { params, page, facets };
```

to:

```ts
  return { params, page, facets, focusSearch: url.searchParams.get("focus") === "search" };
```

(`url` is already a parameter of the load function — confirm it is destructured; if the signature is `({ locals })`, change it to `({ locals, url })`.)

- [ ] **Step 7: Pass focusSearch into LibraryToolbar**

In `apps/web/src/routes/library/+page.svelte`, update the `<LibraryToolbar ... />` usage. Change:

```svelte
<LibraryToolbar
  params={data.params}
  total={data.page.totalItems}
  onSearch={(q) => patch({ q })}
  onSort={(s: Sort) => patch({ sort: s })}
  onOpenFilters={() => (drawerOpen = true)}
/>
```

to:

```svelte
<LibraryToolbar
  params={data.params}
  total={data.page.totalItems}
  focusSearch={data.focusSearch}
  onSearch={(q) => patch({ q })}
  onSort={(s: Sort) => patch({ sort: s })}
  onOpenFilters={() => (drawerOpen = true)}
/>
```

- [ ] **Step 8: Run the library page-server test + full web suite**

Run: `cd apps/web && npx vitest run src/routes/library/page.server.test.ts`
Expected: PASS (existing tests unaffected — `focusSearch` defaults to `false` when no `focus` param).

Run: `cd apps/web && npx vitest run` (full web suite)
Expected: PASS — now 47 tests added across the plan; total = 144 baseline + 4 (Task 1) + 3 (Task 2) + 1 (Task 4) + 2 (Task 5) = **154 tests**, 0 failures, across 44 test files.

- [ ] **Step 9: Type-check**

Run: `cd apps/web && npx svelte-check --tsconfig ./tsconfig.json`
Expected: no new errors in the touched files.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/components/LibraryToolbar.svelte apps/web/src/lib/components/library-toolbar.test.ts apps/web/src/routes/library/+page.server.ts apps/web/src/routes/library/+page.svelte
git commit -m "feat(web): focus library search from the bottom-nav Search tab

Route the mobile Search tab through /library?focus=search; the server load
surfaces a focusSearch flag that LibraryToolbar uses to autofocus its input.
Stack the toolbar into rows with 44px targets on mobile. Removes the second
search box on mobile (the TopBar inline search is already hidden there).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] **Full web suite green:** `cd apps/web && npx vitest run` → 154 tests, 0 failures.
- [ ] **Type-check clean:** `cd apps/web && npx svelte-check --tsconfig ./tsconfig.json` → no new errors.
- [ ] **Manual/visual verification at 360px** (per spec rollout note — jsdom can't verify CSS layout): use the `verify` or `run` skill / Playwright to load `/library` at 360px width and confirm: single-row TopBar with a working menu button; bottom nav visible with 3 tabs; bottom nav hides on scroll-down and returns on scroll-up; no horizontal overflow; only one search box; content not covered by the fixed bar (incl. iOS safe-area).

## Spec coverage check

- Wrap chaos → Task 4 (hide nav/search on mobile, single row). ✓
- Duplicate search → Task 4 (hide TopBar search) + Task 5 (LibraryToolbar owns search, Search tab focus). ✓
- Sub-44px targets → Tasks 2, 4, 5 (min-heights). ✓
- Thumb-zone nav → Task 2 + Task 3. ✓
- Auto-hide on scroll direction → Task 1 (pure logic) + Task 2 (wiring). ✓
- Safe-area + content clearance → Task 2 (`env(safe-area-inset-bottom)`) + Task 3 (page padding). ✓
- Reduced motion → Task 2. ✓
- Desktop unchanged → Tasks 4 & 5 scope all changes under `@media (max-width: 640px)` / additive props. ✓
