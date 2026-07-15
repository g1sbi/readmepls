# Landing-Site Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the existing static `apps/site` landing page as its own container so it can serve the root domain, with a runtime-configurable `APP_URL` pointing at the reader app on the `app.` subdomain.

**Architecture:** `apps/site` is a prerendered adapter-static SvelteKit app. Its one outward link (`APP_URL`, the "Open app" CTA) is read from a public env var at build; the Docker build bakes a sentinel token `__APP_URL__` into the static output, and the nginx container's entrypoint rewrites that sentinel to `$APP_URL` before serving — so operators pulling the prebuilt image set their own app subdomain without rebuilding. `apps/web` is unchanged; it lives at the root of the `app.` subdomain via the operator's reverse proxy.

**Tech Stack:** SvelteKit + adapter-static, `$env/dynamic/public`, Vitest, Docker multi-stage (node:22-alpine build → nginx:alpine serve), Docker Compose, GitHub Actions matrix.

## Global Constraints

- Node base image: `node:22-alpine` (matches `apps/web/Dockerfile`).
- Package manager: pnpm via `corepack enable`; installs use `--frozen-lockfile`.
- Env idiom: read public env with `import { env } from "$env/dynamic/public"` — same as `apps/web/src/lib/public-pb-url.ts`. Do NOT use `import.meta.env` (Vite default prefix is `VITE_`, not `PUBLIC_`).
- Sentinel token is exactly `__APP_URL__`.
- Site container serves on port `80` internally; host port env var `SITE_PORT` defaults to `3001` (web owns 3000).
- Cross-app link is one-way (site → app). `apps/web` is not modified.
- TDD: failing test first. Conventional Commits. Small commits.
- Existing exports in `apps/site/src/lib/site.ts` other than `APP_URL` (`GITHUB_URL`, `TAGLINE`, `STEPS`, `FEATURES`) are unchanged.

---

### Task 1: Make `APP_URL` resolve from public env

Currently `apps/site/src/lib/site.ts` hardcodes `APP_URL = "https://app.readmepls.com"`. Make it read `PUBLIC_APP_URL` from `$env/dynamic/public` with a dev fallback. The site's vitest config uses the plain `svelte()` plugin and has no `$env` alias, so tests need a mock module aliased in — mirroring `apps/web`.

**Files:**
- Create: `apps/site/src/__mocks__/env-dynamic-public.ts`
- Modify: `apps/site/vitest.config.ts`
- Modify: `apps/site/src/lib/site.ts`
- Test: `apps/site/src/lib/site.test.ts` (modify)
- Test: `apps/site/src/lib/components/Hero.test.ts` (verify still green — no change expected)

**Interfaces:**
- Consumes: `env` from `$env/dynamic/public` (SvelteKit virtual module; real value baked at prerender, mocked in tests).
- Produces: `export const APP_URL: string` — resolves to `env.PUBLIC_APP_URL` when non-empty, else `"http://localhost:3000"`. Consumed by `Hero.svelte` (the "Open app" CTA `href`).

- [ ] **Step 1: Create the test mock module for the public-env virtual module**

Create `apps/site/src/__mocks__/env-dynamic-public.ts`:

```ts
// Test stand-in for SvelteKit's $env/dynamic/public virtual module.
// Mutable so individual tests can set PUBLIC_* values via vi.mock/assignment.
export const env: Record<string, string> = {};
```

- [ ] **Step 2: Alias the virtual module in the site's vitest config**

