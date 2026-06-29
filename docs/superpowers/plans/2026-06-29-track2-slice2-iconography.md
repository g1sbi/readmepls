# UI Rework — Track 2 · Slice 2 (Iconography) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a tokenized `@lucide/svelte` line-icon system and apply icons across all chrome (actions + nav) following an icon+text / icon-only policy, changing no behavior and preserving every control's accessible name.

**Architecture:** Per-icon imports from `@lucide/svelte` (tree-shakeable). Size/stroke are tokenized in `tokens.css`; global `.icon-sm/md/lg` utilities in `app.css` carry width/height/stroke; color inherits `currentColor`. Icons are decorative (`aria-hidden="true"`). The `Button` primitive gains inline-flex layout (no prop/API change). Where a control becomes icon-only, its visible text is replaced by an `.sr-only` label span (or an existing `aria-label` is kept) so the accessible name never changes and existing `getByRole(..., { name })` tests stay the regression contract.

**Tech Stack:** SvelteKit (Svelte 5 runes), `@lucide/svelte@^1.22`, Vitest + `@testing-library/svelte` (jsdom), scoped component `<style>`, CSS custom properties in `apps/web/src/lib/styles/tokens.css`, global `apps/web/src/app.css`.

**Source spec:** `docs/superpowers/specs/2026-06-29-track2-slice2-iconography.md` (icon map §6, policy §4, a11y §5, build order §9). Brief finding `G3`, §F item 8.

## Global Constraints

- **Tokens only — never hardcode a color, font, or icon size in a component.** Icon size/stroke come from `--icon-*` tokens via the `.icon-*` utility class; color is `currentColor`. (`CLAUDE.md` › Design language; spec §4)
- **No behavior, routing, or copy changes. No new features.** This slice adds visual language only. (spec §2 Non-Goals)
- **Preserve every control's accessible name.** Icons are decorative (`aria-hidden="true"`) and never the sole accessible name. Icon-only controls keep an existing `aria-label` or gain an `.sr-only` text label. No control's accessible name changes. (spec §5)
- **No Button prop/API change.** `Button` gets inline-flex + gap only; icon-only Buttons use an `.sr-only` child span for their name, not a new prop. (spec §4)
- **Dependency:** add `@lucide/svelte@^1.22` to `apps/web` `dependencies`, imported per-icon. Flag it in review as a deliberate new dependency (brief named the older `lucide-svelte`; `@lucide/svelte` is the maintained Svelte-5 package). (spec §3)
- **Not iconned (deliberate):** tag/collection chips (text-only); ConfirmDialog buttons (text-only); no close affordance added to ConfirmDialog. (spec §2, §6)
- **TypeScript strict.** No `any` without a written reason. (`CLAUDE.md`)
- **TDD where it carries logic.** Only the A−/A+ stepper accessible names are new logic — failing test first. Restyling is visual: verify by running the app, never write hollow assertions. (spec §8)
- **Conventional Commits, one logical change per commit** (`feat:`/`refactor:`). Squash NOT required on `develop`; keep commits logical. **Never push or open a PR.** (`CLAUDE.md`)
- **Run-app visual checks:** dev server `http://localhost:3000`, sign in with the test account; check light/dark/sepia. The Docker stack may already be up from a prior session (`docker compose ps`); otherwise `cd apps/web && pnpm dev`.
- **Test commands run from `apps/web/`:** `pnpm vitest run <path>` (single run). Typecheck: `pnpm check`.

---

## File map

