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
- Gate the one existing AI feature (tag + summary on capture) behind Pro.
- Standard users keep full manual tagging via the existing `TagEditor` — no
  functionality lost, just no AI assist.
- Hosted-SaaS users can self-serve switch tiers from a minimal profile page.
- Self-hosted deploys need zero extra operator steps beyond the AI key they
  already configure (or don't).
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

### Where it's used
- **Worker** (`apps/worker/src/worker.ts`): before calling
  `deps.ai.tagAndSummarize`, resolve the capturing user's tier. On `standard`,
  skip the AI call — `excerpt` falls back to the extractor's excerpt (already
  wired: `ai.summary || result.excerpt`), `ai_tags_json` stays empty, the
  article is otherwise unaffected. On `pro`, call AI as today.
- **Web** (profile page + any future gated UI): same `resolveTier`, called
  server-side with the session user and server-side deploy config — never
  exposed as a client-trusted value.

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
- Worker: integration test asserts a `standard`-tier capture makes no call to
  the injected `AIProvider` (spy/mock) and `pro`-tier does.
- Migration: existing `free` rows read back as `standard` after migration;
  `pro` rows unchanged.
- Tier-toggle route: a user can only ever write their own `tier` (tenant
  isolation test, per repo convention); self-hosted mode rejects/hides the
  toggle route entirely.
- Quota: existing quota tests updated for the renamed `standard` key,
  behavior otherwise unchanged.

## 7. Risks

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
