# Gated Staging Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a password-gated, prod-isolated staging deployment of the app on the existing VPS, running `develop`-branch images, deployed on manual trigger.

**Architecture:** Reuse the single `compose.yml` under a distinct Docker project name (`readmepls-staging`) so volumes/networks auto-isolate from prod. A new `IMAGE_TAG` compose variable selects `:develop` images. CI builds `:develop` on every push to `develop` and deploys staging only on `workflow_dispatch`. Caddy on the VPS gates the app with Basic Auth; PocketBase is reached via its own subdomain with auth path-scoped to the admin UI so browser SDK calls survive.

**Tech Stack:** Docker Compose, GitHub Actions, Caddy, PocketBase, SvelteKit. No application source changes.

## Global Constraints

- **No application code changes.** This plan touches only `compose.yml`, one workflow file, and two new doc/example files. The existing test suite must stay green.
- **Prod behavior must not change.** `IMAGE_TAG` defaults to `latest`; the prod deploy job and its trigger are untouched; the `latest` tag still applies to `main` and `v*` tag builds.
- **Image registry / naming:** `ghcr.io/g1sbi/readmepls-<service>`. Do not rename.
- **Staging Docker project name is exactly `readmepls-staging`** — this is the isolation guarantee; the runbook, `.env.staging.example`, and the deploy job must all use it verbatim.
- **Staging host ports:** web `3100`, PocketBase `8190` (prod uses `3000` / `8090`).
- **Staging subdomains:** app `staging.readmepls.com`, PocketBase `pb-staging.readmepls.com`.
- **`ORIGIN=https://staging.readmepls.com`** on staging — it drives the verification-email link (see `pocketbase/pb_hooks/verification_config.pb.js`). Getting this wrong sends testers to prod.
- No secrets committed. `.env.staging.example` is secret-free; the real filled-in
  env file lives only on the VPS.
- **The staging env file is named `.env` in the staging directory** (e.g.
  `/srv/readmepls-staging/.env`). `compose.yml`'s services declare `env_file: .env`,
  and `docker compose --env-file X` only redirects *variable interpolation* — it
  does NOT change which file `env_file:` reads. Isolation comes from the separate
  directory + project name, not from the filename. Do not add `--env-file` to any
  staging command.

Spec: `docs/superpowers/specs/2026-07-20-gated-staging-environment-design.md`.

---

### Task 1: Parametrize the image tag in `compose.yml`

Makes the one compose file serve both prod (`latest`) and staging (`develop`) without a forked stack. Verification renders the merged config with `docker compose config` and asserts the tag substitutes both ways.

**Files:**
- Modify: `compose.yml:5` (pocketbase image), `compose.yml:20` (web image), `compose.yml:35` (worker image)

**Interfaces:**
- Consumes: nothing.
- Produces: compose variable `IMAGE_TAG` (string, defaults to `latest`). The CI deploy job (Task 2) and `.env.staging.example` (Task 3) set `IMAGE_TAG=develop`.

- [ ] **Step 1: Write the failing verification**

Run this now to capture the current (pre-change) rendered tag — it should still say `:latest`, proving the variable does not yet exist:

```bash
IMAGE_TAG=develop docker compose -f compose.yml config | grep 'readmepls-web'
```

Expected BEFORE change: prints `image: ghcr.io/g1sbi/readmepls-web:latest` (the `IMAGE_TAG` env is ignored because the file hardcodes `latest`). This is the failing state — staging cannot select `develop`.

- [ ] **Step 2: Edit the three image lines**

`compose.yml:5`:
```yaml
    image: ghcr.io/g1sbi/readmepls-pocketbase:${IMAGE_TAG:-latest}
```

`compose.yml:20`:
```yaml
    image: ghcr.io/g1sbi/readmepls-web:${IMAGE_TAG:-latest}
```

`compose.yml:35`:
```yaml
    image: ghcr.io/g1sbi/readmepls-worker:${IMAGE_TAG:-latest}
```

- [ ] **Step 3: Verify the default still renders `latest` (prod-safety)**

```bash
docker compose -f compose.yml config | grep -E 'readmepls-(pocketbase|web|worker):'
```
Expected: all three print `:latest`. Prod behavior unchanged.

- [ ] **Step 4: Verify the override renders `develop` (staging path)**

```bash
IMAGE_TAG=develop docker compose -f compose.yml config | grep -E 'readmepls-(pocketbase|web|worker):'
```
Expected: all three print `:develop`.

- [ ] **Step 5: Commit**

```bash
git add compose.yml
git commit -m "feat(deploy): parametrize compose image tag for staging"
```

---

### Task 2: Wire staging into the CI workflow

Adds a `develop` build trigger, a `:develop` image tag (without disturbing `latest`), and a manual-only `deploy-staging` job. All three changes are in one file (`docker-publish.yml`) and reviewed together — a partial change would leave the workflow inconsistent.

