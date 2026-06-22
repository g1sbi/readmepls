# Landing Site (`apps/site`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small, fully-prerendered SvelteKit landing page (`apps/site`) for `readmepls.com`, styled from the brand banner, with Hero / How it works / Features / Footer sections.

**Architecture:** A new pnpm-workspace app `apps/site` using SvelteKit + `@sveltejs/adapter-static`. The whole site prerenders to static HTML. Outward-facing constants (app URL, GitHub URL, copy) live in one config module (`src/lib/site.ts`). Four presentational components compose a single page. Component tests run offline with `@testing-library/svelte` + jsdom.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), Vite 5, `@sveltejs/adapter-static`, `@fontsource-variable/fredoka`, Vitest, `@testing-library/svelte`, jsdom.

## Global Constraints

- TypeScript strict (inherited from `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`). No `any` without a written reason.
- TDD: write the failing test first, run it red, then implement. No production code without a driving test.
- Svelte 5 runes syntax: props via `let { ... } = $props()`, children via `{@render children()}`.
- Conventional Commits, one logical change per commit. Never push, never open a PR.
- Tests are offline and deterministic — no network.
- Small, single-purpose files.
- Brand tokens (verbatim from spec): ink `#211E17`, accent `#C24A38`, muted `#6E6453`, faint `#AC9F86`, surfaces `#F7F3EA` / `#F1ECDF` / `#EAE3D2`, fold `#E4DCC8`. Background gradient: `radial-gradient(120% 140% at 18% 12%, #F7F3EA 0%, #F1ECDF 55%, #EAE3D2 100%)`.
- App URL constant: `https://app.readmepls.com`. Tagline: `save any link. actually read it. pls.`
- Tests live next to source as `*.test.ts`. The app's `vitest.config.ts` includes `src/**/*.test.ts`.

---

## File Structure

```
apps/site/
  package.json              # workspace app + deps
  svelte.config.js          # adapter-static
  vite.config.ts            # sveltekit() for dev/build
  vitest.config.ts          # svelte() + svelteTesting() + jsdom + $lib alias
  tsconfig.json             # extends ../../tsconfig.base.json
  src/
    app.html                # SvelteKit shell + <title>/meta
    app.css                 # tokens, background gradient, paper grain, base type
    routes/
      +layout.ts            # export const prerender = true
      +layout.svelte        # imports font + app.css, renders children
      +page.svelte          # composes the four sections
      page.test.ts          # all four sections mount
    lib/
      site.ts               # APP_URL, GITHUB_URL, TAGLINE, STEPS, FEATURES
      site.test.ts          # config constants
      components/
        Hero.svelte         + Hero.test.ts
        HowItWorks.svelte   + HowItWorks.test.ts
        Features.svelte     + Features.test.ts
        Footer.svelte       + Footer.test.ts
  static/
    hero.png                # copied from assets/
    favicon.png             # copied from assets/
```

---

## Task 1: Scaffold app + config seam (`lib/site.ts`)

