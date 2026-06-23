# Phase 3 Reader-App Visual Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the warm-paper design language to the reader app (`apps/web`): reconcile every component to the real token vocabulary, style them, build the app shell, and split the single page into an extractor home + a library.

**Architecture:** Pure logic (token mapping, theme resolution, home-feed partition) lives in tested `$lib` helpers; Svelte components/routes consume them and reference `tokens.css` semantic/reader tokens only. Themes are applied as `data-theme` on `<html>` (global) with a per-`<article>` override on the reader.

**Tech Stack:** SvelteKit (Svelte 5 runes), PocketBase JS SDK, Vitest + @testing-library/svelte, design tokens in `apps/web/src/lib/styles/tokens.css`.

## Global Constraints

- **Tokens only.** Components reference semantic (`--color-*`) + reader (`--reading-*`) tokens, never a primitive ramp value, hex, font name, px radius, or gray shadow. A literal color in a component is a bug. (CLAUDE.md / design-system spec)
- **One new token only:** `--reading-font-sans`. Everything else already exists in `tokens.css`. Never add a token alias inside a component.
- **TDD.** Pure logic gets a failing test first. Restyling is CSS — existing behavior tests must stay green; add render assertions where new markup carries logic.
- **CardState values are `processing | ready | partial | failed`** (from `deriveCardState`). "Settled/done" = `ready`. Active = any state ≠ `ready`.
- **ReaderPrefs** (`@readmepls/types`, Zod): `font: "serif"|"sans"`, `size: number`, `lineHeight: number`, `width: "narrow"|"normal"|"wide"`, `theme: "light"|"dark"|"sepia"`. Persisted in `users.reader_prefs`.
- **Run tests** from repo root: all = `npm test`; scoped = `npx vitest run <path>`. Type/Svelte check = `npm --prefix apps/web run check`.
- **Motion** collapses to 0 under `prefers-reduced-motion`. Focus always visible via `--color-ring`; never `outline: none` alone.
- **Commits:** Conventional Commits, one logical change each. Do not push.
- **No new features:** tags/collections/search UI, highlights, connectors are Phase 4+.

---

## File Structure

**New:**
- `apps/web/src/lib/theme/theme.ts` — pure `resolveTheme` + thin `applyTheme`/`persistTheme`.
- `apps/web/src/lib/theme/theme.test.ts` — tests for `resolveTheme`.
- `apps/web/src/lib/article/home-feed.ts` — pure `splitHomeFeed` partition.
- `apps/web/src/lib/article/home-feed.test.ts` — tests.
- `apps/web/src/lib/components/TopBar.svelte` — app shell top bar.
- `apps/web/src/routes/library/+page.svelte` — reading collection grid.

**Modified:**
- `apps/web/src/lib/styles/tokens.css` — add `--reading-font-sans`.
- `apps/web/src/lib/reader/css-vars.ts` — reconcile emitted var names + font tokens.
- `apps/web/src/lib/components/ui/{Button,Input,Tag,Card,Spinner}.svelte` — reconcile refs + add styles.
- `apps/web/src/lib/components/{CaptureBar,ArticleCard,ReaderControls}.svelte` — restyle.
- `apps/web/src/routes/+layout.svelte` — shell (bg, grain, TopBar, theme, reveal).
- `apps/web/src/routes/+page.svelte` — extractor home.
- `apps/web/src/routes/read/[id]/+page.svelte` — reader polish, reconcile reader CSS.
- `apps/web/src/routes/login/+page.svelte` — centered paper card.

---

## Task 1: Reconcile reader typography vars (`css-vars.ts` + reader CSS + sans token)

**Files:**
- Modify: `apps/web/src/lib/reader/css-vars.ts`
- Modify: `apps/web/src/lib/styles/tokens.css`
- Modify: `apps/web/src/routes/read/[id]/+page.svelte` (style block only)
- Test: `apps/web/src/lib/reader/css-vars.test.ts` (exists — extend)

**Interfaces:**
- Produces: `readerCssVars(prefs: ReaderPrefs): string` emitting `--reading-size`, `--reading-leading`, `--reading-measure`, `--reading-font`. Reader CSS reads those + `--reading-bg`/`--reading-text`.

- [ ] **Step 1: Write the failing test**

Replace `apps/web/src/lib/reader/css-vars.test.ts` contents:

