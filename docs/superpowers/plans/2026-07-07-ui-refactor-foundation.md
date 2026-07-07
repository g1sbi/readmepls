# UI Refactor Foundation + Tag PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt Tailwind v4 + shadcn-svelte scaffolding in `apps/web`, bridge shadcn's CSS variables onto the existing `tokens.css` semantic layer so all three themes work with zero per-component theme code, and prove the whole pipeline end-to-end by migrating one component (`Tag`) to shadcn's `Badge`.

**Architecture:** Incremental, copy-in. shadcn-svelte components are generated as source files under `src/lib/components/ui/<name>/` and coexist with the surviving hand-rolled primitives — nothing else has to change at once. The keystone is a one-time CSS bridge: shadcn's alias vars (`--background`, `--primary`, …) are pointed at `tokens.css`'s `--color-*` tokens in `:root` only; because CSS custom properties re-resolve at use-site, the existing `[data-theme="dark"|"sepia"]` remaps of `--color-*` are inherited automatically with no per-theme shadcn overrides. This plan is the foundation; the remaining 10 component migrations are a separate plan written after this one lands (their exact class strings depend on how this foundation resolves).

**Tech Stack:** SvelteKit 2.66, Svelte 5.56, Vite 5.4, `bits-ui ^2.18.1` (already installed), `@lucide/svelte` (already installed), Tailwind v4 (new), `@tailwindcss/vite`, `clsx`, `tailwind-merge`, shadcn-svelte CLI.

## Global Constraints

- **Never hardcode a color, font, radius, or shadow in a component — reference a token** (CLAUDE.md). The whole point of the CSS bridge is that shadcn components resolve to `tokens.css` tokens, not literal values.
- **`tokens.css` stays the single source of truth.** The bridge maps shadcn vars *onto* it; it must not introduce a second parallel palette. Do not edit the `--color-*` / `--radius-*` / `--shadow-*` values in `tokens.css`.
- **Themes are driven by `[data-theme="dark"]` / `[data-theme="sepia"]` attributes, NOT a `.dark` class.** shadcn's default `.dark` convention must be replaced with a `@custom-variant dark ([data-theme="dark"] &)`.
- **No visual regression on existing hand-rolled components.** Tailwind v4 ships a preflight reset; adding it must not change how the ~14 un-migrated primitives or existing pages render in any of the three themes.
- **Mobile-first, usable at 360px, tap targets ≥44px** (CLAUDE.md).
- **Commit messages: Conventional Commits, end every message with**
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Test/verify commands (this repo is a vitest workspace — the per-package `pnpm --filter … test` form does NOT work):**
  - Run a test subset: `pnpm exec vitest run <pattern>` from repo root.
  - Full suite: `pnpm test` from repo root.
  - Web type/svelte check: `pnpm --filter @readmepls/web run check` — baseline already has ~15 PRE-EXISTING errors unrelated to this work; the gate is **introduce NO NEW errors**, not zero.
  - Root typecheck: `pnpm typecheck`.
  - Web build: `pnpm --filter @readmepls/web build`.
  - Dev server for visual checks: `pnpm --filter @readmepls/web dev`.

---

## File Structure

- **Modify:** `apps/web/vite.config.ts` — add the `@tailwindcss/vite` plugin (before `sveltekit()`), preserving the existing `resolve.alias` and `build.commonjsOptions`.
- **Modify:** `apps/web/package.json` — add Tailwind + helper devDependencies.
- **Create:** `apps/web/src/lib/utils.ts` — the `cn()` class-merge helper shadcn components import.
- **Create:** `apps/web/src/lib/styles/shadcn-bridge.css` — `@import "tailwindcss"`, the `@custom-variant dark`, the `:root` alias-var block mapping shadcn vars → `tokens.css`, and the `@theme inline` block exposing them to Tailwind utilities. Imported from `+layout.svelte` AFTER `tokens.css`.
- **Modify:** `apps/web/src/routes/+layout.svelte` — import `shadcn-bridge.css` after `tokens.css`.
- **Create:** `apps/web/components.json` — shadcn-svelte CLI config (aliases, paths, base color).
- **Create (by CLI):** `apps/web/src/lib/components/ui/badge/` — shadcn `Badge` component source.
- **Modify:** `apps/web/src/lib/components/ui/Tag.svelte` — reimplement on `Badge` instead of `Chip`.
- **Create:** `apps/web/src/lib/components/ui/tailwind-bridge.test.ts` — a probe test asserting a Tailwind utility resolves to a token value (bridge tripwire).
- **Untouched:** `tokens.css`, `fonts.css`, `app.css` values; all other `ui/*.svelte`; `Chip.svelte` (Tag stops using it, but Chip stays for its own later migration).

