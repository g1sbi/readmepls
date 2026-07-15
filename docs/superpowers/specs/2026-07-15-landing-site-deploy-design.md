# Serve landing page on root, webapp on `app.` subdomain — design

## Problem

`apps/site` already exists — a fully-built static SvelteKit landing page (Hero,
Features, HowItWorks, Footer, adapter-static). But it is never deployed: it has
no Dockerfile, no `compose.yml` service, and no CI image job. Its one
outward-facing link, `APP_URL`, is hardcoded to `https://app.readmepls.com`.

Meanwhile `apps/web` (the reader app, adapter-node) serves its home feed at `/`.
We want the marketing landing page on the root domain and the webapp on an
`app.` subdomain.

## Scope

**Wire the existing `apps/site` for deployment, and make its outward `APP_URL`
configurable at container runtime.** No landing-page content or design changes.
No change to `apps/web` routing.

### Explicitly out of scope
- Landing page content / visual design.
- Any change to `apps/web` (it uses only relative links, so it lives unchanged at
  the root of the `app.` subdomain).
- Subdomain routing / TLS. That is the operator's reverse proxy (Caddy in this
  deployment): `readmepls.com → site`, `app.readmepls.com → web`. The code is
  origin-agnostic.

## Key constraints

- `apps/site` is **adapter-static** — fully prerendered, no server to read env at
  runtime. So a configurable URL cannot be read live the way `apps/web`
  (adapter-node) reads `PUBLIC_PB_URL`. It must be baked at build **or** patched
  into the static files at container start.
- Self-host is first-class (per CLAUDE.md). An operator pulling the prebuilt GHCR
  image must be able to point the landing page at their own app subdomain
  **without rebuilding**. → **runtime substitution**, chosen below.
- The two apps are separate origins. The only cross-origin coupling is the
  landing page's "Open app" CTA, which needs an absolute `APP_URL` (a relative
  link cannot cross origins). No shared auth/cookies — root is static marketing
  with no auth, so this is a non-issue.

## Design

### 1. `apps/site/src/lib/site.ts` — resolve `APP_URL` from build env

```ts
export const APP_URL =
  import.meta.env.PUBLIC_APP_URL || "http://localhost:3000";
```

- Local dev (`vite dev`, env unset): defaults to `http://localhost:3000` (the web
  dev server's port), so the CTA works locally.
- Docker build: passes `PUBLIC_APP_URL=__APP_URL__`, so the sentinel token
  `__APP_URL__` lands in the prerendered `index.html` **and** the hashed JS
  bundle wherever the constant is used.

### 2. `apps/site/Dockerfile` — multi-stage

- **Build stage** (`node`/pnpm, same base pattern as `apps/web/Dockerfile`):
  install workspace deps, then
  `PUBLIC_APP_URL=__APP_URL__ pnpm --filter @readmepls/site build` → `build/`.
- **Serve stage** (`nginx:alpine`):
  - Copy `build/` → `/usr/share/nginx/html`.
  - Add `nginx.conf` with `try_files $uri $uri/ /index.html;`.
  - Add `/docker-entrypoint.d/10-app-url.sh` (nginx:alpine runs `*.sh` in this
    dir before starting nginx). It rewrites the sentinel across static files:
    ```sh
    : "${APP_URL:=https://app.readmepls.com}"
    find /usr/share/nginx/html -type f \( -name '*.html' -o -name '*.js' \) \
      -exec sed -i "s|__APP_URL__|${APP_URL}|g" {} +
    ```
    `|` delimiter is safe (URLs contain `/`, not `|`).
  - `HEALTHCHECK` fetching `/`.

### 3. `compose.yml` — add `site` service

```yaml
site:
  image: ghcr.io/${IMAGE_OWNER:-owner}/readmepls-site:latest
  build:
    context: .
    dockerfile: apps/site/Dockerfile
  restart: unless-stopped
  environment:
    APP_URL: ${APP_URL:-https://app.readmepls.com}
  ports:
    - "${SITE_PORT:-3001}:80"
```

Operator's reverse proxy maps root domain → `site:80` and `app.` → `web:3000`.

### 4. `.env.example` — add

```
# Absolute URL of the reader app, used by the landing page "Open app" CTA.
APP_URL=https://app.readmepls.com
# Host port for the landing site container (web holds 3000).
SITE_PORT=3001
```

### 5. `.github/workflows/docker-publish.yml` — add matrix entry

```yaml
- name: site
  dockerfile: apps/site/Dockerfile
```

## Testing (TDD)

- `apps/site/src/lib/site.test.ts` and `Hero.test.ts` currently assert the exact
  string `https://app.readmepls.com`. Rewrite to assert the resolver behavior:
  - `PUBLIC_APP_URL` set → `APP_URL` equals it.
  - unset → `APP_URL` equals the `http://localhost:3000` dev default.
  - `Hero` CTA `href` equals `APP_URL` (unchanged assertion, new source of truth).
- Substitution logic: extract the sed replacement into a form testable offline
  (e.g. a small shell/JS assertion over a fixture containing `__APP_URL__`), or a
  unit test of the token→value transform. Do not hit the network or require a
  running container in unit tests.

## Verification

- `pnpm test`, `pnpm typecheck`, `pnpm lint` green.
- `docker compose build site` succeeds; `docker compose up site` serves the
  landing page; with `APP_URL` overridden, the served `index.html` "Open app"
  href reflects the override (no sentinel remains).