```ts
import { describe, it, expect } from "vitest";
import { readerCssVars } from "./css-vars.js";
import { withReaderDefaults } from "@readmepls/core";

describe("readerCssVars", () => {
  it("emits reading-* var names that the reader CSS consumes", () => {
    const css = readerCssVars(withReaderDefaults({ size: 20, lineHeight: 1.7, width: "wide" }));
    expect(css).toContain("--reading-size: 20px");
    expect(css).toContain("--reading-leading: 1.7");
    expect(css).toContain("--reading-measure: 80ch");
  });
  it("maps serif to the reading face and sans to the reading-sans token", () => {
    expect(readerCssVars(withReaderDefaults({ font: "serif" }))).toContain("--reading-font: var(--font-reading)");
    expect(readerCssVars(withReaderDefaults({ font: "sans" }))).toContain("--reading-font: var(--reading-font-sans)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/lib/reader/css-vars.test.ts`
Expected: FAIL — current code emits `--reader-font`/`--reader-size`/`--reader-width`, not `--reading-*`.

- [ ] **Step 3: Rewrite `css-vars.ts`**

```ts
import type { ReaderPrefs } from "@readmepls/types";

const WIDTHS: Record<ReaderPrefs["width"], string> = {
  narrow: "55ch",
  normal: "68ch",
  wide: "80ch",
};

/** Inline custom properties for the reader container, layered over tokens.css.
 *  Emits the --reading-* names the theme + reader CSS already consume. */
export function readerCssVars(prefs: ReaderPrefs): string {
  const font = prefs.font === "serif" ? "var(--font-reading)" : "var(--reading-font-sans)";
  return [
    `--reading-font: ${font}`,
    `--reading-size: ${prefs.size}px`,
    `--reading-leading: ${prefs.lineHeight}`,
    `--reading-measure: ${WIDTHS[prefs.width]}`,
  ].join("; ");
}
```

- [ ] **Step 4: Add the `--reading-font-sans` token**

In `apps/web/src/lib/styles/tokens.css`, in the `:root` reader/reading section (near the other `--reading-*` declarations), add:

```css
  /* humanist reading sans — the serif/sans toggle's sans option.
     NOT --font-display (Fredoka is display-only, never body). */
  --reading-font-sans: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
```

- [ ] **Step 5: Reconcile the reader `<style>` block**

In `apps/web/src/routes/read/[id]/+page.svelte`, replace the `.reader` rule's undefined vars:

```css
  .reader {
    background: var(--reading-bg);
    color: var(--reading-text);
    font-family: var(--reading-font);
    font-size: var(--reading-size);
    line-height: var(--reading-leading);
    max-width: var(--reading-measure);
    margin: 0 auto;
  }
```

- [ ] **Step 6: Run tests + check**

Run: `npx vitest run apps/web/src/lib/reader/css-vars.test.ts && npm --prefix apps/web run check`
Expected: PASS; check clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/reader/css-vars.ts apps/web/src/lib/reader/css-vars.test.ts apps/web/src/lib/styles/tokens.css apps/web/src/routes/read/\[id\]/+page.svelte
git commit -m "fix(web): reconcile reader typography vars to real reading tokens"
```

---

## Task 2: Style the UI primitives & reconcile their tokens

**Files:**
- Modify: `apps/web/src/lib/components/ui/Button.svelte`
- Modify: `apps/web/src/lib/components/ui/Input.svelte`
- Modify: `apps/web/src/lib/components/ui/Tag.svelte`
- Modify: `apps/web/src/lib/components/ui/Card.svelte`
- Modify: `apps/web/src/lib/components/ui/Spinner.svelte`
- Test: `apps/web/src/lib/components/ui/primitives.test.ts` (exists — keep green, extend)

**Interfaces:**
- Consumes: none. Produces: same component props as today (`Button` variant `"default"|"accent"`, `Input` `bind:value`, etc.). No prop/markup changes that break existing tests (roles/text preserved).

- [ ] **Step 1: Add a failing assertion for the accent variant**

Append to `apps/web/src/lib/components/ui/primitives.test.ts` inside the `describe`:

```ts
  it("Button exposes its variant for styling", () => {
    render(Button, { children: text("Go"), variant: "accent" });
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("data-variant", "accent");
  });
```

- [ ] **Step 2: Run to verify current suite + new test status**

Run: `npx vitest run apps/web/src/lib/components/ui/primitives.test.ts`
Expected: PASS for existing 4, PASS for new (Button already renders `data-variant`). This locks behavior before restyle.

- [ ] **Step 3: Style `Button.svelte`** — add a `<style>` block after the markup:

```svelte
<style>
  button {
    font-family: var(--font-display);
    font-size: var(--text-sm, 0.95rem);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    border-radius: var(--radius-pill);
    padding: 0.5rem 1.1rem;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out),
      box-shadow var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  }
  button:hover:not(:disabled) { box-shadow: var(--shadow-sm); transform: translateY(-1px); }
  button:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  button:disabled { opacity: 0.55; cursor: not-allowed; }
  button[data-variant="accent"] {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-text-on-accent);
  }
  button[data-variant="accent"]:hover:not(:disabled) { background: var(--color-accent-hover); }
  @media (prefers-reduced-motion: reduce) {
    button { transition: none; }
    button:hover:not(:disabled) { transform: none; }
  }
