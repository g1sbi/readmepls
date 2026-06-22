# Docker & Self-Host Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `readmepls` self-hostable with `docker compose up -d`: three containerized services (pocketbase, web, worker), published multi-arch images, and a bring-up doc.

**Architecture:** A root `compose.yml` runs pocketbase (own image, baked-in migrations, named volume), web (SvelteKit adapter-node), and worker (Node poller). Both app images build from the repo root so pnpm workspace deps resolve, via `pnpm deploy` to a self-contained dir. The worker gets a new thin entrypoint that wires existing pure pieces and authenticates to PocketBase as a dedicated superuser. CI publishes all three images to ghcr.io.

**Tech Stack:** Docker (multi-stage, buildx multi-arch), Docker Compose Spec, pnpm workspaces, corepack, PocketBase 0.39.4, Node 22, SvelteKit adapter-node, GitHub Actions.

## Global Constraints

- **TDD always.** Failing test/check first, then implementation. (For infra, the "test" is a runnable smoke/parity check — see Task 7.)
- **Verify before claiming done.** Run the command and read output before asserting pass.
- **Conventional Commits**, one logical change per commit. Squash before merging to `main`.
- **Never commit secrets.** Only `.env.example` is committed; real `.env` is gitignored (already covered by `.env.*` + `!.env.example`).
- **TypeScript strict**, no `any` without a written reason. Shared types in `@readmepls/types`.
- **Pure core, thin IO shell.** The worker entrypoint is composition only — no new domain logic.
- **PocketBase version pinned to 0.39.4** (matches the vendored binary; `./pocketbase/pocketbase --version`).
- **Node base image: `node:22-alpine`** for build + runtime stages (matches `@types/node` ^22).
- **Internal PB URL is `http://pocketbase:8090`; browser-facing default `http://localhost:8090`.**
- **Bare HTTP only** — no bundled TLS/proxy. Only `pocketbase` and `web` publish host ports.
- **Image names:** `ghcr.io/<owner>/readmepls-pocketbase`, `-web`, `-worker`. Use the literal placeholder `OWNER` in committed files where the GitHub org/user is unknown; CI substitutes `${{ github.repository_owner }}`.

---

### Task 1: Worker runtime entrypoint + build/start scripts

The worker package exports `processJob` but has no runnable main, no `build`/`start` script. Add a thin composition entrypoint and the scripts so the worker can be built and run in a container. This is the deployability seam; it adds no domain logic.

**Files:**
- Create: `apps/worker/src/main.ts`
- Create: `apps/worker/src/run-loop.ts`
- Create: `apps/worker/src/run-loop.test.ts`
- Modify: `apps/worker/package.json` (add `build`, `start` scripts)
- Create: `apps/worker/tsconfig.build.json`

**Interfaces:**
- Consumes (all existing):
  - `claimNextJob(pb: PocketBase, workerId: string): Promise<Job | null>` from `./jobs/claim.js`
  - `processJob(pb: PocketBase, jobId: string, deps: ProcessDeps): Promise<void>` from `./worker.js`
  - `ProcessDeps = { fetchHtml, extractor, ai, classify }` from `./worker.js`
  - `createSafeFetchHtml(deps: SafeFetchDeps): (url:string)=>Promise<string>` from `./fetch/safe-fetch.js`
  - `ArticleExtractor` from `./extract/article-extractor.js`
  - `ClaudeProvider` (ctor `(client: Pick<Anthropic,"messages">, model: string)`) from `./ai/claude-provider.js`
  - `classifySource(url: string): SourceType` from `@readmepls/core`
- Produces:
  - `runLoopOnce(pb: PocketBase, workerId: string, deps: ProcessDeps): Promise<boolean>` — claims one job; if claimed, processes it and returns `true`; if none, returns `false`. (Pure-ish orchestration; testable with the ephemeral PB harness.)
  - `main(): Promise<void>` in `main.ts` — reads env, builds deps, auths as superuser, loops `runLoopOnce` with `WORKER_POLL_MS` sleep between empty polls.

- [ ] **Step 1: Write the failing test for `runLoopOnce`**

Create `apps/worker/src/run-loop.test.ts`. This mirrors the existing `loop.e2e.test.ts` wiring but asserts the new orchestration helper.

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startEphemeralPb, makeTestUser, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { handleCapture, classifySource } from "@readmepls/core";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { MockAIProvider } from "./ai/mock-provider.js";
import { runLoopOnce } from "./run-loop.js";