**Files:**
- Modify: `.github/workflows/docker-publish.yml` — `on.push.branches` (line 5), the `meta` step `tags:` block (lines 40-43), and append a new `deploy-staging` job after the `deploy` job (after line 74).

**Interfaces:**
- Consumes: `IMAGE_TAG` from Task 1; existing secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
- Produces: images tagged `:develop` on push to `develop`; a `deploy-staging` job requiring a new secret `VPS_STAGING_DIR` (documented in Task 4). Runs the staging compose command with project `readmepls-staging`.

- [ ] **Step 1: Add `develop` to the build trigger**

`.github/workflows/docker-publish.yml` line 5, change:
```yaml
    branches: [main]
```
to:
```yaml
    branches: [main, develop]
```

- [ ] **Step 2: Add the `:develop` tag without changing `latest`**

Replace the `tags:` block (currently lines 40-43):
```yaml
          tags: |
            type=ref,event=tag
            type=raw,value=latest
```
with:
```yaml
          tags: |
            type=ref,event=tag
            type=raw,value=latest,enable=${{ github.ref != 'refs/heads/develop' }}
            type=raw,value=develop,enable=${{ github.ref == 'refs/heads/develop' }}
```

Rationale: `latest` still applies to `main` and `v*` tag builds (ref is not `develop`), matching current prod behavior exactly; only `develop` pushes/dispatches get `:develop`, and they never move `latest`.

- [ ] **Step 3: Append the `deploy-staging` job**