| File | Responsibility | Tasks |
| --- | --- | --- |
| `apps/web/package.json` | Add `@lucide/svelte` dependency | 1 |
| `apps/web/src/lib/styles/tokens.css` | Icon size/stroke tokens | 1 |
| `apps/web/src/app.css` | `.icon-sm/md/lg` + `.sr-only` utilities | 1 |
| `apps/web/src/lib/components/ui/Button.svelte` | inline-flex + gap (no API change) | 1 |
| `apps/web/src/lib/components/TopBar.svelte` | search, nav, theme, sign-out icons; mobile label-hide | 2 |
| `apps/web/src/lib/components/ArticleCard.svelte` | read/retry/delete icons | 3 |
| `apps/web/src/lib/components/CaptureBar.svelte` | save-it icon | 3 |
| `apps/web/src/lib/components/ReaderControls.svelte` | size/font/theme icons; new stepper `aria-label`s | 4 |
| `apps/web/src/routes/read/[id]/+page.svelte` | back/archive/delete icons | 4 |
| `apps/web/src/routes/collections/[slug]/+page.svelte` | back icon | 4 |
| `apps/web/src/lib/components/HighlightsSidebar.svelte` | delete icon | 5 |
| `apps/web/src/lib/components/HighlightPopover.svelte` | cancel icon | 5 |
| `apps/web/src/routes/library/+page.svelte` | collections-rail action icons | 5 |

---

## Icon usage patterns (reference — used by every task)

**Icon + text** (accessible name = the visible text; icon decorative):
```svelte
<Button onclick={…}>
  <BookOpen class="icon-md" aria-hidden="true" /> read
</Button>
```

**Icon only on a `Button`** (no Button API change — name comes from an `.sr-only` span):
```svelte
<Button onclick={…}>
  <AArrowUp class="icon-md" aria-hidden="true" /><span class="sr-only">increase text size</span>
</Button>
```

**Icon only on a plain `<button>` that already has `aria-label`** (drop the visible text/glyph, keep the label):
```svelte
<button class="del" aria-label="delete" onclick={…}><Trash2 class="icon-sm" aria-hidden="true" /></button>
```

Always `aria-hidden="true"` on the icon. Size via `.icon-sm` (1rem) / `.icon-md` (1.25rem) / `.icon-lg` (1.5rem). Never pass `size`/`strokeWidth`/`color` props — the class is the single tokenized source.

---

## Task 1: Foundation — dependency, tokens, utilities, Button layout

Adds the icon system's foundation. Nothing visual changes yet except `Button` gaining a harmless inline-flex layout.

**Files:**
- Modify: `apps/web/package.json` (add dependency)
- Modify: `apps/web/src/lib/styles/tokens.css` (icon tokens)
- Modify: `apps/web/src/app.css` (`.icon-*` + `.sr-only`)
- Modify: `apps/web/src/lib/components/ui/Button.svelte` (inline-flex + gap)

**Interfaces:**
- Produces: `.icon-sm` / `.icon-md` / `.icon-lg` global classes; `.sr-only` global class; `--icon-sm/md/lg/stroke` tokens; a `Button` whose default slot lays children out as `inline-flex` with `gap: var(--space-2)`. All later tasks consume these.

- [ ] **Step 1: Add the dependency**

In `apps/web/package.json`, add to `dependencies` (keep alphabetical with the existing `bits-ui` entry):
```json
    "@lucide/svelte": "^1.22",
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates; `@lucide/svelte` resolves (peerDep `svelte: ^5` satisfied). No errors.

- [ ] **Step 3: Add icon tokens**

In `apps/web/src/lib/styles/tokens.css`, inside the `:root { … }` block (e.g. right after the `--space-*` line), add:
```css
  /* iconography (Track 2 slice 2) */
  --icon-sm: 1rem;     /* 16 — inline with sm/md text */
  --icon-md: 1.25rem;  /* 20 — default action/control icon */
  --icon-lg: 1.5rem;   /* 24 — emphasis */
  --icon-stroke: 1.75; /* line weight, pairs with Fredoka */
```

- [ ] **Step 4: Add the global utilities**

In `apps/web/src/app.css`, append:
```css

/* Icon sizing utilities (Track 2 slice 2). Applied via the lucide component's
   `class` prop so size/stroke stay tokenized and themeable. Color inherits
   currentColor (lucide's default stroke), so an icon takes its button/link's
   text color automatically. CSS stroke-width overrides lucide's attribute. */
.icon-sm,
.icon-md,
.icon-lg {
  stroke-width: var(--icon-stroke);
  flex: none; /* don't let an icon stretch inside a flex control */
}
.icon-sm { width: var(--icon-sm); height: var(--icon-sm); }
.icon-md { width: var(--icon-md); height: var(--icon-md); }
.icon-lg { width: var(--icon-lg); height: var(--icon-lg); }