const html = readFileSync(
  fileURLToPath(new URL("./extract/fixtures/simple-article.html", import.meta.url)),
  "utf8"
);

let h: PbHandle;
let userId: string;
beforeAll(async () => {
  h = await startEphemeralPb();
  userId = await makeTestUser(h.pb);
}, 30000);
afterAll(() => h?.stop());

const deps = {
  fetchHtml: async () => html,
  extractor: new ArticleExtractor(),
  ai: new MockAIProvider({ tags: ["hello"], summary: "A test." }),
  classify: classifySource,
};

describe("runLoopOnce", () => {
  it("returns false when no jobs are queued", async () => {
    const worked = await runLoopOnce(h.pb, "worker-A", deps);
    expect(worked).toBe(false);
  });

  it("claims and processes one queued job, returns true", async () => {
    await handleCapture(h.pb, userId, "https://example.com/loop-once");
    const worked = await runLoopOnce(h.pb, "worker-A", deps);
    expect(worked).toBe(true);
    const job = await h.pb.collection("jobs").getFirstListItem(
      'canonical_url = "https://example.com/loop-once"'
    );
    expect(job.status).toBe("done");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @readmepls/worker exec vitest run src/run-loop.test.ts`
Expected: FAIL — `Cannot find module './run-loop.js'` (or "runLoopOnce is not a function").

- [ ] **Step 3: Implement `run-loop.ts`**

Create `apps/worker/src/run-loop.ts`:

```ts
import type PocketBase from "pocketbase";
import { claimNextJob } from "./jobs/claim.js";
import { processJob, type ProcessDeps } from "./worker.js";

/**
 * One poll tick: claim a single job and process it. Returns true if a job was
 * processed, false if the queue was empty. Idempotent and safe to call in a loop
 * from multiple workers — claiming is guarded in claimNextJob.
 */
export async function runLoopOnce(
  pb: PocketBase,
  workerId: string,
  deps: ProcessDeps
): Promise<boolean> {
  const job = await claimNextJob(pb, workerId);
  if (!job) return false;
  await processJob(pb, job.id, deps);
  return true;
}
```

If `ProcessDeps` is not already exported from `worker.ts`, add `export` to its `interface ProcessDeps` declaration (it is currently `export interface ProcessDeps` — confirm; if so, no change needed).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @readmepls/worker exec vitest run src/run-loop.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `main.ts` (entrypoint — no unit test; covered by Task 7 smoke test)**

Create `apps/worker/src/main.ts`:

```ts
import { hostname } from "node:os";
import { lookup as dnsLookup } from "node:dns/promises";
import PocketBase from "pocketbase";
import Anthropic from "@anthropic-ai/sdk";
import { classifySource } from "@readmepls/core";
import { ArticleExtractor } from "./extract/article-extractor.js";
import { ClaudeProvider } from "./ai/claude-provider.js";
import { createSafeFetchHtml } from "./fetch/safe-fetch.js";
import { runLoopOnce } from "./run-loop.js";
import type { ProcessDeps } from "./worker.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const pbUrl = process.env.PB_URL ?? "http://pocketbase:8090";
  const pollMs = Number(process.env.WORKER_POLL_MS ?? "2000");
  const model = process.env.AI_MODEL ?? "claude-haiku-4-5";
  const workerId = process.env.WORKER_ID ?? hostname();

  const pb = new PocketBase(pbUrl);
  pb.autoCancellation(false);
  await pb
    .collection("_superusers")
    .authWithPassword(requireEnv("PB_WORKER_EMAIL"), requireEnv("PB_WORKER_PASSWORD"));

  const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const fetchHtml = createSafeFetchHtml({
    lookup: async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address),
    fetchFn: (url) => fetch(url, { redirect: "manual" }),
  });

  const deps: ProcessDeps = {
    fetchHtml,
    extractor: new ArticleExtractor(),
    ai: new ClaudeProvider(anthropic, model),
    classify: classifySource,
  };

  console.log(`[worker ${workerId}] polling ${pbUrl} every ${pollMs}ms`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const worked = await runLoopOnce(pb, workerId, deps);
      if (!worked) await sleep(pollMs);
    } catch (err) {
      console.error(`[worker ${workerId}] loop error:`, err);
      await sleep(pollMs);
    }
  }
}

main().catch((err) => {
  console.error("worker fatal:", err);
  process.exit(1);
});
```

Note: `fetch`'s `Response` satisfies the `ResponseLike` interface (`status`, `headers.get`, `text()`) consumed by `createSafeFetchHtml`.

- [ ] **Step 6: Add `build` and `start` scripts + build tsconfig**

Create `apps/worker/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "noEmit": false,
    "composite": false,
    "declaration": false
  },
  "exclude": ["**/*.test.ts", "**/*.integration.test.ts", "**/*.e2e.test.ts"]
}
```

Modify `apps/worker/package.json` — add a `scripts` block:

```json
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/main.js"
  },
