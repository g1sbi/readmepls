# Phase 8 — Tiering & Entitlements — Design

**Date:** 2026-07-02
**Status:** Approved design, pre-implementation
**Supersedes:** `2026-06-28-reading-roadmap-design.md` (phases 8–12, scrapped).
**First of a new roadmap** aimed at the reading experience: (A) Tiering &
Entitlements — this doc, (B) Reading Progress, (C) AI Next-Best-Read, (D)
Speed-Reading Toggle, (E) full Profile Page. Each gets its own spec + plan in
its own future run. B and C are ordered after A because C is explicitly
Pro-gated and benefits from B's data existing first.

## 1. Summary

The app has one AI feature today — auto-tagging + summary on capture — and it
runs unconditionally for every user, for free. This phase introduces a
Standard/Pro split so AI features can be gated going forward (starting with
this one, and later Phase C's AI next-best-read), without retrofitting the
gating seam each time a new AI feature ships.

Two deploy shapes, two different rules for who gets Pro:

- **Hosted SaaS** (the run-by-us instance): tier is per-user and self-serve —
  a user flips Standard⇄Pro themselves, no payment gate. Monetization is a
  separate, later phase; this phase only builds the seam.
- **Self-hosted**: tier is not per-user at all. One deploy-time switch —
  operator configures an AI provider key or doesn't — decides Pro or Standard
  for *everyone* on that instance.

## 2. Goals / Non-Goals

### Goals
- A single, pure, unit-tested `resolveTier` function that both deploy shapes
  go through — no scattered `if (user.tier === 'pro')` checks.
- Gate the one existing AI feature (tags + summary) behind Pro **at display
  time** — see §3 for why this can't be a write-time (worker) gate.
- Standard users keep full manual tagging via the existing `TagEditor` — no
  functionality lost, just no AI assist shown to them.
- Hosted-SaaS users can self-serve switch tiers from a minimal profile page.
- Self-hosted deploys need no separate tier-management mechanism — telling
  hosted-SaaS and self-hosted deployments apart still needs one explicit
  `SELF_HOSTED` env flag (a same-deployment-mode signal can't be inferred
  from AI-key presence alone, since hosted SaaS always has a key too), but
  it's one more line in the same `.env` file operators already edit per the
  README's existing self-host setup — not a new mechanism, page, or command.
- Rename the `free` tier value to `standard` to match the product naming.

### Non-Goals (deferred)
- **Payment/billing wiring.** Was already deferred in the original design
  (`2026-06-21-reader-app-design.md` §2) and stays deferred — the hosted-SaaS
  toggle is free to flip in both directions until a future monetization phase
  adds a real gate.
- **Per-user tiers on self-host.** Explicitly rejected — one deploy-level
  switch governs every user on a self-hosted instance.
- **Any admin UI for tier management.** PocketBase's built-in admin panel
  already gives full CRUD on the `users` collection; nothing custom is built.
- **Gating anything beyond AI tag/summary.** Next-best-read (Phase C) and any
  other future Pro feature reuse `resolveTier`, but aren't built here.
- **The full profile page** (Feature E) — this phase seeds only the tier
  display + toggle; the rest of the profile page is a later phase.

## 3. Architecture

### Deployment-mode signal
A new env var, `SELF_HOSTED` (boolean, default `false`), is the only new
config surface. It's read once at the process boundary (SvelteKit server
config + worker config) and passed into `resolveTier` as data — the function
itself never touches `process.env`, keeping it a pure, fixture-testable unit
in `@readmepls/core`.

### `resolveTier`
```ts
type Tier = 'standard' | 'pro';

interface TierConfig {
  selfHosted: boolean;
  aiProviderConfigured: boolean; // derived once from AI_PROVIDER/ANTHROPIC_API_KEY presence
}

function resolveTier(user: { tier: Tier }, config: TierConfig): Tier {
  if (config.selfHosted) {
    return config.aiProviderConfigured ? 'pro' : 'standard';
  }
  return user.tier;
}
```
- Self-hosted: `user.tier` is ignored entirely — the function is a pure
  function of deploy config, uniform for every user on that instance.
- Hosted SaaS: `user.tier` is authoritative, read from the user's own record.

### Why gating happens at read time, not write time
`content` (title, excerpt, `ai_tags_json`) is a **global, deduped cache**
keyed by `canonical_url` — the first capture of a URL, by anyone, runs
extraction + AI tagging once, and every later capture of the same URL
(any user, any tier) is a cache hit that reuses that row; the worker never
re-runs AI for it. Gating the AI call at capture time by *the capturing
user's* tier would mean a Standard user who happens to capture a new URL
first permanently denies AI tags to that content for every future Pro user
too — and conversely a Standard viewer could see AI tags a different, prior
Pro user already paid to generate. Tier is a property of the *viewer*, not
of the *content*, so the gate belongs at render time, per viewing user.

