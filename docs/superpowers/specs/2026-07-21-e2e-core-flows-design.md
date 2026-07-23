# E2E tests for core user flows

Date: 2026-07-21
Status: approved, not yet implemented

## Problem

The app has no end-to-end coverage. Unit and integration tests are thorough —
pure logic, extractors against saved fixtures, integration suites against an
ephemeral PocketBase — but nothing drives a browser through a real user journey.

`scripts/smoke-test.sh` is often mistaken for this coverage. It is not:

- No browser, no UI. It checks that web returns *any* HTTP status, then greps
  `/_app/env.js` for the runtime `PUBLIC_PB_URL` sentinel.
- No auth. It seeds a job by POSTing to PocketBase as superuser, bypassing
  `/api/capture`. Its header comment still claims the app "has no auth yet" —
  stale since Phase 2.
- One meaningful assertion: a seeded `extract` job reaches `status: "done"`.
- Not wired into CI. `.github/workflows/` contains only `docker-publish.yml`
  and `release-please.yml`; neither invokes it. It is a manual `pnpm smoke`.

It proves the containers boot and the worker drains a job. Everything else —
signup, capture through the UI, search, reader, collections, tags, highlights,
delete — is uncovered end to end.

The smoke test stays as-is (it is the container-boot check), but its stale
auth comment should be corrected while this work is in flight.

## Goals

Guard the flows a user cannot work around if broken:

1. Account sign-up / login
2. Capture: paste a link on the homepage, article gets extracted
3. Find it via search
4. Open and read it
5. Add to a collection, tag it, add a highlight
6. Delete it

## Non-goals

- Replacing unit or integration coverage. E2E is the outermost thin layer.
- E2E for every feature. See the CLAUDE.md rule in "Documentation changes".
- Testing the real outbound fetch path in Playwright (see "Fixture fetcher").
- Visual regression testing.

## Test structure

Three tiers, split by setup cost. Not one long test, and not fully atomized.

The flow is a dependency chain — each step consumes the prior step's artifact —
which is what makes both extremes bad:

- **One long test:** a failure at "add a highlight" does not say which of six
  subsystems broke, and each retry re-runs the full chain including a real
  worker extraction.
- **Fully atomized:** every test repeats signup + capture + wait-for-extraction,
  multiplying the slowest path in the suite by N.

### Tier 1 — `e2e/auth.setup.ts`

Playwright *setup project*. Signs up and logs in once, saves `storageState`;
downstream specs reuse the session. The only place the signup flow is asserted.

Runs with `SELF_HOSTED=true` so the `/verify` email gate is skipped — otherwise
signup requires a mail server. Confirmed in `apps/web/src/routes/login/+page.svelte`:
self-hosted mode routes straight to `/` after signup, SaaS mode gates at `/verify`.

### Tier 2 — `e2e/capture.spec.ts`

A single `test.describe.serial()` chain: paste link → job queued → worker
extracts → article appears in library → search finds it → reader opens.

Serial because genuinely dependent. Each stage is a `test.step()` so failures
report which stage broke rather than just "the test failed."

This is the **only** spec that runs the real capture pipeline.

Search ranking is deterministic here because `FakeEmbedder`
(`apps/worker/src/embed/fake-embedder.ts`) hashes lowercased tokens into
dimension buckets — texts sharing vocabulary get similar vectors, so an article
matching the query ranks top without a real model. Set `EMBED_PROVIDER=fake`.

### Tier 3 — `e2e/article-ops.spec.ts`

Tag, add-to-collection, highlight, and delete as independent, parallel tests.
Each receives a freshly seeded article injected directly into PocketBase by a
fixture — no capture, no worker, no waiting. These are UI-and-API operations on
an existing article; waiting on extraction buys nothing.

## Fixture fetcher

The worker's SSRF guard (`apps/worker/src/fetch/private-address.ts`) rejects
loopback, all RFC1918 ranges, and link-local unconditionally, with no env
escape hatch. So a fixture HTTP server is unreachable by the worker at any
address available in a test environment — `127.0.0.1` is blocked, and a fixture
container in the compose network gets a `172.16–31.x` address, also blocked.

Approach: an e2e-only worker entrypoint injects a fixture `Fetcher` serving
saved HTML. The worker already takes `Extractor`/`Fetcher` as interfaces
(`apps/worker/src/extract/extractor.ts`), so this uses a DI seam that already
exists. Real UI, real job queue, real PocketBase, real extraction pipeline —
only outbound HTTP is swapped. The SSRF guard is untouched.

