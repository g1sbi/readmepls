# Gated staging environment (develop branch)

**Status:** design approved · **Date:** 2026-07-20

## Goal

Stand up a password-gated staging deployment of the app on the existing
production VPS, running images built from the `develop` branch, so upcoming
features can be exercised on the official server before they merge to `main`.
Staging is fully isolated from production data and deploys on manual trigger.

## Decisions (locked)

| Question | Decision |
|---|---|
| Host | Same VPS, isolated (separate Docker project, own volumes, own subdomains) |
| Gate | HTTP Basic Auth at the Caddy reverse proxy |
| Reverse proxy | Caddy (already terminates TLS / routes domains on the VPS) |
| Deploy trigger | Images build automatically on push to `develop`; **deploy is manual** (`workflow_dispatch`) |
| Starting data | Fresh empty PocketBase (own volume, migrations run, no prod data) |
| Services | App stack only — `pocketbase` + `web` + `worker`. No landing `site`. |
| Mode | SaaS (`SELF_HOSTED=false`), reusing prod SMTP credentials |
| PB browser access | Own subdomain `pb-staging.readmepls.com` (mirrors prod's `pb.` pattern) |

## Architecture

### Isolation model — reuse `compose.yml`, isolate by Docker project name

No forked compose stack. Staging runs the **same `compose.yml`** under a
distinct Docker project so Docker auto-prefixes volumes and networks:

- `COMPOSE_PROJECT_NAME=readmepls-staging` → volume `readmepls-staging_pb_data`
  is a different volume from prod's `readmepls_pb_data`. **Zero data-crossing
  risk** — this is what guarantees "fresh empty PB" and prod-safety.
- App-stack-only falls out for free: staging never loads `compose.site.yml`, so
  no `site` container is created.

Parametrize the image tag so the one compose file serves both environments:

- Add `${IMAGE_TAG:-latest}` to the three `image:` lines in `compose.yml`
  (`pocketbase`, `web`, `worker`). Prod leaves `IMAGE_TAG` unset → `:latest`
  (behavior unchanged). Staging sets `IMAGE_TAG=develop`.
- Host ports are already parametrized (`WEB_PORT`, `PB_PORT`). Staging remaps to
  `3100` / `8190` to avoid collision with prod's `3000` / `8090`. The worker
  `/search` endpoint stays internal (no host port) — unchanged.

Deploy command (run on the VPS by the CI deploy job):

```
docker compose --env-file .env.staging -f compose.yml -p readmepls-staging up -d --pull always
```

Production stack is never touched by any staging operation.

### Deploy pipeline — `.github/workflows/docker-publish.yml`

Three changes:

1. **Build trigger.** Add `develop` to the push branches. Tag logic in
   `docker/metadata-action`:
   - `main` → `latest` (via `type=raw,value=latest,enable={{is_default_branch}}`)
   - `develop` → `develop` (via
     `type=raw,value=develop,enable=${{ github.ref == 'refs/heads/develop' }}`)

   Every push to `develop` rebuilds all four matrix images tagged `:develop`.
   The `site` image is still built on `develop` (staging doesn't use it) — left
   as-is; branching the matrix is not worth the complexity.

2. **Prod deploy job.** Unchanged — `if: github.event_name == 'push' &&
   github.ref == 'refs/heads/main'`.

3. **New `deploy-staging` job.** `if: github.event_name ==
   'workflow_dispatch'`. SSHes to the same VPS (reusing `VPS_HOST` /
   `VPS_USER` / `VPS_SSH_KEY`), `cd $VPS_STAGING_DIR`, runs the staging compose
   command above. Manual click only.

New GitHub secret: **`VPS_STAGING_DIR`** — staging lives in its own directory on
the VPS so its `.env.staging` and compose invocation sit apart from prod.

Flow: push `develop` → images build automatically → click **Run workflow** when
ready → staging redeploys with fresh `:develop` images.

### Gating — Caddy

Two new subdomains under `*.readmepls.com` (wildcard TLS already covers them).

**Cross-origin constraint (load-bearing):** the app (`staging.readmepls.com`)
and PocketBase (`pb-staging.readmepls.com`) are different origins. The browser's
PocketBase SDK issues cross-origin XHR to `pb-staging`. Basic Auth credentials
are **not** sent on cross-origin XHR and no auth prompt appears for XHR — so a
blanket Basic Auth on the PB subdomain would 401 every SDK call and break the
app.

**Resolution:** path-scope the auth. Full Basic Auth on the app subdomain;
on the PB subdomain protect only the admin UI (`/_` and `/_/*`), leave `/api/*`
open. PocketBase API rules are the real security boundary (per CLAUDE.md), and
this is the same exposure prod's public PB already has.

Caddyfile blocks (manual VPS step — the Caddyfile is not tracked in the repo):

```caddy
staging.readmepls.com {
	basic_auth {
		staging $2a$14$REPLACE_WITH_BCRYPT_HASH
	}
	reverse_proxy localhost:3100
}

pb-staging.readmepls.com {
	@admin path /_ /_/*
	basic_auth @admin {
		staging $2a$14$REPLACE_WITH_BCRYPT_HASH
	}
	reverse_proxy localhost:8190
}
```

Hash via `caddy hash-password`. Same shared credential in both blocks. Result:
public visitors and crawlers hit a password wall on the app; the browser SDK's
`/api/*` calls flow through; the PB admin UI stays gated.

### Configuration — `.env.staging` (on VPS, never committed)

| var | value | why |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `readmepls-staging` | isolates volumes/network from prod |
| `IMAGE_TAG` | `develop` | pulls develop-tagged images |
| `WEB_PORT` / `PB_PORT` | `3100` / `8190` | no host-port collision with prod |
| `SELF_HOSTED` | `false` | SaaS mode (enables email-verification gate) |
| `SINGLE_ACCOUNT` | `false` | multi-user staging |
| `ORIGIN` | `https://staging.readmepls.com` | drives verify-email link + CSRF/cookies |
| `PUBLIC_PB_URL` | `https://pb-staging.readmepls.com` | browser SDK target |
| `PB_URL` | `http://pocketbase:8090` | internal (unchanged) |
| `SMTP_*` | same as prod | reuse prod SMTP |
| `ANTHROPIC_API_KEY` / `AI_MODEL` | real | exercise AI features for real |
| `AI_PROVIDER` | empty | real provider (not `mock`) |
| `PB_ADMIN_*` / `PB_WORKER_*` | staging-only credentials | fresh DB provisions on first boot |
| `WORKER_SEARCH_SECRET` | own `openssl rand -hex 32` | enable semantic search |
| `EXTENSION_ORIGINS` | empty | extension off on staging |

**Verify-email correctness (why no code change is needed):**
`pocketbase/pb_hooks/verification_config.pb.js` sets
`settings.meta.appURL = $os.getenv("ORIGIN")` and the verification template links
to `{APP_URL}/verify?token={TOKEN}`. So the email link keys entirely off
`ORIGIN`. Setting `ORIGIN=https://staging.readmepls.com` makes verify emails
point at staging automatically. The hook is idempotent and reads env on each
boot. The `verify_existing_users` migration is a no-op on a fresh empty DB.

**Accepted tradeoff:** reusing prod SMTP means real verification emails send
from prod's sender address to whatever address you sign up with, and staging
shares prod's sender reputation. Acceptable because signups are controlled by the
tester.

## Deliverables

### Committed to the repo (what the implementation plan builds)

- **`compose.yml`** — add `${IMAGE_TAG:-latest}` to the `pocketbase`, `web`, and
  `worker` `image:` lines. Prod behavior unchanged (defaults to `latest`).
- **`.github/workflows/docker-publish.yml`** — `develop` build trigger, `:develop`
  tag, and the `deploy-staging` (`workflow_dispatch`) job.
- **`.env.staging.example`** — documented, secret-free template of the table above.
- **`docs/deploy/staging.md`** — runbook: DNS records, Caddy blocks + hashing,
  VPS directory setup, `.env.staging` fill-in, first deploy, redeploy, teardown.

### Manual VPS / GitHub steps (documented in the runbook, not automatable from repo)

- DNS: `staging` and `pb-staging` A records → VPS IP.
- Caddyfile: the two blocks above; generate hash with `caddy hash-password`;
  reload Caddy.
- Create the staging directory on the VPS; place the real `.env.staging`.
- Add GitHub secret `VPS_STAGING_DIR`.

## Testing

- **CI workflow** is YAML with no unit test — verify by triggering a
  `workflow_dispatch` run and reading the run log.
- **No app code changes** — the existing suite must remain green: `pnpm test`,
  `pnpm typecheck`, `pnpm lint`.
- **End-to-end verification (manual, on the server):** push `develop` → confirm
  `:develop` images build → dispatch the deploy → hit `staging.readmepls.com`
  (password wall appears) → sign up → confirm the verification email links to
  `staging.readmepls.com/verify` → complete verification → capture an article and
  confirm the worker processes it.
- **Isolation proof:** `docker volume ls` shows `readmepls-staging_pb_data`
  distinct from `readmepls_pb_data`; prod containers and data are untouched
  (`docker compose -p readmepls ps` still healthy).

## Out of scope

- Separate staging host / SMTP inbox (chose same VPS + prod SMTP).
- Automatic deploy on every `develop` push (chose manual dispatch).
- Seeding staging with prod or sample data (chose fresh empty).
- Staging landing `site` (app stack only).
- Playwright E2E automation of the gated flow (later, if ever).