Modify `apps/site/vitest.config.ts` — add a `$env/dynamic/public` entry to `resolve.alias` (keep the existing `$lib` alias):

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
      "$env/dynamic/public": fileURLToPath(
        new URL("./src/__mocks__/env-dynamic-public.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Write the failing test for `APP_URL`**

Replace the `APP_URL` test in `apps/site/src/lib/site.test.ts`. Keep every other test in the file exactly as-is; only swap the first test block. New top of file and replacement test:

```ts
import { expect, test, vi, beforeEach } from "vitest";

// Mutable mock of the SvelteKit runtime-public-env virtual module.
const mockEnv: Record<string, string> = {};
vi.mock("$env/dynamic/public", () => ({ env: mockEnv }));

beforeEach(() => {
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
  vi.resetModules();
});

test("APP_URL uses PUBLIC_APP_URL when set", async () => {
  mockEnv.PUBLIC_APP_URL = "https://app.example.com";
  const { APP_URL } = await import("$lib/site");
  expect(APP_URL).toBe("https://app.example.com");
});

test("APP_URL falls back to localhost dev default when unset", async () => {
  const { APP_URL } = await import("$lib/site");
  expect(APP_URL).toBe("http://localhost:3000");
});
```

Leave the existing `GITHUB_URL`, `TAGLINE`, `STEPS`, `FEATURES` tests below unchanged, but change their static top-level `import { ... } from "$lib/site"` into per-test dynamic imports only if they now fail under `resetModules`. To avoid churn: keep them using the top-level import — because they read module constants that don't depend on env, and `vi.mock` is hoisted so the module resolves. If any of those tests fail after this change, convert that individual test to `const { X } = await import("$lib/site")` inside the test body.

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/site/src/lib/site.test.ts`
Expected: FAIL — `APP_URL` still equals `"https://app.readmepls.com"`, so both new assertions fail.

- [ ] **Step 5: Implement env-driven `APP_URL`**

Modify `apps/site/src/lib/site.ts` — change only the `APP_URL` declaration and its imports; leave everything else in the file intact:

```ts
import { env } from "$env/dynamic/public";

// Single source of truth for outward-facing links and marketing copy.
// APP_URL is the absolute origin of the reader app (a relative link can't cross
// origins). Operators set PUBLIC_APP_URL; the Docker build bakes the sentinel
// __APP_URL__, which the container entrypoint rewrites to $APP_URL at start.
// Fallback covers local `vite dev` with no env set (web's default dev port).
export const APP_URL = env.PUBLIC_APP_URL || "http://localhost:3000";

// Change GITHUB_URL here if the repo slug differs.
export const GITHUB_URL = "https://github.com/readmepls/readmepls";
export const TAGLINE = "save any link. actually read it. pls.";
```

(Keep the `Step`/`Feature` types, `STEPS`, and `FEATURES` exactly as they already are.)

- [ ] **Step 6: Run the site test suite to verify green**

Run: `pnpm exec vitest run apps/site/src/lib/site.test.ts apps/site/src/lib/components/Hero.test.ts`
Expected: PASS. `Hero.test.ts` asserts the CTA `href` equals `APP_URL`; with env unset both are `http://localhost:3000`, so it stays green.

- [ ] **Step 7: Commit**

```bash
git add apps/site/src/lib/site.ts apps/site/src/lib/site.test.ts \
  apps/site/vitest.config.ts apps/site/src/__mocks__/env-dynamic-public.ts
git commit -m "feat(site): resolve APP_URL from PUBLIC_APP_URL env"
```

---

### Task 2: Entrypoint script that rewrites the sentinel at container start

A POSIX-sh script that replaces `__APP_URL__` with `$APP_URL` across the served `*.html` and `*.js` files. Parameterized on a root dir so it is testable offline against a fixture. Uses busybox `sed -i` with a `|` delimiter (URLs contain `/`, never `|`).

**Files:**
- Create: `apps/site/docker-entrypoint.d/40-app-url.sh`
- Test: `apps/site/docker-entrypoint.d/40-app-url.test.ts`

**Interfaces:**
- Consumes: env `APP_URL` (defaults to `https://app.readmepls.com` if unset), env `SITE_ROOT` (defaults to `/usr/share/nginx/html`).
- Produces: in-place rewrite of `__APP_URL__` → `$APP_URL` in all `*.html`/`*.js` files under `SITE_ROOT`. Consumed by the nginx container (script dropped in `/docker-entrypoint.d/`, run before nginx starts).

- [ ] **Step 1: Write the failing offline test for the substitution**

Create `apps/site/docker-entrypoint.d/40-app-url.test.ts`. It writes a fixture, runs the real script with `SITE_ROOT` pointed at the fixture, and asserts the sentinel is gone and the URL is present:

```ts
import { expect, test, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./40-app-url.sh", import.meta.url));
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "site-sub-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("rewrites the sentinel in html and js to APP_URL", () => {
  writeFileSync(join(dir, "index.html"), '<a href="__APP_URL__">Open app</a>');
  writeFileSync(join(dir, "app.js"), 'const u="__APP_URL__";');
  writeFileSync(join(dir, "hero.png"), "__APP_URL__"); // non-target, must stay

  execFileSync("sh", [script], {
    env: { ...process.env, APP_URL: "https://app.example.com", SITE_ROOT: dir },
  });

  expect(readFileSync(join(dir, "index.html"), "utf8")).toBe(
    '<a href="https://app.example.com">Open app</a>',
  );
  expect(readFileSync(join(dir, "app.js"), "utf8")).toBe(
    'const u="https://app.example.com";',
  );
  // .png is not an html/js target — left untouched.
  expect(readFileSync(join(dir, "hero.png"), "utf8")).toBe("__APP_URL__");
});

test("falls back to the SaaS URL when APP_URL is unset", () => {
  writeFileSync(join(dir, "index.html"), '<a href="__APP_URL__">Open app</a>');
  const env = { ...process.env, SITE_ROOT: dir };
  delete env.APP_URL;
  execFileSync("sh", [script], { env });
  expect(readFileSync(join(dir, "index.html"), "utf8")).toBe(
    '<a href="https://app.readmepls.com">Open app</a>',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/site/docker-entrypoint.d/40-app-url.test.ts`
Expected: FAIL — `execFileSync` throws ENOENT because `40-app-url.sh` does not exist yet.

- [ ] **Step 3: Write the entrypoint script**

Create `apps/site/docker-entrypoint.d/40-app-url.sh`:

```sh
#!/bin/sh
# Rewrite the build-time sentinel __APP_URL__ to the operator's $APP_URL across
# the prerendered static files. nginx:alpine runs /docker-entrypoint.d/*.sh
# before starting nginx, so this fixes the "Open app" link at container start —
# no rebuild needed. SITE_ROOT is overridable so this is testable offline.
set -e
: "${APP_URL:=https://app.readmepls.com}"
root="${SITE_ROOT:-/usr/share/nginx/html}"
find "$root" -type f \( -name '*.html' -o -name '*.js' \) \
  -exec sed -i "s|__APP_URL__|${APP_URL}|g" {} +
```

- [ ] **Step 4: Make it executable and run the test to verify it passes**

Run:
```bash
chmod +x apps/site/docker-entrypoint.d/40-app-url.sh
pnpm exec vitest run apps/site/docker-entrypoint.d/40-app-url.test.ts
```
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add apps/site/docker-entrypoint.d/40-app-url.sh apps/site/docker-entrypoint.d/40-app-url.test.ts
git commit -m "feat(site): add entrypoint sentinel rewrite for APP_URL"
```

---

### Task 3: Dockerfile + nginx config for the site image

Multi-stage build following `apps/web/Dockerfile`'s base/build split. Build stage bakes `PUBLIC_APP_URL=__APP_URL__`; serve stage is `nginx:alpine` with the static output, an SPA-safe nginx config, the entrypoint script from Task 2, and a healthcheck.

**Files:**
- Create: `apps/site/Dockerfile`
- Create: `apps/site/nginx.conf`

**Interfaces:**
- Consumes: `apps/site/docker-entrypoint.d/40-app-url.sh` (Task 2); the site's `build/` output (produced inside the image).
- Produces: an image serving the landing page on port `80`, reading env `APP_URL` at start.

- [ ] **Step 1: Write the nginx config**

Create `apps/site/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Write the Dockerfile**

Create `apps/site/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
# ---- base: workspace install ----
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY apps/site/package.json apps/site/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build: bake the sentinel into the prerendered output ----
FROM base AS build
COPY apps/site ./apps/site
ENV PUBLIC_APP_URL=__APP_URL__
RUN pnpm --filter @readmepls/site build

# ---- runtime: static serve via nginx ----
FROM nginx:alpine AS runtime
COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/site/docker-entrypoint.d/40-app-url.sh /docker-entrypoint.d/40-app-url.sh
RUN chmod +x /docker-entrypoint.d/40-app-url.sh
COPY --from=build /repo/apps/site/build /usr/share/nginx/html
ENV APP_URL=https://app.readmepls.com
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
```

- [ ] **Step 3: Build the image to verify it compiles and prerenders**

Run: `docker build -f apps/site/Dockerfile -t readmepls-site:plan-check .`
Expected: build succeeds through all three stages; final line `naming to ... readmepls-site:plan-check`. (If Docker is unavailable in the environment, mark this step blocked and rely on the Task 6 end-to-end verification.)

- [ ] **Step 4: Commit**

```bash
git add apps/site/Dockerfile apps/site/nginx.conf
git commit -m "build(site): nginx image serving the prerendered landing page"
```

---

### Task 4: Compose service + `.env.example`

Add the `site` service to `compose.yml` and document the two new env vars.

**Files:**
- Modify: `compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `apps/site/Dockerfile` (Task 3); env vars `APP_URL`, `SITE_PORT`, `IMAGE_OWNER`.
- Produces: a `site` compose service published on `${SITE_PORT:-3001}:80`.

- [ ] **Step 1: Add the `site` service to `compose.yml`**

Insert this service into the `services:` block of `compose.yml` (place it after `worker`, before the top-level `volumes:` key). Match the two-space indentation of the existing services:

```yaml
  site:
    image: ghcr.io/${IMAGE_OWNER:-owner}/readmepls-site:latest
    build:
      context: .
      dockerfile: apps/site/Dockerfile
    restart: unless-stopped
    environment:
      # Absolute origin of the reader app, injected into the landing page's
      # "Open app" CTA at container start (rewrites the baked __APP_URL__).
      APP_URL: ${APP_URL:-https://app.readmepls.com}
    ports:
      - "${SITE_PORT:-3001}:80"
```

- [ ] **Step 2: Document the new env vars in `.env.example`**

Append to `.env.example`:

```
# --- Landing site ---
# Absolute URL of the reader app; the landing page "Open app" CTA points here.
# In production this is the app subdomain routed by your reverse proxy.
APP_URL=https://app.readmepls.com
# Host port for the landing-site container (web owns 3000).
SITE_PORT=3001
```

- [ ] **Step 3: Validate compose interpolation and service wiring**

Run: `docker compose config >/dev/null && echo OK`
Expected: `OK` (no YAML or interpolation errors). Then confirm the service resolved:
Run: `docker compose config --services`
Expected: output lists `pocketbase`, `web`, `worker`, `site`.

(If the Docker CLI is unavailable, validate YAML instead with `pnpm exec node -e "require('yaml')" ` is not available — fall back to visual review and the Task 6 run.)

- [ ] **Step 4: Commit**

```bash
git add compose.yml .env.example
git commit -m "feat(site): add compose service and env for the landing site"
```

---

### Task 5: CI image publish for the site

Add the `site` image to the docker-publish matrix so releases build and push `readmepls-site` alongside the others.

**Files:**
- Modify: `.github/workflows/docker-publish.yml`

**Interfaces:**
- Consumes: `apps/site/Dockerfile` (Task 3).
- Produces: a matrix build publishing `ghcr.io/<owner>/readmepls-site`.

- [ ] **Step 1: Add the matrix entry**

In `.github/workflows/docker-publish.yml`, add to the `matrix.include` list (after the `worker` entry), matching the existing indentation:

```yaml
          - name: site
            dockerfile: apps/site/Dockerfile
```

- [ ] **Step 2: Verify the matrix entry is present and the YAML is well-formed**

Run: `grep -A1 'name: site' .github/workflows/docker-publish.yml`
Expected: shows the `name: site` line followed by `dockerfile: apps/site/Dockerfile`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "ci: publish the readmepls-site image"
```

---

### Task 6: End-to-end verification

Prove the full chain: image builds, container serves the landing page, and an `APP_URL` override reaches the served HTML with no sentinel left behind. Then run the whole workspace suite.

**Files:** none (verification only).

- [ ] **Step 1: Build and run the container with an overridden APP_URL**

Run:
```bash
docker build -f apps/site/Dockerfile -t readmepls-site:verify .
docker run -d --name site-verify -e APP_URL=https://app.override.test -p 8099:80 readmepls-site:verify
sleep 2
curl -s http://localhost:8099/ > /tmp/site-index.html
```
Expected: `docker run` prints a container id; `curl` succeeds.

- [ ] **Step 2: Assert the override is applied and no sentinel remains**

Run:
```bash
grep -q 'https://app.override.test' /tmp/site-index.html && echo "URL OK"
grep -q '__APP_URL__' /tmp/site-index.html && echo "SENTINEL LEAKED" || echo "SENTINEL CLEAN"
```
Expected: `URL OK` and `SENTINEL CLEAN`.

- [ ] **Step 3: Tear down the verification container**

Run: `docker rm -f site-verify && docker rmi readmepls-site:verify readmepls-site:plan-check 2>/dev/null; echo done`
Expected: `done`.

- [ ] **Step 4: Run the full workspace checks**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all green. If any fail, fix before proceeding — do not claim done on red.

- [ ] **Step 5: Delete the shipped spec and plan**

Per CLAUDE.md working agreements, remove the spec and this plan once implemented and verified:

```bash
git rm docs/superpowers/specs/2026-07-15-landing-site-deploy-design.md \
       docs/superpowers/plans/2026-07-15-landing-site-deploy.md
git commit -m "chore: remove shipped landing-site deploy plan and spec"
```

---

## Self-Review

**Spec coverage:**
- site.ts APP_URL from env → Task 1. ✓
- Dockerfile multi-stage + sentinel bake → Task 3. ✓
- nginx entrypoint sed substitution → Task 2 (script) + Task 3 (wired into image). ✓
- compose `site` service → Task 4. ✓
- `.env.example` (`APP_URL`, `SITE_PORT`) → Task 4. ✓
- CI matrix entry → Task 5. ✓
- Tests: env resolver + substitution offline test → Tasks 1 & 2. ✓
- Verification (build, override reaches HTML, full suite) → Task 6. ✓
- Out of scope respected: no `apps/web` changes, no landing content/design changes, no reverse-proxy/TLS config. ✓

**Placeholder scan:** No TBD/TODO; all code and commands are concrete. Docker-unavailable fallbacks are explicit, not vague.

**Type/name consistency:** `APP_URL` (const), `PUBLIC_APP_URL` (env), sentinel `__APP_URL__`, `SITE_ROOT`/`APP_URL` script envs, `SITE_PORT` (default 3001), service name `site`, image `readmepls-site` — all used identically across tasks.