</style>
```

- [ ] **Step 4: Style `Input.svelte`** — add a `<style>` block:

```svelte
<style>
  input {
    font-family: var(--font-display);
    font-size: 1rem;
    color: var(--color-text);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 0.55rem 0.8rem;
    width: 100%;
  }
  input::placeholder { color: var(--color-text-subtle); }
  input:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; border-color: var(--color-border-strong); }
</style>
```

- [ ] **Step 5: Reconcile `Tag.svelte` tokens** — replace its `<style>`:

```svelte
<style>
  .tag {
    display: inline-block;
    font-family: var(--font-display);
    font-size: 0.8rem;
    color: var(--color-text-muted);
    border: 1px solid var(--color-fold);
    border-radius: var(--radius-pill);
    padding: 0.1rem 0.55rem;
  }
</style>
```

- [ ] **Step 6: Reconcile + enrich `Card.svelte`** — replace its `<style>`:

```svelte
<style>
  .card {
    background: var(--color-surface-raised);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    padding: 1.1rem 1.2rem;
  }
</style>
```

- [ ] **Step 7: Reconcile `Spinner.svelte` tokens** — its `.spinner` uses undefined `--fold`/`--accent`; replace with:

```css
  .spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--color-fold);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin var(--dur-slow) linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
```

- [ ] **Step 8: Run tests + check**

Run: `npx vitest run apps/web/src/lib/components/ui/primitives.test.ts && npm --prefix apps/web run check`
Expected: PASS (5 tests); check clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/components/ui apps/web/src/lib/components/ui/primitives.test.ts
git commit -m "feat(web): style UI primitives and reconcile to real tokens"
```

---

## Task 3: Theme store (resolve + apply + persist)

**Files:**
- Create: `apps/web/src/lib/theme/theme.ts`
- Test: `apps/web/src/lib/theme/theme.test.ts`

**Interfaces:**
- Produces:
  - `type Theme = "light" | "dark" | "sepia"`
  - `resolveTheme(stored: string | null, pref?: string | null): Theme` — pure precedence resolver.
  - `applyTheme(t: Theme): void` — sets `document.documentElement.dataset.theme` + writes `localStorage["theme"]`.
  - `readStoredTheme(): string | null` — reads `localStorage["theme"]` (SSR-safe).
  - `THEMES: readonly Theme[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveTheme } from "./theme.js";

describe("resolveTheme", () => {
  it("prefers a valid localStorage value", () => {
    expect(resolveTheme("dark", "light")).toBe("dark");
  });
  it("falls back to the account pref when nothing is stored", () => {
    expect(resolveTheme(null, "sepia")).toBe("sepia");
  });
  it("defaults to light when both are missing or invalid", () => {
    expect(resolveTheme(null, null)).toBe("light");
    expect(resolveTheme("neon", "blurple")).toBe("light");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/lib/theme/theme.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `theme.ts`**

```ts
export type Theme = "light" | "dark" | "sepia";
export const THEMES = ["light", "dark", "sepia"] as const;

const isTheme = (v: unknown): v is Theme => typeof v === "string" && (THEMES as readonly string[]).includes(v);

/** Precedence: localStorage (instant paint) → account pref → light. */
export function resolveTheme(stored: string | null, pref?: string | null): Theme {
  if (isTheme(stored)) return stored;
  if (isTheme(pref)) return pref;
  return "light";
}

export function readStoredTheme(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem("theme");
}