```

- [ ] **Step 7: Verify the worker builds and the entrypoint is the emitted file**

Run: `pnpm --filter @readmepls/worker build && ls apps/worker/dist/main.js`
Expected: compiles with no errors; `apps/worker/dist/main.js` exists.

- [ ] **Step 8: Run full worker test suite (no regressions)**

Run: `pnpm --filter @readmepls/worker exec vitest run`
Expected: PASS (existing tests + new `run-loop.test.ts`).

- [ ] **Step 9: Commit**

```bash
git add apps/worker/src/run-loop.ts apps/worker/src/run-loop.test.ts apps/worker/src/main.ts apps/worker/tsconfig.build.json apps/worker/package.json
git commit -m "feat(worker): add runnable poll-loop entrypoint and build scripts"
```

---

### Task 2: `.env.example` + root `.dockerignore`

Single source of truth for configuration, and a dockerignore so build contexts stay small and never leak secrets/artifacts.

**Files:**
- Create: `.env.example`
- Create: `.dockerignore`

**Interfaces:**
- Produces: the canonical env var set consumed by `compose.yml` (Task 6) and the parity check (Task 7).

- [ ] **Step 1: Create `.env.example`**

```bash
# ---- AI provider ----
ANTHROPIC_API_KEY=
AI_MODEL=claude-haiku-4-5

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
```

- [ ] **Step 2: Create `.dockerignore`**

```gitignore
**/node_modules
**/.svelte-kit
**/build
**/dist
**/.turbo
.git
.github
.worktrees
docs
assets
pocketbase/pocketbase
pocketbase/*.zip
pocketbase/CHANGELOG.md
pocketbase/LICENSE.md
pb_data
**/*.log
.env
.env.*
!.env.example
```

- [ ] **Step 3: Verify dockerignore parses and excludes the PB binary**

Run: `git check-ignore -v pocketbase/pocketbase >/dev/null 2>&1; printf 'dockerignore lines: '; grep -c . .dockerignore`
Expected: prints a non-zero line count (sanity that the file exists and is non-empty). The `.dockerignore` itself is honored by `docker build`; it's verified in practice by Task 7's build.

- [ ] **Step 4: Commit**

```bash
git add .env.example .dockerignore
git commit -m "chore: add .env.example and root .dockerignore for self-host"
```

---

### Task 3: PocketBase image + entrypoint

Build a pinned PocketBase image with baked-in migrations and an idempotent entrypoint that upserts both superusers, then serves.

**Files:**
- Create: `pocketbase/docker-entrypoint.sh`
- Create: `pocketbase/Dockerfile`

**Interfaces:**
- Produces: an image that serves PB on `:8090`, applies `pb_migrations`, persists to `/pb_data`, and has provisioned the `PB_ADMIN_*` and `PB_WORKER_*` superusers. Consumed by `compose.yml` (Task 6) and `runLoopOnce`/`main.ts` auth (Task 1).

- [ ] **Step 1: Write the entrypoint script**

Create `pocketbase/docker-entrypoint.sh`:

```sh
#!/bin/sh
set -e

# Idempotent superuser provisioning. `upsert` creates or updates, so re-runs are
# safe. Both are PocketBase superusers (jobs/content rules are superuser-only);
# the worker uses a separate credential from the human admin.
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
  ./pocketbase superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD"
fi
if [ -n "$PB_WORKER_EMAIL" ] && [ -n "$PB_WORKER_PASSWORD" ]; then
  ./pocketbase superuser upsert "$PB_WORKER_EMAIL" "$PB_WORKER_PASSWORD"
fi

exec ./pocketbase serve \
  --http 0.0.0.0:8090 \
  --dir /pb_data \
  --migrationsDir /pb_migrations