Add at the end of the file (after the `deploy` job's last line), at the same indentation as the other jobs (two spaces):
```yaml
  deploy-staging:
    needs: build-push
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@0ff4204d59e8e51228ff73bce53f80d53301dee2 # v1.2.5
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd ${{ secrets.VPS_STAGING_DIR }}
            docker compose -f compose.yml -p readmepls-staging up -d --pull always
            docker image prune -f
```

Note: `build-push` has no `if`, so it runs on `workflow_dispatch` too — dispatching from the `develop` branch rebuilds `:develop` first, then this job deploys it. The runbook (Task 4) instructs dispatching from `develop`.

- [ ] **Step 4: Verify the workflow is valid YAML and the jobs/keys are present**

```bash
python3 -c "import yaml,sys; d=yaml.safe_load(open('.github/workflows/docker-publish.yml')); \
assert d['on']['push']['branches']==['main','develop'], d['on']['push']['branches']; \
assert set(d['jobs'])>={'build-push','deploy','deploy-staging'}, set(d['jobs']); \
assert d['jobs']['deploy-staging']['if']==\"github.event_name == 'workflow_dispatch'\"; \
print('workflow OK:', sorted(d['jobs']))"
```
Expected: `workflow OK: ['build-push', 'deploy', 'deploy-staging']` and no assertion error.

Note: PyYAML parses the unquoted `on:` key as the boolean `True`. If the assertion on `d['on']` raises `KeyError`, retry with `d[True]['push']['branches']` — this is a PyYAML quirk, not a workflow error. GitHub Actions reads `on` correctly regardless.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "feat(deploy): build develop images and add manual staging deploy job"
```

---

### Task 3: Add `.env.staging.example`

A committed, secret-free template of the staging environment. Testers copy it to `.env` in the VPS staging directory and fill in secrets.

**Files:**
- Create: `.env.staging.example`

**Interfaces:**
- Consumes: `IMAGE_TAG` (Task 1), project name `readmepls-staging` (Task 2 deploy job).
- Produces: the documented variable set the runbook (Task 4) references.

- [ ] **Step 1: Create the file**

`.env.staging.example`:
```bash
# ---- Staging environment (gated, develop branch) ----
# Copy to `.env` IN THE VPS STAGING DIRECTORY (e.g. /srv/readmepls-staging/.env)
# and fill in secrets. NEVER commit the filled-in file.
#
# It must be named `.env`: compose.yml's services declare `env_file: .env`, and
# `--env-file` only redirects variable interpolation, not that. Isolation comes
# from the separate directory + Docker project name, never from the filename —
# staging reuses the single compose.yml, so its volumes never touch prod's.
#
# Deploy (run by the CI deploy-staging job, or by hand on the VPS):
#   docker compose -f compose.yml -p readmepls-staging up -d --pull always

# ---- Isolation + image selection ----
# Distinct project name => volumes/networks become readmepls-staging_* (never
# prod's readmepls_*). This is the data-isolation guarantee. Do not change.
COMPOSE_PROJECT_NAME=readmepls-staging
# Pull develop-tagged images built by CI from the develop branch.
IMAGE_TAG=develop

# ---- Host ports (must not collide with prod's 3000 / 8090) ----
WEB_PORT=3100
PB_PORT=8190

# ---- Deployment mode: SaaS (exercises the email-verification gate) ----
SELF_HOSTED=false
SINGLE_ACCOUNT=false

# ---- Service URLs (staging subdomains) ----
# Browser-facing app origin. DRIVES THE VERIFICATION-EMAIL LINK + CSRF/cookies.
# Must equal the URL testers hit, or verify links point at prod.
ORIGIN=https://staging.readmepls.com
# Browser-facing PocketBase (its own subdomain, mirrors prod's pb. pattern).
PUBLIC_PB_URL=https://pb-staging.readmepls.com
# Internal container-to-container (unchanged).
PB_URL=http://pocketbase:8090

# ---- AI provider (real, to exercise AI features) ----
ANTHROPIC_API_KEY=
AI_MODEL=claude-haiku-4-5
AI_PROVIDER=

# ---- SMTP: reuse prod's credentials so verification emails send ----
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_TLS=true
SMTP_FROM=no-reply@example.com
SMTP_FROM_NAME=readmepls

# ---- PocketBase superusers (staging-only creds; provisioned on first boot) ----
PB_ADMIN_EMAIL=admin@example.com
PB_ADMIN_PASSWORD=change-me-admin
PB_WORKER_EMAIL=worker@example.com
PB_WORKER_PASSWORD=change-me-worker

# ---- Semantic search ----
# Generate: openssl rand -hex 32
WORKER_SEARCH_SECRET=
TRANSFORMERS_CACHE=/data/models
WORKER_URL=http://worker:8091

# ---- Chrome extension: off on staging ----
EXTENSION_ORIGINS=
```

- [ ] **Step 2: Verify it renders a valid staging config**

Render it the way the VPS will — as `.env` in a scratch dir — so the check
exercises the real load path and cannot be masked by this repo's own `.env`:

```bash
tmp=$(mktemp -d) && cp compose.yml "$tmp/" && cp .env.staging.example "$tmp/.env" \
  && (cd "$tmp" && docker compose -f compose.yml -p readmepls-staging config \
       | grep -E 'readmepls-(pocketbase|web|worker):|published: "3100"|published: "8190"'); \
  rm -rf "$tmp"
```
Expected: three images print `:develop`, and published host ports show `3100` (web)
and `8190` (pocketbase). No `site` service appears (compose.site.yml not loaded).

- [ ] **Step 3: Commit**

```bash
git add .env.staging.example
git commit -m "docs(deploy): add staging env example"
```

---

### Task 4: Write the staging runbook

The operator guide for the manual VPS + GitHub steps that the repo cannot automate (DNS, Caddy, secret, first deploy, teardown).

**Files:**
- Create: `docs/deploy/staging.md`

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing (documentation).

- [ ] **Step 1: Create the runbook**

`docs/deploy/staging.md`:
````markdown
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

### 3. Staging directory + env

On the VPS, in a directory **separate from prod** (e.g. `/srv/readmepls-staging`):

```bash
mkdir -p /srv/readmepls-staging && cd /srv/readmepls-staging
# Copy compose.yml and .env.staging.example from the repo into this dir.
cp .env.staging.example .env
# Fill in .env: SMTP_* (reuse prod's), ANTHROPIC_API_KEY, staging-only
# PB_ADMIN_*/PB_WORKER_* passwords, and WORKER_SEARCH_SECRET (openssl rand -hex 32).
```

The file **must** be named `.env` — `compose.yml` declares `env_file: .env` per
service, and `docker compose --env-file X` only redirects variable interpolation,
not that. What keeps staging off prod's data is this separate directory plus the
`readmepls-staging` project name, not the filename.

### 4. GitHub secret

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
3. Visit `https://staging.readmepls.com` → Basic Auth prompt → app.

## Verify a deploy

```bash
# On the VPS:
docker compose -p readmepls-staging ps          # 3 services healthy
docker volume ls | grep readmepls-staging       # readmepls-staging_pb_data exists
docker compose -p readmepls ps                  # prod still healthy, untouched
```

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
````

- [ ] **Step 2: Verify the doc renders and links resolve**

```bash
test -f docs/deploy/staging.md && grep -q 'readmepls-staging' docs/deploy/staging.md \
  && grep -q 'pb-staging.readmepls.com' docs/deploy/staging.md \
  && echo "runbook OK"
```
Expected: `runbook OK`.

- [ ] **Step 3: Commit**

```bash
git add docs/deploy/staging.md
git commit -m "docs(deploy): add staging environment runbook"
```

---

## Final verification (no app regression)

Run once after all tasks. The app was not touched, so this proves it:

- [ ] `pnpm typecheck` — expected: passes.
- [ ] `pnpm lint` — expected: passes.
- [ ] `pnpm test` — expected: full suite green.
- [ ] `docker compose -f compose.yml config >/dev/null && echo prod-config-OK` — prod stack still renders (defaults to `:latest`).

## Post-merge (manual, on the server — from the runbook)

Not part of the code changes; do these to actually bring staging up:

- [ ] DNS records for `staging` + `pb-staging`.
- [ ] Caddy blocks added + hashed password + reload.
- [ ] Staging dir created on VPS with filled-in `.env`.
- [ ] GitHub secret `VPS_STAGING_DIR` added.
- [ ] Dispatch **docker-publish** from `develop`; confirm the end-to-end flow in the runbook's "Verify a deploy" section.
