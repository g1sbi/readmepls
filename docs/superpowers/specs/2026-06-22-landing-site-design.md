# Landing Site (`apps/site`) — Design

**Date:** 2026-06-22
**Status:** Approved design, pre-implementation

## 1. Summary

Split the product across two domains and add a new marketing front door:

- `readmepls.com` — landing page (this work), docs later.
- `app.readmepls.com` — the existing reader web app (`apps/web`), unchanged.

This spec covers a new workspace app, `apps/site`: a small, fully-prerendered
SvelteKit landing page styled from the existing brand banner. Modern, minimal,
playful. Short and simple.

## 2. Goals / Non-Goals

### Goals
- New `apps/site` SvelteKit app, prerendered to static HTML for `readmepls.com`.
- Landing page with four sections: Hero, How it works, Feature highlights, Footer.
- Visual language derived from `assets/_banner.html` and `assets/banner.png`:
  cream paper background, dog-ear fold motif, Fredoka font, terracotta accent.
- Cross-domain CTAs to `https://app.readmepls.com` and the GitHub repo.
- Tests drive the content (TDD), run offline.

### Non-Goals
- Docs content/section (deferred; route may be a placeholder link only).
- Changelog page (deferred, tracked in Linear).
- Any change to `apps/web` beyond acknowledging the domain split.
- Payments, auth, blog, i18n.

## 3. Architecture

### Approach (chosen): SvelteKit + `@sveltejs/adapter-static`
Fully prerendered static HTML. Gives real `<title>`/meta tags for SEO and social
previews, stays consistent with `apps/web` (also SvelteKit), and deploys to any
static host/CDN cheaply. Rejected alternatives: a client-rendered Vite+Svelte SPA
(weak SEO for a marketing page) and Astro (introduces a second framework; brief
was "still svelte").

### Routing / deploy
- `apps/site` deploys to `readmepls.com`.
- `apps/web` continues to serve `app.readmepls.com` (adapter-node, as today).
- The split is a deployment/DNS concern. No shared runtime between the two apps.
- All "open the app" CTAs are absolute links to `https://app.readmepls.com`.

## 4. Visual System

Lifted from `assets/_banner.html`:

- **Background:** cream radial gradient
  `radial-gradient(120% 140% at 18% 12%, #F7F3EA 0%, #F1ECDF 55%, #EAE3D2 100%)`,
  plus the faint SVG paper-grain overlay (`opacity ~0.04`, `mix-blend-mode: multiply`).
- **Dog-ear fold** motif as a decorative accent (the `.fold` element idea).
- **Font:** Fredoka, self-hosted via `@fontsource-variable/fredoka` so the build is
  offline and deterministic (matches repo testing ethos). Fallback `system-ui, sans-serif`.
- **Logo:** reuse `hero.png` from `assets/` (copied into `apps/site/static/`),
  shown with the banner's slight `-4deg` tilt + soft drop shadow.
- **Wordmark:** `readme` in ink + `pls` in terracotta.

### Color tokens (CSS custom properties in `app.css`)
| Token | Value | Use |
|---|---|---|
| `--ink` | `#211E17` | primary text / wordmark |
| `--accent` | `#C24A38` | "pls", primary CTA |
| `--muted` | `#6E6453` | tagline / body |
| `--faint` | `#AC9F86` | meta / uppercase labels |
| `--surface-0/1/2` | `#F7F3EA` / `#F1ECDF` / `#EAE3D2` | background gradient + cards |
| `--fold` | `#E4DCC8` | dog-ear accent |

## 5. Sections (top → bottom)

1. **Hero** — tilted `hero.png` logo, `readme`**`pls`** wordmark, tagline
   *"save any link. actually read it. pls."*, primary CTA **Open app**
   (→ `https://app.readmepls.com`), secondary **GitHub** link.
2. **How it works** — three steps, icon/numeral + one line each:
   paste link → extract + auto-tag → read with highlights.
3. **Feature highlights** — grid of 3–4 cards: reader view, highlights & notes,
   AI auto-tags, search & collections.
4. **Footer** — links (GitHub, self-host, docs placeholder) and the banner echo
   line "open source · self-hostable".

## 6. File Structure

Small, single-purpose files (per CLAUDE.md):

```
apps/site/
  package.json
  svelte.config.js          # adapter-static
  vite.config.ts
  tsconfig.json
  vitest.config.ts
  src/
    app.html
    app.css                 # tokens, background gradient, paper grain
    routes/
      +layout.ts            # export const prerender = true
      +page.svelte          # composes the four sections
    lib/
      site.ts               # config: app URL, GitHub URL, copy strings
      components/
        Hero.svelte
        HowItWorks.svelte
        Features.svelte
        Footer.svelte
  static/
    hero.png                # copied from assets/
    favicon.png
```

### Config seam — `lib/site.ts`
Centralizes outward-facing constants so they are not scattered across components:
`APP_URL = "https://app.readmepls.com"`, `GITHUB_URL`, tagline, feature/step copy.

## 7. Testing (TDD)

Vitest + Svelte component render tests, fully offline. Write failing tests first,
then implement each component to pass.

- **Hero:** renders the tagline; **Open app** CTA `href === "https://app.readmepls.com"`.
- **Footer:** renders the GitHub link and the "open source · self-hostable" line.
- **Page:** mounts all four sections (Hero, How it works, Features, Footer).

## 8. Out of Scope

Docs content, changelog (tracked in Linear), payments, `apps/web` changes,
analytics, blog.