---

### Task 1: Adopt Tailwind v4 + shadcn scaffolding (no visual change)

Goal: Tailwind and the shadcn helper files exist and build, and **nothing renders differently**. This task deliberately adds NO theme bridge and NO components yet — it isolates the single riskiest question ("does adding Tailwind's preflight break the existing hand-rolled styles?") behind its own review gate.

**Files:**
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/package.json` (via `pnpm add`)
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/components.json`
- Create: `apps/web/src/app-tailwind.css` (temporary minimal Tailwind entry for this task)
- Modify: `apps/web/src/routes/+layout.svelte`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` exported from `$lib/utils` — every shadcn component imports this. Exact signature below.

- [ ] **Step 1: Install Tailwind v4 and helpers**

Run from repo root:
```bash
pnpm --filter @readmepls/web add -D tailwindcss@^4 @tailwindcss/vite@^4
pnpm --filter @readmepls/web add clsx tailwind-merge
```
Expected: `apps/web/package.json` gains `tailwindcss` and `@tailwindcss/vite` under devDependencies and `clsx`, `tailwind-merge` under dependencies. No install errors.

- [ ] **Step 2: Wire the Tailwind Vite plugin**

Edit `apps/web/vite.config.ts`. Add the import and put the plugin **before** `sveltekit()`, leaving `resolve` and `build` exactly as they are:
```ts
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  resolve: {
    alias: [
      { find: /^optimal-select$/, replacement: "optimal-select/lib/index.js" },
    ],
  },
  build: {
    commonjsOptions: { transformMixedEsModules: true },
  },
});
```

- [ ] **Step 3: Create the `cn()` helper**

Create `apps/web/src/lib/utils.ts`:
```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Create a minimal Tailwind entry and import it last**

Create `apps/web/src/app-tailwind.css` with ONLY the Tailwind import (no theme yet — the bridge is Task 2):
```css
@import "tailwindcss";
```
Edit `apps/web/src/routes/+layout.svelte` so the import order is tokens → app reset → tailwind (tailwind last so its preflight can be audited against the existing reset):
```svelte
  import "$lib/styles/tokens.css";
  import "../app.css";
  import "../app-tailwind.css";
```

- [ ] **Step 5: Create `components.json`**