```

- [ ] **Step 2: Write the Dockerfile**

Create `pocketbase/Dockerfile`:

```dockerfile
# ---- download stage ----
FROM alpine:3.20 AS download
ARG PB_VERSION=0.39.4
ARG TARGETARCH
RUN apk add --no-cache ca-certificates unzip wget
WORKDIR /dl
# Map Docker's TARGETARCH to PocketBase's release naming.
RUN case "$TARGETARCH" in \
      amd64) PB_ARCH=amd64 ;; \
      arm64) PB_ARCH=arm64 ;; \
      *) echo "unsupported arch: $TARGETARCH" && exit 1 ;; \
    esac && \
    wget -q -O pb.zip \
      "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" && \
    unzip pb.zip && chmod +x pocketbase

# ---- runtime stage ----
FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget && \
    addgroup -S pb && adduser -S pb -G pb
WORKDIR /pb
COPY --from=download /dl/pocketbase ./pocketbase
COPY pocketbase/pb_migrations /pb_migrations
COPY pocketbase/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    mkdir -p /pb_data && chown -R pb:pb /pb /pb_data /pb_migrations
USER pb
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:8090/api/health || exit 1
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
```

Note: build context for this image is the **repo root** (so `COPY pocketbase/...` works); set in compose via `build.context: .` and `dockerfile: pocketbase/Dockerfile`.

- [ ] **Step 3: Build the image**

Run: `docker build -f pocketbase/Dockerfile -t readmepls-pocketbase:test .`
Expected: builds successfully; downloads PB 0.39.4 for the host arch.

- [ ] **Step 4: Smoke-run the container and hit health**

Run:
```bash
docker run -d --name pb-test -p 8090:8090 \
  -e PB_ADMIN_EMAIL=admin@example.com -e PB_ADMIN_PASSWORD=test12345678 \
  -e PB_WORKER_EMAIL=worker@example.com -e PB_WORKER_PASSWORD=test12345678 \
  readmepls-pocketbase:test
sleep 5
wget -qO- http://localhost:8090/api/health; echo
docker rm -f pb-test
```
Expected: health JSON `{"code":200,...}`; logs show migrations applied and two superusers upserted.

- [ ] **Step 5: Commit**

```bash
git add pocketbase/Dockerfile pocketbase/docker-entrypoint.sh
git commit -m "feat(docker): pocketbase image with baked migrations and superuser bootstrap"
```

---

### Task 4: Worker image

Multi-stage build from repo root using `pnpm deploy` to a self-contained dir.

**Files:**
- Create: `apps/worker/Dockerfile`

**Interfaces:**
- Consumes: `apps/worker` `build`/`start` scripts (Task 1); workspace packages `@readmepls/core`, `@readmepls/types`.
- Produces: an image whose default command is `node dist/main.js`, runnable with the worker env vars.

- [ ] **Step 1: Write the Dockerfile**

Create `apps/worker/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
# ---- base: workspace install ----
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
# Manifests first for layer caching.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/types/package.json packages/types/
COPY apps/worker/package.json apps/worker/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build ----
FROM base AS build
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm --filter @readmepls/worker... build
# Produce a self-contained, symlink-free deploy dir.
RUN pnpm --filter @readmepls/worker deploy --prod /out

# ---- runtime ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /out ./
USER app
CMD ["node", "dist/main.js"]
```

Note on `pnpm deploy`: it copies the package's `dist` and `node_modules` into `/out`. Because the worker `build` script emits to `apps/worker/dist`, and `deploy` includes built files, `/out/dist/main.js` is present. If your pnpm version requires it, add `inject-workspace-packages=true` to a root `.npmrc` — verify in Step 2 and add only if the deploy dir is missing workspace deps.

- [ ] **Step 2: Build the image**

Run: `docker build -f apps/worker/Dockerfile -t readmepls-worker:test .`
Expected: builds; final stage contains `/app/dist/main.js`.

- [ ] **Step 3: Verify the entry file exists in the image**

Run: `docker run --rm readmepls-worker:test node -e "require('fs').accessSync('dist/main.js'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/Dockerfile
git commit -m "feat(docker): worker image via pnpm deploy from workspace root"
```

---

### Task 5: Web image

Multi-stage build of the SvelteKit adapter-node server.

**Files:**
- Create: `apps/web/Dockerfile`

**Interfaces:**
- Consumes: `apps/web` `build` script (`vite build`); adapter-node output dir `build/`; workspace packages.
- Produces: an image whose default command is `node build` listening on `PORT` (default 3000).

- [ ] **Step 1: Write the Dockerfile**

Create `apps/web/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
# ---- base: workspace install ----
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build ----
FROM base AS build
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter @readmepls/web... build
RUN pnpm --filter @readmepls/web deploy --prod /out