/* Visually hidden but available to assistive tech and to getByRole({name}).
   Used to keep an icon-only control's accessible name without changing copy. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 5: Give Button inline-flex layout**

In `apps/web/src/lib/components/ui/Button.svelte` `<style>`, edit the `button { … }` rule to add layout (leave every other declaration unchanged):
```css
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
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
```
(Text-only buttons are unaffected — `gap` has no visible effect with a single child.)

- [ ] **Step 6: Typecheck + existing suite green**

Run: `pnpm check`
Expected: no new type errors.
Run: `pnpm vitest run src/lib/components/ui/button` (and any existing Button test)
Expected: PASS. If no Button test exists, run the full suite `pnpm vitest run` → all green (foundation introduces no behavior change).

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src/lib/styles/tokens.css apps/web/src/app.css apps/web/src/lib/components/ui/Button.svelte
git commit -m "feat(web): add @lucide/svelte icon foundation (tokens, utilities, Button layout)"
```
> Note: the lockfile is at the repo root (`pnpm-lock.yaml`) in this workspace — `git add` the lockfile that actually changed (`git status` will show it). Stage the changed lockfile path.

---

## Task 2: TopBar icons + mobile label-hide

**Files:**
- Modify: `apps/web/src/lib/components/TopBar.svelte`

**Interfaces:**
- Consumes: `.icon-md`, `.sr-only` (Task 1). Produces: no exports; markup-only. Accessible names unchanged: search input keeps `aria-label="search library"`; nav links keep text "extract"/"library"; theme buttons keep text name + `aria-pressed`; sign-out keeps "sign out".

- [ ] **Step 1: Import the icons**

In the `<script>` block add (after the existing imports):
```svelte
  import { Search, Sparkles, Library, Sun, Moon, Coffee, LogOut } from "@lucide/svelte";

  // Theme → icon map; theme text label stays the accessible name.
  const themeIcon = { light: Sun, dark: Moon, sepia: Coffee } as const;
```

- [ ] **Step 2: Add the search icon inside the field**

Replace the `.search` form markup:
```svelte
  <form class="search" onsubmit={(e) => { e.preventDefault(); if (q.trim()) goto(`/search?q=${encodeURIComponent(q)}`); }}>
    <Search class="icon-sm search-icon" aria-hidden="true" />
    <input bind:value={q} placeholder="search…" aria-label="search library" />
  </form>
```
And in `<style>`, make the field position the icon (replace the `.search` + `.search input` rules' positioning; keep all other declarations):
```css
  .search { display: flex; flex: 1; max-width: 20rem; position: relative; align-items: center; }
  .search-icon { position: absolute; left: 0.6rem; color: var(--color-text-subtle); pointer-events: none; }
  .search input {
    width: 100%;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    padding: 0.3rem 0.65rem 0.3rem 1.9rem; /* left pad for the icon */
    background: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    color: var(--color-text);
    outline: none;
  }
```

- [ ] **Step 3: Add nav icons (icon + text)**

```svelte
  <nav>
    <a href="/"><Sparkles class="icon-sm" aria-hidden="true" />extract</a>
    <a href="/library"><Library class="icon-sm" aria-hidden="true" />library</a>
  </nav>
```
In `<style>`, give nav links inline-flex alignment (replace the `nav a` rule, keep color rules):
```css
  nav a { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-display); color: var(--color-text-muted); text-decoration: none; }
