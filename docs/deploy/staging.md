# Staging environment runbook

Gated staging deploy of the app, running `develop`-branch images on the same VPS
as production, fully isolated from prod data. App stack only (no landing site).

Design: `docs/superpowers/specs/2026-07-20-gated-staging-environment-design.md`.

## How it works

- CI (`.github/workflows/docker-publish.yml`) builds `:develop` images on every
  push to `develop`.
- Deploy is **manual**: the `deploy-staging` job runs only on `workflow_dispatch`.
  **Dispatch it from the `develop` branch** so it builds and deploys `:develop`.
- Staging runs the same `compose.yml` under Docker project `readmepls-staging`,
  so its volumes are `readmepls-staging_pb_data` etc. — never prod's
  `readmepls_pb_data`. PocketBase starts empty; migrations run on first boot.

## One-time setup

### 1. DNS

Add A records pointing at the VPS IP:

- `staging.readmepls.com`
- `pb-staging.readmepls.com`

### 2. Caddy

Add these blocks to the VPS Caddyfile. Generate the hash with
`caddy hash-password` and paste the same hash into both blocks:

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

Why auth is path-scoped on PocketBase: the browser's PB SDK makes cross-origin
XHR from `staging.` to `pb-staging.`. Basic Auth is not sent on cross-origin XHR,
so gating all of `pb-staging` would 401 every SDK call. Protecting only the admin
UI (`/_`, `/_/*`) keeps `/api/*` reachable; PocketBase API rules remain the
security boundary, same as prod's public PB.

Reload Caddy after editing (e.g. `caddy reload` or `systemctl reload caddy`).

### 3. Firewall

`compose.yml` publishes its ports on `0.0.0.0`, so `http://<VPS_IP>:3100` and
`http://<VPS_IP>:8190` are reachable directly, bypassing Caddy's Basic Auth
entirely (worst case: PocketBase's admin UI wide open on `:8190`). Block direct
access so all traffic is forced through Caddy:

```bash
ufw deny 3100
ufw deny 8190
```

### 4. Staging directory + env

On the VPS, in a directory **separate from prod** (e.g. `/srv/readmepls-staging`):

```bash
mkdir -p /srv/readmepls-staging && cd /srv/readmepls-staging
# Copy compose.yml and .env.staging.example from the repo into this dir.
cp .env.staging.example .env
# Fill in .env: SMTP_* (reuse prod's), ANTHROPIC_API_KEY, staging-only
# PB_ADMIN_*/PB_WORKER_* passwords, and WORKER_SEARCH_SECRET (openssl rand -hex 32).
```

`compose.yml` is hand-copied here, not pulled by CI — **re-copy it into this
directory whenever it changes on `develop`**. The deploy job only runs `up`, so
a stale copy (e.g. one predating an image-tag or port change) silently keeps
running against the old file, including old production defaults.

The file **must** be named `.env` — `compose.yml` declares `env_file: .env` per
service, and `docker compose --env-file X` only redirects variable interpolation,
not that. What keeps staging off prod's data is this separate directory plus the
`readmepls-staging` project name, not the filename.

### 5. GitHub secret

Add repo secret **`VPS_STAGING_DIR`** = the staging directory path (e.g.
`/srv/readmepls-staging`). The existing `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY`
are reused.

## Deploy

1. Push feature work to `develop`. CI builds `:develop` images automatically.
2. Actions → **docker-publish** → **Run workflow** → select branch **develop** →
   Run. This rebuilds `:develop`, then the `deploy-staging` job SSHes in and runs:
   ```
   docker compose -f compose.yml -p readmepls-staging up -d --pull always
   ```

> **Dispatch from `develop`, not `main`.** The `deploy-staging` job has no branch guard — a dispatch from another branch still deploys, but it redeploys whatever stale image already sits at `:develop` instead of building your latest work.

3. Visit `https://staging.readmepls.com` → Basic Auth prompt → app.

## Verify a deploy

```bash
# On the VPS:
docker compose -p readmepls-staging ps          # 3 services healthy
docker volume ls | grep readmepls-staging       # readmepls-staging_pb_data exists
docker compose -p readmepls ps                  # prod still healthy, untouched
docker compose -p readmepls-staging images      # all three services on :develop
```

The `ps`/`volume ls` checks confirm staging is running and isolated, but they
can't tell you which image tag is actually deployed — check `images` explicitly
and confirm all three services show `:develop`, not `:latest`.

Then in a browser: sign up, confirm the verification email links to
`https://staging.readmepls.com/verify?token=...`, verify, and capture an article.

## Teardown

```bash
cd /srv/readmepls-staging
docker compose -f compose.yml -p readmepls-staging down
# To also wipe staging data (does NOT touch prod):
docker compose -f compose.yml -p readmepls-staging down -v
```

Prod is a different project (`readmepls`) and is never affected by these commands.