**Files:**
- Create: `apps/site/package.json`, `apps/site/svelte.config.js`, `apps/site/vite.config.ts`, `apps/site/vitest.config.ts`, `apps/site/tsconfig.json`
- Create: `apps/site/src/app.html`, `apps/site/src/app.css`
- Create: `apps/site/src/routes/+layout.ts`, `apps/site/src/routes/+layout.svelte`, `apps/site/src/routes/+page.svelte` (placeholder)
- Create: `apps/site/src/lib/site.ts`
- Create: `apps/site/static/hero.png`, `apps/site/static/favicon.png` (copied)
- Test: `apps/site/src/lib/site.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: module `$lib/site` exporting `APP_URL: string` (`"https://app.readmepls.com"`), `GITHUB_URL: string`, `TAGLINE: string`, `STEPS: readonly { n: string; title: string; body: string }[]`, `FEATURES: readonly { title: string; body: string }[]`.

- [ ] **Step 1: Create the scaffolding files**

`apps/site/package.json`:

```json
{
  "name": "@readmepls/site",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@fontsource-variable/fredoka": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/adapter-static": "^3.0.0",
    "@sveltejs/kit": "^2.5.0",
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "@testing-library/svelte": "^5.2.0",
    "jsdom": "^25.0.0",
    "svelte": "^5.0.0",
    "vite": "^5.4.0"
  }
}
```

`apps/site/svelte.config.js`:

```js
import adapter from "@sveltejs/adapter-static";
export default { kit: { adapter: adapter() } };
```

`apps/site/vite.config.ts`:

```ts
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [sveltekit()] });
```

`apps/site/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
```

`apps/site/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`apps/site/src/app.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>readmepls — save any link. actually read it. pls.</title>
    <meta
      name="description"
      content="Reader-first bookmark + article app. Paste a link, read it clean, highlight, auto-tag with AI. Open source, self-hostable."
    />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

`apps/site/src/app.css`:

```css
:root {
  --ink: #211e17;
  --accent: #c24a38;
  --muted: #6e6453;
  --faint: #ac9f86;
  --surface-0: #f7f3ea;
  --surface-1: #f1ecdf;
  --surface-2: #eae3d2;
  --fold: #e4dcc8;
  --font: "Fredoka Variable", system-ui, sans-serif;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  position: relative;
  min-height: 100dvh;
  font-family: var(--font);
  color: var(--ink);
  background: radial-gradient(
    120% 140% at 18% 12%,
    var(--surface-0) 0%,
    var(--surface-1) 55%,
    var(--surface-2) 100%
  );
  background-attachment: fixed;
}

/* faint paper grain, lifted from the brand banner */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/></svg>");
  opacity: 0.04;
  mix-blend-mode: multiply;
  z-index: 0;
}

a {
  color: inherit;
}
```

`apps/site/src/routes/+layout.ts`:

```ts
export const prerender = true;
```

`apps/site/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import "@fontsource-variable/fredoka";
  import "../app.css";

  let { children } = $props();
</script>

{@render children()}
```

`apps/site/src/routes/+page.svelte` (placeholder, replaced in Task 6):

```svelte
<main></main>
```

- [ ] **Step 2: Copy brand images into static/**

Run from repo root:

```bash
cp assets/hero.png apps/site/static/hero.png
cp assets/hero.png apps/site/static/favicon.png
```

Expected: both files exist under `apps/site/static/`.

- [ ] **Step 3: Install dependencies**

Run from repo root:

```bash
pnpm install
```

Expected: install succeeds; `@readmepls/site` linked into the workspace.

- [ ] **Step 4: Write the failing test for the config module**

`apps/site/src/lib/site.test.ts`:

```ts
import { expect, test } from "vitest";
import { APP_URL, GITHUB_URL, TAGLINE, STEPS, FEATURES } from "$lib/site";

test("APP_URL points at the app subdomain", () => {
  expect(APP_URL).toBe("https://app.readmepls.com");
});

test("GITHUB_URL is an absolute https url", () => {
  expect(GITHUB_URL.startsWith("https://github.com/")).toBe(true);
});

test("tagline matches the brand line", () => {
  expect(TAGLINE).toBe("save any link. actually read it. pls.");
});

test("there are exactly three how-it-works steps", () => {
  expect(STEPS).toHaveLength(3);
  expect(STEPS[0]?.title.length).toBeGreaterThan(0);
});

