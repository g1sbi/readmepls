# Tauri Mobile Port — Design & Effort Analysis

**Date:** 2026-06-29
**Status:** Design approved; pending spec review.
**Goal:** Port the reader UI to a Tauri shell so an iOS/Android app can ship from
the same codebase, with offline reading.

## Summary / verdict

The frontend is already client-rendered (no SvelteKit server `load` functions —
every page is a plain `+page.svelte` talking to PocketBase via `browserPb()`), so
the UI ports to a static SPA with little change. No architecture rewrite. The
backend (PocketBase + worker) stays put. The real work sits in three places:

1. **Auth model** — cookie-based SSR auth becomes token auth for the Tauri client.
2. **Offline read-cache** — a new local store + one-way pull sync.
3. **Mobile tooling** — Tauri 2.x iOS/Android targets, signing, CI.

Scope is a Phase-8-sized initiative, decomposed into 6 slices below. Each slice
gets its own spec + plan per repo convention.

## Decisions (locked during brainstorming)

- **App model:** thin client to the hosted SaaS. All capture / extraction / AI /
  storage stays server-side. The app talks to the remote backend over HTTPS.
- **Offline scope:** **read-only cache.** Cached articles + their content are
  readable offline. Highlights, notes, and capture require network. Sync is a
  one-way pull — no write-conflict handling.
- **Build strategy:** **one codebase, dual build.** Keep `apps/web` with its
  `adapter-node` SaaS build (SSR shell, cookie auth, co-located BFF). Add a
  static-SPA build target (`adapter-static`) for Tauri. Same Svelte UI, two
  outputs. Auth refactored to support both cookie (web) and token (Tauri).
- **Tauri version:** 2.x (has iOS/Android support). Validate on **desktop first**,
  then add mobile targets.

## Current-state findings (from code scan)

- **No server `load` functions.** No `+page.server.ts`, `+layout.server.ts`, or
  `+page.ts`. All pages load data client-side via `browserPb()`. SSR/CSR/prerender
  flags are unset (SvelteKit defaults).
- **Server-side surface is small:**
  - `src/hooks.server.ts` — loads PB auth from cookie, refreshes it, sets
    `event.locals.{pb,userId}`, runs `routeGuard` (redirect to `/login`), and
    writes the auth cookie back (`httpOnly:false`) so the browser SDK shares it.
  - 3 BFF routes:
    - `/api/capture` → `core.handleCapture(pb, userId, url)`.
    - `/api/export` → builds a zip via the markdown connector; reads PB with the
      user's token.
    - `/api/retry` → uses `servicePb()` **superuser** auth with the
      `PB_ADMIN_PASSWORD` secret. **Must stay server-side.**
- **Client calls to BFF are relative** (`fetch("/api/capture")`, the
  `/api/export?...` link, `/api/retry`). 3 call sites. Relative URLs work for
  same-origin web but resolve to nothing inside a Tauri webview → need a
  configurable API base.
- **Client pages import `@readmepls/core`** but only pure functions: `slugify`,
  `withReaderDefaults`, `anchoring`, `rangeOver`, `listConnectors`. The barrel
  `index.ts` re-exports server-heavy modules (`handle-capture` → extraction,
  turndown); rely on tree-shaking to keep them out of the SPA bundle and verify
  bundle size. The existing web build already bundles `core` for the client
  (vite handles the optimal-select / turndown CJS quirks in `vite.config.ts`), so
  the SPA build inherits a working setup.
- **Realtime is used:** the home (`+page.svelte`) and library pages
  `pb.collection("articles").subscribe("*", …)` to live-refresh the grid. This
  must degrade gracefully offline and reconnect when back online.
- **`publicPbUrl()` uses `$env/dynamic/public`** (adapter-node injects it at
  runtime). `adapter-static` has no runtime server to inject env → the SPA build
  needs `$env/static/public` (baked at build) or a small runtime config file.

## Target architecture

```
                 ┌─────────────────────────── hosted SaaS ───────────────────────────┐
 Browser (web) ──┤  SvelteKit adapter-node: SSR shell + cookie auth + BFF (/api/*)     │
                 │  PocketBase (auth, SQLite, files)  •  Worker (extract + AI)         │
 Tauri (mobile)──┤  ↑ calls /api/{capture,export,retry} over HTTPS (Bearer token)      │
                 └────────────────────────────────────────────────────────────────────┘
        │
        ├─ Tauri 2.x shell (Rust)  →  loads static SPA build of the same Svelte UI
        ├─ PB SDK direct (token auth) for reads/highlights/collections
        └─ LocalCache (SQLite via Tauri SQL plugin)  →  offline read-cache, pull sync
```

- **One Svelte UI, two builds.** `adapter-node` build is unchanged for browser
  SaaS users (SSR shell, cookie auth, BFF co-located). A second `adapter-static`
  build (`ssr=false` + SPA fallback) is what Tauri packages.
- **BFF stays remote.** The Tauri app calls the hosted SaaS for capture, export,
  and retry. This keeps the `PB_ADMIN_PASSWORD` superuser secret server-side and
  keeps `core`'s server-heavy dependencies out of the SPA bundle.