```

- [ ] **Step 4: Theme buttons — icon + text, label hidden on mobile**

Replace the `{#each THEMES}` button. The text stays in a `.label` span so its accessible name survives when visually hidden at ≤640px (do **not** use `display:none` — that would drop the accessible name and break `getByRole({name})`):
```svelte
      {#each THEMES as t}
        {@const Icon = themeIcon[t]}
        <button
          type="button"
          aria-pressed={theme === t}
          data-active={theme === t}
          onclick={() => onTheme(t)}><Icon class="icon-sm" aria-hidden="true" /><span class="label">{t}</span></button>
      {/each}
```
In `<style>` update `.themes button` to align icon+label, and hide the label at ≤640px via the visually-hidden clip (add inside the existing `@media (max-width: 640px)` block):
```css
  .themes button { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-display); font-size: 0.8rem; padding: 0.25rem 0.6rem; border: none; background: transparent; color: var(--color-text-muted); cursor: pointer; }
```
Add to the existing `@media (max-width: 640px) { … }` block:
```css
    .themes button .label {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }
```

- [ ] **Step 5: Sign-out icon (icon + text)**

```svelte
    <button type="button" class="signout" onclick={onSignOut}><LogOut class="icon-sm" aria-hidden="true" />sign out</button>
```
In `<style>` (replace `.signout` rule, keep hover/focus rules):
```css
  .signout { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-display); font-size: 0.85rem; background: none; border: none; color: var(--color-text-muted); cursor: pointer; }
```

- [ ] **Step 6: Existing tests + typecheck**

Run: `pnpm vitest run src/lib/components/TopBar` (if a test exists) then `pnpm check`.
Expected: PASS / no new type errors. Accessible names are unchanged so any `getByRole`/`getByText` queries still resolve.

- [ ] **Step 7: Verify in the running app**

Sign in; on the library/extract chrome confirm: search field shows a leading magnifier; nav shows extract/library with icons; theme pill shows sun/moon/coffee + labels and the active theme stays highlighted (`aria-pressed`); sign-out shows the logout glyph. Resize to ≤640px: theme labels disappear (icon-only) while the pill still toggles. Icons inherit text color in light/dark/sepia.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/components/TopBar.svelte
git commit -m "feat(web): add icons to the top bar (search, nav, theme, sign out)"
```

---

## Task 3: ArticleCard + CaptureBar icons

**Files:**
- Modify: `apps/web/src/lib/components/ArticleCard.svelte`
- Modify: `apps/web/src/lib/components/CaptureBar.svelte`

**Interfaces:**
- Consumes: `.icon-md`, `.icon-sm`, `.sr-only` (Task 1). Produces: markup-only. ArticleCard delete keeps `aria-label="delete article"` (becomes icon-only); read/retry keep their text names; CaptureBar save keeps "save it"/"saving…".

- [ ] **Step 1: ArticleCard — import icons**

In the `<script>` imports add:
```svelte
  import { BookOpen, RotateCw, Trash2 } from "@lucide/svelte";
```

- [ ] **Step 2: ArticleCard — read / retry (icon + text), delete (icon-only)**

Replace the retry and read Buttons:
```svelte
      <Button variant="accent" onclick={() => onRetry?.(article.id)}><RotateCw class="icon-sm" aria-hidden="true" /> retry</Button>
```
```svelte
      <Button onclick={() => onOpen?.(article.id)}><BookOpen class="icon-sm" aria-hidden="true" /> read</Button>
```
Replace the delete button (icon-only; the `aria-label` is its accessible name — drop the visible "delete" text):
```svelte
    <button class="delete-btn" onclick={() => (confirming = true)} aria-label="delete article"><Trash2 class="icon-sm" aria-hidden="true" /></button>
```
In `.delete-btn` `<style>`, ensure it centers the icon (add to the existing rule):
```css
  .delete-btn {
    display: inline-flex;
    align-items: center;
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: 0.1rem 0.4rem;
    align-self: flex-end;
  }
```

- [ ] **Step 3: CaptureBar — save-it icon (icon + text)**

In `<script>` imports add:
```svelte
  import { BookmarkPlus } from "@lucide/svelte";
```
Replace the submit Button:
```svelte
  <Button type="submit" variant="accent" disabled={busy}><BookmarkPlus class="icon-sm" aria-hidden="true" /> {busy ? "saving…" : "save it"}</Button>
```

- [ ] **Step 4: Existing tests + typecheck**

Run: `pnpm vitest run src/lib/components/ArticleCard` then `pnpm check`.
Expected: PASS — the delete test (`getByRole("button", { name: "delete article" })`), read/retry text, and capture flow are unchanged. No new type errors.

- [ ] **Step 5: Verify in the running app**

Library grid: read cards show a book icon + "read"; a processing/failed card shows retry with a refresh icon; each card's delete is now an icon-only trash button (hover → accent) and still opens the confirm dialog. Extract page: "save it" shows a bookmark-plus icon; busy state still reads "saving…".

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/ArticleCard.svelte apps/web/src/lib/components/CaptureBar.svelte
git commit -m "feat(web): add icons to article cards and the capture bar"
```

---

## Task 4: ReaderControls (incl. new stepper labels, TDD) + reader page + collections back

**Files:**
- Test: `apps/web/src/lib/components/ReaderControls.test.ts` (add stepper-label assertions)
- Modify: `apps/web/src/lib/components/ReaderControls.svelte`
- Modify: `apps/web/src/routes/read/[id]/+page.svelte`
- Modify: `apps/web/src/routes/collections/[slug]/+page.svelte`

**Interfaces:**
- Consumes: `.icon-md`, `.sr-only` (Task 1), `Button` (Task 1 layout). Produces: the A−/A+ steppers gain the accessible names **"decrease text size"** / **"increase text size"** (via `.sr-only` spans — no Button API change). Theme/font/back/archive/delete accessible names unchanged.

- [ ] **Step 1: Write the failing test (stepper accessible names)**

Append to `apps/web/src/lib/components/ReaderControls.test.ts` inside the `describe`:
```ts
  it("labels the size steppers for assistive tech", () => {
    render(ReaderControls, { prefs, onChange: vi.fn() });
    expect(screen.getByRole("button", { name: "decrease text size" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "increase text size" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/components/ReaderControls`
Expected: FAIL — current steppers are named "A−"/"A+", so the exact-name queries find nothing.

- [ ] **Step 3: ReaderControls — icons + sr-only stepper labels + font/theme icons**

Add to `<script>` imports:
```svelte
  import { AArrowDown, AArrowUp, Type, Sun, Moon, Coffee } from "@lucide/svelte";
```
Replace the controls markup (size steppers become icon-only with `.sr-only` names; font toggle shows `Type` + the target font; theme buttons get icons + keep their text names):
```svelte
<div class="controls" role="group" aria-label="reading controls">
  <Button onclick={() => emit({ size: clampSize(prefs.size - 1) })}><AArrowDown class="icon-md" aria-hidden="true" /><span class="sr-only">decrease text size</span></Button>
  <Button onclick={() => emit({ size: clampSize(prefs.size + 1) })}><AArrowUp class="icon-md" aria-hidden="true" /><span class="sr-only">increase text size</span></Button>
  <Button onclick={() => emit({ font: prefs.font === "serif" ? "sans" : "serif" })}>
    <Type class="icon-sm" aria-hidden="true" /> {prefs.font === "serif" ? "sans" : "serif"}
  </Button>
  <span class="sep" aria-hidden="true"></span>
  <Button onclick={() => emit({ theme: "light" })}><Sun class="icon-sm" aria-hidden="true" /> light</Button>
  <Button onclick={() => emit({ theme: "dark" })}><Moon class="icon-sm" aria-hidden="true" /> dark</Button>
  <Button onclick={() => emit({ theme: "sepia" })}><Coffee class="icon-sm" aria-hidden="true" /> sepia</Button>
</div>
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/components/ReaderControls`
Expected: PASS — new "decrease/increase text size" names resolve; the existing `/A\+|increase/i` and `/dark/i` tests still match.

- [ ] **Step 5: Reader page — back / archive / delete icons**

In `apps/web/src/routes/read/[id]/+page.svelte` `<script>` imports add:
```svelte
  import { ArrowLeft, Archive, Trash2 } from "@lucide/svelte";
```
Replace the three controls in the `.bar` (back link, archive Button, delete button):
```svelte
    <a class="back" href="/library"><ArrowLeft class="icon-sm" aria-hidden="true" /> library</a>
    <ReaderControls {prefs} onChange={savePrefs} />
    <Button onclick={archive}><Archive class="icon-sm" aria-hidden="true" /> archive</Button>
    <button class="reader-delete" onclick={() => (confirmingDelete = true)} aria-label="delete article"><Trash2 class="icon-sm" aria-hidden="true" /></button>
```
In `<style>` give the back link inline-flex alignment (replace the `.bar .back` rule, keep the hover rule), and the delete button centering:
```css
  .bar .back { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-display); color: var(--color-text-muted); text-decoration: none; }
```
Add `display: inline-flex; align-items: center;` to the existing `.reader-delete` rule.

- [ ] **Step 6: Collections detail — back icon**

In `apps/web/src/routes/collections/[slug]/+page.svelte` `<script>` add:
```svelte
  import { ArrowLeft } from "@lucide/svelte";
```
Replace the back link:
```svelte
  <a class="back" href="/library"><ArrowLeft class="icon-sm" aria-hidden="true" /> library</a>
```
In `<style>`, the `.back` rule already sets `display: inline-block` — change it to align the icon:
```css
  .back { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-display); color: var(--color-text-muted); text-decoration: none; margin-bottom: var(--space-3); }
```

- [ ] **Step 7: Full suite + typecheck**

Run: `pnpm vitest run` then `pnpm check`.
Expected: PASS — ReaderControls (incl. new test), reader-page, and collections tests green; no new type errors. The reader page has its delete-error-path test from a prior feature; it must stay green (accessible name "delete article" unchanged).

- [ ] **Step 8: Verify in the running app**

Open an article. Reader controls: A−/A+ are icon-only (font size still changes; screen-reader/`getByRole` name present); font toggle shows the `Type` icon + target font; theme buttons show sun/moon/coffee + labels and switch theme. Top bar: "← library" is now an arrow-left icon + "library"; "archive" has an archive icon; delete is an icon-only trash. Open a collection → its back link shows the arrow icon. Check all three themes; icons inherit text color.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/components/ReaderControls.svelte apps/web/src/lib/components/ReaderControls.test.ts apps/web/src/routes/read/[id]/+page.svelte apps/web/src/routes/collections/[slug]/+page.svelte
git commit -m "feat(web): add icons to reader controls, reader page, and collection detail"
```

---

## Task 5: HighlightsSidebar + HighlightPopover + library collections-rail

**Files:**
- Modify: `apps/web/src/lib/components/HighlightsSidebar.svelte`
- Modify: `apps/web/src/lib/components/HighlightPopover.svelte`
- Modify: `apps/web/src/routes/library/+page.svelte`

**Interfaces:**
- Consumes: `.icon-sm` (Task 1). Produces: markup-only. All accessible names unchanged: highlight delete keeps `aria-label="delete"`; popover cancel keeps `aria-label="cancel"`; rail rename/delete keep `aria-label="rename {name}"`/`"delete {name}"`; save/cancel/create keep their text names.

- [ ] **Step 1: HighlightsSidebar — delete icon (icon-only)**

In `<script>` add:
```svelte
  import { Trash2 } from "@lucide/svelte";
```
Replace the `.del` button (keep its `aria-label="delete"`; drop visible text):
```svelte
        <button class="del" aria-label="delete" onclick={() => ondelete(h.id)}><Trash2 class="icon-sm" aria-hidden="true" /></button>
```
In `<style>` add centering to `.del`:
```css
  .del { display: inline-flex; align-items: center; background: none; border: none; color: var(--color-text-muted); cursor: pointer; font-size: var(--text-xs); }
```

- [ ] **Step 2: HighlightPopover — cancel icon (icon-only)**

In `<script>` add:
```svelte
  import { X } from "@lucide/svelte";
```
Replace the cancel button (currently shows the `×` glyph; keep `aria-label="cancel"`):
```svelte
    <button class="cancel" onclick={oncancel} aria-label="cancel"><X class="icon-sm" aria-hidden="true" /></button>
```
The popover is portaled, so its `.cancel` style is `:global`. Add centering to the existing `:global(.hl-popover) .cancel` rule:
```css
  :global(.hl-popover) .cancel {
    display: inline-flex; align-items: center;
    background: none; border: none; cursor: pointer; color: var(--color-text-muted);
  }
```

- [ ] **Step 3: Library collections-rail — rename/delete (icon-only), save/cancel/create (icon + text)**

In `<script>` imports add:
```svelte
  import { Pencil, Trash2, Check, X, Plus } from "@lucide/svelte";
```
Rename form save/cancel (icon + text):
```svelte
              <button type="submit" class="action-btn"><Check class="icon-sm" aria-hidden="true" /> save</button>
              <button type="button" class="action-btn" onclick={() => (renameTarget = null)}><X class="icon-sm" aria-hidden="true" /> cancel</button>
```
Rename/delete actions (icon-only; keep the dynamic `aria-label`s):
```svelte
            <button class="action-btn" onclick={() => startRename(col.id, col.name)} aria-label="rename {col.name}"><Pencil class="icon-sm" aria-hidden="true" /></button>
            <button class="action-btn danger" onclick={() => deleteCollection(col.id)} aria-label="delete {col.name}"><Trash2 class="icon-sm" aria-hidden="true" /></button>
```
Create button (icon + text):
```svelte
    <button type="submit" class="action-btn"><Plus class="icon-sm" aria-hidden="true" /> create</button>
```
In `<style>` give `.action-btn` inline-flex alignment (add to the existing rule, preserving its other declarations):
```css
  .action-btn { display: inline-flex; align-items: center; gap: var(--space-1); /* …keep existing declarations… */ }
```

- [ ] **Step 4: Full suite + typecheck**

Run: `pnpm vitest run` then `pnpm check`.
Expected: PASS — highlight delete (`name: "delete"`), popover cancel (`name: "cancel"`), and library rail rename/delete/save/cancel/create queries all still resolve; no new type errors.

- [ ] **Step 5: Verify in the running app**

In the reader, the highlights rail delete is an icon-only trash; selecting text → the popover cancel is an icon-only ×→X. On the library page collections rail: rename = pencil (icon-only), delete = trash (icon-only), and the rename form's save/cancel + the create button show check/x/plus + text. Confirm rename and delete still work and `aria-label`s read the collection name. Check all themes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/HighlightsSidebar.svelte apps/web/src/lib/components/HighlightPopover.svelte apps/web/src/routes/library/+page.svelte
git commit -m "feat(web): add icons to highlights rail, highlight popover, and collections rail"
```

---

## Final verification

- [ ] Full web suite green: `cd apps/web && pnpm vitest run` (every accessible-name regression query resolves; the new ReaderControls stepper test passes).
- [ ] Typecheck clean: `cd apps/web && pnpm check`.
- [ ] Grep guard — no hardcoded icon sizing in components (sizing must come from the `.icon-*` class, not inline props): `grep -rn "size={\|strokeWidth\|stroke-width=" apps/web/src/lib apps/web/src/routes` should have no new hits on lucide usage.
- [ ] Run-app pass across light/dark/sepia: every §6 surface shows its icon; icon+text controls align; TopBar theme pill collapses to icon-only at ≤640px with `aria-pressed` intact; no layout regression vs the pre-icon chrome.

## Self-Review notes

- **Spec coverage:** dep+tokens+utilities+Button (Task 1) ↔ spec §3/§4; TopBar incl. mobile label-hide (Task 2) ↔ §6 rows 1–4 + §4 mobile note; ArticleCard+CaptureBar (Task 3) ↔ §6 rows 5–6; ReaderControls+reader+collections (Task 4) ↔ §6 rows 7–11 + §5 stepper labels; HighlightsSidebar+Popover+rail (Task 5) ↔ §6 rows 12–14. Non-goals respected: no chip icons, no ConfirmDialog icon, no motion/status-color.
- **Accessible-name preservation:** every icon-only control keeps an existing `aria-label` (card/reader/highlight delete, popover cancel, rail rename/delete) or gains an `.sr-only` text label (size steppers). No `getByRole({ name })` query breaks.
- **Deliberate interpretations to flag in review:** (1) icon-only `Button`s use an `.sr-only` child span rather than a new `aria-label` prop, honoring spec §4 "no Button API change" while satisfying §5; (2) TopBar mobile theme labels are hidden with the visually-hidden clip, not `display:none`, so the accessible name survives at ≤640px; (3) `@lucide/svelte` (not the brief's older `lucide-svelte`) is a deliberate new dependency.
- **Type consistency:** `.icon-sm/md/lg` and `.sr-only` class names are identical across all tasks; lucide icons are always used as `<Icon class="icon-*" aria-hidden="true" />` with no size/stroke/color props.