export function applyTheme(t: Theme): void {
  if (typeof document !== "undefined") document.documentElement.dataset.theme = t;
  if (typeof localStorage !== "undefined") localStorage.setItem("theme", t);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run apps/web/src/lib/theme/theme.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/theme
git commit -m "feat(web): add theme resolve/apply/persist helper"
```

---

## Task 4: App shell — TopBar + layout (bg, grain, theme, reveal)

**Files:**
- Create: `apps/web/src/lib/components/TopBar.svelte`
- Modify: `apps/web/src/routes/+layout.svelte`

**Interfaces:**
- Consumes: `theme.ts` (`resolveTheme`, `applyTheme`, `readStoredTheme`, `THEMES`, `Theme`), `browserPb` from `$lib/pb.js`.
- `TopBar` props: `{ theme: Theme; onTheme: (t: Theme) => void; onSignOut: () => void }`.

- [ ] **Step 1: Create `TopBar.svelte`**

```svelte
<script lang="ts">
  import { THEMES, type Theme } from "$lib/theme/theme.js";
  let { theme, onTheme, onSignOut }: { theme: Theme; onTheme: (t: Theme) => void; onSignOut: () => void } = $props();
</script>

<header class="topbar">
  <a class="brand" href="/">readme<span>pls</span></a>
  <nav>
    <a href="/">extract</a>
    <a href="/library">library</a>
  </nav>
  <div class="right">
    <div class="themes" role="group" aria-label="theme">
      {#each THEMES as t}
        <button
          type="button"
          aria-pressed={theme === t}
          data-active={theme === t}
          onclick={() => onTheme(t)}>{t}</button>
      {/each}
    </div>
    <button type="button" class="signout" onclick={onSignOut}>sign out</button>
  </div>
</header>

<style>
  .topbar {
    display: flex; align-items: center; gap: 1.5rem;
    padding: 0.75rem 1.25rem;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }
  .brand { font-family: var(--font-display); font-size: 1.3rem; font-weight: 600; color: var(--color-text); text-decoration: none; }
  .brand span { color: var(--color-accent); }
  nav { display: flex; gap: 1rem; }
  nav a { font-family: var(--font-display); color: var(--color-text-muted); text-decoration: none; }
  nav a:hover { color: var(--color-text); }
  .right { margin-left: auto; display: flex; align-items: center; gap: 1rem; }
  .themes { display: inline-flex; border: 1px solid var(--color-border); border-radius: var(--radius-pill); overflow: hidden; }
  .themes button { font-family: var(--font-display); font-size: 0.8rem; padding: 0.25rem 0.6rem; border: none; background: transparent; color: var(--color-text-muted); cursor: pointer; }
  .themes button[data-active="true"] { background: var(--color-accent-wash); color: var(--color-text); }
  .themes button:focus-visible, .signout:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  .signout { font-family: var(--font-display); font-size: 0.85rem; background: none; border: none; color: var(--color-text-muted); cursor: pointer; }
  .signout:hover { color: var(--color-text); }
</style>
```

- [ ] **Step 2: Rewrite `+layout.svelte`**

```svelte
<script lang="ts">
  import "$lib/styles/fonts.css";
  import "$lib/styles/tokens.css";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { browserPb } from "$lib/pb.js";
  import { resolveTheme, applyTheme, readStoredTheme, type Theme } from "$lib/theme/theme.js";
  import TopBar from "$lib/components/TopBar.svelte";

  let { children } = $props();
  const pb = browserPb();
  let theme = $state<Theme>("light");

  // Chrome (TopBar + paper bg) is hidden on the standalone login screen.
  const chrome = $derived($page.url.pathname !== "/login");

  onMount(() => {
    const prefTheme = pb.authStore.model?.reader_prefs?.theme ?? null;
    theme = resolveTheme(readStoredTheme(), prefTheme);
    applyTheme(theme);
  });

  function setTheme(t: Theme) {
    theme = t;
    applyTheme(t);
    const uid = pb.authStore.model?.id;
    if (uid) {
      const prev = pb.authStore.model?.reader_prefs ?? {};
      pb.collection("users").update(uid, { reader_prefs: { ...prev, theme: t } });
    }
  }

  async function signOut() {
    pb.authStore.clear();
    await goto("/login");
  }
</script>

<div class="app">
  {#if chrome}
    <TopBar {theme} onTheme={setTheme} onSignOut={signOut} />
  {/if}
  <div class="page">{@render children()}</div>
</div>

<style>
  .app { min-height: 100dvh; background: var(--color-bg-gradient); position: relative; }
  .app::before {
    content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image: var(--texture-grain); opacity: 0.04; mix-blend-mode: multiply;
  }
  .page { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; padding: 1.5rem 1.25rem; animation: reveal var(--dur-slow) var(--ease-paper) both; }
  @keyframes reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .page { animation: none; } }
</style>
```

- [ ] **Step 3: Run check**

Run: `npm --prefix apps/web run check`
Expected: clean (no type errors). `reader_prefs` is loosely typed on the PB model; if check complains, narrow via `(pb.authStore.model as any)?.reader_prefs` with a `// PB model is untyped` comment.

- [ ] **Step 4: Run full suite (nothing should break)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/TopBar.svelte apps/web/src/routes/+layout.svelte
git commit -m "feat(web): app shell with top bar, paper bg, grain, theme switcher"
```

---

## Task 5: Home-feed partition logic

**Files:**
- Create: `apps/web/src/lib/article/home-feed.ts`
- Test: `apps/web/src/lib/article/home-feed.test.ts`

**Interfaces:**
- Consumes: `deriveCardState` from `$lib/article/card-state.js`.
- Produces: `splitHomeFeed<T extends { expand?: { content?: unknown } }>(articles: T[], recentLimit?: number): { active: T[]; recent: T[] }`. `active` = all items whose card state ≠ `"ready"` (order preserved). `recent` = up to `recentLimit` (default 6) `ready` items (order preserved).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { splitHomeFeed } from "./home-feed.js";

const art = (id: string, status?: string) => ({
  id,
  expand: status ? { content: { extract_status: status } } : undefined,
});

describe("splitHomeFeed", () => {
  it("puts every non-ready item in active, regardless of count", () => {
    const items = [art("a", "pending"), art("b"), art("c", "failed"), art("d", "partial"), art("e", "ok")];
    const { active } = splitHomeFeed(items);
    expect(active.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("limits recent to ready items up to the limit", () => {
    const items = [art("r1", "ok"), art("r2", "ok"), art("r3", "ok")];
    const { recent } = splitHomeFeed(items, 2);
    expect(recent.map((x) => x.id)).toEqual(["r1", "r2"]);
  });
  it("defaults the recent limit to 6", () => {
    const items = Array.from({ length: 8 }, (_, i) => art(`r${i}`, "ok"));
    expect(splitHomeFeed(items).recent).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/lib/article/home-feed.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `home-feed.ts`**

```ts
import { deriveCardState } from "./card-state.js";

type WithContent = { expand?: { content?: unknown } };

/** Split a -created-sorted article list for the extractor home:
 *  every in-flight/failed item is surfaced; a few recent ready ones give context. */
export function splitHomeFeed<T extends WithContent>(
  articles: T[],
  recentLimit = 6,
): { active: T[]; recent: T[] } {
  const active: T[] = [];
  const recent: T[] = [];
  for (const a of articles) {
    const state = deriveCardState((a.expand?.content ?? null) as Parameters<typeof deriveCardState>[0]);
    if (state === "ready") {
      if (recent.length < recentLimit) recent.push(a);
    } else {
      active.push(a);
    }
  }
  return { active, recent };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run apps/web/src/lib/article/home-feed.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/article/home-feed.ts apps/web/src/lib/article/home-feed.test.ts
git commit -m "feat(web): add home-feed partition for the extractor page"
```

---

## Task 6: Extractor home page

**Files:**
- Modify: `apps/web/src/routes/+page.svelte`

**Interfaces:**
- Consumes: `splitHomeFeed` (Task 5), `CaptureBar`, `ArticleCard`, `browserPb`.

- [ ] **Step 1: Rewrite `+page.svelte`**

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import { splitHomeFeed } from "$lib/article/home-feed.js";
  import CaptureBar from "$lib/components/CaptureBar.svelte";
  import ArticleCard from "$lib/components/ArticleCard.svelte";

  const pb = browserPb();
  let articles = $state<any[]>([]);
  let unsub: (() => void) | undefined;
  const feed = $derived(splitHomeFeed(articles));

  async function load() {
    const list = await pb.collection("articles").getList(1, 50, { sort: "-created", expand: "content" });
    articles = list.items;
  }
  async function retry(id: string) {
    await fetch("/api/retry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ articleId: id }),
    });
  }

  onMount(async () => {
    await load();
    unsub = await pb.collection("articles").subscribe("*", () => load(), { expand: "content" });
  });
  onDestroy(() => unsub?.());
</script>

<section class="hero">
  <h1>save any link. <span>actually read it.</span></h1>
  <CaptureBar onCaptured={load} />
</section>

{#if feed.active.length}
  <section class="block">
    <h2>working on it</h2>
    <div class="grid">
      {#each feed.active as a (a.id)}
        <ArticleCard article={a} onRetry={retry} onOpen={(id) => goto(`/read/${id}`)} />
      {/each}
    </div>
  </section>
{/if}

{#if feed.recent.length}
  <section class="block">
    <h2>recently saved</h2>
    <div class="grid">
      {#each feed.recent as a (a.id)}
        <ArticleCard article={a} onOpen={(id) => goto(`/read/${id}`)} />
      {/each}
    </div>
    <a class="more" href="/library">see all in your library →</a>
  </section>
{/if}

<style>
  .hero { text-align: center; padding: 2.5rem 0 2rem; }
  .hero h1 { font-family: var(--font-display); font-size: clamp(1.8rem, 4vw, 2.8rem); color: var(--color-text); margin: 0 0 1.5rem; }
  .hero h1 span { color: var(--color-accent); }
  .block { margin-top: 2.5rem; }
  .block h2 { font-family: var(--font-display); font-size: 1.1rem; color: var(--color-text-muted); margin: 0 0 0.9rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
  .more { display: inline-block; margin-top: 1rem; font-family: var(--font-display); color: var(--color-accent); text-decoration: none; }
  .more:hover { color: var(--color-accent-hover); }
</style>
```

- [ ] **Step 2: Make the CaptureBar hero-sized**

In `apps/web/src/lib/components/CaptureBar.svelte`, add a `<style>` block so the form is a centered, prominent row (Input grows, Button sits beside it, error below):

```svelte
<style>
  form { display: flex; gap: 0.6rem; max-width: 640px; margin: 0 auto; align-items: center; }
  form :global(input) { flex: 1; font-size: 1.05rem; padding: 0.7rem 0.9rem; }
  p { flex-basis: 100%; margin: 0.5rem 0 0; color: var(--color-danger); font-family: var(--font-display); font-size: 0.9rem; }
</style>
```

Also change the Button label/variant in CaptureBar markup to the brand voice: `<Button type="submit" variant="accent" disabled={busy}>{busy ? "saving…" : "save it"}</Button>`.

- [ ] **Step 3: Run check + full suite**

Run: `npm --prefix apps/web run check && npm test`
Expected: clean; PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/+page.svelte apps/web/src/lib/components/CaptureBar.svelte
git commit -m "feat(web): extractor home with active captures and recent strip"
```

---

## Task 7: Library route (grid + empty + loading)

**Files:**
- Create: `apps/web/src/routes/library/+page.svelte`
- Test: `apps/web/src/routes/library/page.test.ts`

**Interfaces:**
- Consumes: `ArticleCard`, `browserPb`. Renders the full `articles` list.

- [ ] **Step 1: Write a failing render test for the empty state**

Create `apps/web/src/routes/library/page.test.ts`. The page does IO in `onMount`; test the empty-state branch by rendering with the loaded-but-empty state. Extract the view into a presentational check via the rendered DOM after mount resolves with a mocked pb returning `[]`:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/svelte";

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    collection: () => ({
      getList: vi.fn().mockResolvedValue({ items: [] }),
      subscribe: vi.fn().mockResolvedValue(() => {}),
    }),
  }),
}));

import Library from "./+page.svelte";

describe("library page", () => {
  it("shows a warm empty state when there are no articles", async () => {
    render(Library);
    await waitFor(() => expect(screen.getByText(/nothing saved yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/web/src/routes/library/page.test.ts`
Expected: FAIL — `./+page.svelte` does not exist.

- [ ] **Step 3: Create `library/+page.svelte`**

```svelte
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import ArticleCard from "$lib/components/ArticleCard.svelte";

  const pb = browserPb();
  let articles = $state<any[]>([]);
  let loading = $state(true);
  let unsub: (() => void) | undefined;

  async function load() {
    const list = await pb.collection("articles").getList(1, 100, { sort: "-created", expand: "content" });
    articles = list.items;
    loading = false;
  }

  onMount(async () => {
    await load();
    unsub = await pb.collection("articles").subscribe("*", () => load(), { expand: "content" });
  });
  onDestroy(() => unsub?.());
</script>

<h1>your library</h1>

{#if loading}
  <div class="grid">
    {#each Array(6) as _}
      <div class="skeleton" aria-hidden="true"></div>
    {/each}
  </div>
{:else if articles.length === 0}
  <div class="empty">
    <p>nothing saved yet. paste a link on the <a href="/">extract page</a> ☝</p>
  </div>
{:else}
  <div class="grid">
    {#each articles as a (a.id)}
      <ArticleCard article={a} onOpen={(id) => goto(`/read/${id}`)} />
    {/each}
  </div>
{/if}

<style>
  h1 { font-family: var(--font-display); color: var(--color-text); font-size: 1.6rem; margin: 0 0 1.25rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
  .skeleton { height: 9rem; border-radius: var(--radius-lg); background: var(--color-surface-sunken); animation: pulse var(--dur-slow) var(--ease-out) infinite alternate; }
  @keyframes pulse { to { opacity: 0.5; } }
  @media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
  .empty {
    text-align: center; padding: 3rem 1rem; background: var(--color-surface);
    border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); position: relative;
  }
  /* dog-ear fold */
  .empty::after {
    content: ""; position: absolute; top: 0; right: 0; width: 40px; height: 40px;
    background: var(--color-fold); clip-path: polygon(100% 0, 0 0, 100% 100%);
    border-top-right-radius: var(--radius-xl);
  }
  .empty p { font-family: var(--font-display); color: var(--color-text-muted); }
  .empty a { color: var(--color-accent); }
</style>
```

- [ ] **Step 4: Run to verify pass + check**

Run: `npx vitest run apps/web/src/routes/library/page.test.ts && npm --prefix apps/web run check`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/library
git commit -m "feat(web): library route with grid, empty state, and skeletons"
```

---

## Task 8: Reader polish (controls bar, progress, typography)

**Files:**
- Modify: `apps/web/src/routes/read/[id]/+page.svelte`
- Modify: `apps/web/src/lib/components/ReaderControls.svelte`

**Interfaces:**
- Consumes: `readerCssVars` (Task 1), `ReaderControls`. Keep accessible button names so `ReaderControls.test.ts` stays green: a control matching `/A\+|increase/i` and one matching `/dark/i`.

- [ ] **Step 1: Confirm the existing ReaderControls test still passes (baseline)**

Run: `npx vitest run apps/web/src/lib/components/ReaderControls.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 2: Restyle `ReaderControls.svelte`** — keep the same buttons/labels, wrap as a grouped bar; replace markup's outer `<div class="controls">` and add styles:

```svelte
<div class="controls" role="group" aria-label="reading controls">
  <Button onclick={() => emit({ size: clampSize(prefs.size - 1) })}>A−</Button>
  <Button onclick={() => emit({ size: clampSize(prefs.size + 1) })}>A+</Button>
  <Button onclick={() => emit({ font: prefs.font === "serif" ? "sans" : "serif" })}>
    {prefs.font === "serif" ? "Sans" : "Serif"}
  </Button>
  <span class="sep" aria-hidden="true"></span>
  <Button onclick={() => emit({ theme: "light" })}>Light</Button>
  <Button onclick={() => emit({ theme: "dark" })}>Dark</Button>
  <Button onclick={() => emit({ theme: "sepia" })}>Sepia</Button>
</div>

<style>
  .controls {
    position: sticky; top: 0; z-index: 5;
    display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center;
    padding: 0.6rem 0.8rem; margin-bottom: 1rem;
    background: var(--color-surface); border-radius: var(--radius-pill);
    box-shadow: var(--shadow-sm);
  }
  .sep { width: 1px; height: 1.4rem; background: var(--color-border); margin: 0 0.3rem; }
</style>
```

- [ ] **Step 3: Add the progress bar + layout to the reader page**

In `apps/web/src/routes/read/[id]/+page.svelte`: keep the existing script (scroll→progress already updates PB). Add a reactive `progress` state for the visual bar and render it. Replace the markup region (from `<ReaderControls …>` down) with:

```svelte
<div class="progress" style="--p: {progress}" aria-hidden="true"></div>
<div class="reader-shell">
  <div class="bar">
    <a class="back" href="/library">← library</a>
    <ReaderControls {prefs} onChange={savePrefs} />
    <Button onclick={archive}>Archive</Button>
  </div>

  {#if !content}
    <Spinner label="Loading article" />
  {:else}
    <article data-theme={prefs.theme} style={readerCssVars(prefs)} class="reader">
      <h1>{content.title}</h1>
      {@html content.content_html}
    </article>
  {/if}
</div>
```

Add `let progress = $state(0);` to the script, and in `onScroll` set `progress = p;` (alongside the existing PB update). Replace the `<style>` block:

```svelte
<style>
  .progress { position: fixed; top: 0; left: 0; height: 3px; width: calc(var(--p) * 100%); background: var(--color-accent); z-index: 10; transition: width var(--dur-fast) var(--ease-out); }
  .reader-shell { max-width: 68ch; margin: 0 auto; }
  .bar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
  .bar .back { font-family: var(--font-display); color: var(--color-text-muted); text-decoration: none; }
  .bar .back:hover { color: var(--color-text); }
  .reader {
    background: var(--reading-bg); color: var(--reading-text);
    font-family: var(--reading-font); font-size: var(--reading-size);
    line-height: var(--reading-leading); max-width: var(--reading-measure);
    margin: 0 auto; padding: 1.5rem; border-radius: var(--radius-lg);
  }
  .reader :global(h1) { font-family: var(--font-display); line-height: 1.15; }
  .reader :global(a) { color: var(--color-accent); }
  .reader :global(pre), .reader :global(code) { font-family: var(--font-mono); }
  .reader :global(pre) { background: var(--color-surface-sunken); padding: 1rem; border-radius: var(--radius-md); overflow-x: auto; }
  .reader :global(blockquote) { border-left: 3px solid var(--color-accent); margin: 1rem 0; padding-left: 1rem; color: var(--color-text-muted); }
  .reader :global(img) { max-width: 100%; height: auto; border-radius: var(--radius-md); }
  @media (prefers-reduced-motion: reduce) { .progress { transition: none; } }
</style>
```

- [ ] **Step 4: Run checks + tests**

Run: `npm --prefix apps/web run check && npm test`
Expected: clean; PASS (ReaderControls test green — labels unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/read/\[id\]/+page.svelte apps/web/src/lib/components/ReaderControls.svelte
git commit -m "feat(web): polish reader — sticky controls, progress bar, typography"
```

---

## Task 9: Login page polish

**Files:**
- Modify: `apps/web/src/routes/login/+page.svelte`

**Interfaces:**
- Consumes: `Input`, `Button`. No logic change — markup/styling only. Keep the existing form behavior and error role.

- [ ] **Step 1: Restyle `login/+page.svelte`** — keep the `<script>` as-is; replace the markup + add styles:

```svelte
<main>
  <div class="card">
    <h1>readme<span>pls</span></h1>
    <p class="tag">save any link. actually read it. pls.</p>
    <form onsubmit={(e) => { e.preventDefault(); submit(); }}>
      <Input bind:value={email} type="email" placeholder="email" />
      <Input bind:value={password} type="password" placeholder="password" />
      <Button type="submit" variant="accent">{mode === "signin" ? "sign in" : "sign up"}</Button>
      {#if err}<p role="alert" class="err">{err}</p>{/if}
    </form>
    <button class="toggle" type="button" onclick={() => (mode = mode === "signin" ? "signup" : "signin")}>
      {mode === "signin" ? "need an account? sign up" : "have an account? sign in"}
    </button>
  </div>
</main>

<style>
  main { min-height: 100dvh; display: grid; place-items: center; background: var(--color-bg-gradient); padding: 1.5rem; }
  .card {
    position: relative; width: 100%; max-width: 380px; padding: 2rem 1.75rem;
    background: var(--color-surface); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
  }
  .card::after {
    content: ""; position: absolute; top: 0; right: 0; width: 40px; height: 40px;
    background: var(--color-fold); clip-path: polygon(100% 0, 0 0, 100% 100%);
    border-top-right-radius: var(--radius-xl);
  }
  h1 { font-family: var(--font-display); font-size: 1.8rem; margin: 0; color: var(--color-text); }
  h1 span { color: var(--color-accent); }
  .tag { font-family: var(--font-display); color: var(--color-text-muted); margin: 0.25rem 0 1.5rem; }
  form { display: flex; flex-direction: column; gap: 0.75rem; }
  .err { color: var(--color-danger); font-family: var(--font-display); font-size: 0.9rem; margin: 0; }
  .toggle { margin-top: 1rem; background: none; border: none; color: var(--color-accent); font-family: var(--font-display); cursor: pointer; padding: 0; }
  .toggle:hover { color: var(--color-accent-hover); }
  .toggle:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
</style>
```

- [ ] **Step 2: Run check + full suite**

Run: `npm --prefix apps/web run check && npm test`
Expected: clean; PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/routes/login/+page.svelte
git commit -m "feat(web): polish login as a centered paper card with dog-ear"
```

---

## Task 10: Final verification pass

**Files:** none (verification + any small fixes uncovered).

- [ ] **Step 1: Full type/svelte check**

Run: `npm --prefix apps/web run check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 3: Grep for any remaining undefined-token references**

Run:
```bash
grep -rnE "var\(--(paper-2|bg|fg|muted|fold|accent|shadow-card|font-ui|reader-font|font-reader-serif|font-reader-sans)\b" apps/web/src
```
Expected: **no output** (every legacy ref reconciled). Note: `--color-fold`/`--color-accent` are fine; the pattern targets the bare legacy names only.

- [ ] **Step 4: Manual smoke (document result, do not skip)**

Run: `npm --prefix apps/web run dev`, then in a browser: load `/login` (centered card + dog-ear), sign in, confirm TopBar + paper bg + grain, paste a link on `/` (capture → active card appears), open `/library` (grid / empty / skeletons), open an article (`/read/[id]`: sticky controls, progress bar fills on scroll, typography). Toggle each theme in the TopBar — chrome retones; reload — theme persists (localStorage). Verify `prefers-reduced-motion` kills the reveal/animations.

- [ ] **Step 5: Commit any fixes; otherwise this task is complete.**

```bash
git commit -am "fix(web): phase-3 verification follow-ups" # only if fixes were needed
```

---

## Self-Review notes

- **Spec coverage:** token reconciliation (T1, T2, T10-grep) · `--reading-font-sans` (T1) · primitives styling (T2) · theme global+override+persist (T3, T4, T8 reader override) · app shell bg/grain/topbar/nav/reveal (T4) · route split home/library (T6, T7) · home shows all in-flight + recent (T5, T6) · empty/loading states (T7) · reader controls/progress/typography (T8) · login (T9) · dog-ear motif (T7, T9) · reduced-motion (T2, T4, T7, T8) · TDD for pure logic (T1, T3, T5, T7-empty). All spec sections mapped.
- **No new backend/schema** — theme reuses `users.reader_prefs.theme`.
- **Existing tests preserved:** ArticleCard (roles/text unchanged), ReaderControls (labels unchanged), primitives (extended), card-state (untouched).
