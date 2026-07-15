# Landing Page Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the `apps/site` landing page with a slot-machine tagline reel and rework "How it works" / "What you get" so AI reads as an optional Pro coming-soon extension, not the free core.

**Architecture:** All marketing copy and data live in `apps/site/src/lib/site.ts`; the section components are data-driven, so most copy changes are pure data edits with no component change. Two component changes: the `Hero` gains a CSS-only slot-machine reel, and a new `ComingSoon` component renders the Pro strip. No new dependencies.

**Tech Stack:** SvelteKit (Svelte 5 runes), Vitest + `@testing-library/svelte` (jsdom), plain CSS.

## Global Constraints

- Scope is `apps/site` only. Do **not** touch `apps/web` (the reader app).
- No new dependencies — CSS + existing Svelte/Vitest only.
- Test runner: `pnpm exec vitest run <path>` from the repo root. `pnpm --filter` does NOT run tests here (single vitest workspace).
- GitHub slug is exactly `https://github.com/g1sbi/readmepls`.
- Reel words, in order: `link`, `article`, `video`, `thread`, `newsletter`.
- The reel is accent-colored (`--accent`), animated purely in CSS, and freezes on the first word under `prefers-reduced-motion` (already handled by the global rule in `app.css` — no per-component media query).
- Conventional Commits, one logical change per commit.

---

### Task 1: Rewrite marketing copy & data in `site.ts`

Section components (`HowItWorks`, `Features`) iterate over `STEPS`/`FEATURES`, so rewriting the data updates them with no component edit. The old `Hero.svelte` keeps rendering `{TAGLINE}` (now line 2 only) and stays green until Task 2 rebuilds it.

**Files:**
- Modify: `apps/site/src/lib/site.ts`
- Test: `apps/site/src/lib/site.test.ts`

**Interfaces:**
- Consumes: `$env/dynamic/public` (unchanged).
- Produces:
  - `APP_URL: string` (unchanged), `GITHUB_URL: string`, `TAGLINE: string`
  - `REEL_WORDS: readonly string[]` (length 5)
  - `type Step = { n: string; title: string; body: string }`; `STEPS: readonly Step[]` (length 3)
  - `type Feature = { title: string; body: string }`; `FEATURES: readonly Feature[]` (length 4)
  - `type ProStrip = { badge: string; body: string }`; `PRO_STRIP: ProStrip`

- [ ] **Step 1: Update the tests first**

Replace the tagline test and strengthen the GitHub test in `apps/site/src/lib/site.test.ts`. Change the existing `tagline matches the brand line` test body to:

```ts
test("tagline is the hero's second line", async () => {
  const { TAGLINE } = await import("$lib/site");
  expect(TAGLINE).toBe("actually read it. pls.");
});
```

Change the existing `GITHUB_URL is an absolute https url` test body to:

```ts
test("GITHUB_URL points at the g1sbi repo", async () => {
  const { GITHUB_URL } = await import("$lib/site");
  expect(GITHUB_URL).toBe("https://github.com/g1sbi/readmepls");
});
```

Then append these new tests to the end of the file:

```ts
test("reel has the five ordered content-type words", async () => {
  const { REEL_WORDS } = await import("$lib/site");
  expect([...REEL_WORDS]).toEqual([
    "link",
    "article",
    "video",
    "thread",
    "newsletter",
  ]);
});

test("there are four features and none is the AI card", async () => {
  const { FEATURES } = await import("$lib/site");
  expect(FEATURES).toHaveLength(4);
  const titles = FEATURES.map((f) => f.title.toLowerCase());
  expect(titles.some((t) => t.includes("ai"))).toBe(false);
});

test("pro strip has a badge and AI body copy", async () => {
  const { PRO_STRIP } = await import("$lib/site");
  expect(PRO_STRIP.badge).toBe("Coming soon · Pro");
  expect(PRO_STRIP.body).toContain("AI auto-tags");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run apps/site/src/lib/site.test.ts`
Expected: FAIL — `TAGLINE` still equals the old brand line; `REEL_WORDS`/`PRO_STRIP` are `undefined`.

- [ ] **Step 3: Rewrite `site.ts`**

Replace the entire contents of `apps/site/src/lib/site.ts` with:

```ts
import { env } from "$env/dynamic/public";

// Single source of truth for outward-facing links and marketing copy.
// APP_URL is the absolute origin of the reader app (a relative link can't cross
// origins). Operators set PUBLIC_APP_URL; the Docker build bakes the sentinel
// __APP_URL__, which the container entrypoint rewrites to $APP_URL at start.
// Fallback covers local `vite dev` with no env set (web's default dev port).
export const APP_URL = env.PUBLIC_APP_URL || "http://localhost:3000";

export const GITHUB_URL = "https://github.com/g1sbi/readmepls";

// Hero line 2. The reel (Hero.svelte) renders line 1: "save any <reel>".
export const TAGLINE = "actually read it. pls.";

// Slot-machine reel words shown after "save any", in display order.
// NOTE: the `reel` keyframes in Hero.svelte are hand-tuned to this exact count
// (5 words). If you add or remove a word, update those keyframes too.
export const REEL_WORDS: readonly string[] = [
  "link",
  "article",
  "video",
  "thread",
  "newsletter",
];

export type Step = { n: string; title: string; body: string };
export type Feature = { title: string; body: string };
export type ProStrip = { badge: string; body: string };

export const STEPS: readonly Step[] = [
  { n: "1", title: "Paste a link", body: "Any article, video, or thread." },
  {
    n: "2",
    title: "We extract the content and store it in readable form",
    body: "Blog post, article, YouTube video — you name it.",
  },
  {
    n: "3",
    title: "Read, highlight, organize",
    body: "A calm reader with highlights, notes, search, and collections.",
  },
];

export const FEATURES: readonly Feature[] = [
  {
    title: "A reader you'll actually use",
    body: "Distraction-free typography, tuned your way.",
  },
  {
    title: "Highlights & notes",
    body: "Mark up anything; it stays anchored to the text.",
  },
  { title: "Search & collections", body: "Find and group everything, fast." },
  {
    title: "Yours to host",
    body: "Open source and self-hostable. No lock-in.",
  },
];

// The "coming soon" band below the free core. AI is a Pro extension — never
// part of the free experience.
export const PRO_STRIP: ProStrip = {
  badge: "Coming soon · Pro",
  body: "AI auto-tags, summaries, reading recommendations and more. Built on top of the reader you already have — it never gets in the way of it.",
};
```

- [ ] **Step 4: Run the affected tests to verify they pass**

Run: `pnpm exec vitest run apps/site/src/lib/site.test.ts apps/site/src/lib/components/HowItWorks.test.ts apps/site/src/lib/components/Features.test.ts apps/site/src/routes/page.test.ts apps/site/src/lib/components/Hero.test.ts`
Expected: PASS. (`HowItWorks`/`Features` iterate the new data; `Hero`/`page` still read `TAGLINE` from the old `Hero.svelte` line — green.)

- [ ] **Step 5: Commit**

```bash
git add apps/site/src/lib/site.ts apps/site/src/lib/site.test.ts
git commit -m "feat(site): rework landing copy — de-AI core flow, add reel words + Pro strip data"
```

---

### Task 2: Hero slot-machine reel

Rebuild the hero tagline as an accent-colored CSS reel: line 1 is `save any <reel>`; line 2 is `TAGLINE`. Screen readers get one clean sentence via an `.sr-only` span; the animated column is `aria-hidden`. Reduced motion is covered by the existing global rule in `app.css` (which zeroes animation duration and iteration count), so the column settles on the first slot (`link`) with no extra CSS.

**Files:**
- Modify: `apps/site/src/app.css` (add `.sr-only` utility)
- Modify: `apps/site/src/lib/components/Hero.svelte`
- Test: `apps/site/src/lib/components/Hero.test.ts`

**Interfaces:**
- Consumes: `APP_URL`, `GITHUB_URL`, `TAGLINE`, `REEL_WORDS` from `$lib/site`.
- Produces: Hero markup with `.reel` (has `aria-hidden="true"`), `.reel-col`, `.reel-word` spans, `.reel-lead` ("save any"), and an `.sr-only` full-phrase span.

- [ ] **Step 1: Rewrite the Hero test**

Replace the entire contents of `apps/site/src/lib/components/Hero.test.ts` with:

```ts
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Hero from "./Hero.svelte";
import { APP_URL, GITHUB_URL, TAGLINE, REEL_WORDS } from "$lib/site";

test("hero renders the second tagline line", () => {
  render(Hero);
  expect(screen.getByText(TAGLINE)).toBeTruthy();
});

test("hero shows the 'save any' lead", () => {
  const { container } = render(Hero);
  expect(container.querySelector(".reel-lead")?.textContent).toMatch(/save any/i);
});

test("reel column carries every reel word", () => {
  const { container } = render(Hero);
  const col = container.querySelector(".reel-col");
  expect(col).not.toBeNull();
  for (const w of REEL_WORDS) {
    expect(col?.textContent).toContain(w);
  }
});

test("reel is hidden from assistive tech", () => {
  const { container } = render(Hero);
  expect(container.querySelector(".reel")?.getAttribute("aria-hidden")).toBe("true");
});

test("hero exposes the full phrase to screen readers", () => {
  const { container } = render(Hero);
  const sr = container.querySelector(".sr-only");
  expect(sr?.textContent).toContain("save any");
  for (const w of REEL_WORDS) {
    expect(sr?.textContent).toContain(w);
  }
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

- [ ] **Step 2: Run the Hero test to verify it fails**

Run: `pnpm exec vitest run apps/site/src/lib/components/Hero.test.ts`
Expected: FAIL — no `.reel-lead` / `.reel-col` / `.sr-only` in the current Hero.

- [ ] **Step 3: Add the `.sr-only` utility to `app.css`**

Insert this block into `apps/site/src/app.css` immediately after the `a { color: inherit; }` rule (before the `.reveal` block):

```css
/* Visually hidden but available to screen readers. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 4: Rewrite `Hero.svelte`**

Replace the entire contents of `apps/site/src/lib/components/Hero.svelte` with:

```svelte
<script lang="ts">
  import { APP_URL, GITHUB_URL, TAGLINE, REEL_WORDS } from "$lib/site";

  // Visual reel slots: the first word is duplicated at the top so the downward
  // scroll loops seamlessly; the remaining words are reversed because a higher
  // DOM word enters the downward-moving window later. Order/count is locked to
  // the `reel` keyframes below (5 words).
  const slots = [REEL_WORDS[0], ...[...REEL_WORDS].reverse()];

  // One clean sentence for screen readers, in place of the churning reel.
  const srPhrase = `save any ${REEL_WORDS.slice(0, -1).join(", ")}, or ${REEL_WORDS[REEL_WORDS.length - 1]}`;
</script>

<section class="hero">
  <div class="fold" aria-hidden="true"></div>
  <div class="logo-wrap">
    <img class="logo" src="/hero.png" alt="readmepls" width="160" height="160" />
  </div>
  <h1 class="wordmark">readme<span class="pls">pls</span></h1>
  <p class="tagline reel-line">
    <span class="reel-lead">save any&nbsp;</span><span class="reel" aria-hidden="true"><span class="reel-col">{#each slots as w}<span class="reel-word">{w}</span>{/each}</span></span>
    <span class="sr-only">{srPhrase}</span>
  </p>
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

  /* dog-ear corner peels open on load */
  .fold {
    position: absolute;
    top: -1rem;
    right: -1rem;
    width: 140px;
    height: 140px;
    background: linear-gradient(135deg, var(--fold) 0%, var(--fold) 50%, transparent 50%);
    opacity: 0.55;
    border-bottom-left-radius: 28px;
    transform-origin: top right;
    animation: peel 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
  }

  .logo-wrap {
    animation: drop-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .logo {
    display: block;
    border-radius: 32px;
    transform: rotate(-4deg);
    filter: drop-shadow(0 18px 28px rgba(54, 44, 22, 0.28));
    transition: transform 0.2s ease;
  }
  /* paper flutter on hover */
  .logo-wrap:hover .logo {
    animation: flutter 0.5s ease;
  }

  .wordmark {
    font-weight: 600;
    font-size: clamp(3.5rem, 12vw, 7rem);
    line-height: 0.9;
    letter-spacing: -0.04em;
    animation: rise 0.6s ease 0.15s both;
  }
  .pls {
    color: var(--accent);
  }
  .tagline {
    font-weight: 500;
    font-size: clamp(1.1rem, 3.5vw, 1.6rem);
    color: var(--muted);
    animation: rise 0.6s ease 0.28s both;
  }

  /* Slot-machine reel: a one-line window; the column steps downward, holding on
     each word. ponytail: baseline of an overflow-hidden inline-block can sit a
     hair low — nudge vertical-align if it looks off when running. */
  .reel-line {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: baseline;
  }
  .reel {
    --reel-h: 1.2em;
    display: inline-block;
    height: var(--reel-h);
    line-height: var(--reel-h);
    overflow: hidden;
    vertical-align: bottom;
    text-align: left;
  }
  .reel-col {
    display: flex;
    flex-direction: column;
    animation: reel 11s cubic-bezier(0.7, 0, 0.3, 1) infinite;
  }
  .reel-word {
    height: var(--reel-h);
    color: var(--accent);
    font-weight: 600;
    white-space: nowrap;
  }

  .cta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
    margin-top: 0.5rem;
    animation: rise 0.6s ease 0.4s both;
  }

  .btn {
    text-decoration: none;
    font-weight: 600;
    font-size: 1.05rem;
    padding: 0.7rem 1.5rem;
    border-radius: 999px;
    transition:
      transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 0.18s ease;
  }
  .btn:hover {
    transform: translateY(-3px) scale(1.03);
  }
  .btn:active {
    transform: translateY(-1px) scale(0.98);
  }
  .btn.primary {
    background: var(--accent);
    color: var(--surface-0);
    box-shadow: 0 10px 20px rgba(194, 74, 56, 0.28);
  }
  .btn.primary:hover {
    box-shadow: 0 16px 28px rgba(194, 74, 56, 0.34);
  }
  .btn.ghost {
    color: var(--ink);
    border: 2px solid var(--fold);
  }

  @keyframes reel {
    0%, 14% { transform: translateY(calc(var(--reel-h) * -5)); }
    20%, 34% { transform: translateY(calc(var(--reel-h) * -4)); }
    40%, 54% { transform: translateY(calc(var(--reel-h) * -3)); }
    60%, 74% { transform: translateY(calc(var(--reel-h) * -2)); }
    80%, 94% { transform: translateY(calc(var(--reel-h) * -1)); }
    100% { transform: translateY(0); }
  }
  @keyframes drop-in {
    0% {
      opacity: 0;
      transform: translateY(-30px) scale(0.85);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  @keyframes rise {
    0% {
      opacity: 0;
      transform: translateY(18px);
    }
    100% {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes peel {
    0% {
      opacity: 0;
      transform: scale(0.2) rotate(-35deg);
    }
    100% {
      opacity: 0.55;
      transform: none;
    }
  }
  @keyframes flutter {
    0%,
    100% {
      transform: rotate(-4deg);
    }
    25% {
      transform: rotate(2deg);
    }
    50% {
      transform: rotate(-7deg);
    }
    75% {
      transform: rotate(1deg);
    }
  }
</style>
```

- [ ] **Step 5: Run the Hero test to verify it passes**

Run: `pnpm exec vitest run apps/site/src/lib/components/Hero.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 6: Verify the reel visually**

Run: `pnpm --filter @readmepls/site dev` and open the printed URL. Confirm: "save any" is followed by an accent-colored reel cycling `link → article → video → thread → newsletter` and looping smoothly; "actually read it. pls." sits on the line below; the reel word is vertically aligned with "save any" (nudge `.reel vertical-align` if not). Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add apps/site/src/app.css apps/site/src/lib/components/Hero.svelte apps/site/src/lib/components/Hero.test.ts
git commit -m "feat(site): animate hero tagline as a slot-machine reel"
```

---

### Task 3: "Coming soon · Pro" strip

Add a visually lighter band between `Features` and `Footer` that introduces AI as a Pro coming-soon extension.

**Files:**
- Create: `apps/site/src/lib/components/ComingSoon.svelte`
- Create: `apps/site/src/lib/components/ComingSoon.test.ts`
- Modify: `apps/site/src/routes/+page.svelte`
- Test: `apps/site/src/routes/page.test.ts`

**Interfaces:**
- Consumes: `PRO_STRIP` from `$lib/site`; `reveal` from `$lib/actions/reveal`.
- Produces: `ComingSoon.svelte` rendering `PRO_STRIP.badge` and `PRO_STRIP.body`; mounted in `+page.svelte` between `<Features />` and `<Footer />`.

- [ ] **Step 1: Write the ComingSoon test**

Create `apps/site/src/lib/components/ComingSoon.test.ts`:

```ts
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import ComingSoon from "./ComingSoon.svelte";
import { PRO_STRIP } from "$lib/site";

test("renders the Pro coming-soon badge", () => {
  render(ComingSoon);
  expect(screen.getByText(PRO_STRIP.badge)).toBeTruthy();
});

test("renders the AI extension copy", () => {
  render(ComingSoon);
  expect(screen.getByText(PRO_STRIP.body)).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/site/src/lib/components/ComingSoon.test.ts`
Expected: FAIL — `ComingSoon.svelte` does not exist.

- [ ] **Step 3: Create `ComingSoon.svelte`**

Create `apps/site/src/lib/components/ComingSoon.svelte`:

```svelte
<script lang="ts">
  import { PRO_STRIP } from "$lib/site";
  import { reveal } from "$lib/actions/reveal";
</script>

<section class="pro" use:reveal>
  <span class="badge">{PRO_STRIP.badge}</span>
  <p class="body">{PRO_STRIP.body}</p>
</section>

<style>
  /* Lighter, dashed band so it clearly reads as "not yet / extra", not core. */
  .pro {
    position: relative;
    z-index: 1;
    max-width: 720px;
    margin: 0 auto;
    padding: 2.5rem 1.75rem;
    text-align: center;
    border: 1.5px dashed var(--fold);
    border-radius: 20px;
    background: color-mix(in srgb, var(--surface-1) 55%, transparent);
  }
  .badge {
    display: inline-block;
    font-weight: 600;
    font-size: 0.8rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 0.75rem;
  }
  .body {
    color: var(--muted);
    font-size: 1.05rem;
    line-height: 1.5;
  }
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/site/src/lib/components/ComingSoon.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Update the page composition test**

In `apps/site/src/routes/page.test.ts`, add the `PRO_STRIP` import and a new test. Change the import line to:

```ts
import { TAGLINE, PRO_STRIP } from "$lib/site";
```

Append this test:

```ts
test("landing page shows the coming-soon Pro strip", () => {
  render(Page);
  expect(screen.getByText(PRO_STRIP.badge)).toBeTruthy();
});
```

- [ ] **Step 6: Run the page test to verify the new test fails**

Run: `pnpm exec vitest run apps/site/src/routes/page.test.ts`
Expected: FAIL on the new test — `PRO_STRIP.badge` is not on the page yet (`ComingSoon` not mounted).

- [ ] **Step 7: Mount `ComingSoon` in `+page.svelte`**

Replace the entire contents of `apps/site/src/routes/+page.svelte` with:

```svelte
<script lang="ts">
  import Hero from "$lib/components/Hero.svelte";
  import HowItWorks from "$lib/components/HowItWorks.svelte";
  import Features from "$lib/components/Features.svelte";
  import ComingSoon from "$lib/components/ComingSoon.svelte";
  import Footer from "$lib/components/Footer.svelte";
</script>

<main>
  <Hero />
  <HowItWorks />
  <Features />
  <ComingSoon />
  <Footer />
</main>
```

- [ ] **Step 8: Run the page test to verify it passes**

Run: `pnpm exec vitest run apps/site/src/routes/page.test.ts`
Expected: PASS (all tests, including the Pro strip and the existing sections check).

- [ ] **Step 9: Commit**

```bash
git add apps/site/src/lib/components/ComingSoon.svelte apps/site/src/lib/components/ComingSoon.test.ts apps/site/src/routes/+page.svelte apps/site/src/routes/page.test.ts
git commit -m "feat(site): add coming-soon Pro strip for AI features"
```

---

### Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole site test suite**

Run: `pnpm exec vitest run apps/site`
Expected: PASS — all site tests green.

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. (If `svelte-check` flags an unused `w` in the `{#each}`, it will not — `w` is used; fix any real issue and re-run.)

- [ ] **Step 3: Visual smoke test**

Run: `pnpm --filter @readmepls/site dev`, open the URL, and confirm end to end: reel animates and loops; "How it works" shows the three de-AI'd steps; "What you get" shows four free features with no AI card; the dashed "Coming soon · Pro" strip sits above the footer; Hero + Footer GitHub links point to `github.com/g1sbi/readmepls`. Stop the dev server when done.

- [ ] **Step 4: Confirm reduced-motion freeze (optional but recommended)**

In the browser devtools, emulate `prefers-reduced-motion: reduce` and reload. Expected: the reel is static on `link` (no animation). No code change — this verifies the existing global rule in `app.css` covers the reel.