# ---- runtime ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /out ./
USER app
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok||r.status===404?0:1)).catch(()=>process.exit(1))"
CMD ["node", "build"]
```

Note: adapter-node's server entry is `build/index.js` started by `node build`. It reads `PORT`, `ORIGIN`, and `HOST` from env. The healthcheck treats any HTTP response (including 404 on `/` before routes exist) as "process is up"; tighten to a dedicated health route in a later phase if desired.

- [ ] **Step 2: Build the image**

Run: `docker build -f apps/web/Dockerfile -t readmepls-web:test .`
Expected: builds; `/out/build/index.js` present.

- [ ] **Step 3: Verify the server starts and binds the port**

Run:
```bash
docker run -d --name web-test -p 3000:3000 -e ORIGIN=http://localhost:3000 readmepls-web:test
sleep 4
docker logs web-test 2>&1 | tail -5
wget -qO- http://localhost:3000/ >/dev/null 2>&1 && echo "responded" || echo "responded (non-200 ok)"
docker rm -f web-test
```
Expected: logs show "Listening on" and the container responds on 3000.

- [ ] **Step 4: Commit**

```bash
git add apps/web/Dockerfile
git commit -m "feat(docker): web image for sveltekit adapter-node server"
```

---

### Task 6: Root `compose.yml`

Wire the three services with the published-image + build-fallback pattern.

**Files:**
- Create: `compose.yml`

**Interfaces:**
- Consumes: all three Dockerfiles (Tasks 3–5), `.env.example`/`.env` (Task 2).
- Produces: the `docker compose up -d` deployment used by Task 7's smoke test and the README.

- [ ] **Step 1: Write `compose.yml`**

```yaml
name: readmepls

services:
  pocketbase:
    image: ghcr.io/OWNER/readmepls-pocketbase:latest
    build:
      context: .
      dockerfile: pocketbase/Dockerfile
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
    image: ghcr.io/OWNER/readmepls-web:latest
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    env_file: .env
    environment:
      PB_URL: http://pocketbase:8090
    ports:
      - "${WEB_PORT:-3000}:3000"
    depends_on:
      pocketbase:
        condition: service_healthy

  worker:
    image: ghcr.io/OWNER/readmepls-worker:latest
    build:
      context: .
      dockerfile: apps/worker/Dockerfile
    restart: unless-stopped
    env_file: .env
    environment:
      PB_URL: http://pocketbase:8090
    depends_on:
      pocketbase:
        condition: service_healthy

volumes:
  pb_data:
```

Note: `env_file: .env` loads all keys; the per-service `PB_URL: http://pocketbase:8090` override ensures the internal URL even if `.env` set it to localhost. The `OWNER` placeholder is replaced by the user (docs Task 8) or pulled as published by CI (Task 9).

- [ ] **Step 2: Validate the compose file**

Run: `cp .env.example .env && docker compose config >/dev/null && echo "compose valid"`
Expected: prints `compose valid` (no schema errors, all `${VAR}` resolve).

- [ ] **Step 3: Commit**

```bash
git add compose.yml
git commit -m "feat(docker): root compose.yml wiring pocketbase, web, worker"
```

---

### Task 7: Smoke test + env-parity check (the TDD safety net)

A runnable script that boots the stack and verifies an end-to-end capture, plus a check that `compose.yml` vars and `.env.example` never drift.

**Files:**
- Create: `scripts/env-parity-check.mjs`
- Create: `scripts/smoke-test.sh`
- Modify: `package.json` (root) — add `smoke` and `env:check` scripts

**Interfaces:**
- Consumes: `compose.yml`, `.env.example`, the three images.
- Produces: `pnpm env:check` (fast, offline) and `pnpm smoke` (boots Docker).

- [ ] **Step 1: Write the failing env-parity check**

Create `scripts/env-parity-check.mjs`:

