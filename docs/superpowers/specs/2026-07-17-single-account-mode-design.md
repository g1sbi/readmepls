# Single-account mode — Design

## Problem

A self-hoster running readmepls on a public URL has no way to keep it
private to themselves. Anyone who finds the URL can sign up and gain a
full account. Self-hosters who want a personal, single-user instance need
a way to lock signup down to just the first account created.

## Goal

A `SINGLE_ACCOUNT=true|false` env var (default `false`) that, once one
account exists on a self-hosted instance, blocks all further signups —
both at the API level and in the UI.

## Scope

- Only takes effect when **both** `SELF_HOSTED=true` and
  `SINGLE_ACCOUNT=true`. The hosted SaaS is a shared multi-tenant
  PocketBase instance; requiring `SELF_HOSTED=true` means a stray
  `SINGLE_ACCOUNT=true` can never accidentally lock out all future SaaS
  signups after the first one.
- Lock condition: the `users` collection has ≥1 record. This also covers
  a self-hoster who already has multiple accounts before turning the flag
  on — new signups are blocked regardless of how many accounts already
  exist; existing accounts are unaffected.
- Out of scope: deleting/demoting extra accounts, admin UI for managing
  the single account, per-account allowlists. If a self-hoster needs any
  of that, they use the PocketBase admin UI directly.

## Enforcement mechanism

Enforcement lives in PocketBase, not the client — matches the existing
security boundary convention ("PocketBase API rules are the security
boundary. Never rely on the client to enforce access.").

New hook file `pocketbase/pb_hooks/single_account.pb.js`:

- `onRecordCreateRequest` bound to the `users` collection: rejects the
  create request (`ForbiddenError`) when locked. This is what actually
  stops a second signup, independent of what the UI shows.
- `routerAdd("GET", "/api/single-account/status")`: public, unauthenticated
  route returning `{ locked: boolean }`. Used by the web app to decide
  whether to render the sign-up UI.
- Both share one `locked()` helper: returns `false` immediately unless
  `SELF_HOSTED=true` and `SINGLE_ACCOUNT=true`; otherwise counts `users`
  rows via a raw SQL query (`$app.db().newQuery("SELECT COUNT(*) as count
  FROM users").one(result)` — same raw-SQL-via-DynamicModel style already
  used in `search.pb.js`) and returns `count > 0`.

Known accepted edge case: a race between two simultaneous first-time
signups is not specifically guarded against (no transaction/lock beyond
whatever PocketBase's request handling already serializes). This is a
single-operator self-host scenario — the realistic risk is negligible,
and adding distributed-lock complexity for it isn't worth it.

## Web app wiring

- New `apps/web/src/routes/login/+page.server.ts`: server `load()` fetches
  `${PB_URL}/api/single-account/status`, validates the response shape with
  Zod, returns `{ locked: boolean }`. Reuses the existing `PB_URL` env var
  already used in `hooks.server.ts`.
- `apps/web/src/routes/login/+page.svelte`: reads `data.locked` via
  `let { data } = $props()`.
  - `locked === false` (current behavior): sign-in/sign-up toggle works as
    today.
  - `locked === true`: the mode-toggle button is not rendered, sign-up is
    unreachable through the UI, and a small note is shown — e.g. "this
    instance is locked to one account" — so a confused visitor (or the
    owner verifying their own setup) understands why.
- If someone submits a signup anyway while `locked` is stale client-side
  (e.g. another tab just signed up), the existing generic "Could not
  create account." error path in `submit()` already handles the 403 —
  no new error handling needed.

## Config

Add to `.env.example`, next to `SELF_HOSTED`:

```
# true = only the first account created can sign in; all further signups
# are rejected (both by the API and in the UI). Only takes effect when
# SELF_HOSTED=true. Leave false for a normal multi-user instance.
SINGLE_ACCOUNT=false
```

No change needed to the `/docs` self-hosting page — it renders the real
`.env.example` content verbatim (see `apps/site/src/routes/docs/+page.server.ts`),
so the new var shows up there automatically.

## Testing

- **Integration test** (new, alongside `packages/core/src/pb/tier-self-update.test.ts`-style
  tests): boots an ephemeral PocketBase with `SELF_HOSTED=true` and
  `SINGLE_ACCOUNT=true`, asserts:
  - `GET /api/single-account/status` → `{ locked: false }` before any
    account exists.
  - First `users` create succeeds.
  - `GET /api/single-account/status` → `{ locked: true }` afterward.
  - Second `users` create is rejected (403).
  - A control instance with `SINGLE_ACCOUNT=false` (or `SELF_HOSTED=false`)
    allows a second signup — proves the flag actually gates the behavior
    rather than something else blocking creation.
- `packages/core/src/pb/test-harness.ts`'s `startEphemeralPb` currently
  spawns PocketBase inheriting `process.env` with no way to override
  per-test. Extend its options with an optional `env?: Record<string, string>`
  merged over `process.env` for the spawned process, so tests can boot
  instances with different `SELF_HOSTED`/`SINGLE_ACCOUNT` combinations
  without mutating global process env (which would race under Vitest's
  parallel test execution).
- **Unit test** for `apps/web/src/routes/login/+page.server.ts`'s load
  function (mock `fetch`), matching the existing pattern in
  `apps/web/src/routes/layout.server.test.ts`.
- **Unit test** for `+page.svelte`: renders with `data.locked = true` →
  no sign-up toggle, note is present; `data.locked = false` → toggle
  present, note absent.
