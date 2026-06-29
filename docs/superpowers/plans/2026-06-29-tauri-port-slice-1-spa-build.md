# Tauri Port — Slice 1: SPA Build Target — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static-SPA build of `apps/web` (alongside the existing adapter-node SaaS build) that runs without a Node server, so a Tauri shell can package the same Svelte UI.

**Architecture:** One Svelte codebase, two build outputs selected by a `BUILD_TARGET` env var. The SaaS build keeps `adapter-node` (SSR shell + cookie auth + co-located BFF). The SPA build uses `adapter-static` (`ssr=false`, SPA fallback). Backend-facing config (PocketBase origin, BFF base URL) reads `$env/dynamic/public` first (works on adapter-node, set per-host at runtime) and falls back to Vite-baked `import.meta.env.VITE_*` (works on adapter-static, baked at build). The route-guard redirect moves from the server hook into a pure client-side guard so it works with no server.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), `@sveltejs/adapter-static`, Vite 5, Vitest 2, PocketBase JS SDK.

## Global Constraints

- TypeScript strict; no `any` without a written reason.
- TDD: failing test first, then implementation. Pure logic is unit-tested; build-config tasks are verified by running the build and inspecting output.
- Never hardcode a color or font name in a component — reference a token. (Not exercised in this slice; no styling changes.)
- Conventional Commits, one logical change per commit.
- Do not repoint `@readmepls/core`/`@readmepls/types` `main` at `dist`.
- The web build is `@readmepls/web`; run its tooling via `pnpm --filter @readmepls/web ...`. This repo uses **pnpm**, not npm.
- Repo root for all commands: `/home/gisbi/Code/personal/readmepls`.
- The default (no env) build must remain byte-for-behavior identical to today's adapter-node SaaS build; the SPA target is purely additive.

---

### Task 1: API base-URL helper

Introduces a single source for the BFF origin. Web (same-origin) gets `""` so `fetch` stays relative and unchanged; the SPA build sets `VITE_API_BASE` to the remote SaaS origin.

**Files:**
- Create: `apps/web/src/lib/api-base.ts`
- Test: `apps/web/src/lib/api-base.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `apiBase(): string` — returns the BFF origin with no trailing slash, or `""` when unset (callers build `` `${apiBase()}/api/…` ``).

- [ ] **Step 1: Write the failing test**

Mirror the existing `public-pb-url.test.ts` mocking pattern for `$env/dynamic/public`, plus `vi.stubEnv` for the Vite fallback.

```ts
// apps/web/src/lib/api-base.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockEnv: Record<string, string> = {};
vi.mock("$env/dynamic/public", () => ({ env: mockEnv }));