Create `apps/web/components.json` (SvelteKit paths; base color slate is only shadcn's default seed — the Task 2 bridge overrides all of it to tokens):
```json
{
  "$schema": "https://shadcn-svelte.com/schema.json",
  "tailwind": {
    "css": "src/app-tailwind.css",
    "baseColor": "slate"
  },
  "aliases": {
    "components": "$lib/components",
    "utils": "$lib/utils",
    "ui": "$lib/components/ui",
    "hooks": "$lib/hooks",
    "lib": "$lib"
  },
  "typescript": true,
  "registry": "https://shadcn-svelte.com/registry"
}
```

- [ ] **Step 6: Verify the build succeeds and types are clean**

Run:
```bash
pnpm --filter @readmepls/web build
pnpm --filter @readmepls/web run check
```
Expected: build completes with no errors; `check` shows the SAME ~15 pre-existing baseline errors and **no new ones** referencing `utils.ts`, `vite.config.ts`, or `+layout.svelte`.

- [ ] **Step 7: Verify the existing test suite still passes**

Run:
```bash
pnpm test
```
Expected: the full suite is green (same count as before this task). If any previously-passing component test now fails, Tailwind's preflight has altered rendered output — STOP and reconcile (see Step 8) before proceeding.

- [ ] **Step 8: Visually verify no regression across all three themes**

Run `pnpm --filter @readmepls/web dev`, open the library and reader pages, and toggle `default` / `dark` / `sepia` (the theme switcher writes `[data-theme]`). Confirm the existing hand-rolled components (buttons, cards, chips, inputs) look identical to before. If Tailwind's preflight reset visibly changed borders/margins/heading styles, add a scoped exclusion by replacing the plain import in `app-tailwind.css` with the layered form that omits preflight:
```css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
```
(This pulls in Tailwind utilities WITHOUT its preflight reset, since `app.css` already owns the reset.) Re-run Steps 6–8 after any change here.

- [ ] **Step 9: Commit**

```bash
git add apps/web/vite.config.ts apps/web/package.json apps/web/src/lib/utils.ts apps/web/src/app-tailwind.css apps/web/src/routes/+layout.svelte apps/web/components.json pnpm-lock.yaml
git commit -m "chore(web): adopt Tailwind v4 + shadcn-svelte scaffolding

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Bridge shadcn CSS variables onto tokens.css

Goal: shadcn's utility classes (`bg-primary`, `text-foreground`, `rounded-md`, `border-border`) resolve to `tokens.css` values in every theme, defined once. Ends with an automated probe proving it.

**Files:**
- Create: `apps/web/src/lib/styles/shadcn-bridge.css` (replaces the temporary `app-tailwind.css` from Task 1)
- Delete: `apps/web/src/app-tailwind.css`
- Modify: `apps/web/src/routes/+layout.svelte` (import the bridge instead)
- Modify: `apps/web/components.json` (point `tailwind.css` at the bridge)
- Create: `apps/web/src/lib/components/ui/tailwind-bridge.test.ts`

**Interfaces:**
- Consumes: `tokens.css` semantic vars (`--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-surface-sunken`, `--color-text`, `--color-text-muted`, `--color-text-subtle`, `--color-text-on-accent`, `--color-accent`, `--color-accent-wash`, `--color-border`, `--color-ring`, `--color-danger`), and the radius ramp `--radius-xs/sm/md/lg/xl/2xl/pill`.
- Produces: shadcn alias vars in `:root` and Tailwind theme tokens, consumed by every future shadcn component. The dark variant is registered as `@custom-variant dark ([data-theme="dark"] &)`.

- [ ] **Step 1: Write the failing bridge probe test**

jsdom does not run the Tailwind pipeline, so the bridge can't be tested by computed style. Instead assert on the bridge file's declared indirection — that each shadcn alias var is wired to a `tokens.css` token (never a literal), and that the dark variant targets `[data-theme]`. This is the property that actually matters: the bridge must not smuggle in a second palette. Create `apps/web/src/lib/components/ui/tailwind-bridge.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("shadcn ↔ tokens bridge", () => {
  const css = () =>
    readFileSync(resolve(__dirname, "../../styles/shadcn-bridge.css"), "utf8");

  it("registers the dark variant against [data-theme], not .dark", () => {
    expect(css()).toContain('@custom-variant dark ([data-theme="dark"] &)');
  });

  it("maps every shadcn alias var to a tokens.css --color-* token, not a literal", () => {
    const c = css();
    for (const [alias, token] of [
      ["--background", "--color-bg"],
      ["--foreground", "--color-text"],
      ["--primary", "--color-accent"],
      ["--primary-foreground", "--color-text-on-accent"],
      ["--secondary", "--color-surface-sunken"],
      ["--muted-foreground", "--color-text-subtle"],
      ["--accent", "--color-accent-wash"],
      ["--destructive", "--color-danger"],
      ["--border", "--color-border"],
      ["--ring", "--color-ring"],
    ]) {
      expect(c).toMatch(new RegExp(`${alias}:\\s*var\\(${token}\\)`));
    }
  });
});
```

- [ ] **Step 2: Run the probe to verify it fails**

Run:
```bash
pnpm exec vitest run tailwind-bridge
```
Expected: FAIL with "ENOENT … shadcn-bridge.css" (the file doesn't exist yet).

- [ ] **Step 3: Write the bridge CSS**

Create `apps/web/src/lib/styles/shadcn-bridge.css`:
```css
/* shadcn-svelte ↔ tokens.css bridge.
 * shadcn components reference alias vars (--background, --primary, …). We
 * point those at tokens.css's --color-* semantic layer ONCE, in :root.
 * Because custom properties re-resolve at use-site, the existing
 * [data-theme="dark"|"sepia"] remaps of --color-* are inherited with no
 * per-theme override here (confirmed in the effort analysis, §2). */
@import "tailwindcss";

/* This repo themes via [data-theme], not shadcn's default .dark class. */
@custom-variant dark ([data-theme="dark"] &);

:root {
  --background: var(--color-bg);
  --foreground: var(--color-text);
  --card: var(--color-surface-raised);
  --card-foreground: var(--color-text);
  --popover: var(--color-surface-raised);
  --popover-foreground: var(--color-text);
  --primary: var(--color-accent);
  --primary-foreground: var(--color-text-on-accent);
  --secondary: var(--color-surface-sunken);
  --secondary-foreground: var(--color-text-muted);
  --muted: var(--color-surface-sunken);
  --muted-foreground: var(--color-text-subtle);
  --accent: var(--color-accent-wash);
  --accent-foreground: var(--color-text);
  --destructive: var(--color-danger);
  --destructive-foreground: var(--color-text-on-accent);
  --border: var(--color-border);
  --input: var(--color-border);
  --ring: var(--color-ring);
}

/* Expose the alias vars + the existing radius ramp as Tailwind theme tokens
 * so utilities (bg-primary, rounded-md, …) generate. tokens.css already owns
 * --radius-*; naming aligns, so rounded-md == --radius-md (14px) automatically. */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
  --radius-xl: var(--radius-xl);
}
```

- [ ] **Step 4: Swap the layout import and delete the temporary entry**

Edit `apps/web/src/routes/+layout.svelte` — replace the `app-tailwind.css` import:
```svelte
  import "$lib/styles/tokens.css";
  import "../app.css";
  import "$lib/styles/shadcn-bridge.css";