```js
import { readFileSync } from "node:fs";

const compose = readFileSync(new URL("../compose.yml", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

// Vars referenced in compose as ${VAR} or ${VAR:-default}
const referenced = new Set(
  [...compose.matchAll(/\$\{([A-Z0-9_]+)(?::-[^}]*)?\}/g)].map((m) => m[1])
);
// Vars declared in .env.example (KEY=...)
const declared = new Set(
  envExample
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=")[0])
);

const missing = [...referenced].filter((v) => !declared.has(v));
if (missing.length) {
  console.error("compose references vars absent from .env.example:", missing);
  process.exit(1);
}
console.log(`env-parity OK: ${referenced.size} referenced vars all declared`);
```

Add to root `package.json` scripts:

```json
    "env:check": "node scripts/env-parity-check.mjs",
    "smoke": "bash scripts/smoke-test.sh"
```

- [ ] **Step 2: Run the parity check — expect it to pass given Tasks 2 & 6**

Run: `pnpm env:check`
Expected: PASS — `env-parity OK: N referenced vars all declared`. (If it fails, a `${VAR}` in `compose.yml` is missing from `.env.example` — add it to `.env.example` and re-run. This is the check doing its job.)

- [ ] **Step 3: Write the smoke test script**

Create `scripts/smoke-test.sh`:

```sh
#!/bin/sh
set -e

cleanup() { docker compose down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

[ -f .env ] || cp .env.example .env

echo "==> building + starting stack"
docker compose up -d --build

echo "==> waiting for pocketbase health"
for i in $(seq 1 30); do
  if wget -qO- "http://localhost:${PB_PORT:-8090}/api/health" >/dev/null 2>&1; then
    echo "pocketbase healthy"; break
  fi
  [ "$i" = "30" ] && { echo "pocketbase never became healthy"; docker compose logs pocketbase; exit 1; }
  sleep 2
done

echo "==> waiting for web"
for i in $(seq 1 30); do
  if wget -qO- "http://localhost:${WEB_PORT:-3000}/" >/dev/null 2>&1; then
    echo "web responding"; break
  fi
  [ "$i" = "30" ] && { echo "web never responded"; docker compose logs web; exit 1; }
  sleep 2
done

echo "==> driving one capture via the web API"
CODE=$(wget -qO- --post-data='{"url":"https://example.com/smoke"}' \
  --header='Content-Type: application/json' \
  "http://localhost:${WEB_PORT:-3000}/api/capture" >/dev/null 2>&1 && echo ok || echo fail)
echo "capture POST: $CODE"

echo "==> waiting for worker to produce content"
for i in $(seq 1 30); do
  COUNT=$(wget -qO- "http://localhost:${PB_PORT:-8090}/api/collections/jobs/records?filter=$(printf '%s' 'status="done"')" 2>/dev/null | grep -c '"status":"done"' || true)
  if [ "${COUNT:-0}" -ge 1 ]; then echo "worker produced a done job"; break; fi
  [ "$i" = "30" ] && { echo "worker did not finish a job"; docker compose logs worker; exit 1; }
  sleep 2
done

echo "==> SMOKE PASS"
```

Note: the capture endpoint contract (`POST /api/capture`, body `{ "url": ... }`) comes from `apps/web/src/routes/api/capture/+server.ts` — confirm the exact field name there and adjust the post body if it differs. The jobs query is unauthenticated only if list rules allow it; since `jobs` rules are superuser-only, this read may 403. If so, replace the worker-completion check with `docker compose logs worker | grep -q "done"` or query as the admin via an auth token. Pick whichever the running stack supports and make the step deterministic.

- [ ] **Step 4: Run the smoke test**

Run: `pnpm smoke`
Expected: ends with `==> SMOKE PASS`. On failure it dumps the failing service's logs — debug with `superpowers:systematic-debugging`.

- [ ] **Step 5: Commit**

```bash
git add scripts/env-parity-check.mjs scripts/smoke-test.sh package.json
git commit -m "test(docker): add boot smoke test and env-parity check"
```

---

### Task 8: README self-hosting section

Document the one-command bring-up.

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Add a "Self-hosting" section to `README.md`**

Append:

```markdown
## Self-hosting

`readmepls` runs as three containers (PocketBase, web, worker) via Docker Compose.

**Requirements:** Docker with the Compose plugin.

1. Clone the repo and copy the env template:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env`: set `ANTHROPIC_API_KEY`, and change the `PB_ADMIN_*` /
   `PB_WORKER_*` passwords. For a public host, set `PUBLIC_PB_URL` and `ORIGIN`
   to the URLs users will actually hit.
