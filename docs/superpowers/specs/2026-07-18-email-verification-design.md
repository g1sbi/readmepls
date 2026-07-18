# Email verification for signups (SaaS only) — design

**Status:** approved, ready for planning
**Date:** 2026-07-18
**Scope:** Hosted SaaS only (`SELF_HOSTED=false`). Self-hosted instances are
untouched — no SMTP, no gate, no UI change.

## Goal

New SaaS signups must verify their email before using the app. Enforcement is a
**hard block**: an authenticated-but-unverified user is locked out of every app
route and every mutating API until they confirm. Uses PocketBase's native
verification flow end-to-end — no custom mailer, no new collection.

## Non-goals

- Self-hosted verification. Self-host has no SMTP and everyone on the instance
  shares an instance-wide tier; adding a mail gate there is out of scope.
- Custom email templates / branded transactional email. PB's built-in template
  (with its action URL overridden) is sufficient.
- Password reset, MFA, or any other auth flow. Verification only.
- A new `jobs`-based worker mailer. PB sends the mail.

## Background (current state)

- Signup is **entirely client-side**: `apps/web/src/routes/login/+page.svelte:22-27`
  calls `pb.collection("users").create(...)` then `authWithPassword(...)` and
  redirects to `/`. No verification step.
- The default PocketBase `users` collection already ships a `verified` field;
  nothing sets, checks, or gates on it today.
- Auth middleware lives in `apps/web/src/hooks.server.ts:13-56`; the route gate is
  `routeGuard()` in `apps/web/src/lib/server/auth.ts:3-6` (`/login` and `/api/*`
  public, everything else requires auth). Auth resolution (cookie + bearer) is
  `resolvePbAuth` in `apps/web/src/lib/server/api-auth.ts`.
- SaaS vs self-host toggle: `SELF_HOSTED` env, read at
  `apps/web/src/routes/+layout.server.ts:6` and returned to every page as
  `data.selfHosted`.
- No SMTP is configured anywhere. PB mail settings are never set. `.env.example`
  has no mail vars.

## Architecture

One conceptual gate ("is this SaaS user verified?"), enforced at two layers, both
keyed off `SELF_HOSTED !== "true"`:

1. **Page layer** — `routeGuard` redirects authenticated-but-unverified SaaS
   users to `/verify` for every app route except the allowlist.
2. **API layer** — a shared `requireVerified()` helper on the two mutating
   SvelteKit API routes (`/api/capture`, `/api/retry`) returns 403. This also
   covers the browser extension, which captures via `/api/capture` with a bearer
   token (`resolvePbAuth` already handles bearer + cookie identically).

Verification itself is PocketBase-native:
`requestVerification(email)` → PB sends templated email → user clicks link to
`/verify?token=…` → `confirmVerification(token)` sets `verified=true`.

### Why this shape

- Single choke point that already exists (`routeGuard`), so the page block is one
  added branch, not a new subsystem.
- No new collection or migration — `verified` already exists on `users`.
- Self-host bypass is a single `selfHosted` check; the self-host path never
  touches SMTP or the gate.
- Rejected alternatives: **client-side guard** (bypassable, leaves APIs open);
  **PB API-rule enforcement** (`@request.auth.verified=true` on every collection
  rule) — strongest at the data layer but breaks self-host, where nobody is
  verified, and PB rules cannot read the `SELF_HOSTED` env cleanly.

## Components

### New files

- **`apps/web/src/routes/verify/+page.svelte`** — the gated landing screen.
  - With `?token=T` in the URL: call `confirmVerification(T)`, then `authRefresh()`
    to pick up the now-stale `verified` claim, then redirect to `/`.
  - Without a token: "check your email" message, a **resend** button
    (`requestVerification(currentUserEmail)`), and a **logout** link
    (client-side `pb.authStore.clear()` → navigate to `/login`).
  - Uses existing `ui/Button.svelte`. Mobile-first, token-driven styling, usable
    at 360px (per CLAUDE.md).
- **`apps/web/src/lib/server/require-verified.ts`** — pure helper
  `requireVerified({ verified }, selfHosted)`: throws a 403 (`error(403, …)`) when
  `!selfHosted && !verified`; no-ops otherwise. Unit-tested in isolation.
