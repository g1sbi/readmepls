# Docker Second-Pass — Design Spec

**Date:** 2026-06-27
**Phase:** 7 (Docker self-host). Docker was implemented early, in parallel with
Phase 2 (`2026-06-22-docker-self-host-design.md`). This is a second pass to verify
the dockerization still holds after Phases 3–6 added features, deps, migrations,
and hooks.
**Status:** Approved design, pre-implementation.

## Goal

Confirm `docker compose up -d` still produces a working self-host on the current
codebase, and fix the drift introduced since the original docker phase. Infra
only — no product features, no visual design.

## Findings from the audit

A static pass over the docker config and env/code usage found:

1. **Browser→PocketBase URL is broken in a published image (the real bug).**
   The browser PocketBase client reads `import.meta.env.VITE_PB_URL`
   (`apps/web/src/lib/pb.ts:8`, `apps/web/src/routes/search/+page.svelte:18`).
   `import.meta.env.VITE_*` is a **Vite build-time constant** — it is statically
   replaced at `vite build` and frozen into the image. No runtime env can change
   it. `VITE_PB_URL` is neither in `.env.example` nor passed to the web image nor a
   build ARG, so the published image bakes the fallback `http://127.0.0.1:8090`.
   On any non-localhost self-host, the browser then issues PB calls to
   `127.0.0.1:8090` and fails. The `search` call site is from Phase 4 — i.e. drift
   added after the docker phase.

2. **`PUBLIC_PB_URL` is dead.** `.env.example` declares it as the browser-facing PB
   URL — exactly the value the client needs — but no code reads it. The code
   diverged to `VITE_PB_URL`.

3. **`env-parity-check.mjs` cannot catch this.** It diffs `${VAR}` in `compose.yml`
   against `.env.example` only; it never inspects code. That blind spot is why the
   drift shipped.

Confirmed **not** drifted (baked/wired correctly): worker auth
(`PB_WORKER_EMAIL`/`PB_WORKER_PASSWORD`), `ANTHROPIC_API_KEY`, `AI_MODEL`,
`AI_PROVIDER` mock path, yt-dlp via apk (Phase 5), new deps `sanitize-html`
(worker) and `jszip` (web), the Phase-4/6 migrations, and the `search.pb.js` hook
(all `COPY`-baked into the pocketbase image). `apps/worker/dist/` is gitignored, so
no build artifact is committed. The smoke test, CI workflow, and the three
Dockerfiles are otherwise structurally sound.

## Fix

### Browser PB URL → runtime public env (chosen)

- Add a single helper `publicPbUrl()` in `apps/web/src/lib/` that reads SvelteKit
  `$env/dynamic/public` → `PUBLIC_PB_URL`, with fallback `http://127.0.0.1:8090`
  for local `vite dev`. `$env/dynamic/public` is resolved at **runtime** by
  `adapter-node` and exposed to the browser, so one published image serves any host
  by setting `PUBLIC_PB_URL` in its environment.
- Repoint both call sites (`lib/pb.ts`, `routes/search/+page.svelte`) at the helper.
  Remove all `import.meta.env.VITE_PB_URL` usage.
- This makes the already-declared `PUBLIC_PB_URL` live and DRYs the fallback into
  one place.
- **No `compose.yml` change required:** every service already gets `env_file: .env`,
  and `.env.example` already declares `PUBLIC_PB_URL=http://localhost:8090`. The
  operator sets it to their public PB origin.

**Rejected alternative — build ARG.** Pass `VITE_PB_URL` as a docker `--build-arg`
and bake it per host. This forces a rebuild per deployment and breaks reuse of the
published `latest` image across hosts — the opposite of the self-host goal.

### Harden the parity check (prevention)

Extend `scripts/env-parity-check.mjs` so that, in addition to compose↔`.env.example`,
every `PUBLIC_*` variable read via `$env/dynamic/public` anywhere under
`apps/web/src` must be declared in `.env.example`. Keep it a plain static scan (no
build, no deps). This is the guard that would have caught finding #1.

## Verification

1. **TDD first.** A failing Vitest on `publicPbUrl()` that mocks
   `$env/dynamic/public` and asserts it returns `PUBLIC_PB_URL` when set and the
   localhost fallback when unset. Implement to green. Then `pnpm --filter
   @readmepls/web check` and a web build to confirm no `VITE_PB_URL` reference
   remains.
2. **Boot smoke test.** Run `scripts/smoke-test.sh`: `docker compose up -d --build`
   with `AI_PROVIDER=mock`, wait for all three services healthy, seed a job via the
   PB superuser REST API, assert it reaches `done`, `docker compose down -v`. This
   proves the three images **build on the current dependency set** (yt-dlp,
   sanitize-html, jszip, the new migrations and `search.pb.js` hook) and that the
   capture loop works end-to-end.
3. **Close the smoke-test gap for the URL fix.** The smoke test drives PB over REST
   and never loads the browser client, so on its own it cannot exercise the
   `PUBLIC_PB_URL` change. Add one cheap assertion: fetch the web app's served
   runtime public-env payload and assert it carries the configured `PUBLIC_PB_URL`
   value, not `127.0.0.1`. This verifies the runtime-env wiring without a browser.

## Future work (out of scope here)

- **E2E (Playwright) for the reader + self-host flow.** A real browser asserting the
  client reaches PocketBase at the configured `PUBLIC_PB_URL` (and the core capture →
  read flow) belongs in the dedicated E2E phase noted in CLAUDE.md ("E2E comes
  later"). The curl-based assertion above is the interim, browserless guard; it does
  not replace E2E. When the E2E suite lands, fold this check into it.
- Worker health/heartbeat endpoint (already deferred by the original spec).
- TLS / bundled reverse proxy (operator-provided, per original spec).

## Files to touch

- `apps/web/src/lib/` — new `publicPbUrl()` helper + its test.
- `apps/web/src/lib/pb.ts`, `apps/web/src/routes/search/+page.svelte` — use the
  helper; drop `VITE_PB_URL`.
- `scripts/env-parity-check.mjs` — add the `PUBLIC_*` code-vs-env check.
- `scripts/smoke-test.sh` — add the served-public-env assertion.
- No changes to `compose.yml`, the Dockerfiles, `.env.example`, or CI are expected;
  the audit found them correct. Any required change surfaced during implementation
  is in scope.
