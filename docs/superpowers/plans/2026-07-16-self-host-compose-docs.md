# Self-host compose split + landing docs page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give self-hosters a Nextcloud-style "copy one compose.yml, set a few envs, go" experience, and add a `/docs` page on the landing site that documents it using the real `compose.yml`/`.env.example` content (no copy-drift).

**Architecture:** Split the monolithic root `compose.yml` into three files by audience — `compose.yml` (self-host: pull-only images, no landing page), `compose.dev.yml` (adds `build:` back, for `pnpm smoke`/contributors), `compose.site.yml` (adds the landing-page service, for the maintainer's own VPS). Mirror the split in env templates (`.env.example` / `.env.site.example`). The landing site (`apps/site`, plain Svelte + CSS, no Tailwind) gets a new top nav, a renamed footer link, and a `/docs` route whose server `load()` reads the real `compose.yml`/`.env.example` off disk at build time so the docs can never drift from the shipped files.

**Tech Stack:** Docker Compose, GitHub Actions, Bash, Node.js (`.mjs` script), SvelteKit (Svelte 5 runes, `adapter-static`, prerendered), Vitest + @testing-library/svelte.

## Global Constraints

- **TDD always** — write the failing test first, then the implementation (per repo working agreement).
- **Mobile-first, always responsive** — every new UI element must work at 360px wide: no horizontal overflow, tap targets ≥44px, no desktop-only layout.
- **`apps/site` has no Tailwind/shadcn** — it's plain Svelte components + `apps/site/src/app.css` CSS custom properties (`--ink`, `--accent`, `--muted`, `--faint`, `--surface-0/1/2`, `--fold`, `--font`). Never hardcode a hex color in a new component — use these existing vars, matching `Hero.svelte`/`Features.svelte`/`Footer.svelte` conventions.
- **Small commits, Conventional Commits** — one logical change per commit (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- **Never push or open a PR unless asked** — commit locally only.
- **TypeScript strict** — no `any` without a written reason.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `compose.yml` | Modify | Self-host stack: `pocketbase`, `web`, `worker` only, hardcoded `ghcr.io/g1sbi/...` images, no `build:` |
| `compose.dev.yml` | Create | Adds `build:` back for the 3 self-host services (contributors / `pnpm smoke`) |
| `compose.site.yml` | Create | Adds the `site` (landing page) service — maintainer's VPS only |
| `.env.example` | Modify | Self-host env vars only (drops `IMAGE_OWNER`) |
| `.env.site.example` | Create | `APP_URL`, `SITE_PORT` — only used with `compose.site.yml` |
| `scripts/env-parity-check.mjs` | Modify | Validates both compose/env pairs instead of one |
| `scripts/smoke-test.sh` | Modify | Builds via `compose.yml` + `compose.dev.yml` |
| `.github/workflows/docker-publish.yml` | Modify | Deploy job pulls/runs via `compose.yml` + `compose.site.yml` |
| `README.md` | Modify | Self-host section rewritten around the new files |
| `CLAUDE.md` | Modify | "Full stack via Docker" command note updated |
| `apps/site/src/lib/components/Nav.svelte` | Create | Top nav: wordmark, GitHub link, Docs link |
| `apps/site/src/lib/components/Nav.test.ts` | Create | Tests for `Nav.svelte` |
| `apps/site/src/routes/+layout.svelte` | Modify | Renders `<Nav />` above page content |
| `apps/site/src/lib/components/Footer.svelte` | Modify | "Self-host" link → "Docs" link, points at `/docs` |
| `apps/site/src/lib/components/Footer.test.ts` | Modify | Adds a test for the new Docs link |
| `apps/site/src/lib/components/CodeBlock.svelte` | Create | Copyable code block, reused by the docs page |
| `apps/site/src/lib/components/CodeBlock.test.ts` | Create | Tests for `CodeBlock.svelte` |
| `apps/site/src/routes/docs/+page.server.ts` | Create | Reads root `compose.yml`/`.env.example` at build time |
| `apps/site/src/routes/docs/+page.svelte` | Create | Self-hosting walkthrough, using `CodeBlock` |
| `apps/site/src/routes/docs/page.test.ts` | Create | Tests for the docs page |

---

## Task 1: Split compose.yml into self-host / dev / site files

**Files:**
- Modify: `compose.yml`
- Create: `compose.dev.yml`
- Create: `compose.site.yml`

**Interfaces:**
- Produces: three compose files self-hosters/contributors/the maintainer combine via `docker compose -f compose.yml [-f compose.dev.yml | -f compose.site.yml] ...`. Later tasks (env-parity script, smoke test, deploy workflow) depend on these exact filenames and the fact that `compose.yml` alone has no `build:` and no `site` service.

- [x] **Step 1: Rewrite `compose.yml` as the self-host-only file**

Replace the full file contents with:

```yaml
name: readmepls

services:
  pocketbase:
    image: ghcr.io/g1sbi/readmepls-pocketbase:latest
    restart: unless-stopped
    env_file: .env
    ports:
      - "${PB_PORT:-8090}:8090"
    volumes:
      - pb_data:/pb_data
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8090/api/health"]
      interval: 10s
      timeout: 3s
      start_period: 20s
      retries: 5

  web:
    image: ghcr.io/g1sbi/readmepls-web:latest
    restart: unless-stopped
    env_file: .env
    environment:
      PB_URL: http://pocketbase:8090
      # Browser-facing PB origin. From .env by default; overridable at runtime
      # (the smoke test injects a sentinel to prove it reaches the browser).
      PUBLIC_PB_URL: ${PUBLIC_PB_URL:-http://localhost:8090}
    ports:
      - "${WEB_PORT:-3000}:3000"
    depends_on:
      pocketbase:
        condition: service_healthy

  worker:
    image: ghcr.io/g1sbi/readmepls-worker:latest
    restart: unless-stopped
    env_file: .env
    environment:
      PB_URL: http://pocketbase:8090
      # Empty by default (real provider). The smoke test exports AI_PROVIDER=mock
      # so the worker completes jobs offline; overrides the .env value.
      AI_PROVIDER: ${AI_PROVIDER:-}
      # Bind the internal /search server to all interfaces so `web` can reach it
      # container-to-container (the worker defaults to loopback-only otherwise).
      WORKER_HTTP_HOST: 0.0.0.0
    expose:
      # Internal semantic /search endpoint — reachable only on the compose network,
      # never published to the host. `web` calls it with the shared secret.
      - "8091"
    volumes:
      # Persist the downloaded embedding model across restarts (first capture
      # fetches it once into TRANSFORMERS_CACHE=/data/models).
      - worker_models:/data/models
    depends_on:
      pocketbase:
        condition: service_healthy

volumes:
  pb_data:
  worker_models:
```

- [x] **Step 2: Create `compose.dev.yml`**

```yaml
# Layers `build:` back onto the self-host services in compose.yml, for
# building from source (contributors, `pnpm smoke`). Not used by self-hosters
# or the production deploy — see compose.yml and compose.site.yml.
services:
  pocketbase:
    build:
      context: .
      dockerfile: pocketbase/Dockerfile

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile

  worker:
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
```

- [x] **Step 3: Create `compose.site.yml`**

```yaml
# Adds the landing-page service. Only the maintainer's own deploy needs this —
# self-hosters never load this file.
services:
  site:
    image: ghcr.io/g1sbi/readmepls-site:latest
    build:
      context: .
      dockerfile: apps/site/Dockerfile
    restart: unless-stopped
    environment:
      APP_URL: ${APP_URL:-https://app.readmepls.com}
    ports:
      - "${SITE_PORT:-3001}:80"
```

- [x] **Step 4: Validate all three compose combinations parse and resolve**

`env_file: .env` requires the file to exist at config-resolution time, so
create one first if it's not already there:

```bash
[ -f .env ] || cp .env.example .env
docker compose -f compose.yml config >/dev/null && echo "compose.yml OK"
docker compose -f compose.yml -f compose.dev.yml config >/dev/null && echo "dev overlay OK"
docker compose -f compose.yml -f compose.site.yml config >/dev/null && echo "site overlay OK"
```
Expected: all three print their `OK` line with no YAML/merge errors.

- [x] **Step 5: Commit**

```bash
git add compose.yml compose.dev.yml compose.site.yml
git commit -m "feat(deploy): split compose.yml into self-host, dev, and site overlays"
```

---

## Task 2: Split .env.example into self-host / site templates

**Files:**
- Modify: `.env.example`
- Create: `.env.site.example`

**Interfaces:**
- Produces: `.env.example` (paired with `compose.yml` in Task 3's parity check) and `.env.site.example` (paired with `compose.site.yml`).

- [x] **Step 1: Rewrite `.env.example`, dropping the `# ---- Images ----` / `IMAGE_OWNER` block and the `# --- Landing site ---` block**

Replace the full file contents with:

```
# ---- AI provider ----
ANTHROPIC_API_KEY=
AI_MODEL=claude-haiku-4-5
# Leave empty for the real Claude provider. Set to "mock" ONLY for the smoke
# test (scripts/smoke-test.sh) to process jobs offline with no API key/cost.
AI_PROVIDER=

# ---- Deployment mode ----
# false (default) = hosted SaaS: tier is per-user, self-serve via /profile.
# true = self-hosted: tier is NOT per-user — everyone on this instance is Pro
# if ANTHROPIC_API_KEY is set (or AI_PROVIDER=mock), else everyone is Standard.
SELF_HOSTED=false

# ---- PocketBase superusers (provisioned on first boot) ----
# Human admin — log in at http://localhost:8090/_/
PB_ADMIN_EMAIL=admin@example.com
PB_ADMIN_PASSWORD=change-me-admin

# Dedicated worker superuser (separate, independently revocable)
PB_WORKER_EMAIL=worker@example.com
PB_WORKER_PASSWORD=change-me-worker

# ---- Service URLs ----
# Internal (container-to-container). Leave as-is for compose.
PB_URL=http://pocketbase:8090
# Browser-facing PocketBase URL (used by the web client).
PUBLIC_PB_URL=http://localhost:8090
# SvelteKit origin (CSRF/cookies) — must match the URL users hit.
ORIGIN=http://localhost:3000

# ---- Ports / runtime ----
PORT=3000
WEB_PORT=3000
PB_PORT=8090
WORKER_POLL_MS=2000

# ---- Semantic search embedding (worker) ----
# Leave EMBED_PROVIDER unset to use the local ONNX model (multilingual-e5-small,
# int8, no key, no inference-time network). Set EMBED_PROVIDER=fake for
# offline/deterministic runs (tests, smoke).
EMBED_PROVIDER=
# Where transformers.js caches the downloaded model (persist this in Docker).
TRANSFORMERS_CACHE=/data/models
# One-shot: set to 1 to embed all pre-existing content on next worker boot.
BACKFILL_EMBEDDINGS=

# ---- Semantic search query path (worker /search ↔ web) ----
# Shared secret protecting the worker's internal /search endpoint. Both the worker
# and the web app read it from this .env, so a single value here wires both sides.
# Generate: openssl rand -hex 32. Leave empty to disable semantic /search (the
# library then falls back to keyword-only search).
WORKER_SEARCH_SECRET=
# Port the worker serves /search on (internal compose network only).
WORKER_HTTP_PORT=8091
# Interface the worker binds /search to. In Docker this MUST be 0.0.0.0 so `web`
# can reach it (compose overrides this per-service); loopback-only otherwise.
WORKER_HTTP_HOST=0.0.0.0
# How the web app reaches the worker's /search (internal service URL).
WORKER_URL=http://worker:8091
```

- [x] **Step 2: Create `.env.site.example`**

```
# ---- Landing site (compose.site.yml) ----
# Not used by self-hosters — only the maintainer's own SaaS deploy runs the
# landing-page container alongside the reader app.

# Absolute URL of the reader app; the landing page "Open app" CTA points here.
# In production this is the app subdomain routed by your reverse proxy.
APP_URL=https://app.readmepls.com
# Host port for the landing-site container (web owns 3000).
SITE_PORT=3001
```

- [x] **Step 3: Sanity-check no other file still references the removed `IMAGE_OWNER` var**

Run:
```bash
grep -rn "IMAGE_OWNER" --include="*.md" --include="*.yml" --include="*.mjs" --include="*.sh" . | grep -v node_modules | grep -v docs/superpowers/specs
```
Expected: no output (empty) — confirms `compose.yml`/`compose.dev.yml`/`compose.site.yml` from Task 1 don't reference it either.

- [x] **Step 4: Commit**

```bash
git add .env.example .env.site.example
git commit -m "feat(deploy): split .env.example into self-host and site templates"
```

---

## Task 3: Update env-parity-check.mjs for two compose/env pairs

**Files:**
- Modify: `scripts/env-parity-check.mjs`

**Interfaces:**
- Consumes: `compose.yml`, `.env.example`, `compose.site.yml`, `.env.site.example` (from Tasks 1–2).
- Produces: `node scripts/env-parity-check.mjs` exits 0 and prints an OK line per pair, or exits 1 with the offending file names and missing vars.

- [x] **Step 1: Replace the full file contents**

```javascript
import { readFileSync, readdirSync, statSync } from "node:fs";

function referencedVars(relativePath) {
  const text = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return new Set(
    [...text.matchAll(/\$\{([A-Z0-9_]+)(?::-[^}]*)?\}/g)].map((m) => m[1])
  );
}

function declaredVars(relativePath) {
  const text = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return new Set(
    text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.split("=")[0])
  );
}

// Each compose file's ${VAR} references must all be declared in its paired
// env template. compose.yml/.env.example (self-host) and
// compose.site.yml/.env.site.example (landing page, maintainer-only) are
// independent pairs — self-hosters never load the site file, so its vars
// don't belong in .env.example.
const pairs = [
  { compose: "../compose.yml", env: "../.env.example" },
  { compose: "../compose.site.yml", env: "../.env.site.example" },
];

for (const { compose, env } of pairs) {
  const referenced = referencedVars(compose);
  const declared = declaredVars(env);
  const missing = [...referenced].filter((v) => !declared.has(v));
  if (missing.length) {
    console.error(`${compose} references vars absent from ${env}:`, missing);
    process.exit(1);
  }
  console.log(
    `env-parity OK: ${compose} — ${referenced.size} referenced vars all declared in ${env}`
  );
}

// --- code-vs-env: every PUBLIC_* read in web source must be declared in the
// self-host .env.example (the only env file `web` actually reads) ---
const declaredMain = declaredVars("../.env.example");
const webSrc = new URL("../apps/web/src/", import.meta.url);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = new URL(name, dir);
    if (statSync(full).isDirectory()) out.push(...walk(new URL(name + "/", dir)));
    else if (/\.(ts|js|svelte)$/.test(name)) out.push(full);
  }
  return out;
}

const usedPublic = new Set();
for (const file of walk(webSrc)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\bPUBLIC_[A-Z0-9_]+\b/g)) usedPublic.add(m[0]);
}

const undeclaredPublic = [...usedPublic].filter((v) => !declaredMain.has(v));
if (undeclaredPublic.length) {
  console.error(
    "web source uses PUBLIC_* vars absent from .env.example:",
    undeclaredPublic
  );
  process.exit(1);
}
console.log(`env-parity OK: ${usedPublic.size} PUBLIC_* code vars all declared`);
```

- [x] **Step 2: Run it and confirm it passes for both pairs**

Run: `node scripts/env-parity-check.mjs`
Expected output (order matters — pairs run in the order listed):
```
env-parity OK: ../compose.yml — <N> referenced vars all declared in ../.env.example
env-parity OK: ../compose.site.yml — 2 referenced vars all declared in ../.env.site.example
env-parity OK: <M> PUBLIC_* code vars all declared
```
(exact `<N>`/`<M>` counts depend on current vars — just confirm exit code 0 and three OK lines, no `missing`/`undeclared` errors.)

- [x] **Step 3: Prove the check actually catches a break (regression test for the script itself)**

Edit `compose.site.yml`, temporarily adding one line under `site.environment:`
so it reads:
```yaml
    environment:
      APP_URL: ${APP_URL:-https://app.readmepls.com}
      TEST_VAR: ${NOT_DECLARED_VAR}
```
Run: `node scripts/env-parity-check.mjs`
Expected: exits 1, printing
`compose.site.yml references vars absent from ../.env.site.example: [ 'NOT_DECLARED_VAR' ]`.

Then revert the throwaway line:
```bash
git checkout -- compose.site.yml
```

- [x] **Step 4: Commit**

```bash
git add scripts/env-parity-check.mjs
git commit -m "test(deploy): extend env-parity-check to the site compose/env pair"
```

---

## Task 4: Update smoke-test.sh to build via compose.yml + compose.dev.yml

**Files:**
- Modify: `scripts/smoke-test.sh`

**Interfaces:**
- Consumes: `compose.yml`, `compose.dev.yml` (Task 1), `.env.example` (Task 2, copied to `.env` if absent).

- [x] **Step 1: Replace the full file contents**

```bash
#!/usr/bin/env bash
# End-to-end self-host smoke test: boots the full stack with `docker compose`,
# verifies all three services come up, then drives one job through the worker
# and asserts it reaches `done`.
#
# Determinism: the worker runs with AI_PROVIDER=mock (no Anthropic key/cost). The
# web app on this branch has no auth yet, so the job is seeded directly via the
# PocketBase superuser REST API rather than POSTed to /api/capture. The worker
# still performs a real HTTP fetch of the seeded URL (example.com — RFC-2606
# reserved and stable), so a network connection is required.
set -euo pipefail

cd "$(dirname "$0")/.."

PB_PORT="${PB_PORT:-8090}"
WEB_PORT="${WEB_PORT:-3000}"
SEED_URL="https://example.com"
# compose.yml alone has no build: blocks (self-hosters pull pre-built images);
# compose.dev.yml layers build: back in so this test builds from source.
COMPOSE=(docker compose -f compose.yml -f compose.dev.yml)

cleanup() { "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

[ -f .env ] || cp .env.example .env
# Admin creds for the REST calls below.
set -a; . ./.env; set +a

echo "==> building + starting stack (worker in mock-AI mode)"
# Sentinel proves the browser-facing PB URL is injected at runtime (not baked).
export PUBLIC_PB_URL="http://pb.smoke.test:8090"
AI_PROVIDER=mock "${COMPOSE[@]}" up -d --build

wait_for() { # <name> <url>
  for i in $(seq 1 30); do
    if curl -fsS "$2" >/dev/null 2>&1; then echo "$1 up"; return 0; fi
    sleep 2
  done
  echo "$1 never came up: $2"; "${COMPOSE[@]}" logs "$1"; exit 1
}

echo "==> waiting for pocketbase health"
wait_for pocketbase "http://localhost:${PB_PORT}/api/health"

echo "==> waiting for web"
# adapter-node returns 404 on / before routes exist; treat any HTTP reply as up.
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${WEB_PORT}/" || true)
  if [ "$code" != "000" ] && [ -n "$code" ]; then echo "web responding ($code)"; break; fi
  [ "$i" = "30" ] && { echo "web never responded"; "${COMPOSE[@]}" logs web; exit 1; }
  sleep 2
done

echo "==> asserting runtime PUBLIC_PB_URL reached the browser bundle"
# SvelteKit serves the full public env unconditionally at /_app/env.js
# (export const env={...}); layout-independent, so this can't false-fail.
PUBLIC_ENV_JS=$(curl -fsS "http://localhost:${WEB_PORT}/_app/env.js")
case "$PUBLIC_ENV_JS" in
  *pb.smoke.test:8090*) echo "runtime PB URL present in public env" ;;
  *) echo "PUBLIC_PB_URL sentinel missing from /_app/env.js — runtime env not wired";
     "${COMPOSE[@]}" logs web; exit 1 ;;
esac

echo "==> authenticating as PocketBase superuser"
TOKEN=$(curl -fsS -X POST \
  "http://localhost:${PB_PORT}/api/collections/_superusers/auth-with-password" \
  -H 'Content-Type: application/json' \
  -d "{\"identity\":\"${PB_ADMIN_EMAIL}\",\"password\":\"${PB_ADMIN_PASSWORD}\"}" \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "superuser auth failed"; exit 1; }

echo "==> seeding a queued job for ${SEED_URL}"
curl -fsS -X POST "http://localhost:${PB_PORT}/api/collections/jobs/records" \
  -H "Authorization: ${TOKEN}" -H 'Content-Type: application/json' \
  -d "{\"user\":\"smoke\",\"canonical_url\":\"${SEED_URL}\",\"type\":\"extract\",\"status\":\"queued\",\"attempts\":0}" \
  >/dev/null

echo "==> waiting for the worker to mark the job done"
for i in $(seq 1 30); do
  STATUS=$(curl -fsS -H "Authorization: ${TOKEN}" \
    "http://localhost:${PB_PORT}/api/collections/jobs/records?filter=$(printf 'canonical_url="%s"' "$SEED_URL")" \
    | sed -n 's/.*"status":"\([a-z]*\)".*/\1/p' | head -n1)
  echo "   job status: ${STATUS:-<none>}"
  [ "$STATUS" = "done" ] && { echo "==> SMOKE PASS"; exit 0; }
  [ "$STATUS" = "failed" ] && { echo "worker marked job failed"; "${COMPOSE[@]}" logs worker; exit 1; }
  sleep 2
done

echo "worker did not finish the job in time"; "${COMPOSE[@]}" logs worker; exit 1
```

- [x] **Step 2: Run the smoke test**

Run: `pnpm smoke`
Expected: ends with `==> SMOKE PASS` and exit code 0. (Requires network access for the worker's real HTTP fetch of `example.com`, per the script's own header comment.)

- [x] **Step 3: Commit**

```bash
git add scripts/smoke-test.sh
git commit -m "test(deploy): build the smoke stack via compose.dev.yml overlay"
```

---

## Task 5: Update the deploy job to use compose.yml + compose.site.yml

**Files:**
- Modify: `.github/workflows/docker-publish.yml`

**Interfaces:**
- Consumes: `compose.yml`, `compose.site.yml` (Task 1) — assumed already present in `secrets.VPS_APP_DIR` on the VPS.

- [x] **Step 1: Update the deploy job's SSH script**

In the `deploy` job's `script:` block, replace:

```yaml
          script: |
            cd ${{ secrets.VPS_APP_DIR }}
            docker compose pull
            docker compose up -d
            docker image prune -f
```

with:

```yaml
          script: |
            cd ${{ secrets.VPS_APP_DIR }}
            docker compose -f compose.yml -f compose.site.yml pull
            docker compose -f compose.yml -f compose.site.yml up -d
            docker image prune -f
```

- [x] **Step 2: Validate the workflow YAML still parses**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/docker-publish.yml'))" && echo "YAML OK"
```
Expected: `YAML OK`, no exception.

- [x] **Step 3: Commit**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "fix(deploy): pull/run the VPS stack via compose.yml + compose.site.yml"
```

**Note for the human operator (not part of this task's automation):** before the next deploy runs, copy `compose.site.yml` and a merged `.env` (self-host vars + `APP_URL`/`SITE_PORT`) into `VPS_APP_DIR` alongside the existing `compose.yml` — the workflow now expects both files there.

---

## Task 6: Update README.md and CLAUDE.md self-host docs

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:** None (documentation only).

- [x] **Step 1: Replace the "## Self Hosting" section in `README.md`**

Replace:
```markdown
## Self Hosting
Wanna build your own, personal library? Got you covered there too. The app is easily self-hostable, with an optional bring-your-own-key approach to the AI features.
```

with:
```markdown
## Self Hosting

Wanna build your own, personal library? Got you covered there too — the app
is easily self-hostable, with an optional bring-your-own-key approach to the
AI features. Full walkthrough: [readmepls.com/docs](https://readmepls.com/docs).

1. Grab [`compose.yml`](compose.yml) and [`.env.example`](.env.example) from
   this repo — no need to clone it.
2. Rename `.env.example` to `.env` and fill in the PocketBase admin/worker
   passwords (and, optionally, `ANTHROPIC_API_KEY` to turn AI features on for
   everyone using your instance).
3. `docker compose pull && docker compose up -d`

Data persists in the `pb_data` volume.
```

- [x] **Step 2: Update the Docker command note in `CLAUDE.md`**

Replace:
```markdown
- Full stack via Docker: `cp .env.example .env` then `docker compose up -d` (see README.md for required env vars)
```

with:
```markdown
- Full stack via Docker: `cp .env.example .env` then `docker compose up -d`
  (pulls published images; see README.md for self-host setup). To build from
  source instead: `docker compose -f compose.yml -f compose.dev.yml up -d --build`.
```

- [x] **Step 3: Read both files back to confirm the edits landed cleanly**

Run: `git diff README.md CLAUDE.md`
Expected: a clean diff showing exactly the two replacements above, nothing else changed.

- [x] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: rewrite self-host instructions around the compose file split"
```

---

## Task 7: Add Nav.svelte and wire it into the layout

**Files:**
- Create: `apps/site/src/lib/components/Nav.svelte`
- Create: `apps/site/src/lib/components/Nav.test.ts`
- Modify: `apps/site/src/routes/+layout.svelte`
- Test: `apps/site/src/lib/components/Nav.test.ts`

**Interfaces:**
- Consumes: `GITHUB_URL` from `$lib/site` (existing export, see `apps/site/src/lib/site.ts:11`).
- Produces: `Nav.svelte` — a Svelte component with no props, rendering a `GitHub` link (`href={GITHUB_URL}`) and a `Docs` link (`href="/docs"`).

- [x] **Step 1: Write the failing test**

Create `apps/site/src/lib/components/Nav.test.ts`:
```typescript
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Nav from "./Nav.svelte";
import { GITHUB_URL } from "$lib/site";

test("renders the GitHub link", () => {
  render(Nav);
  const gh = screen.getByRole("link", { name: "GitHub" });
  expect(gh.getAttribute("href")).toBe(GITHUB_URL);
});

test("renders the Docs link pointing at /docs", () => {
  render(Nav);
  const docs = screen.getByRole("link", { name: "Docs" });
  expect(docs.getAttribute("href")).toBe("/docs");
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @readmepls/site test -- Nav.test.ts` (or `pnpm exec vitest run apps/site/src/lib/components/Nav.test.ts` from repo root, per this repo's testing convention)
Expected: FAIL — `Nav.svelte` doesn't exist yet.

- [x] **Step 3: Create `Nav.svelte`**

```svelte
<script lang="ts">
  import { GITHUB_URL } from "$lib/site";
</script>

<header class="nav">
  <a class="wordmark" href="/">readme<span class="pls">pls</span></a>
  <nav class="links">
    <a href={GITHUB_URL}>GitHub</a>
    <a href="/docs">Docs</a>
  </nav>
</header>

<style>
  .nav {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 1.25rem 1.5rem;
    max-width: 1100px;
    margin: 0 auto;
  }
  .wordmark {
    text-decoration: none;
    font-weight: 600;
    font-size: 1.25rem;
    color: var(--ink);
  }
  .pls {
    color: var(--accent);
  }
  .links {
    display: flex;
    gap: 1.25rem;
  }
  .links a {
    text-decoration: none;
    font-weight: 600;
    color: var(--ink);
    padding: 0.5rem 0;
  }
  .links a:hover {
    color: var(--accent);
  }
</style>
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @readmepls/site test -- Nav.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Wire `Nav` into the shared layout**

Modify `apps/site/src/routes/+layout.svelte` — replace:
```svelte
<script lang="ts">
  import "@fontsource-variable/fredoka";
  import "../app.css";

  let { children } = $props();
</script>

{@render children()}
```

with:
```svelte
<script lang="ts">
  import "@fontsource-variable/fredoka";
  import "../app.css";
  import Nav from "$lib/components/Nav.svelte";

  let { children } = $props();
</script>

<Nav />
{@render children()}
```

- [x] **Step 6: Run the full site test suite to confirm nothing else broke**

Run: `pnpm --filter @readmepls/site test`
Expected: all tests pass, including the existing `page.test.ts` (which renders `+page.svelte` directly, not the layout, so it's unaffected by the layout change).

- [x] **Step 7: Commit**

```bash
git add apps/site/src/lib/components/Nav.svelte apps/site/src/lib/components/Nav.test.ts apps/site/src/routes/+layout.svelte
git commit -m "feat(site): add a top nav with GitHub and Docs links"
```

---

## Task 8: Point the footer's self-host link at /docs

**Files:**
- Modify: `apps/site/src/lib/components/Footer.svelte`
- Modify: `apps/site/src/lib/components/Footer.test.ts`

**Interfaces:**
- Produces: `Footer.svelte`'s second link now reads "Docs" and points at `/docs` (was "Self-host" → `GITHUB_URL`).

- [x] **Step 1: Write the failing test**

Add to `apps/site/src/lib/components/Footer.test.ts` (append after the existing two tests):
```typescript
test("renders the Docs link pointing at /docs", () => {
  render(Footer);
  const docs = screen.getByRole("link", { name: "Docs" });
  expect(docs.getAttribute("href")).toBe("/docs");
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @readmepls/site test -- Footer.test.ts`
Expected: FAIL — no link named "Docs" exists yet (current link is named "Self-host").

- [x] **Step 3: Update `Footer.svelte`**

Replace:
```svelte
<footer class="footer">
  <nav class="links">
    <a href={GITHUB_URL}>GitHub</a>
    <a href={GITHUB_URL}>Self-host</a>
  </nav>
  <p class="meta">open source · self-hostable</p>
</footer>
```

with:
```svelte
<footer class="footer">
  <nav class="links">
    <a href={GITHUB_URL}>GitHub</a>
    <a href="/docs">Docs</a>
  </nav>
  <p class="meta">open source · self-hostable</p>
</footer>
```

(Only the `<footer>` markup changes — the `<script>` and `<style>` blocks are unchanged.)

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @readmepls/site test -- Footer.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add apps/site/src/lib/components/Footer.svelte apps/site/src/lib/components/Footer.test.ts
git commit -m "feat(site): point the footer's self-host link at /docs"
```

---

## Task 9: Add a reusable CodeBlock component

**Files:**
- Create: `apps/site/src/lib/components/CodeBlock.svelte`
- Create: `apps/site/src/lib/components/CodeBlock.test.ts`

**Interfaces:**
- Produces: `CodeBlock.svelte` accepting a single prop `code: string`, rendering it verbatim in a `<pre><code>` block with a copy-to-clipboard button. Consumed by the docs page (Task 10) via `<CodeBlock code={...} />`.

- [x] **Step 1: Write the failing tests**

Create `apps/site/src/lib/components/CodeBlock.test.ts`:
```typescript
import { render, screen, fireEvent } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import CodeBlock from "./CodeBlock.svelte";

test("renders the given code verbatim", () => {
  render(CodeBlock, { props: { code: "docker compose pull" } });
  expect(screen.getByText("docker compose pull")).toBeTruthy();
});

test("copies the code to the clipboard on click", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });

  render(CodeBlock, { props: { code: "docker compose up -d" } });
  await fireEvent.click(screen.getByRole("button", { name: "copy" }));

  expect(writeText).toHaveBeenCalledWith("docker compose up -d");
  expect(await screen.findByText("copied!")).toBeTruthy();
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @readmepls/site test -- CodeBlock.test.ts`
Expected: FAIL — `CodeBlock.svelte` doesn't exist yet.

- [x] **Step 3: Create `CodeBlock.svelte`**

```svelte
<script lang="ts">
  let { code }: { code: string } = $props();
  let copied = $state(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="code-block">
  <button class="copy" type="button" onclick={copy}>{copied ? "copied!" : "copy"}</button>
  <pre><code>{code}</code></pre>
</div>

<style>
  .code-block {
    position: relative;
    text-align: left;
    background: var(--surface-1);
    border: 1px solid var(--fold);
    border-radius: 16px;
    padding: 1.25rem;
    overflow-x: auto;
  }
  pre {
    margin: 0;
    font-family: "Fira Code", "SFMono-Regular", Consolas, monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    white-space: pre;
  }
  .copy {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    font-family: var(--font);
    font-weight: 600;
    font-size: 0.75rem;
    border: 1px solid var(--fold);
    border-radius: 999px;
    background: var(--surface-0);
    color: var(--ink);
    padding: 0.35rem 0.9rem;
    cursor: pointer;
  }
  .copy:hover {
    color: var(--accent);
    border-color: var(--accent);
  }
</style>
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @readmepls/site test -- CodeBlock.test.ts`
Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```bash
git add apps/site/src/lib/components/CodeBlock.svelte apps/site/src/lib/components/CodeBlock.test.ts
git commit -m "feat(site): add a copyable CodeBlock component"
```

---

## Task 10: Add the /docs route

**Files:**
- Create: `apps/site/src/routes/docs/+page.server.ts`
- Create: `apps/site/src/routes/docs/+page.svelte`
- Create: `apps/site/src/routes/docs/page.test.ts`

**Interfaces:**
- Consumes: `CodeBlock` (Task 9, `props: { code: string }`), `GITHUB_URL` from `$lib/site`.
- Produces: route `/docs`, prerendered (inherits `export const prerender = true` from `apps/site/src/routes/+layout.ts:1`). `+page.server.ts` exports `load: PageServerLoad` returning `{ compose: string, envExample: string }`, consumed by `+page.svelte` via `let { data } = $props()`.

- [x] **Step 1: Write the failing test**

Create `apps/site/src/routes/docs/page.test.ts`:
```typescript
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Page from "./+page.svelte";

const data = {
  compose:
    "name: readmepls\nservices:\n  pocketbase:\n    image: ghcr.io/g1sbi/readmepls-pocketbase:latest\n",
  envExample: "PB_ADMIN_EMAIL=admin@example.com\n",
};

test("renders the self-hosting steps", () => {
  render(Page, { props: { data } });
  expect(screen.getByRole("heading", { name: /self-hosting/i })).toBeTruthy();
  expect(screen.getByText(/prerequisites/i)).toBeTruthy();
  expect(screen.getByText(/docker compose pull/)).toBeTruthy();
});

test("renders the loaded compose.yml content verbatim", () => {
  render(Page, { props: { data } });
  expect(screen.getByText(/readmepls-pocketbase:latest/)).toBeTruthy();
});

test("renders the AI on/off explainer, not a tiers/plans pitch", () => {
  render(Page, { props: { data } });
  expect(screen.getByText(/no tiers, no plans, no subscriptions/i)).toBeTruthy();
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @readmepls/site test -- docs/page.test.ts`
Expected: FAIL — `apps/site/src/routes/docs/+page.svelte` doesn't exist yet.

- [x] **Step 3: Create `+page.server.ts`**

```typescript
import { readFileSync } from "node:fs";
import type { PageServerLoad } from "./$types";

// Reads the actual repo-root compose.yml/.env.example at build time (this
// route is prerendered — see ../+layout.ts) so the docs page can never drift
// from the files self-hosters actually copy.
export const load: PageServerLoad = () => {
  const compose = readFileSync(
    new URL("../../../../../compose.yml", import.meta.url),
    "utf8"
  );
  const envExample = readFileSync(
    new URL("../../../../../.env.example", import.meta.url),
    "utf8"
  );
  return { compose, envExample };
};
```

- [x] **Step 4: Create `+page.svelte`**

```svelte
<script lang="ts">
  import type { PageData } from "./$types";
  import CodeBlock from "$lib/components/CodeBlock.svelte";
  import { GITHUB_URL } from "$lib/site";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>readmepls — docs</title>
</svelte:head>

<main class="docs">
  <h1>self-hosting</h1>
  <p class="lede">
    run your own copy on your own box. no clone needed — grab two files, fill
    in a few secrets, and you're reading.
  </p>

  <section>
    <h2>1. prerequisites</h2>
    <p>Docker and Docker Compose. That's it.</p>
  </section>

  <section>
    <h2>2. copy compose.yml</h2>
    <p>Save this as <code>compose.yml</code> in a new directory:</p>
    <CodeBlock code={data.compose} />
  </section>

  <section>
    <h2>3. copy .env.example → .env</h2>
    <p>
      Save this as <code>.env</code> next to it, then fill in the PocketBase
      admin/worker passwords.
    </p>
    <CodeBlock code={data.envExample} />
  </section>

  <section>
    <h2>4. pull and run</h2>
    <CodeBlock code={"docker compose pull\ndocker compose up -d"} />
    <p>
      Open <code>http://localhost:3000</code> (or whatever <code>WEB_PORT</code>
      you set).
    </p>
  </section>

  <section>
    <h2>5. updating</h2>
    <p>Same command as above — pulls the latest images and restarts:</p>
    <CodeBlock code={"docker compose pull\ndocker compose up -d"} />
  </section>

  <section>
    <h2>6. data</h2>
    <p>
      Everything lives in the <code>pb_data</code> Docker volume. Back that up,
      back up everything that matters.
    </p>
  </section>

  <section>
    <h2>7. AI features: on or off</h2>
    <p>
      Self-hosting has no tiers, no plans, no subscriptions — that's a
      hosted-SaaS thing. The reader is fully functional with nothing set. Add
      an <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and AI features
      (auto-tagging and friends) switch on for everyone using your instance.
      One switch, not a choice between plans.
    </p>
  </section>

  <p class="more">
    Questions or something looks off? Open an issue on
    <a href={GITHUB_URL}>GitHub</a>.
  </p>
</main>

<style>
  .docs {
    position: relative;
    z-index: 1;
    max-width: 720px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
  }
  h1 {
    font-weight: 600;
    font-size: clamp(2rem, 7vw, 3rem);
    letter-spacing: -0.02em;
    margin-bottom: 0.75rem;
  }
  .lede {
    color: var(--muted);
    font-size: 1.1rem;
    margin-bottom: 2.5rem;
  }
  section {
    margin-bottom: 2.25rem;
  }
  h2 {
    font-weight: 600;
    font-size: 1.3rem;
    margin-bottom: 0.6rem;
  }
  p {
    color: var(--muted);
    line-height: 1.6;
  }
  code {
    font-family: "Fira Code", "SFMono-Regular", Consolas, monospace;
    font-size: 0.9em;
    background: var(--surface-1);
    border-radius: 4px;
    padding: 0.1em 0.35em;
    color: var(--ink);
  }
  .more {
    margin-top: 3rem;
  }
  .more a {
    font-weight: 600;
    color: var(--ink);
  }
  .more a:hover {
    color: var(--accent);
  }
</style>
```

- [x] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @readmepls/site test -- docs/page.test.ts`
Expected: PASS (3 tests).

- [x] **Step 6: Verify the file-path resolution in `+page.server.ts` is correct**

The relative path `../../../../../compose.yml` from
`apps/site/src/routes/docs/+page.server.ts` must resolve to the repo-root
`compose.yml`. Confirm with:
```bash
node -e '
const path = require("path");
console.log(path.relative(
  path.resolve("apps/site/src/routes/docs"),
  path.resolve("compose.yml")
));
'
```
Expected: `../../../../../compose.yml` (5 levels — `docs` → `routes` → `src` → `site` → `apps` → repo root), matching the path used in Step 3.

- [x] **Step 7: Start the dev server and manually confirm `/docs` renders correctly in a browser**

Run: `pnpm --filter @readmepls/site dev`, open `http://localhost:5173/docs` (or whatever port Vite prints).
Expected: the page loads with no errors, all 7 sections render, both code blocks show the real contents of the repo's `compose.yml` and `.env.example` (not the test fixture), the copy buttons work, and the layout is usable at a 360px-wide viewport (use the browser's device toolbar). Also click "Docs" in both the top nav and the footer from `/` to confirm both links land here.

- [x] **Step 8: Run the full site test suite and the repo-wide env-parity/typecheck/lint checks**

Run:
```bash
pnpm --filter @readmepls/site test
pnpm --filter @readmepls/site check
pnpm env:check
```
Expected: all pass with no errors.

- [x] **Step 9: Commit**

```bash
git add apps/site/src/routes/docs
git commit -m "feat(site): add a /docs page walking through self-hosting"
```

---

## Final verification (after all tasks)

- [x] Run `pnpm test` (whole workspace) — all pass.
- [x] Run `pnpm typecheck` and `pnpm lint` — both clean.
- [x] Run `pnpm smoke` — ends in `SMOKE PASS` (proves `compose.dev.yml` still builds and boots the real stack).
- [x] Run `docker compose -f compose.yml config`, `-f compose.dev.yml config`, and `-f compose.site.yml config` — all resolve without error.
- [x] In a browser (`pnpm --filter @readmepls/site dev`): visit `/`, confirm the new top nav appears above `Hero` with working GitHub/Docs links, scroll to the footer and confirm its Docs link also points at `/docs`; visit `/docs` directly and confirm all 7 sections and both code blocks render.
- [ ] Delete this plan and its paired spec (`docs/superpowers/specs/2026-07-16-self-host-compose-docs-design.md`) once merged, per the repo's working agreement on parked/shipped plans.
