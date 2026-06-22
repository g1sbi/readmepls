# Docker & Self-Host Packaging — Design Spec

**Date:** 2026-06-22
**Phase:** 7 (Docker Compose deploy + self-host packaging), pulled forward.
**Status:** Approved design, pre-implementation.

## Goal

Make `readmepls` trivially self-hostable by OSS users: clone, set env, `docker
compose up -d`. Mirror the conventions of popular self-hostable projects (Immich,
Paperless-ngx, Gitea): published multi-arch images on a registry, a single
`compose.yml` that references them, and a short bring-up doc.

This spec covers infrastructure only. It adds no product features and no visual
design.

## Decisions (locked during brainstorming)

1. **Full Phase-7 packaging** — production-grade, not just a dev compose.
2. **Bare HTTP ports** — the app exposes plain HTTP; the operator brings their own
   reverse proxy / TLS termination. No bundled Caddy/Traefik.
3. **Published images + build fallback** — images published to `ghcr.io` via CI;
   `compose.yml` references the tag and also carries a local `build:` stanza so
   `docker compose up --build` works from source.

## Architecture

Three long-running services plus one CI pipeline.

```
                 (host ports — operator fronts their own proxy/TLS)
   :PB_PORT ─── pocketbase ◄──── web :WEB_PORT
                    ▲
                    └────────── worker (no exposed port; polls PB jobs)
```

All services share a single Docker network. `web` and `worker` reach PocketBase
over the internal network at `http://pocketbase:8090`. Only `pocketbase` and `web`
publish host ports.

### Service: pocketbase

- PocketBase ships **no official Docker image**, so we build our own.
- Pinned version: **0.39.4** (matches the binary currently vendored in the repo).
  Expressed as a Dockerfile `ARG PB_VERSION=0.39.4` so bumps are one line.
- Multi-stage: a builder stage downloads + verifies the pinned release zip; the
  runtime stage is `alpine` with just the binary and the baked-in
  `pocketbase/pb_migrations/`.
- Migrations are **baked into the image** (not host-mounted) so a published image
  is self-consistent with its schema. PB auto-applies them on `serve`.
- Persists to a named volume `pb_data` mounted at `/pb_data`
  (`serve --dir /pb_data --migrationsDir /pb_migrations --http 0.0.0.0:8090`).
- Healthcheck: `wget -qO- http://localhost:8090/api/health`.
- Runs as a non-root user; `pb_data` owned by that user.

### Service: web

- SvelteKit with `@sveltejs/adapter-node` already configured → build output is a
  Node server started with `node build`.
- Multi-stage build (see Build Strategy). Runtime stage runs `node build` as
  non-root on `PORT` (default 3000).
- Env: `PB_URL` (internal), `PUBLIC_PB_URL` (browser-facing), `ORIGIN`, `PORT`,
  plus server-side AI key. Secrets are never baked into the image.
- `depends_on: pocketbase (service_healthy)`.
- Healthcheck: HTTP GET on the listen port.

### Service: worker

- Node/TypeScript poller. No HTTP surface.
- Multi-stage build (see Build Strategy). Runs as non-root.
- Env: `ANTHROPIC_API_KEY`, `AI_MODEL`, `PB_URL`, `PB_WORKER_EMAIL`,
  `PB_WORKER_PASSWORD`.
- Liveness: `restart: unless-stopped`. A heartbeat/health surface is explicitly
  **out of scope** here and noted as future work.
- `depends_on: pocketbase (service_healthy)`.

## Build strategy (pnpm monorepo)

The workspace has `apps/web`, `apps/worker` depending on `packages/core` and
`packages/types` via `workspace:*`. A naïve per-app Docker build can't resolve
those symlinks. Therefore:

- **Build context is the repo root** for both app images; the Dockerfile lives at
  `apps/<app>/Dockerfile` and is selected via `dockerfile:` in compose.
- Multi-stage per app:
  1. Base stage: pin pnpm via `corepack`, copy lockfile + manifests, run
     `pnpm install --frozen-lockfile`.
  2. Build stage: copy sources, `pnpm --filter <app>... build` (the `...` pulls in
     workspace deps).
  3. Deploy stage: `pnpm deploy --filter <app> --prod /out` produces a
     self-contained directory with flattened `node_modules` and no workspace
     symlinks.
  4. Runtime stage: slim node base, copy `/out`, drop to non-root, set the start
     command.
- A root `.dockerignore` excludes `node_modules`, `.svelte-kit`, `build`, `dist`,
  `pb_data`, `.git`, `.env*` (except `.env.example`), and the vendored
  `pocketbase/pocketbase` binary.

## Configuration — `.env.example`

