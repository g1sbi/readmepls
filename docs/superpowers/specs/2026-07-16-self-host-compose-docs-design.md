# Self-host compose simplification + docs page — Design

Date: 2026-07-16
Status: Approved, ready for planning

## Goal

Give self-hosters a Nextcloud-style experience: copy one `compose.yml`, drop
in a `.env`, `docker compose pull && docker compose up -d`, done. Today's root
`compose.yml` mixes three unrelated concerns — self-host template, local
build-from-source (for `pnpm smoke`), and the maintainer's own SaaS deploy
(which also needs the marketing landing page) — which makes it noisier than a
typical self-hosted app's compose file. Split those concerns into separate
files, and give the landing site a `/docs` page that walks through the
self-host setup using the real `compose.yml`/`.env.example` content (no
copy-drift).

## Decisions

### Compose file split

| File | Services | Image handling | Used by |
|---|---|---|---|
| `compose.yml` | `pocketbase`, `web`, `worker` | Hardcoded `image: ghcr.io/g1sbi/readmepls-<svc>:latest`. No `build:`, no `IMAGE_OWNER` var. | Self-hosters (copy-paste) + base layer for the other two files |
| `compose.dev.yml` | same 3 services | Adds `build:` (context `.`, matching `Dockerfile`) back in as an override | Contributors / `pnpm smoke` |
| `compose.site.yml` | `site` (landing page) | `image:` + `build:`, same pattern the service has today | The maintainer's own VPS deploy only |

All three stay at repo root, next to the existing `Dockerfile`s. `compose.yml`
alone is a complete, runnable stack — `compose.dev.yml` and `compose.site.yml`
are pure additive overrides via `docker compose -f compose.yml -f <other>.yml`.

**Why hardcode the image owner:** self-hosters using `compose.yml` never
build locally, so there's nothing for `IMAGE_OWNER` to parametrize for them.
Removing the var removes a required edit from the self-host path. Someone
forking the project to publish under their own GHCR namespace edits the four
`image:` lines directly — a rare enough case not to warrant a variable.

**Why PocketBase keeps its custom image (not an "official" one):** there is
no official upstream PocketBase Docker image — only GitHub-release binaries.
More importantly, `pocketbase/Dockerfile` bakes in this app's actual
backend: `pb_migrations/` (schema — articles, jobs, tags, collections,
sources, embeddings, tiering) and `pb_hooks/` (`bootstrap_superusers.pb.js`,
`search.pb.js`). A generic PocketBase image would need those directories
bind-mounted from the repo, which would force self-hosters back into
cloning — defeating the goal. `readmepls-pocketbase` stays a fully-baked,
purpose-built image like the other three.

### Env file split

- `.env.example` — everything `compose.yml` needs: PB admin/worker creds,
  `ANTHROPIC_API_KEY` (optional), `AI_PROVIDER`, `SELF_HOSTED`, ports,
  `WORKER_SEARCH_SECRET`, `PB_URL`/`PUBLIC_PB_URL`/`ORIGIN`. No `IMAGE_OWNER`.
- `.env.site.example` — `APP_URL`, `SITE_PORT`. Only relevant with
  `compose.site.yml`, so it never appears in the self-host path.

### Deploy workflow (`docker-publish.yml`)

The `deploy` job's SSH script becomes:

```
cd ${{ secrets.VPS_APP_DIR }}
docker compose -f compose.yml -f compose.site.yml pull
docker compose -f compose.yml -f compose.site.yml up -d
docker image prune -f
```

The VPS's `VPS_APP_DIR` needs `compose.yml`, `compose.site.yml`, and one
`.env` (merging both `.env.example` and `.env.site.example` vars, since it's
a single deploy target) checked out or copied there.

### `pnpm smoke` (`scripts/smoke-test.sh`)

Every `docker compose ...` invocation in the script gains `-f compose.yml -f
compose.dev.yml` (currently `up -d --build`, `down -v`, `logs <svc>`), so it
keeps building from source without the self-host file needing `build:`.

### `scripts/env-parity-check.mjs`