```
Delete the temporary file:
```bash
git rm apps/web/src/app-tailwind.css
```
Update `apps/web/components.json` `tailwind.css` to `"src/lib/styles/shadcn-bridge.css"`.

- [ ] **Step 5: Run the probe test — verify it passes**

Run:
```bash
pnpm exec vitest run tailwind-bridge
```
Expected: PASS (both assertions).

- [ ] **Step 6: Verify build, types, and full suite**

Run:
```bash
pnpm --filter @readmepls/web build
pnpm --filter @readmepls/web run check
pnpm test
```
Expected: build clean; no new `check` errors beyond the ~15 baseline; full suite green.

- [ ] **Step 7: Visually confirm a live utility resolves to a token in all three themes**

Run `pnpm --filter @readmepls/web dev`. Temporarily drop `<div class="bg-primary text-primary-foreground rounded-md p-4">bridge probe</div>` onto the library page. Confirm it renders terracotta with the correct 14px radius in `default`, stays terracotta in `sepia` (accent is intentionally preserved there), and adapts in `dark`. Remove the probe div before committing.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/styles/shadcn-bridge.css apps/web/src/routes/+layout.svelte apps/web/components.json apps/web/src/lib/components/ui/tailwind-bridge.test.ts
git rm apps/web/src/app-tailwind.css
git commit -m "feat(web): bridge shadcn-svelte CSS vars onto tokens.css

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Migrate `Tag` to shadcn `Badge` (proof-of-concept)

Goal: replace the first real component. `Tag` currently renders a non-interactive `Chip`; reimplement it on shadcn's `Badge` (default variant), keeping its `children`-only public API and its existing `primitives.test.ts` assertion green. `Tag` has ONE import site (`ArticleCard.svelte`), the smallest blast radius in the inventory.

**Files:**
- Create (by CLI): `apps/web/src/lib/components/ui/badge/` (and `index.ts`)
- Modify: `apps/web/src/lib/components/ui/Tag.svelte`
- Modify: `apps/web/src/lib/components/ui/primitives.test.ts` (add a Tag-on-Badge assertion)
- Reference (unchanged): `apps/web/src/lib/components/ArticleCard.svelte`

**Interfaces:**
- Consumes: `cn()` from `$lib/utils` (Task 1), the bridge from Task 2, `Badge` from `$lib/components/ui/badge`.
- Produces: `Tag.svelte` with unchanged public API — `{ children?: Snippet }` — so `ArticleCard` needs no change.

- [ ] **Step 1: Add the shadcn Badge component**

Run from repo root:
```bash
pnpm --filter @readmepls/web exec shadcn-svelte@latest add badge
```
Expected: creates `apps/web/src/lib/components/ui/badge/badge.svelte` and `index.ts`. If the CLI prompts, accept the `components.json` paths. Confirm the generated `badge.svelte` imports `cn` from `$lib/utils`.

- [ ] **Step 2: Update the existing Tag test to assert it renders via Badge**

The current assertion in `apps/web/src/lib/components/ui/primitives.test.ts` checks `screen.getByText("ai")` for Tag. Keep that (it's the API tripwire) and add one asserting Badge's data attribute is present, confirming Tag now routes through Badge. Add inside the existing Tag describe/test block:
```ts
it("Tag renders its label through the shadcn Badge", () => {
  render(Tag, { props: { children: createRawSnippet(() => ({ render: () => "ai" })) } });
  const el = screen.getByText("ai");
  // shadcn Badge renders a data-slot="badge" attribute on its root element.
  expect(el.closest('[data-slot="badge"]')).not.toBeNull();
});
```
(If `createRawSnippet` isn't already imported in this file, add it to the existing `svelte` import; match how other tests in this file construct `children` snippets.)

- [ ] **Step 3: Run the new test to verify it fails**

Run:
```bash
pnpm exec vitest run primitives
```
Expected: the new assertion FAILS with `expect(received).not.toBeNull()` (Tag still renders `.chip`, no `data-slot="badge"` yet). The pre-existing `getByText("ai")` assertion still passes.

- [ ] **Step 4: Reimplement Tag on Badge**

Replace `apps/web/src/lib/components/ui/Tag.svelte`:
```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Badge } from "./badge";
  let { children }: { children?: Snippet } = $props();