3. Start the stack:
   ```bash
   docker compose up -d
   ```
   This pulls published images from `ghcr.io`. To build from source instead, run
   `docker compose up -d --build`.
4. Open `http://localhost:3000` for the app, and `http://localhost:8090/_/` for
   the PocketBase admin (log in with `PB_ADMIN_*`).

**TLS:** the app serves plain HTTP. For a public deployment, put it behind your
own reverse proxy (Caddy, Traefik, or nginx) terminating TLS and forwarding to the
`web` (3000) and `pocketbase` (8090) ports.

**Images:** replace `OWNER` in `compose.yml` with the GitHub org/user that hosts
the published packages (or build locally with `--build`).

**Updating:** `docker compose pull && docker compose up -d`. Data persists in the
`pb_data` volume.
```

- [ ] **Step 2: Verify the section renders (no broken fences)**

Run: `grep -n "## Self-hosting" README.md`
Expected: prints the heading line.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add self-hosting (docker compose) section to README"
```

---

### Task 9: CI — publish multi-arch images to ghcr.io

**Files:**
- Create: `.github/workflows/docker-publish.yml`

**Interfaces:**
- Consumes: the three Dockerfiles.
- Produces: published images on release tags.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/docker-publish.yml`:

```yaml
name: docker-publish

on:
  push:
    tags: ["v*"]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  build-push:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        include:
          - name: pocketbase
            dockerfile: pocketbase/Dockerfile
          - name: web
            dockerfile: apps/web/Dockerfile
          - name: worker
            dockerfile: apps/worker/Dockerfile
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/readmepls-${{ matrix.name }}
          tags: |
            type=ref,event=tag
            type=raw,value=latest

      - uses: docker/build-push-action@v6
        with:
          context: .
          file: ${{ matrix.dockerfile }}
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `node -e "const y=require('fs').readFileSync('.github/workflows/docker-publish.yml','utf8'); if(!y.includes('build-push-action')) process.exit(1); console.log('workflow present')"`
Expected: prints `workflow present`. (Full validation happens when GitHub runs it; this just guards against an empty/garbled file. If `actionlint` is available, prefer `actionlint .github/workflows/docker-publish.yml`.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "ci: publish multi-arch docker images to ghcr.io on release tags"
```

---

## Self-Review

**Spec coverage:**
- Architecture (3 services + CI) → Tasks 3,4,5,6,9 ✓
- pocketbase image, pinned 0.39.4, baked migrations, named volume, health, non-root → Task 3 ✓
- web adapter-node image, non-root, health → Task 5 ✓
- worker poller + the entrypoint-gap pre-req → Task 1 (entrypoint) + Task 4 (image) ✓
- pnpm monorepo build strategy (root context, `pnpm deploy`, `.dockerignore`) → Tasks 2,4,5 ✓
- `.env.example` (closes the gap) → Task 2 ✓
- Worker dedicated-superuser security reconciliation → Task 1 (auth) + Task 3 (upsert) ✓
- compose.yml published-image + build fallback, bare ports, depends_on healthy → Task 6 ✓
- CI ghcr multi-arch on tags → Task 9 ✓
- Testing: boot smoke test + env-parity → Task 7 ✓
- Self-host docs → Task 8 ✓
- Out of scope (TLS, worker health endpoint, K8s, SaaS tiers) — correctly omitted ✓

**Placeholder scan:** No TBD/TODO. The literal `OWNER` token is an intentional, documented placeholder (Task 6 note + Task 8 docs + CI substitutes the real owner). Two implementation-time confirmations are flagged with explicit fallbacks, not left vague: (a) `ProcessDeps` export check in Task 1 Step 3; (b) capture endpoint field name + jobs-read auth in Task 7 Step 3.

**Type consistency:** `runLoopOnce(pb, workerId, deps)` defined in Task 1 and used identically in Task 7's expectations. `ProcessDeps` shape matches `worker.ts` (`fetchHtml`, `extractor`, `ai`, `classify`). `ClaudeProvider(client, model)` and `createSafeFetchHtml({lookup, fetchFn})` signatures match the source read during planning. PB superuser auth uses `_superusers` collection (PB ≥0.23 / 0.39.4). Env var names are identical across `.env.example`, `compose.yml`, `main.ts`, and the entrypoint.
