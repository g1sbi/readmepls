# Landing page refresh — design

Date: 2026-07-15
Scope: `apps/site` (the standalone marketing site), not the reader app.

## Goal

Sharpen the landing page around what the product actually is: a **free,
self-hostable, reader-first** app. Replace the static "save any link" tagline
with an animated slot-machine reel, and rework "How it works" and "What you
get" so AI reads as an optional **Pro, coming-soon** extension — never part of
the free core.

## Guiding principles (from the product owner)

1. AI features are **Pro only, coming soon** — an extension of the app, never
   something that detracts from the core experience.
2. The core app is **free**. Nothing hidden behind a paywall.
3. The app is **self-hostable**.
4. The **reader experience is the core**.
5. GitHub is `https://github.com/g1sbi/readmepls`.

## 1. Hero — slot-machine reel

The hero tagline's first line becomes an animated reel; the second line stays.

- Line 1: **save any `[reel]`** where `[reel]` cycles, looping:
  `link · article · video · thread · newsletter`
- Line 2 (unchanged): *actually read it. pls.*

### Mechanic

- A one-line-tall window with `overflow: hidden`. The reel words are stacked in
  a column that steps **downward**: each word slides in from the top, **holds**
  (pauses, centered), then slides out the bottom as the next word drops in.
  Reads as a slot-machine reel.
- "save any" is normal ink; the reel words are **accent** (`--accent`,
  terracotta — the primary color).

### Implementation

- Pure CSS keyframes: a stepped `translateY` on the column with hold plateaus
  between slides, plus a duplicated first word appended for a seamless loop.
  No JS, no runtime state — works under SSR and with JS disabled.
  (ponytail: one keyframe block beats a JS ticker.)
- The number of hold/slide steps is derived from the word count; keep the word
  list and the keyframe step math in sync (a comment must call this out).

### Motion & accessibility

- `@media (prefers-reduced-motion: reduce)` freezes the reel on the first word
  (animation disabled), consistent with the existing `reveal` action's
  reduced-motion posture.
- The animated column is `aria-hidden="true"`. A visually-hidden span carries
  the full phrase for screen readers: **"save any link, article, video, thread,
  or newsletter"** — one clean sentence, no reel churn.

## 2. "How it works" — de-AI'd core flow

AI leaves the core flow (it is now a Pro extra). Three steps:

1. **Paste a link** — any article, video, or thread.
2. **We extract the content and store it in readable form** — blog post,
   article, YouTube video, you name it.
3. **Read, highlight, organize** — a calm reader with highlights, notes,
   search, and collections.

Copy lives in `STEPS` in `apps/site/src/lib/site.ts`.

## 3. "What you get" — free core

Section header stays **"What you get"** (no "(free)" label). Four cards,
reader-experience-first:

- **A reader you'll actually use** — distraction-free typography, tuned your way.
- **Highlights & notes** — mark up anything; it stays anchored to the text.
- **Search & collections** — find and group everything, fast.
- **Yours to host** — open source and self-hostable. No lock-in.

Copy lives in `FEATURES` in `apps/site/src/lib/site.ts`. The current AI
auto-tags feature card is removed from this grid (it moves to the Pro strip).

## 4. "Coming soon · Pro" strip

A visually lighter band **between Features and Footer** — not a card in the
features grid, so it clearly reads as "not yet / extra". Styled muted (e.g.
lighter surface / dashed accent) to distinguish it from the free core.

- Eyebrow/badge: **Coming soon · Pro**
- Body: **AI auto-tags, summaries, reading recommendations and more.** Built on
  top of the reader you already have — it never gets in the way of it.

New component `apps/site/src/lib/components/ComingSoon.svelte`, composed into
`+page.svelte` between `<Features />` and `<Footer />`. Copy sourced from
`site.ts` (a `PRO_STRIP` constant) so all marketing copy stays in one file.

## 5. Links

- `GITHUB_URL` in `site.ts` → **`https://github.com/g1sbi/readmepls`**
  (currently `https://github.com/readmepls/readmepls`). This corrects both
  Footer links and the Hero "GitHub" button in one place.

## 6. Testing (TDD)

Update the existing Vitest component tests first (red), then implement:

- `Hero.test.ts` — reel words all present; animated column is `aria-hidden`;
  the sr-only phrase renders; reduced-motion freeze is expressed via a class or
  media query the test can assert against the markup/style.
- `HowItWorks.test.ts` — new step titles/bodies; no "AI"/"auto-tag" in the
  core steps.
- `Features.test.ts` — four new feature titles; the AI auto-tags card is gone.
- New `ComingSoon.test.ts` — renders the "Coming soon · Pro" badge and the AI
  body copy.
- `site.test.ts` — `GITHUB_URL` equals the g1sbi slug; `STEPS`/`FEATURES`/
  `PRO_STRIP` shapes match.
- `page.test.ts` — `ComingSoon` sits between `Features` and `Footer`.

Tests are component/data assertions (jsdom), consistent with the existing site
test setup. The reel is CSS-only, so its motion is not unit-tested beyond
markup/attributes; visual behavior is verified by running the site.

## Out of scope

- The reader app's own home/login taglines (`apps/web`) — unchanged.
- Deploy/hosting config (covered by the separate landing-site-deploy plan).
- Any new dependency — everything here is CSS + existing Svelte/Vitest.