</script>

{#if children}
  <Badge variant="secondary">
    {@render children()}
  </Badge>
{/if}
```
(`variant="secondary"` maps — via the bridge — to `--color-surface-sunken` bg / `--color-text-muted` text, matching Tag's read-only look from the effort analysis §2. `Badge`'s default `rounded-full` needs no radius override.)

- [ ] **Step 5: Run the test — verify it passes**

Run:
```bash
pnpm exec vitest run primitives
```
Expected: PASS — both the `getByText("ai")` tripwire and the new `data-slot="badge"` assertion.

- [ ] **Step 6: Verify build, types, and full suite**

Run:
```bash
pnpm --filter @readmepls/web build
pnpm --filter @readmepls/web run check
pnpm test
```
Expected: build clean; no new `check` errors beyond baseline; full suite green.

- [ ] **Step 7: Visually verify tags in ArticleCard across all three themes**

Run `pnpm --filter @readmepls/web dev`, open the library (article cards show tags). Confirm tags render as muted pills, legible at 360px width, in `default` / `dark` / `sepia`, matching their previous appearance closely enough (exact pixels may shift slightly; identity — muted, pill-shaped, readable — must hold).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/components/ui/badge apps/web/src/lib/components/ui/Tag.svelte apps/web/src/lib/components/ui/primitives.test.ts
git commit -m "feat(web): migrate Tag to shadcn Badge (first component swap)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage (against effort analysis §3 upfront-cost list):** (1) adopt Tailwind v4 → Task 1; (2) install shadcn CLI + `cn()` + `clsx`/`tailwind-merge` + `components.json` → Task 1; (3) seed the shared CSS-var block remapped to tokens once, picked up by all 3 themes → Task 2. Migration order's PoC (`Tag` first, 1 import site, color-only remap, existing test survives) → Task 3. Covered.
- **Open risks the analysis flagged, and where handled:** Tailwind preflight vs existing reset → Task 1 Steps 7–8 (with a concrete preflight-exclusion fallback). Dark via `[data-theme]` not `.dark` → Task 2 `@custom-variant`. Radius-ramp mismatch → resolved by name-alignment (tokens.css `--radius-*` populate Tailwind's radius theme directly; verified live in Task 2 Step 7) rather than per-component overrides. `bits-ui` compat → not exercised until a bits-ui-based component migrates (DropdownMenu/Sheet/ConfirmDialog, all in the next plan); `Badge` has no bits-ui dependency, so this foundation doesn't hit it. Font wiring → deferred: `Tag`/`Badge` use no display font; the `--font-*` → Tailwind theme decision is made in the next plan when a font-bearing component (Button) migrates. Noted here so it isn't forgotten.
- **Placeholder scan:** every step has a concrete command, file path, or code block. No "handle appropriately".
- **Type/name consistency:** `cn(...inputs: ClassValue[])` defined in Task 1, imported by Badge in Task 3. `Tag` public API `{ children?: Snippet }` unchanged across the swap, so `ArticleCard` (its only consumer) needs no edit. Bridge var names in Task 2's test match the CSS written in the same task.
- **Deliberately deferred to Plan B (the remaining 10 migrations):** Button, Card, Chip, ConfirmDialog, DropdownMenu, Input, MenuItem, Sheet, Skeleton, Spinner — plus the system-level font/shadow-ramp decisions, which only bite once a font/shadow-bearing component migrates.
```