Currently validates `compose.yml` vars ↔ `.env.example` vars. Extend it to
run the same check twice: `compose.yml` ↔ `.env.example` (unchanged) and
`compose.site.yml` ↔ `.env.site.example` (new). Same logic, parametrized over
a list of (compose file, env file) pairs instead of a single hardcoded pair.

### README

The "Self Hosting" section is rewritten around the new file split: copy
`compose.yml` + `.env.example`, rename the latter to `.env`, fill in secrets,
`docker compose pull && docker compose up -d`. The existing "Updating" line
stays as-is (already correct). Points readers to the new `/docs` page on the
landing site as the fuller walkthrough.

### Landing site (`apps/site`)

**Nav bar (new):** `apps/site/src/lib/components/Nav.svelte` — slim top bar,
wordmark + `GitHub` link + `Docs` link (`/docs`). Rendered in
`+layout.svelte` above `{@render children()}`, so it appears on both `/` and
`/docs`. This is a genuinely new element (today's homepage has no header,
Hero is first) — deliberately kept on both pages for consistent wayfinding,
per user decision. Plain CSS matching `app.css`'s existing tokens (`--ink`,
`--accent`, `--surface-*`), no Tailwind/shadcn (this app doesn't use them).
Mobile-first: two links + wordmark fit inline under 360px, no hamburger
needed.

**Footer:** existing "Self-host" link (`Footer.svelte`) becomes a "Docs"
link pointing at `/docs` instead of `GITHUB_URL`. The "GitHub" link is
unchanged.

**Docs page (new):** `apps/site/src/routes/docs/+page.svelte` +
`apps/site/src/routes/docs/+page.ts`. Route/label is generically "docs" (not
"self-hosting") so future doc topics can be added here later without a
rename. `+page.ts` sets `export const prerender = true` and a `load()` that
reads the repo-root `compose.yml` and `.env.example` via `node:fs` at build
time, returning their raw text — the page renders them verbatim in code
blocks, so the docs can never drift from the actual files.

New shared component `apps/site/src/lib/components/CodeBlock.svelte`
(monospace block + copy-to-clipboard button), reused for both snippets.

Content sections, in order:
1. Prerequisites — Docker + Docker Compose.
2. Copy `compose.yml` + `.env.example` (rendered inline) into a directory,
   rename the env file to `.env`, fill in secrets.
3. `docker compose pull && docker compose up -d`, then open the app.
4. Updating — same pull/up command.
5. Data — persists in the `pb_data` Docker volume.
6. **AI features: on or off** — self-hosting has no tiers/subscriptions
   (that's a SaaS-only concept). The reader is fully functional with no key;
   setting `ANTHROPIC_API_KEY` turns AI features (auto-tagging, etc.) on for
   everyone on that instance. One switch, not a plan choice.

Voice matches the rest of the site: lowercase, playful, matches
`Features`/`HowItWorks` tone rather than reading like a dry ops doc.

## Testing

- `Nav.test.ts` (new) — asserts both links render with correct `href`s,
  following the existing `Footer.test.ts` pattern.
- `docs/page.test.ts` (new) — asserts the loaded compose/env content renders
  and the key steps (prerequisites, pull/up commands, AI on/off explainer)
  are present, following the existing `page.test.ts` pattern.
- `env-parity-check.mjs` changes are exercised by running the script itself
  (already wired as a repo check) against both file pairs.
- `pnpm smoke` is the end-to-end proof the `compose.dev.yml` override still
  builds and boots the full stack correctly.
- No unit tests apply to the compose YAML restructuring itself (infra
  config, not code) — verified by running `pnpm smoke` and, separately, a
  manual `docker compose pull && up -d` against the plain `compose.yml` with
  no dev/site overlays.

## Out of scope

- Actually building/publishing a `.env.site.example`-driven flow for anyone
  but the maintainer — it's a one-target file, not a general product.
- Additional `/docs` sub-pages or a docs nav sidebar — the route is named
  generically for future growth, but only the self-host content ships now.
- Changing `pocketbase/Dockerfile`, `apps/web/Dockerfile`,
  `apps/worker/Dockerfile`, or `apps/site/Dockerfile` themselves.
- SaaS tiering/entitlement logic — unaffected by this change.