test("there is at least one feature, each with title and body", () => {
  expect(FEATURES.length).toBeGreaterThan(0);
  for (const f of FEATURES) {
    expect(f.title.length).toBeGreaterThan(0);
    expect(f.body.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run from repo root:

```bash
pnpm --filter @readmepls/site exec vitest run src/lib/site.test.ts
```

Expected: FAIL — cannot resolve `$lib/site` (module not created yet).

- [ ] **Step 6: Implement the config module**

`apps/site/src/lib/site.ts`:

```ts
// Single source of truth for outward-facing links and marketing copy.
// Change GITHUB_URL here if the repo slug differs.
export const APP_URL = "https://app.readmepls.com";
export const GITHUB_URL = "https://github.com/readmepls/readmepls";
export const TAGLINE = "save any link. actually read it. pls.";

export type Step = { n: string; title: string; body: string };
export type Feature = { title: string; body: string };

export const STEPS: readonly Step[] = [
  { n: "1", title: "Paste a link", body: "Drop any article, thread, or video URL." },
  { n: "2", title: "Extract & auto-tag", body: "We pull the readable content and tag it with AI." },
  { n: "3", title: "Read with highlights", body: "A clean reader with highlights, notes, and search." },
];

export const FEATURES: readonly Feature[] = [
  { title: "Reader view", body: "Distraction-free typography, tuned your way." },
  { title: "Highlights & notes", body: "Mark up anything; it stays anchored to the text." },
  { title: "AI auto-tags", body: "Every save organized without lifting a finger." },
  { title: "Search & collections", body: "Find and group everything, fast." },
];
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
pnpm --filter @readmepls/site exec vitest run src/lib/site.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/site pnpm-lock.yaml
git commit -m "feat(site): scaffold landing app and config seam"
```

---

## Task 2: Hero component

**Files:**
- Create: `apps/site/src/lib/components/Hero.svelte`
- Test: `apps/site/src/lib/components/Hero.test.ts`

**Interfaces:**
- Consumes: `APP_URL`, `GITHUB_URL`, `TAGLINE` from `$lib/site`.
- Produces: default-exported Svelte component `Hero` (no props). Renders the tagline text, an `Open app` link (`href={APP_URL}`), and a `GitHub` link (`href={GITHUB_URL}`).

- [ ] **Step 1: Write the failing test**

`apps/site/src/lib/components/Hero.test.ts`:

```ts
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Hero from "./Hero.svelte";
import { APP_URL, GITHUB_URL, TAGLINE } from "$lib/site";

test("hero renders the tagline", () => {
  render(Hero);
  expect(screen.getByText(TAGLINE)).toBeTruthy();
});

test("Open app CTA links to the app subdomain", () => {
  render(Hero);
  const cta = screen.getByRole("link", { name: "Open app" });
  expect(cta.getAttribute("href")).toBe(APP_URL);
});

test("GitHub link is present", () => {
  render(Hero);
  const gh = screen.getByRole("link", { name: "GitHub" });
  expect(gh.getAttribute("href")).toBe(GITHUB_URL);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @readmepls/site exec vitest run src/lib/components/Hero.test.ts
```

Expected: FAIL — `./Hero.svelte` does not exist.

- [ ] **Step 3: Implement the component**

`apps/site/src/lib/components/Hero.svelte`:

```svelte
<script lang="ts">
  import { APP_URL, GITHUB_URL, TAGLINE } from "$lib/site";
</script>

<section class="hero">
  <div class="fold" aria-hidden="true"></div>
  <img class="logo" src="/hero.png" alt="readmepls logo" width="160" height="160" />
  <h1 class="wordmark">readme<span class="pls">pls</span></h1>
  <p class="tagline">{TAGLINE}</p>
  <div class="cta">
    <a class="btn primary" href={APP_URL}>Open app</a>
    <a class="btn ghost" href={GITHUB_URL}>GitHub</a>
  </div>
</section>

<style>
  .hero {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 1.25rem;
    padding: clamp(4rem, 12vh, 9rem) 1.5rem 3rem;
  }
  .fold {
    position: absolute;
    top: -1rem;
    right: -1rem;
    width: 140px;
    height: 140px;
    background: linear-gradient(135deg, var(--fold) 0%, var(--fold) 50%, transparent 50%);
    opacity: 0.55;
    border-bottom-left-radius: 28px;
  }
  .logo {
    border-radius: 32px;
    transform: rotate(-4deg);
    filter: drop-shadow(0 18px 28px rgba(54, 44, 22, 0.28));
  }
  .wordmark {
    font-weight: 600;
    font-size: clamp(3.5rem, 12vw, 7rem);
    line-height: 0.9;
    letter-spacing: -0.04em;
  }
  .pls {
    color: var(--accent);
  }
  .tagline {
    font-weight: 500;
    font-size: clamp(1.1rem, 3.5vw, 1.6rem);
    color: var(--muted);
  }
  .cta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
    margin-top: 0.5rem;
  }
  .btn {
    text-decoration: none;
    font-weight: 600;
    font-size: 1.05rem;
    padding: 0.7rem 1.5rem;
    border-radius: 999px;
    transition: transform 0.12s ease;
  }
  .btn:hover {
    transform: translateY(-2px);
  }
  .btn.primary {
    background: var(--accent);
    color: var(--surface-0);
    box-shadow: 0 10px 20px rgba(194, 74, 56, 0.28);
  }
  .btn.ghost {
    color: var(--ink);
    border: 2px solid var(--fold);
  }
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @readmepls/site exec vitest run src/lib/components/Hero.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/lib/components/Hero.svelte apps/site/src/lib/components/Hero.test.ts
git commit -m "feat(site): add hero section"
```

---

## Task 3: How-it-works component

**Files:**
- Create: `apps/site/src/lib/components/HowItWorks.svelte`
- Test: `apps/site/src/lib/components/HowItWorks.test.ts`

**Interfaces:**
- Consumes: `STEPS` from `$lib/site`.
- Produces: default-exported component `HowItWorks` (no props). Renders a heading with the exact text `How it works` and one block per `STEPS` entry showing its `n` and `title`.

- [ ] **Step 1: Write the failing test**

`apps/site/src/lib/components/HowItWorks.test.ts`:

```ts
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import HowItWorks from "./HowItWorks.svelte";
import { STEPS } from "$lib/site";

test("renders the section heading", () => {
  render(HowItWorks);
  expect(screen.getByText("How it works")).toBeTruthy();
});

test("renders every step title", () => {
  render(HowItWorks);
  for (const step of STEPS) {
    expect(screen.getByText(step.title)).toBeTruthy();
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @readmepls/site exec vitest run src/lib/components/HowItWorks.test.ts
```

Expected: FAIL — `./HowItWorks.svelte` does not exist.

- [ ] **Step 3: Implement the component**

`apps/site/src/lib/components/HowItWorks.svelte`:

```svelte
<script lang="ts">
  import { STEPS } from "$lib/site";
</script>

<section class="how">
  <h2>How it works</h2>
  <ol class="steps">
    {#each STEPS as step (step.n)}
      <li class="step">
        <span class="num">{step.n}</span>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
      </li>
    {/each}
  </ol>
</section>

<style>
  .how {
    position: relative;
    z-index: 1;
    max-width: 980px;
    margin: 0 auto;
    padding: 3rem 1.5rem;
    text-align: center;
  }
  h2 {
    font-weight: 600;
    font-size: clamp(1.8rem, 5vw, 2.5rem);
    letter-spacing: -0.02em;
    margin-bottom: 2rem;
  }
  .steps {
    list-style: none;
    display: grid;
    gap: 1.5rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .num {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--surface-0);
    font-weight: 600;
    font-size: 1.25rem;
  }
  h3 {
    font-weight: 600;
    font-size: 1.2rem;
  }
  p {
    color: var(--muted);
    max-width: 26ch;
  }
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @readmepls/site exec vitest run src/lib/components/HowItWorks.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/lib/components/HowItWorks.svelte apps/site/src/lib/components/HowItWorks.test.ts
git commit -m "feat(site): add how-it-works section"
```

---

## Task 4: Features component

**Files:**
- Create: `apps/site/src/lib/components/Features.svelte`
- Test: `apps/site/src/lib/components/Features.test.ts`

**Interfaces:**
- Consumes: `FEATURES` from `$lib/site`.
- Produces: default-exported component `Features` (no props). Renders a heading with the exact text `What you get` and one card per `FEATURES` entry showing its `title`.

- [ ] **Step 1: Write the failing test**

`apps/site/src/lib/components/Features.test.ts`:

```ts
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Features from "./Features.svelte";
import { FEATURES } from "$lib/site";

test("renders the section heading", () => {
  render(Features);
  expect(screen.getByText("What you get")).toBeTruthy();
});

test("renders every feature title", () => {
  render(Features);
  for (const feature of FEATURES) {
    expect(screen.getByText(feature.title)).toBeTruthy();
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @readmepls/site exec vitest run src/lib/components/Features.test.ts
```

Expected: FAIL — `./Features.svelte` does not exist.

- [ ] **Step 3: Implement the component**

`apps/site/src/lib/components/Features.svelte`:

```svelte
<script lang="ts">
  import { FEATURES } from "$lib/site";
</script>

<section class="features">
  <h2>What you get</h2>
  <div class="grid">
    {#each FEATURES as feature (feature.title)}
      <article class="card">
        <h3>{feature.title}</h3>
        <p>{feature.body}</p>
      </article>
    {/each}
  </div>
</section>

<style>
  .features {
    position: relative;
    z-index: 1;
    max-width: 980px;
    margin: 0 auto;
    padding: 3rem 1.5rem;
    text-align: center;
  }
  h2 {
    font-weight: 600;
    font-size: clamp(1.8rem, 5vw, 2.5rem);
    letter-spacing: -0.02em;
    margin-bottom: 2rem;
  }
  .grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
  .card {
    text-align: left;
    padding: 1.5rem;
    border-radius: 20px;
    background: var(--surface-0);
    border: 1px solid var(--fold);
    box-shadow: 0 8px 18px rgba(54, 44, 22, 0.08);
  }
  h3 {
    font-weight: 600;
    font-size: 1.2rem;
    margin-bottom: 0.4rem;
  }
  p {
    color: var(--muted);
  }
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @readmepls/site exec vitest run src/lib/components/Features.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/lib/components/Features.svelte apps/site/src/lib/components/Features.test.ts
git commit -m "feat(site): add features section"
```

---

## Task 5: Footer component

**Files:**
- Create: `apps/site/src/lib/components/Footer.svelte`
- Test: `apps/site/src/lib/components/Footer.test.ts`

**Interfaces:**
- Consumes: `GITHUB_URL` from `$lib/site`.
- Produces: default-exported component `Footer` (no props). Renders a `GitHub` link (`href={GITHUB_URL}`) and the text `open source · self-hostable`.

- [ ] **Step 1: Write the failing test**

`apps/site/src/lib/components/Footer.test.ts`:

```ts
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Footer from "./Footer.svelte";
import { GITHUB_URL } from "$lib/site";

test("renders the GitHub link", () => {
  render(Footer);
  const gh = screen.getByRole("link", { name: "GitHub" });
  expect(gh.getAttribute("href")).toBe(GITHUB_URL);
});

test("renders the open-source line from the banner", () => {
  render(Footer);
  expect(screen.getByText(/open source · self-hostable/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @readmepls/site exec vitest run src/lib/components/Footer.test.ts
```

Expected: FAIL — `./Footer.svelte` does not exist.

- [ ] **Step 3: Implement the component**

`apps/site/src/lib/components/Footer.svelte`:

```svelte
<script lang="ts">
  import { GITHUB_URL } from "$lib/site";
</script>

<footer class="footer">
  <nav class="links">
    <a href={GITHUB_URL}>GitHub</a>
    <a href={GITHUB_URL}>Self-host</a>
    <a href="/docs">Docs</a>
  </nav>
  <p class="meta">open source · self-hostable</p>
</footer>

<style>
  .footer {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 3rem 1.5rem 4rem;
    text-align: center;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    justify-content: center;
  }
  .links a {
    text-decoration: none;
    font-weight: 600;
    color: var(--ink);
  }
  .links a:hover {
    color: var(--accent);
  }
  .meta {
    font-weight: 600;
    font-size: 0.85rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--faint);
  }
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @readmepls/site exec vitest run src/lib/components/Footer.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/lib/components/Footer.svelte apps/site/src/lib/components/Footer.test.ts
git commit -m "feat(site): add footer section"
```

---

## Task 6: Compose the page + verify static build

**Files:**
- Modify: `apps/site/src/routes/+page.svelte` (replace the placeholder)
- Test: `apps/site/src/routes/page.test.ts`

**Interfaces:**
- Consumes: `Hero`, `HowItWorks`, `Features`, `Footer` from `$lib/components/*`; `TAGLINE` from `$lib/site` (test only).
- Produces: the landing page. Mounts all four sections in order.

- [ ] **Step 1: Write the failing test**

`apps/site/src/routes/page.test.ts`:

```ts
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Page from "./+page.svelte";
import { TAGLINE } from "$lib/site";

test("landing page mounts all four sections", () => {
  render(Page);
  expect(screen.getByText(TAGLINE)).toBeTruthy(); // Hero
  expect(screen.getByText("How it works")).toBeTruthy(); // HowItWorks
  expect(screen.getByText("What you get")).toBeTruthy(); // Features
  expect(screen.getByText(/open source · self-hostable/i)).toBeTruthy(); // Footer
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @readmepls/site exec vitest run src/routes/page.test.ts
```

Expected: FAIL — placeholder page renders none of the section text.

- [ ] **Step 3: Implement the page**

`apps/site/src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import Hero from "$lib/components/Hero.svelte";
  import HowItWorks from "$lib/components/HowItWorks.svelte";
  import Features from "$lib/components/Features.svelte";
  import Footer from "$lib/components/Footer.svelte";
</script>

<main>
  <Hero />
  <HowItWorks />
  <Features />
  <Footer />
</main>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @readmepls/site exec vitest run src/routes/page.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 5: Run the full app test suite**

```bash
pnpm --filter @readmepls/site exec vitest run
```

Expected: PASS — all tests across `site.test.ts`, the four component tests, and `page.test.ts` (15 tests total).

- [ ] **Step 6: Verify the static build prerenders**

```bash
pnpm --filter @readmepls/site build
```

Expected: build succeeds and writes prerendered output (a `build/` directory containing `index.html`). Confirm `apps/site/build/index.html` exists.

- [ ] **Step 7: Commit**

```bash
git add apps/site/src/routes/+page.svelte apps/site/src/routes/page.test.ts
git commit -m "feat(site): compose landing page from sections"
```

---

## Self-Review

**Spec coverage:**
- New `apps/site` SvelteKit app, prerendered → Task 1 (configs, `prerender = true`), verified Task 6 Step 6.
- Four sections (Hero, How it works, Features, Footer) → Tasks 2–5, composed Task 6.
- Visual language from banner (gradient, grain, fold, Fredoka, terracotta, hero.png) → Task 1 (`app.css`, font import, image copy), Task 2 (`.fold`, tilted logo, accent).
- Cross-domain CTA to `https://app.readmepls.com` + GitHub → `lib/site.ts` (Task 1), asserted in Tasks 2 & 6.
- Config seam `lib/site.ts` → Task 1.
- Offline TDD tests → every task writes the test first; all use jsdom, no network.
- Docs/changelog/payments/web-app changes → out of scope, no tasks (correct).

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step contains complete code. `+page.svelte` placeholder in Task 1 is intentional and explicitly replaced in Task 6.

**Type consistency:** `APP_URL`, `GITHUB_URL`, `TAGLINE`, `STEPS` (`{ n, title, body }`), `FEATURES` (`{ title, body }`) defined in Task 1 and consumed with matching names/shapes in Tasks 2–6. Component names (`Hero`, `HowItWorks`, `Features`, `Footer`) consistent between definition and import in Task 6. Heading strings (`How it works`, `What you get`, `open source · self-hostable`) used identically in components and their tests.

**Note for implementer:** `GITHUB_URL` defaults to `https://github.com/readmepls/readmepls`; adjust the single constant in `lib/site.ts` if the real repo slug differs.