- **PB direct from the client** for reads and user-scoped writes (highlights,
  collections), authenticated by token rather than cookie.
- **Offline read-cache behind an interface.** A `LocalCache` seam (per the repo's
  interface-seam + DI convention) has a no-op implementation for the web build and
  a SQLite-backed implementation for Tauri. The reader reads cache-first and falls
  back to the network.

## Work slices and effort

Sizes are relative T-shirt estimates (S < M < L), not time commitments.

### Slice 1 — SPA build target (S–M)
- Add a dual `svelte.config` that selects `adapter-static` vs `adapter-node` by an
  env flag (e.g. `BUILD_TARGET=spa`). SPA build sets `ssr=false` and an SPA
  fallback page.
- Move the route guard out of `hooks.server.ts` into a client-side guard in
  `+layout.svelte` (check `pb.authStore.isValid`, `goto("/login")` otherwise). The
  server hook stays for the adapter-node build.
- Replace `publicPbUrl()`'s `$env/dynamic/public` with a static/runtime-config
  source that works under `adapter-static`.
- Add an `apiBase()` helper (mirror of `publicPbUrl()`); rewrite the 3 BFF
  `fetch`/link call sites to `${apiBase()}/api/…`.

### Slice 2 — Token auth seam (M)
- Tauri client authenticates with `pb.collection("users").authWithPassword(...)`
  and persists the token (MVP: the PB SDK's localStorage `authStore`; harden to a
  secure-storage plugin later).
- BFF handlers (`capture`, `export`, `retry`) accept an `Authorization: Bearer`
  token as an alternative to the cookie: load it into a PB client, `authRefresh`,
  derive `userId`. Web cookie flow is untouched.
- CORS: the SaaS BFF and the PocketBase instance must allow the Tauri app origin
  (custom scheme, e.g. `tauri://localhost`).

### Slice 3 — Tauri shell, desktop first (M)
- Add the Tauri 2.x Rust project (e.g. `apps/web/src-tauri`), configure
  `frontendDist` to the SPA build output and `beforeBuildCommand` to the SPA build
  script.
- Define Tauri 2 capabilities/ACL for the permissions actually used (network,
  later SQL + secure-storage).
- Get the **desktop** build green first — proves slices 1 + 2 end-to-end with no
  Apple/Android tooling.

### Slice 4 — Offline read-cache + pull sync (M–L)
- Define the `LocalCache` interface (list cached articles, get article + content,
  upsert, evict). No-op web impl; SQLite impl for Tauri via the Tauri SQL plugin.
- One-way pull sync: on load / on regaining connectivity, fetch articles + content
  changed since the last sync (by updated timestamp), upsert into the local store.
- Reader and library read cache-first, fall back to network; realtime
  subscriptions are disabled while offline and re-established on reconnect.
- **Text-only offline for MVP** — article text + metadata are cached; image assets
  are deferred (documented limitation). Define a quota/eviction policy.
- Pure, TDD-able pieces: the sync-diff logic and the cache layer.

### Slice 5 — Mobile targets (M, tooling-heavy)
- Add iOS and Android targets. iOS requires macOS + Xcode + an Apple Developer
  account ($99/yr) for device builds and signing; Android requires the Android
  SDK/NDK toolchain.
- Signing/provisioning; macOS CI runner for iOS builds.

### Slice 6 — Mobile UX adaptation (S–M)
- Touch highlight selection (long-press vs the current popover interaction),
  safe-area insets, a responsive-layout audit of reader/library/search, app icons
  and splash screens.

## Sequencing

`1 → 2 → 3` on **desktop** first (de-risks the SPA + auth refactor with zero mobile
tooling), then `4` (offline read-cache), then `5` and `6` (mobile targets + touch
UX). Each slice ships behind its own spec + plan and is independently mergeable.

## Sharp edges / risks

- **Cookie auth is web-only.** Cross-origin cookies will not flow from a custom
  Tauri scheme to the SaaS origin, so the Tauri path must use a Bearer token and
  local token storage. The web `httpOnly:false` cookie-sharing mechanism stays for
  browsers only.
- **`$env/dynamic/public`** does not work under `adapter-static`; config source
  must change for the SPA build (Slice 1).
- **Realtime** needs explicit offline/reconnect handling (Slice 4).
- **Mobile tooling is the biggest non-code cost:** macOS + paid Apple account for
  iOS, NDK toolchain for Android, macOS CI for iOS builds.
- **SPA bundle size:** confirm tree-shaking keeps `core`'s server-heavy modules
  (`handle-capture`, extraction, turndown) out of the client bundle.
- **On-device E2E** stays manual for the MVP; Playwright cannot drive the native
  webview. Pure logic (sync, cache, auth-token boundary) is unit-tested with
  Vitest per the repo's TDD agreement.

## Out of scope (YAGNI)

- Offline writes / offline capture (read-only cache was chosen).
- Offline image-asset caching (text-only offline MVP).
- Push notifications.
- Native share-sheet capture target.
- Fully self-contained / embedded-backend app (rejected: PocketBase is a Go binary,
  impractical to embed in a mobile app for this goal).