describe("apiBase", () => {
  beforeEach(() => {
    for (const k of Object.keys(mockEnv)) delete mockEnv[k];
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns PUBLIC_API_BASE (dynamic) when set", async () => {
    mockEnv.PUBLIC_API_BASE = "https://saas.example.com";
    const { apiBase } = await import("./api-base.js");
    expect(apiBase()).toBe("https://saas.example.com");
  });

  it("falls back to VITE_API_BASE when dynamic env is unset", async () => {
    vi.stubEnv("VITE_API_BASE", "https://baked.example.com");
    const { apiBase } = await import("./api-base.js");
    expect(apiBase()).toBe("https://baked.example.com");
  });

  it("strips a trailing slash", async () => {
    mockEnv.PUBLIC_API_BASE = "https://saas.example.com/";
    const { apiBase } = await import("./api-base.js");
    expect(apiBase()).toBe("https://saas.example.com");
  });

  it("returns empty string when nothing is set (relative, same-origin)", async () => {
    const { apiBase } = await import("./api-base.js");
    expect(apiBase()).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/api-base.test.ts`
Expected: FAIL — cannot resolve `./api-base.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/api-base.ts
import { env } from "$env/dynamic/public";

/**
 * Origin of the BFF (`/api/*`) routes, with no trailing slash.
 *
 * Web (adapter-node) is same-origin, so this is `""` and `fetch` stays
 * relative. The Tauri SPA build is served from a custom scheme and must call
 * the remote SaaS, so it bakes `VITE_API_BASE` at build time.
 * Dynamic public env wins when present (per-host runtime config on adapter-node);
 * the Vite-baked value is the adapter-static fallback.
 */
export function apiBase(): string {
  const raw = env.PUBLIC_API_BASE || import.meta.env.VITE_API_BASE || "";
  return raw.replace(/\/$/, "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/api-base.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api-base.ts apps/web/src/lib/api-base.test.ts
git commit -m "feat(web): add apiBase() helper for configurable BFF origin"
```

---

### Task 2: PocketBase origin fallback for static builds

`publicPbUrl()` currently reads only `$env/dynamic/public`, which is empty under `adapter-static`. Add the same Vite-baked fallback used by `apiBase()` so the SPA resolves the remote PB origin, while keeping the existing dynamic behavior (and its three tests) intact for web.

**Files:**
- Modify: `apps/web/src/lib/public-pb-url.ts`
- Test: `apps/web/src/lib/public-pb-url.test.ts` (add one case)

**Interfaces:**
- Consumes: nothing.
- Produces: `publicPbUrl(): string` — unchanged signature; resolution order is now dynamic env → `VITE_PB_URL` → `http://127.0.0.1:8090`.

- [ ] **Step 1: Write the failing test**

Append this case inside the existing `describe("publicPbUrl", …)` block in `public-pb-url.test.ts`, and add `afterEach(() => vi.unstubAllEnvs());` next to the existing `beforeEach`:

```ts
  it("falls back to VITE_PB_URL when dynamic env is unset (static SPA build)", async () => {
    vi.stubEnv("VITE_PB_URL", "https://pb.baked.example.com");
    const { publicPbUrl } = await import("./public-pb-url.js");
    expect(publicPbUrl()).toBe("https://pb.baked.example.com");
  });
```

Also add `afterEach` to the imports line: `import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/public-pb-url.test.ts`
Expected: FAIL — new case returns `http://127.0.0.1:8090` instead of the baked URL.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/public-pb-url.ts
import { env } from "$env/dynamic/public";

/**
 * Browser-facing PocketBase origin, resolved at runtime where possible.
 *
 * adapter-node ships PUBLIC_PB_URL to the browser via the SSR bootstrap (set
 * per host). adapter-static has no runtime server, so the SPA build bakes
 * VITE_PB_URL at build time. The localhost fallback covers `vite dev`.
 */
export function publicPbUrl(): string {
  return env.PUBLIC_PB_URL || import.meta.env.VITE_PB_URL || "http://127.0.0.1:8090";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/public-pb-url.test.ts`
Expected: PASS (4 tests — the original 3 plus the new fallback case).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/public-pb-url.ts apps/web/src/lib/public-pb-url.test.ts
git commit -m "feat(web): resolve PB origin from baked env for static builds"
```

---

### Task 3: Route the 3 BFF call sites through `apiBase()`

The three relative `fetch`/link references to `/api/*` resolve to nothing inside a Tauri webview. Prefix them with `apiBase()`. With `apiBase() === ""` on web, the resulting strings are identical to today.

**Files:**
- Modify: `apps/web/src/lib/components/CaptureBar.svelte` (the `fetch("/api/capture")` call)
- Modify: `apps/web/src/routes/+page.svelte` (the `fetch("/api/retry")` call)
- Modify: `apps/web/src/routes/settings/connectors/+page.svelte` (the `/api/export?scope=library` link)
- Test: `apps/web/src/routes/settings/connectors/page.test.ts` (existing assertion still must hold on web)

**Interfaces:**
- Consumes: `apiBase()` from `$lib/api-base.js` (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Update CaptureBar capture call**

In `apps/web/src/lib/components/CaptureBar.svelte`, add the import at the top of `<script>`:

```ts
  import { apiBase } from "$lib/api-base.js";
```

Change the fetch line from:

```ts
      const res = await fetch("/api/capture", {
```

to:

```ts
      const res = await fetch(`${apiBase()}/api/capture`, {
```

- [ ] **Step 2: Update home retry call**

In `apps/web/src/routes/+page.svelte`, add to the `<script>` imports:

```ts
  import { apiBase } from "$lib/api-base.js";
```

Change:

```ts
    await fetch("/api/retry", {
```

to:

```ts
    await fetch(`${apiBase()}/api/retry`, {
```

- [ ] **Step 3: Update connectors export link**

In `apps/web/src/routes/settings/connectors/+page.svelte`, add to the `<script>` block:

```ts
  import { apiBase } from "$lib/api-base.js";
```

Change the anchor:

```svelte
          <a class="action" href={`/api/export?scope=library`}>export library</a>
```

to:

```svelte
          <a class="action" href={`${apiBase()}/api/export?scope=library`}>export library</a>
```

- [ ] **Step 4: Run the existing connectors test to verify web behavior is unchanged**

The existing test asserts `href` equals `/api/export?scope=library`. On web, `apiBase()` is `""` (no env set in the test), so the href is unchanged and the test must still pass.

Run: `pnpm --filter @readmepls/web exec vitest run src/routes/settings/connectors/page.test.ts`
Expected: PASS — `link` still has `href="/api/export?scope=library"`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/CaptureBar.svelte apps/web/src/routes/+page.svelte apps/web/src/routes/settings/connectors/+page.svelte
git commit -m "refactor(web): route BFF calls through apiBase() for off-origin clients"
```

---

### Task 4: Client-side route guard

The server hook (`hooks.server.ts`) redirects unauthenticated users; it does not run in a server-less SPA. Re-home the guard logic as a pure function outside `$lib/server` (SvelteKit forbids importing `$lib/server/*` into client code) and apply it reactively in the root layout. Running it on web too is harmless defense-in-depth.

**Files:**
- Create: `apps/web/src/lib/auth/route-guard.ts`
- Test: `apps/web/src/lib/auth/route-guard.test.ts`
- Modify: `apps/web/src/routes/+layout.svelte`

**Interfaces:**
- Consumes: nothing.
- Produces: `clientRouteGuard(pathname: string, isAuthed: boolean): string | null` — returns a redirect target (`"/login"`) when an unauthenticated user is on a protected route, else `null`. `/login` and `/api/*` are always allowed (mirrors the server `routeGuard`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/auth/route-guard.test.ts
import { describe, it, expect } from "vitest";
import { clientRouteGuard } from "./route-guard.js";

describe("clientRouteGuard", () => {
  it("redirects an unauthenticated user on a protected route to /login", () => {
    expect(clientRouteGuard("/library", false)).toBe("/login");
    expect(clientRouteGuard("/", false)).toBe("/login");
  });

  it("allows an authenticated user anywhere", () => {
    expect(clientRouteGuard("/library", true)).toBeNull();
    expect(clientRouteGuard("/", true)).toBeNull();
  });

  it("always allows /login regardless of auth", () => {
    expect(clientRouteGuard("/login", false)).toBeNull();
    expect(clientRouteGuard("/login", true)).toBeNull();
  });

  it("never redirects /api/* (those enforce their own auth)", () => {
    expect(clientRouteGuard("/api/capture", false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/auth/route-guard.test.ts`
Expected: FAIL — cannot resolve `./route-guard.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/auth/route-guard.ts
/**
 * Client mirror of the server `routeGuard`. Returns a redirect target for a
 * protected page when the user is unauthenticated, else null. `/login` and
 * `/api/*` are always public (API routes enforce their own auth).
 *
 * Used by the root layout so the SPA (adapter-static, no server hook) still
 * gates protected routes. On adapter-node it runs after the server hook as
 * redundant defense-in-depth.
 */
export function clientRouteGuard(pathname: string, isAuthed: boolean): string | null {
  if (pathname === "/login" || pathname.startsWith("/api/")) return null;
  return isAuthed ? null : "/login";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @readmepls/web exec vitest run src/lib/auth/route-guard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the guard into the root layout**

In `apps/web/src/routes/+layout.svelte`, add the import alongside the others in `<script>`:

```ts
  import { clientRouteGuard } from "$lib/auth/route-guard.js";
```

Add this reactive guard immediately after the existing `const chrome = $derived(...)` line:

```ts
  // SPA builds have no server hook; gate protected routes client-side.
  // Re-checks on every navigation and whenever auth validity changes.
  $effect(() => {
    const target = clientRouteGuard($page.url.pathname, pb.authStore.isValid);
    if (target) goto(target);
  });
```

(`goto` and `$page` are already imported in this file.)

- [ ] **Step 6: Run the web test suite to confirm no regression**

Run: `pnpm --filter @readmepls/web exec vitest run`
Expected: PASS — all existing web tests plus the new guard tests.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/auth/route-guard.ts apps/web/src/lib/auth/route-guard.test.ts apps/web/src/routes/+layout.svelte
git commit -m "feat(web): client-side route guard for server-less SPA builds"
```

---

### Task 5: Dual build target (adapter-static SPA) + verification

Wire the second adapter, gate SSR off for the SPA target only, add a build script, and prove both builds produce their expected output. This task is verified by running the builds, not by unit tests (build config is not unit-testable).

**Files:**
- Modify: `apps/web/package.json` (add dev dependency + `build:spa` script)
- Modify: `apps/web/svelte.config.js`
- Create: `apps/web/src/routes/+layout.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a `pnpm --filter @readmepls/web build:spa` command that emits a static SPA into `apps/web/build/` with an `index.html` SPA fallback.

- [ ] **Step 1: Install adapter-static**

Run: `pnpm --filter @readmepls/web add -D @sveltejs/adapter-static`
Expected: `@sveltejs/adapter-static` appears in `apps/web/package.json` devDependencies; lockfile updates.

- [ ] **Step 2: Make SSR conditional on the build target**

Create `apps/web/src/routes/+layout.ts`:

```ts
// adapter-static (the Tauri SPA build) requires SSR off and a client-rendered
// fallback. The flag is baked by Vite when BUILD_TARGET=spa sets VITE_SPA_BUILD.
// The adapter-node SaaS build leaves it unset, keeping SSR on.
export const ssr = import.meta.env.VITE_SPA_BUILD !== "1";
export const prerender = false;
```

- [ ] **Step 3: Select the adapter by build target**

Replace the entire contents of `apps/web/svelte.config.js` with:

```js
import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";

const spa = process.env.BUILD_TARGET === "spa";

export default {
  kit: {
    adapter: spa
      ? adapterStatic({ fallback: "index.html" })
      : adapterNode(),
  },
};
```

- [ ] **Step 4: Add the SPA build script**

In `apps/web/package.json`, add to `"scripts"` (next to the existing `"build"`):

```json
    "build:spa": "BUILD_TARGET=spa VITE_SPA_BUILD=1 vite build",
```

- [ ] **Step 5: Verify the default (adapter-node) build still works**

Run: `pnpm --filter @readmepls/web build`
Expected: build succeeds; `apps/web/build/index.js` (the Node server entry) exists.

Run: `test -f apps/web/build/index.js && echo NODE_BUILD_OK`
Expected: prints `NODE_BUILD_OK`.

- [ ] **Step 6: Verify the SPA build produces a static fallback**

Run: `pnpm --filter @readmepls/web build:spa`
Expected: build succeeds with no "could not be prerendered"/SSR errors.

Run: `test -f apps/web/build/index.html && echo SPA_BUILD_OK`
Expected: prints `SPA_BUILD_OK` (the `index.html` SPA fallback emitted by adapter-static).

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/svelte.config.js apps/web/src/routes/+layout.ts ../../pnpm-lock.yaml
git commit -m "feat(web): add adapter-static SPA build target alongside adapter-node"
```

(If the lockfile is at the repo root, adjust the path: `git add pnpm-lock.yaml`.)

---

## Self-Review

**Spec coverage (Slice 1 only):** The Slice 1 line items in `2026-06-29-tauri-mobile-port-design.md` are: dual `svelte.config` (Task 5), `ssr=false`+SPA fallback (Task 5), client route-guard moved from `hooks.server.ts` (Task 4), fix `publicPbUrl` for static (Task 2), API base helper + rewrite the 3 BFF call sites (Tasks 1 & 3). All covered. Auth-token work, offline cache, Tauri shell, and mobile targets are explicitly later slices and out of scope here.

**Placeholder scan:** No TBD/TODO; every code step contains complete content and every command states expected output.

**Type consistency:** `apiBase(): string` (defined Task 1) is consumed verbatim in Task 3. `publicPbUrl(): string` signature unchanged (Task 2). `clientRouteGuard(pathname: string, isAuthed: boolean): string | null` (defined Task 4) is called with `($page.url.pathname, pb.authStore.isValid)` in the same task — matches. `VITE_SPA_BUILD` (set in the `build:spa` script, Task 5) is the same name read in `+layout.ts` (Task 5). `VITE_API_BASE`/`VITE_PB_URL` are read in Tasks 1/2 and are documented as build-time vars for the SPA — they are not set by this slice (the SPA build's deployment config sets them); the web default leaves them unset, exercising the `""`/localhost fallbacks the tests assert.

**Note for the Tauri build (later slice):** packaging will invoke `build:spa` with `VITE_API_BASE` and `VITE_PB_URL` set to the hosted SaaS origins. This slice deliberately does not set them — it only proves the build path and the fallbacks.