A single root `.env.example` is the source of truth (also closes the existing gap:
CLAUDE.md mandates keeping it current, and none exists yet). `compose.yml` reads it
via `env_file` / `${VAR}` interpolation.

| Variable | Purpose | Example / default |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI provider key (server-side only) | *(required)* |
| `AI_MODEL` | Default model | `claude-haiku-4-5` |
| `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` | Superuser bootstrap | *(required)* |
| `PB_WORKER_EMAIL` / `PB_WORKER_PASSWORD` | Dedicated worker service credential (NOT superuser) | *(required)* |
| `PUBLIC_PB_URL` | Browser-facing PB URL | `http://localhost:8090` |
| `PB_URL` | Internal PB URL | `http://pocketbase:8090` |
| `ORIGIN` | SvelteKit origin (CSRF) | `http://localhost:3000` |
| `PORT` | web listen port (in-container) | `3000` |
| `WEB_PORT` | host port → web | `3000` |
| `PB_PORT` | host port → pocketbase | `8090` |

Secrets live only in the operator's `.env`; they are never committed and never
baked into images.

## Worker service credential (security)

CLAUDE.md security boundary: the `content` table is writable **only** by the
worker's service credential, and worker jobs must be idempotent. The worker
therefore must **not** authenticate as the PocketBase superuser.

Plan: on first boot, an idempotent bootstrap provisions a **dedicated service
account** from `PB_WORKER_EMAIL` / `PB_WORKER_PASSWORD`. The existing API rules
(in `pocketbase/pb_migrations/1718900000_init.js`) scope `content` writes to that
account. The exact provisioning mechanism — a migration that seeds the account
from env vs. an entrypoint upsert step — is decided at implementation time and
**must align with the rules already defined in that migration**. Re-running the
bootstrap must be a no-op (idempotent).

## compose.yml

- Top-level `compose.yml` at repo root (Compose Spec; no `version:` key).
- Named volume `pb_data`.
- Each service: `image: ghcr.io/<owner>/readmepls-<svc>:<tag>` **and** a `build:`
  stanza (context + dockerfile) so source builds work without a registry.
- `web` and `worker` use `depends_on` with `condition: service_healthy` on
  `pocketbase`.
- `restart: unless-stopped` on all services.
- Only `pocketbase` (`${PB_PORT}:8090`) and `web` (`${WEB_PORT}:3000`) publish
  ports. No proxy service.

## CI — `.github/workflows/docker-publish.yml`

- Trigger: release tag push (e.g. `v*`).
- `docker/setup-buildx-action` + `docker/build-push-action`.
- Multi-arch: `linux/amd64, linux/arm64`.
- Builds and pushes three images to `ghcr.io`:
  `readmepls-pocketbase`, `readmepls-web`, `readmepls-worker`.
- Tags: the release tag and `latest`.
- Auth via the built-in `GITHUB_TOKEN` with `packages: write`.

## Testing (TDD adaptation)

Docker/compose configs are not unit-testable with Vitest. The "failing test first"
artifact is a **boot smoke test**, runnable locally and in CI:

1. `docker compose up -d --build`.
2. Poll `pocketbase` `/api/health` and the `web` port until healthy (with timeout).
3. Drive one capture job end-to-end (paste a URL → job → worker → PB write) and
   assert the row lands, reusing the Phase-1 integration approach against the
   composed PocketBase.
4. `docker compose down -v`.

Plus a cheap **env-parity check**: assert every `${VAR}` referenced in
`compose.yml` exists in `.env.example` and vice versa, so the two never drift.

The smoke test starts red (no Dockerfiles/compose exist) and drives the
implementation green.

## Self-host documentation

A README "Self-hosting" section:

1. Clone the repo.
2. `cp .env.example .env` and fill in keys (Anthropic key, admin + worker creds).
3. `docker compose up -d`.
4. Visit `http://<host>:8090/_/` to confirm the admin account, then
   `http://<host>:3000`.
5. Note: the app serves plain HTTP — put it behind your own reverse proxy
   (Caddy/Traefik/nginx) for TLS on a public host.

## Files to create

- `apps/web/Dockerfile`
- `apps/worker/Dockerfile`
- `pocketbase/Dockerfile`
- `.dockerignore` (root)
- `compose.yml` (root)
- `.env.example` (root)
- `.github/workflows/docker-publish.yml`
- Smoke-test script + env-parity check (location decided in plan)
- README "Self-hosting" section

## Out of scope

- TLS / bundled reverse proxy (operator-provided).
- Worker health/heartbeat endpoint (future).
- SaaS tier-gating UI (separate Phase-7 slice).
- Kubernetes / Helm.