- **`pocketbase/pb_hooks/verification_config.pb.js`** — on serve, when
  `SELF_HOSTED !== "true"`, configure PB from env:
  - SMTP settings (`smtp.enabled/host/port/username/password/tls`,
    `smtp.senderName`, `smtp.senderAddress`) from `SMTP_*`.
  - `meta.appUrl = ORIGIN` (the SvelteKit origin) so email links point at the app.
  - Override the verification email template action URL to
    `{APP_URL}/verify?token={TOKEN}` (default points at the PB admin UI).
  - If `SMTP_HOST` is unset in SaaS mode, log a warning (mail cannot send) and
    skip SMTP config. Mirrors the existing `bootstrap_superusers.pb.js` pattern.

### Changed files

- **`apps/web/src/lib/server/api-auth.ts`** (`resolvePbAuth`) — additionally
  surface `verified` from the resolved auth record.
- **`apps/web/src/hooks.server.ts`** — set `event.locals.verified`; read
  `selfHosted` from `process.env.SELF_HOSTED` and pass it to `routeGuard`.
- **`apps/web/src/lib/server/auth.ts`** (`routeGuard`) — when
  `!selfHosted && authenticated && !verified` and the path is not allowlisted,
  redirect to `/verify`. Allowlist: `/verify`, `/login`, and
  `/api/single-account/status`. (`/api/*` stays public for auth purposes; the
  per-route `requireVerified` handles API verification.) Logout needs no
  allowlist entry — it is a client-side `pb.authStore.clear()` that navigates to
  `/login` (already allowlisted); there is no server logout route.
- **`apps/web/src/routes/login/+page.svelte`** — after a successful signup:
  - SaaS (`!data.selfHosted`): call `requestVerification(email)`, then redirect to
    `/verify` (instead of `/`). Signin is unchanged.
  - Self-host: redirect to `/` as today.
- **`apps/web/src/routes/api/capture/+server.ts`** and
  **`apps/web/src/routes/api/retry/+server.ts`** — call `requireVerified` at the
  top of the handler (after auth resolves, before doing work).
- **`app.d.ts`** (`App.Locals`) — add `verified: boolean`.
- **`.env.example`** — add a SaaS-only SMTP block:
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_TLS`,
  `SMTP_FROM` (sender address), `SMTP_FROM_NAME`, documented as required for SaaS
  signup email and ignored when `SELF_HOSTED=true`.

## Data flow

```
signup: users.create → authWithPassword           (verified = false)
      → requestVerification(email) → PB sends mail (SMTP)
      → redirect /verify
guard : every app route + /api/capture,/api/retry pinned/blocked while unverified
email : link → /verify?token=T → confirmVerification(T)   (verified = true)
      → authRefresh() → redirect / → guard + requireVerified pass
```

No new collections or migrations — `verified` already ships on `users`.

## Error handling

- **SMTP unset/broken in SaaS**: `requestVerification` fails; `/verify` shows a
  "couldn't send — retry" state; the user stays gated (fail-closed). Config hook
  logs a warning at boot.
- **Invalid / expired token**: `confirmVerification` throws → `/verify` shows
  "link expired — resend."
- **Resend**: relies on PocketBase's built-in verification rate limit; surface its
  error inline rather than adding our own limiter.
- **Guard**: fails **open only for self-host**; a SaaS unverified user always
  redirects (fail-closed). API `requireVerified` is fail-closed the same way.

## Testing (TDD — failing test first, per CLAUDE.md)

Vitest, offline, network mocked.

- **`require-verified` unit** — 403 when SaaS + unverified; passes when verified;
  passes when self-host.
- **`routeGuard` unit** — unverified SaaS → redirect `/verify`; verified →
  allowed; self-host unverified → allowed; `/verify` itself → allowed.
- **signup (`login` page)** — SaaS signup calls `requestVerification` and redirects
  `/verify`; self-host signup does neither (redirects `/`).
- **`/verify` page** — with token: `confirmVerification` called → redirect; without
  token: renders resend + logout.
- **Integration (ephemeral PB)** — set a user's `verified` true/false, assert
  `/api/capture` and `/api/retry` return 403 vs 200 accordingly; existing tenant
  isolation tests still pass. Email send is mocked — no live SMTP.

## Rollout / config notes

- SaaS deploy must set the `SMTP_*` env vars (transactional email provider creds).
  No secrets committed; `.env.example` documents the keys.
- Existing SaaS users predating this change have `verified=false` and would be
  gated on next visit. If that is undesirable, a one-off data migration can set
  `verified=true` for accounts created before the cutover — flagged for the
  implementation plan to decide, not baked into this design.