### Where it's used
- **Worker** (`apps/worker/src/worker.ts`, `apps/worker/src/ai/select-provider.ts`):
  **unaffected by per-user tier.** Hosted SaaS keeps calling AI on every new
  URL exactly as today — that behavior doesn't change in this phase. The
  only new worker behavior is for **self-hosted with no AI key configured**:
  `selectAiProvider` currently assumes a provider always exists (mock or
  real) and has no "none configured" path. Add a `NullAIProvider` returning
  `{ tags: [], summary: '' }` so extraction can complete without crashing
  when a self-host operator hasn't set up AI. This is deploy-config-driven
  (no key → `NullAIProvider`), never per-user.
- **Web** (library list, reader page, capture-bar tag display): resolve the
  *viewing* user's tier server-side (session user + server deploy config,
  never a client-trusted value) and gate presentation — a `standard`-tier
  viewer's UI shows the plain extractor excerpt and empty/manual tags,
  ignoring `content.ai_tags_json`/AI summary even when populated; a
  `pro`-tier viewer sees the full AI output. Every surface that reads
  `content.ai_tags_json` or treats `content.excerpt` as an AI summary must
  go through this gate — enumerate them in the plan (library cards, reader
  header, search results if they show tags).

## 4. Data Model Deltas

```
users   tier: 'free' | 'pro'  →  tier: 'standard' | 'pro'
```
- Migration renames existing `free` values to `standard`; `pro` rows
  untouched. No new fields.
- `packages/core/src/quota/quota.ts`'s `LIMITS` map key `free` becomes
  `standard`; capture-volume quota logic and numbers are otherwise unchanged
  — it's an orthogonal, already-solved concern that continues to key off the
  same field.
- `Tier` becomes a shared union type in `@readmepls/types`, replacing the
  loose `string` currently used in `QuotaState.tier`.

## 5. UI: Minimal Profile Page

A new route, `/profile` — the seed of Feature E, built to the final path so
it isn't relocated later.

- Shows current tier (Standard/Pro badge).
- **Hosted SaaS:** a toggle/button to switch tier immediately (calls a server
  route that writes `user.tier`, scoped to the authenticated user's own
  record — PocketBase API rule enforces a user can only write their own
  `tier`, not anyone else's).
- **Self-hosted:** no toggle — shows which tier the instance is running in
  and a short note that it's set by the operator's deploy config.
- No other profile content yet (avatar, stats, BYO-key relocation, etc. —
  Feature E).

## 6. Testing

- `resolveTier`: pure unit tests across all four combinations (self-host +AI,
  self-host −AI, SaaS user=standard, SaaS user=pro).
- `NullAIProvider` / `selectAiProvider`: unit test that no key + no
  `AI_PROVIDER=mock` yields `NullAIProvider`, and it returns
  `{ tags: [], summary: '' }` without throwing.
- Worker integration: a self-hosted job with no AI configured completes with
  empty `ai_tags_json` and `excerpt === result.excerpt` (extractor excerpt,
  not an AI summary); hosted-SaaS/self-host-with-key behavior is unchanged
  from today (still covered by existing worker tests).
- Web: given the same `content` row (with populated `ai_tags_json`/AI
  excerpt), a `standard`-tier viewer's library/reader render shows the plain
  excerpt and no AI tags; a `pro`-tier viewer sees both. Covers the case
  where a Pro user captured first and a Standard user views the same
  content.
- Migration: existing `free` rows read back as `standard` after migration;
  `pro` rows unchanged.
- Tier-toggle route: a user can only ever write their own `tier` (tenant
  isolation test, per repo convention); self-hosted mode rejects/hides the
  toggle route entirely.
- Quota: existing quota tests updated for the renamed `standard` key,
  behavior otherwise unchanged.

## 7. Risks

- **Display-gate bypass leaks AI output to Standard users** — every render
  surface that reads `content.ai_tags_json` or `content.excerpt` (as an AI
  summary) must route through `resolveTier`, or a Standard-tier viewer sees
  AI output a different Pro user's capture happened to generate. Enumerate
  every such surface explicitly in the implementation plan; don't rely on a
  single central chokepoint since content is read in more than one route.
- **Hosted-SaaS AI spend is unchanged by this phase** — cost is already a
  function of unique-URL volume (the shared cache), not per-user tier;
  gating display doesn't reduce it. If AI cost needs to scale with paying
  users specifically, that's a larger, later change (a per-user AI
  enrichment path decoupled from the shared cache) — explicitly out of
  scope here.
- **Silent cost creep if `resolveTier` is bypassed** — any new AI feature
  (Phase C included) must route through it rather than re-deriving tier
  logic locally. Keep it the single seam.
- **Self-host operators mid-migration** — an instance with `SELF_HOSTED`
  unset defaults to hosted-SaaS behavior (per-user `tier`), which is safe
  (existing self-host deploys have no per-user tier data anyway, so
  `user.tier` will read whatever the migration backfilled — `standard` —
  until the operator explicitly sets `SELF_HOSTED=true`). Document this
  clearly in the self-host README/env example.
- **Free self-serve toggle means no real monetization yet** — expected and
  accepted; this phase is the seam, not the business model.