Rejected alternatives:

- **Env-gated SSRF bypass** (`SAFE_FETCH_ALLOW_PRIVATE=true`): puts a
  production-reachable bypass of a security boundary in shipping code, guarded
  only by an env var.
- **Fetch a real external URL:** makes the release gate fail when a third-party
  site is down. A flaky gate that blocks releases is worse than no gate.
- **Seed articles directly, skip capture entirely:** drops the capture flow,
  which is one of the flows this suite exists to guard.

Accepted tradeoff: the e2e stack runs a worker built with a test entrypoint, so
the outbound fetch path itself is not what ships. That path stays covered by the
`safe-fetch` unit tests (`safe-fetch.test.ts`, `-redirect`, `-bytes`) and by the
smoke test's genuine fetch of `example.com`. The gap is covered twice already,
just not inside Playwright.

## Infrastructure

Specs live in a root-level `e2e/` directory. `vitest.workspace.ts` globs
`packages/*` and `apps/*`, so root `e2e/` is excluded from the vitest run with
no extra config.

Base URL is parameterized via `E2E_BASE_URL`, so one set of specs serves both
harnesses:

- **Local (`pnpm e2e`):** Playwright `webServer` boots an ephemeral PocketBase
  (reusing `startEphemeralPb` from `packages/core/src/pb/test-harness.ts`), a
  built web preview, and the worker with the fixture fetcher. Fast iteration.
- **CI:** identical specs, `E2E_BASE_URL` pointed at a compose stack built from
  the candidate images. Verifies the real artifact.

Worker env for both: `AI_PROVIDER=mock`, `EMBED_PROVIDER=fake`, fixture fetcher.
Web env: `SELF_HOSTED=true`.

## CI restructure

`docker-publish.yml` currently builds and pushes in one matrix job, then deploys
to production on push to main. Version tags (`v*`) from release-please trigger
the same workflow.

That ordering means a gate placed after publish cannot un-publish. A failed e2e
would leave `latest` pointing at a broken image until the next successful push
to main — potentially overnight — and worse, would leave a **version tag such as
`v0.3.5` permanently pointing at a broken image**. Correcting that requires
deleting a published version tag that self-hosters may already have pulled.

So the gate goes before publish:

```
build  (push: false, load: true)
  → e2e
  → push   (on green only)
  → deploy (needs: push)
```

`cache-from: type=gha` is already configured, so the build feeding e2e is a
cache hit rather than a second full build.

Result: nothing reaches ghcr unless the suite passes, and a bad version tag can
never be published.

## Documentation changes

Replace the final bullet of the **Testing** section in `CLAUDE.md` — currently
`**E2E (Playwright)** comes later for the reader flow.` — with:

> - **E2E (Playwright) covers core user flows, not every feature.** A flow is
>   **core** if a user who hits it broken is done — the app no longer does the
>   thing they came for. Currently: sign-up/login, capture → extract, search,
>   read, annotate (tag/collection/highlight), delete. A broken settings page or
>   export target is annoying, not catastrophic — not core.
>
>   **New features that meet that bar ship with e2e coverage**, not just unit
>   tests; a tier upgrade/checkout flow would qualify on arrival. Changes to an
>   existing core flow update its spec. Keep the list above current.
>
>   Everything else stays on unit + integration tests as described above: new
>   extractors or AI providers, connectors and export targets, UI components,
>   pure logic, settings.
>
>   **Corollary — core flows need a test seam.** A core flow that calls a third
>   party must expose an injectable interface so e2e runs offline and
>   deterministically, the way the worker's `Fetcher` is swapped for a fixture
>   in `e2e/`. For payments: the provider behind an interface with a fake —
>   never live calls to a payment sandbox from the suite.

The criterion is stated in terms of user impact rather than implementation
shape, so it generalizes to flows that do not exist yet. The checkout example is
speculative — that feature is undesigned — and should be revised once a real
qualifying flow lands, rather than treated as fixed.

Also add `pnpm e2e` to the **Commands** section.

## Open items for the implementation plan

- Exact seeding mechanism for Tier 3 fixtures (superuser REST vs. a helper built
  on the existing PB harness).
- Which saved HTML fixture the capture spec uses, and where it lives relative to
  the existing extractor fixtures.
- Whether the worker's e2e entrypoint is a separate Dockerfile target or an
  env-selected fetcher in the existing entrypoint.
- Correcting the stale auth comment in `scripts/smoke-test.sh`.
