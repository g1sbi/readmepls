# SaaS Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New hosted-SaaS signups must confirm their email before using the app; unverified users are hard-blocked from every page and every mutating API until they verify.

**Architecture:** One "is this SaaS user verified?" gate enforced at two layers — a redirect in the existing `routeGuard` (pages) and a shared `requireVerified()` check on the two mutating API routes (`/api/capture`, `/api/retry`). Verification uses PocketBase's native `request-verification` → email → `/verify?token=` → `confirm-verification` flow. Everything is keyed off `SELF_HOSTED !== "true"`; self-host is untouched (no SMTP, no gate).

**Tech Stack:** SvelteKit (server hooks + BFF routes), PocketBase 0.39.4 (auth, `verified` field, JSVM hooks + migrations), Vitest + @testing-library/svelte.

**Spec:** `docs/superpowers/specs/2026-07-18-email-verification-design.md`

## Global Constraints

- **SaaS-only gate.** Every gate branch is skipped when `process.env.SELF_HOSTED === "true"`. Self-host never touches SMTP or the verify flow.
- **TypeScript strict.** No `any` without a written reason.
- **TDD.** Failing test first, then minimal implementation, then green, then commit. One logical change per commit, Conventional Commits (`feat:`/`fix:`/`test:`/`docs:`).
- **Tests run via the single Vitest workspace:** `pnpm exec vitest run <pattern>` (NOT `pnpm --filter <pkg> test`).
- **No hardcoded colors/fonts** in the `/verify` component — reference `tokens.css` vars only. Mobile-first, usable at 360px, tap targets ≥44px.
- **PocketBase schema/config changes go through tracked files** (`pb_migrations/`, `pb_hooks/`), never manual admin edits.
- **No secrets in git.** SMTP creds live in env; keep `.env.example` current.
- **PB collection templates live on the auth collection** in 0.39 (`collection.verificationTemplate.subject/.body`), placeholders `{APP_URL}` and `{TOKEN}`. Settings (`smtp.*`, `meta.appURL`, `meta.senderName`, `meta.senderAddress`) live on `$app.settings()`.

---

### Task 1: `requireVerified` API-gate helper

Pure helper that throws a 403 for an unverified SaaS user; no-op for verified users and for self-host. Consumed by Tasks 5.

**Files:**
- Create: `apps/web/src/lib/server/require-verified.ts`
- Test: `apps/web/src/lib/server/require-verified.test.ts`

**Interfaces:**
- Produces: `requireVerified(locals: { verified: boolean }, selfHosted: boolean): void` — throws `error(403, "email not verified")` when `!selfHosted && !locals.verified`; returns `void` otherwise.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/server/require-verified.test.ts
import { describe, it, expect } from "vitest";
import { requireVerified } from "./require-verified.js";

function status(fn: () => void): number | "no-throw" {
  try {
    fn();
    return "no-throw";
  } catch (e) {
    return (e as { status: number }).status;
  }
}

describe("requireVerified", () => {
  it("throws 403 for an unverified SaaS user", () => {
    expect(status(() => requireVerified({ verified: false }, false))).toBe(403);
  });
  it("passes for a verified SaaS user", () => {
    expect(status(() => requireVerified({ verified: true }, false))).toBe("no-throw");
  });
  it("passes for self-host regardless of verified", () => {
    expect(status(() => requireVerified({ verified: false }, true))).toBe("no-throw");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run require-verified`
Expected: FAIL — cannot find module `./require-verified.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/server/require-verified.ts
import { error } from "@sveltejs/kit";

/**
 * Hard-block for the SaaS verification gate. Throws 403 when a hosted-SaaS user
 * has not confirmed their email. No-op for self-host (verification is SaaS-only)
 * and for already-verified users.
 */
export function requireVerified(
  locals: { verified: boolean },
  selfHosted: boolean,
): void {
  if (!selfHosted && !locals.verified) {
    throw error(403, "email not verified");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run require-verified`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/server/require-verified.ts apps/web/src/lib/server/require-verified.test.ts
git commit -m "feat(auth): add requireVerified API-gate helper"
```

---

### Task 2: Surface `verified` through auth resolution and `App.Locals`

`resolvePbAuth` must report the user's `verified` flag (read off the refreshed PB auth record) so the guard and API routes can consume it.

**Files:**
- Modify: `apps/web/src/lib/server/api-auth.ts`
- Modify: `apps/web/src/app.d.ts:6-9`
- Test: `apps/web/src/lib/server/api-auth.test.ts`

**Interfaces:**
- Produces: `resolvePbAuth(...)` now returns `{ userId: string | null; viaBearer: boolean; verified: boolean }`. `App.Locals` gains `verified: boolean`.
- Consumes: existing `PbLike` (extended: `model` may include `verified?: boolean`).

- [ ] **Step 1: Update the failing test**

Extend the fake and assertions in `apps/web/src/lib/server/api-auth.test.ts`. Add a `verified` option to `fakePb` and expect it in the returned object.

```ts
// in fakePb opts type, add:  verified?: boolean;
// in fakePb, set the model to carry verified in BOTH the cookie-preload and refresh branches:
//   let model: { id?: string; verified?: boolean } | null = opts.cookieValid
//     ? { id: opts.id ?? "u1", verified: !!opts.verified }
//     : null;
//   ...inside authRefresh ok branch:
//     model = { id: opts.id ?? "u1", verified: !!opts.verified };

// Update the four existing expectations to include verified, e.g.:
//   expect(r).toEqual({ userId: "u1", viaBearer: false, verified: false });
//   expect(r).toEqual({ userId: "u9", viaBearer: true, verified: false });
//   expect(r).toEqual({ userId: null, viaBearer: false, verified: false });   // (x2)

// Add one new test:
it("surfaces verified=true from the auth record", async () => {
  const pb = fakePb({ cookieValid: true, refreshOutcome: "ok", verified: true });
  const r = await resolvePbAuth(pb, "pb_auth=x", null);
  expect(r).toEqual({ userId: "u1", viaBearer: false, verified: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run api-auth`
Expected: FAIL — returned objects lack `verified`.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/server/api-auth.ts`:

Extend the `PbLike` model type (line 8):
```ts
    model: { id?: string; verified?: boolean } | null;
```

Change the return type and the three return sites:
```ts
): Promise<{ userId: string | null; viaBearer: boolean; verified: boolean }> {
  pb.authStore.loadFromCookie(cookie);
  if (pb.authStore.isValid) {
    try {
      await pb.collection("users").authRefresh();
      if (pb.authStore.isValid) {
        return {
          userId: pb.authStore.model?.id ?? null,
          viaBearer: false,
          verified: Boolean(pb.authStore.model?.verified),
        };
      }
    } catch {
      pb.authStore.clear();
    }
  }

  const bearer = parseBearer(authHeader);
  if (bearer) {
    pb.authStore.save(bearer, null);
    try {
      await pb.collection("users").authRefresh();
      if (pb.authStore.isValid) {
        return {
          userId: pb.authStore.model?.id ?? null,
          viaBearer: true,
          verified: Boolean(pb.authStore.model?.verified),
        };
      }
    } catch {
      // fall through to cleared/null
    }
  }

  pb.authStore.clear();
  return { userId: null, viaBearer: false, verified: false };
}
```

In `apps/web/src/app.d.ts`, add to `Locals` (after line 8):
```ts
      verified: boolean;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run api-auth`
Expected: PASS (all resolvePbAuth + parseBearer tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add apps/web/src/lib/server/api-auth.ts apps/web/src/lib/server/api-auth.test.ts apps/web/src/app.d.ts
git commit -m "feat(auth): surface verified flag from resolvePbAuth"
```

---

### Task 3: Verification-aware `routeGuard`

Extend the page guard: an authenticated-but-unverified SaaS user is redirected to `/verify`. `/verify` is public (the email link may open on a device with no session), like `/login`.

**Files:**
- Modify: `apps/web/src/lib/server/auth.ts`
- Test: `apps/web/src/lib/server/auth.test.ts`

**Interfaces:**
- Produces: `routeGuard(pathname: string, userId: string | null, verified: boolean, selfHosted: boolean): string | null`.

- [ ] **Step 1: Update the failing test**

Replace `apps/web/src/lib/server/auth.test.ts` with the new signature (4 args) and add verification cases:

```ts
import { describe, it, expect } from "vitest";
import { routeGuard } from "./auth.js";

describe("routeGuard", () => {
  it("redirects unauthenticated users away from protected pages", () => {
    expect(routeGuard("/", null, false, false)).toBe("/login");
    expect(routeGuard("/read/abc", null, false, false)).toBe("/login");
  });
  it("allows verified users through", () => {
    expect(routeGuard("/", "u1", true, false)).toBeNull();
    expect(routeGuard("/read/abc", "u1", true, false)).toBeNull();
  });
  it("never redirects login, verify, or api routes", () => {
    expect(routeGuard("/login", null, false, false)).toBeNull();
    expect(routeGuard("/verify", null, false, false)).toBeNull();
    expect(routeGuard("/api/capture", null, false, false)).toBeNull();
  });
  it("redirects an authenticated but unverified SaaS user to /verify", () => {
    expect(routeGuard("/", "u1", false, false)).toBe("/verify");
    expect(routeGuard("/read/abc", "u1", false, false)).toBe("/verify");
  });
  it("does not gate on verification when self-hosted", () => {
    expect(routeGuard("/", "u1", false, true)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/server/auth`
Expected: FAIL — signature mismatch / `/verify` not handled.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/server/auth.ts
/** Returns a redirect target for a protected page, else null.
 *  `/login`, `/verify`, and `/api/*` are always public (API routes enforce
 *  their own auth + verification). Authenticated-but-unverified SaaS users are
 *  sent to `/verify`; self-host skips the verification gate entirely. */
export function routeGuard(
  pathname: string,
  userId: string | null,
  verified: boolean,
  selfHosted: boolean,
): string | null {
  if (
    pathname === "/login" ||
    pathname === "/verify" ||
    pathname.startsWith("/api/")
  ) {
    return null;
  }
  if (!userId) return "/login";
  if (!selfHosted && !verified) return "/verify";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/server/auth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/server/auth.ts apps/web/src/lib/server/auth.test.ts
git commit -m "feat(auth): redirect unverified SaaS users to /verify in routeGuard"
```

---

### Task 4: Wire `verified` + `selfHosted` into `hooks.server.ts`

Set `event.locals.verified` and pass `verified` + `selfHosted` to the guard.

**Files:**
- Modify: `apps/web/src/hooks.server.ts:15-34`
- Test: `apps/web/src/hooks.server.test.ts`

**Interfaces:**
- Consumes: `resolvePbAuth` (now returns `verified`), `routeGuard` (4-arg).

- [ ] **Step 1: Update the failing test**

In `apps/web/src/hooks.server.test.ts`: add `verified` to every `mockResolve.mockResolvedValue({...})` call (e.g. `{ userId: "u1", viaBearer: true, verified: true }`), and add a test that `event.locals.verified` is populated. Because `routeGuard` is mocked to `() => null`, use a fresh event and read its locals:

```ts
it("populates locals.verified from resolvePbAuth", async () => {
  mockResolve.mockResolvedValue({ userId: "u1", viaBearer: false, verified: true });
  const ev = event("POST", "/api/capture", ALLOWED);
  await handle({ event: ev, resolve: okResolve });
  expect((ev.locals as { verified: boolean }).verified).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run hooks.server`
Expected: FAIL — `locals.verified` is undefined.

- [ ] **Step 3: Implement**

In `apps/web/src/hooks.server.ts`:

```ts
  const { userId, viaBearer, verified } = await resolvePbAuth(
    pb,
    event.request.headers.get("cookie") ?? "",
    event.request.headers.get("authorization"),
  );
  event.locals.pb = pb;
  event.locals.userId = userId;
  event.locals.verified = verified;
```

And the guard call (replacing line 33):
```ts
  const selfHosted = process.env.SELF_HOSTED === "true";
  const target = routeGuard(
    event.url.pathname,
    event.locals.userId,
    event.locals.verified,
    selfHosted,
  );
  if (target) throw redirect(303, target);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run hooks.server`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add apps/web/src/hooks.server.ts apps/web/src/hooks.server.test.ts
git commit -m "feat(auth): set locals.verified and gate pages by verification in hooks"
```

---

### Task 5: Gate `/api/capture` and `/api/retry` with `requireVerified`

Both mutating routes reject unverified SaaS users (covers the extension's bearer path too) before doing any work.

**Files:**
- Modify: `apps/web/src/routes/api/capture/+server.ts`
- Modify: `apps/web/src/routes/api/retry/+server.ts`
- Test: `apps/web/src/routes/api/capture/server.test.ts` (create)
- Test: `apps/web/src/routes/api/retry/server.test.ts` (create)

**Interfaces:**
- Consumes: `requireVerified` (Task 1), `locals.verified` (Task 2).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/routes/api/capture/server.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@readmepls/core", () => ({
  handleCapture: vi.fn(async () => ({ status: 200, body: { ok: true } })),
}));

import { POST } from "./+server.js";
import { handleCapture } from "@readmepls/core";

const mockCapture = handleCapture as unknown as ReturnType<typeof vi.fn>;

function ev(verified: boolean) {
  return {
    request: new Request("http://localhost/api/capture", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com" }),
    }),
    locals: { userId: "u1", verified, pb: {} },
  } as never;
}

beforeEach(() => {
  delete process.env.SELF_HOSTED;
  mockCapture.mockClear();
});

describe("POST /api/capture verification gate", () => {
  it("rejects an unverified SaaS user with 403 before capturing", async () => {
    await expect(POST(ev(false))).rejects.toMatchObject({ status: 403 });
    expect(mockCapture).not.toHaveBeenCalled();
  });
  it("allows a verified user through", async () => {
    const res = await POST(ev(true));
    expect(res.status).toBe(200);
    expect(mockCapture).toHaveBeenCalled();
  });
  it("allows a self-host user regardless of verified", async () => {
    process.env.SELF_HOSTED = "true";
    await POST(ev(false));
    expect(mockCapture).toHaveBeenCalled();
  });
});
```

```ts
// apps/web/src/routes/api/retry/server.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./+server.js";

function ev(verified: boolean) {
  return {
    request: new Request("http://localhost/api/retry", {
      method: "POST",
      body: JSON.stringify({ articleId: "a1" }),
    }),
    // getOne rejects -> handler catches -> null -> 404, proving the gate passed.
    locals: {
      userId: "u1",
      verified,
      pb: { collection: () => ({ getOne: async () => { throw new Error("nf"); } }) },
    },
  } as never;
}

beforeEach(() => {
  delete process.env.SELF_HOSTED;
});

describe("POST /api/retry verification gate", () => {
  it("rejects an unverified SaaS user with 403", async () => {
    await expect(POST(ev(false))).rejects.toMatchObject({ status: 403 });
  });
  it("passes the gate for a verified user (reaches article lookup -> 404)", async () => {
    await expect(POST(ev(true))).rejects.toMatchObject({ status: 404 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run api/capture api/retry`
Expected: FAIL — no gate; unverified requests are not rejected with 403.

- [ ] **Step 3: Implement**

`apps/web/src/routes/api/capture/+server.ts` — add import and gate:
```ts
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { handleCapture } from "@readmepls/core";
import { requireVerified } from "$lib/server/require-verified.js";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.userId) throw error(401, "unauthenticated");
  requireVerified(locals, process.env.SELF_HOSTED === "true");
  const { url } = (await request.json()) as { url?: string };
  if (!url) throw error(400, "missing url");

  const outcome = await handleCapture(locals.pb, locals.userId, url);
  return json(outcome.body, { status: outcome.status });
};
```

`apps/web/src/routes/api/retry/+server.ts` — add import and gate after the auth check:
```ts
import { requireVerified } from "$lib/server/require-verified.js";
// ...
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.userId) throw error(401, "unauthenticated");
  requireVerified(locals, process.env.SELF_HOSTED === "true");
  const { articleId } = (await request.json()) as { articleId?: string };
  // ...unchanged below...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run api/capture api/retry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/api/capture/+server.ts apps/web/src/routes/api/capture/server.test.ts apps/web/src/routes/api/retry/+server.ts apps/web/src/routes/api/retry/server.test.ts
git commit -m "feat(auth): block unverified SaaS users from capture and retry APIs"
```

---

### Task 6: Signup triggers verification email and redirects to `/verify`

After a SaaS signup, request the verification email and send the user to `/verify`. Self-host keeps the old redirect to `/`. Signin is unchanged (an unverified signin is caught by the guard).

**Files:**
- Modify: `apps/web/src/routes/login/+page.svelte:17-31`
- Test: `apps/web/src/routes/login/signup.test.ts` (create)

**Interfaces:**
- Consumes: `data.selfHosted` (from root layout load), `browserPb()`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/routes/login/signup.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";

const h = vi.hoisted(() => ({
  create: vi.fn(async () => ({})),
  authWithPassword: vi.fn(async () => ({})),
  requestVerification: vi.fn(async () => true),
  goto: vi.fn(async () => {}),
}));

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    collection: () => ({
      create: h.create,
      authWithPassword: h.authWithPassword,
      requestVerification: h.requestVerification,
    }),
  }),
}));
vi.mock("$app/navigation", () => ({ goto: h.goto }));

import Page from "./+page.svelte";

async function signUp(selfHosted: boolean) {
  render(Page, { props: { data: { locked: false, selfHosted } } });
  await fireEvent.click(screen.getByRole("button", { name: /need an account\? sign up/i }));
  await fireEvent.input(screen.getByPlaceholderText("email"), { target: { value: "new@user.co" } });
  await fireEvent.input(screen.getByPlaceholderText("password"), { target: { value: "password1" } });
  await fireEvent.click(screen.getByRole("button", { name: /sign up/i }));
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  h.create.mockClear();
  h.requestVerification.mockClear();
  h.goto.mockClear();
});

describe("signup verification (SaaS)", () => {
  it("requests verification and redirects to /verify", async () => {
    await signUp(false);
    expect(h.requestVerification).toHaveBeenCalledWith("new@user.co");
    expect(h.goto).toHaveBeenCalledWith("/verify");
  });
});

describe("signup verification (self-host)", () => {
  it("skips verification and redirects home", async () => {
    await signUp(true);
    expect(h.requestVerification).not.toHaveBeenCalled();
    expect(h.goto).toHaveBeenCalledWith("/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run login/signup`
Expected: FAIL — `requestVerification` never called; always redirects to `/`.

- [ ] **Step 3: Implement**

In `apps/web/src/routes/login/+page.svelte`, replace the `submit()` body (lines 17-31):

```ts
  async function submit() {
    err = validateCredentials(email, password) ?? "";
    if (err) return;
    try {
      if (mode === "signup") {
        await pb.collection("users").create({
          email, password, passwordConfirm: password, tier: "standard", monthly_quota_used: 0,
        });
        await pb.collection("users").authWithPassword(email, password);
        if (!data.selfHosted) {
          // SaaS: send the confirmation email and gate the user at /verify.
          await pb.collection("users").requestVerification(email);
          await goto("/verify");
          return;
        }
        await goto("/");
        return;
      }
      await pb.collection("users").authWithPassword(email, password);
      await goto("/");
    } catch {
      err = mode === "signup" ? "Could not create account." : "Invalid email or password.";
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run login/signup`
Expected: PASS (both describes). Also re-run the existing lock test: `pnpm exec vitest run login/page` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/login/+page.svelte apps/web/src/routes/login/signup.test.ts
git commit -m "feat(auth): request verification email and redirect to /verify on SaaS signup"
```

---

### Task 7: `/verify` page — confirm token, resend, logout

Public route (guard-exempt). With a `?token=`, confirm it and go home (refreshing the session first); without one, show "check your email" + resend + logout for the signed-in-but-unverified user. Robust to the email link being opened without a session.

**Files:**
- Create: `apps/web/src/routes/verify/+page.ts`
- Create: `apps/web/src/routes/verify/+page.svelte`
- Test: `apps/web/src/routes/verify/page.test.ts`

**Interfaces:**
- Consumes: `browserPb()`, `goto`. `data.token: string | null` from the universal load.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/routes/verify/page.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

const h = vi.hoisted(() => ({
  confirmVerification: vi.fn(async () => true),
  authRefresh: vi.fn(async () => ({})),
  requestVerification: vi.fn(async () => true),
  clear: vi.fn(),
  goto: vi.fn(async () => {}),
  isValid: true,
  email: "new@user.co",
}));

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: {
      get isValid() { return h.isValid; },
      get model() { return { email: h.email }; },
      clear: h.clear,
    },
    collection: () => ({
      confirmVerification: h.confirmVerification,
      authRefresh: h.authRefresh,
      requestVerification: h.requestVerification,
    }),
  }),
}));
vi.mock("$app/navigation", () => ({ goto: h.goto }));

import Page from "./+page.svelte";

beforeEach(() => {
  h.confirmVerification.mockClear();
  h.requestVerification.mockClear();
  h.goto.mockClear();
  h.confirmVerification.mockResolvedValue(true);
  h.isValid = true;
});

describe("/verify page", () => {
  it("confirms a token then refreshes and redirects home", async () => {
    render(Page, { props: { data: { token: "tok123" } } });
    await waitFor(() => expect(h.confirmVerification).toHaveBeenCalledWith("tok123"));
    await waitFor(() => expect(h.goto).toHaveBeenCalledWith("/"));
  });

  it("shows an error and resend option when the token is invalid", async () => {
    h.confirmVerification.mockRejectedValueOnce(new Error("expired"));
    render(Page, { props: { data: { token: "bad" } } });
    expect(await screen.findByText(/expired/i)).toBeInTheDocument();
  });

  it("without a token, resend calls requestVerification with the current email", async () => {
    render(Page, { props: { data: { token: null } } });
    await fireEvent.click(screen.getByRole("button", { name: /resend/i }));
    expect(h.requestVerification).toHaveBeenCalledWith("new@user.co");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run verify/page`
Expected: FAIL — route module does not exist.

- [ ] **Step 3: Implement the load + page**

```ts
// apps/web/src/routes/verify/+page.ts
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ url }) => ({
  token: url.searchParams.get("token"),
});
```

```svelte
<!-- apps/web/src/routes/verify/+page.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { browserPb } from "$lib/pb.js";
  import Button from "$lib/components/ui/Button.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const pb = browserPb();
  // idle -> initial "check your email"; confirming/verified/error drive the token path.
  let status = $state<"idle" | "confirming" | "verified" | "sent" | "error">("idle");
  let msg = $state("");

  onMount(async () => {
    if (!data.token) return;
    status = "confirming";
    try {
      await pb.collection("users").confirmVerification(data.token);
      status = "verified";
      if (pb.authStore.isValid) {
        try {
          await pb.collection("users").authRefresh();
        } catch {
          // stale session is harmless; fall through to home, guard re-checks.
        }
        await goto("/");
      }
    } catch {
      status = "error";
      msg = "that link is invalid or has expired.";
    }
  });

  async function resend() {
    const email = pb.authStore.model?.email as string | undefined;
    if (!email) {
      await goto("/login");
      return;
    }
    try {
      await pb.collection("users").requestVerification(email);
      status = "sent";
      msg = "";
    } catch {
      status = "error";
      msg = "couldn't send right now. try again in a moment.";
    }
  }

  function logout() {
    pb.authStore.clear();
    goto("/login");
  }
</script>

<main>
  <div class="card">
    <h1>readme<span>pls</span></h1>

    {#if status === "confirming"}
      <p class="tag">verifying your email…</p>
    {:else if status === "verified"}
      <p class="tag">email verified.</p>
      <a class="link" href="/login">sign in to continue</a>
    {:else}
      <p class="tag">check your email</p>
      <p class="body">
        we sent a verification link to your inbox. click it to start reading.
      </p>
      {#if status === "sent"}<p class="ok" role="status">sent — check again.</p>{/if}
      {#if status === "error"}<p class="err" role="alert">{msg}</p>{/if}
      <div class="actions">
        <Button variant="accent" onclick={resend}>resend email</Button>
        <button class="link" type="button" onclick={logout}>log out</button>
      </div>
    {/if}
  </div>
</main>

<style>
  main { min-height: 100dvh; display: grid; place-items: center; background: var(--color-bg-gradient); padding: 1.5rem; }
  .card {
    position: relative; width: 100%; max-width: 380px; padding: 2rem 1.75rem;
    background: var(--color-surface); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
  }
  h1 { font-family: var(--font-ui); font-size: 1.8rem; margin: 0; color: var(--color-text); }
  h1 span { color: var(--color-accent); }
  .tag { font-family: var(--font-ui); color: var(--color-text-muted); margin: 0.25rem 0 1rem; }
  .body { font-family: var(--font-ui); color: var(--color-text); margin: 0 0 1.25rem; }
  .ok { color: var(--color-text-muted); font-family: var(--font-ui); font-size: 0.9rem; margin: 0 0 0.75rem; }
  .err { color: var(--color-danger); font-family: var(--font-ui); font-size: 0.9rem; margin: 0 0 0.75rem; }
  .actions { display: flex; flex-direction: column; gap: 0.75rem; align-items: flex-start; }
  .link { background: none; border: none; color: var(--color-accent); font-family: var(--font-ui); cursor: pointer; padding: 0; text-decoration: none; }
  .link:hover { color: var(--color-accent-hover); }
  .link:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run verify/page`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add apps/web/src/routes/verify/+page.ts apps/web/src/routes/verify/+page.svelte apps/web/src/routes/verify/page.test.ts
git commit -m "feat(auth): add /verify page for token confirmation and resend"
```

---

### Task 8: PocketBase SMTP + verification-email config hook (SaaS-only)

On boot, in SaaS mode, configure PB's SMTP from env, point mail links at the SvelteKit origin, and override the verification email so its link targets `/verify?token=`. This task has no vitest coverage (JSVM infra); verify by running PB with a local SMTP catcher.

**Files:**
- Create: `pocketbase/pb_hooks/verification_config.pb.js`
- Modify: `.env.example` (add SMTP block)

**Interfaces:**
- Env consumed: `SELF_HOSTED`, `ORIGIN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_TLS`, `SMTP_FROM`, `SMTP_FROM_NAME`.

- [ ] **Step 1: Add the SMTP block to `.env.example`**

Insert after the "Deployment mode" section:
```bash
# ---- SaaS signup email verification (SELF_HOSTED=false only) ----
# Required for hosted SaaS so signups can receive their verification email.
# Ignored entirely when SELF_HOSTED=true (self-host has no email gate).
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
# true = enforce TLS on connect; false = allow STARTTLS upgrade.
SMTP_TLS=true
# Envelope/from address shown to recipients.
SMTP_FROM=no-reply@example.com
SMTP_FROM_NAME=readmepls
```

- [ ] **Step 2: Write the hook**

```js
// pocketbase/pb_hooks/verification_config.pb.js
// Configures SMTP + the verification email template for hosted SaaS. Runs AFTER
// e.next() so collections/migrations exist. SaaS-only: a self-hosted instance
// (SELF_HOSTED=true) has no email gate, so this is a no-op there. Idempotent —
// safe to re-run on every boot.
onBootstrap((e) => {
  e.next();

  if ($os.getenv("SELF_HOSTED") === "true") {
    return; // verification is a SaaS-only feature
  }

  const host = $os.getenv("SMTP_HOST");
  if (!host) {
    $app.logger().warn("verification_config: SMTP_HOST unset — SaaS verification emails cannot be sent");
    return;
  }

  const settings = $app.settings();
  settings.smtp.enabled = true;
  settings.smtp.host = host;
  settings.smtp.port = parseInt($os.getenv("SMTP_PORT") || "587", 10);
  settings.smtp.username = $os.getenv("SMTP_USERNAME");
  settings.smtp.password = $os.getenv("SMTP_PASSWORD");
  settings.smtp.tls = $os.getenv("SMTP_TLS") === "true";

  settings.meta.senderName = $os.getenv("SMTP_FROM_NAME") || "readmepls";
  settings.meta.senderAddress = $os.getenv("SMTP_FROM") || "no-reply@example.com";
  // Mail links resolve against the SvelteKit origin, not the PB admin UI.
  settings.meta.appURL = $os.getenv("ORIGIN") || settings.meta.appURL;

  $app.save(settings);

  // Point the verification email at our SvelteKit /verify route (default links
  // to the PB admin UI confirm page).
  const users = $app.findCollectionByNameOrId("users");
  users.verificationTemplate.subject = "verify your readmepls email";
  users.verificationTemplate.body =
    "<p>hey — one tap to start reading.</p>" +
    '<p><a href="{APP_URL}/verify?token={TOKEN}">verify my email</a></p>' +
    "<p>if you didn't sign up, ignore this.</p>";
  $app.save(users);
});
```

- [ ] **Step 3: Verify by running PB with a local SMTP catcher**

Start a throwaway SMTP sink and PB in SaaS mode:
```bash
# Terminal A — catch mail on :1025 (prints messages to stdout)
python3 -m aiosmtpd -n -l localhost:1025

# Terminal B — run PB in SaaS mode against the catcher (use a scratch data dir)
SELF_HOSTED=false ORIGIN=http://localhost:3000 \
SMTP_HOST=localhost SMTP_PORT=1025 SMTP_TLS=false \
SMTP_FROM=no-reply@example.com SMTP_FROM_NAME=readmepls \
pocketbase/pocketbase serve --http=127.0.0.1:8090 \
  --migrationsDir=pocketbase/pb_migrations --hooksDir=pocketbase/pb_hooks \
  --dir=/tmp/pb-verify-test
```
Then trigger a verification (replace with a real created user email):
```bash
curl -sS -X POST http://127.0.0.1:8090/api/collections/users/request-verification \
  -H 'content-type: application/json' -d '{"email":"someone@example.com"}'
```
Expected: no boot error/warning about SMTP; Terminal A prints an email whose body contains `http://localhost:3000/verify?token=...`. Stop PB and remove `/tmp/pb-verify-test`.

> If PB rejects assigning `users.verificationTemplate.subject/.body` directly (goja proxy), assign the whole template object instead:
> `users.verificationTemplate = new EmailTemplate({ subject: "...", body: "..." })` — check the exact JSVM type name in the PB boot log if the first form errors, and use whichever form PB accepts. The observable success criterion (link contains `/verify?token=`) is unchanged.

- [ ] **Step 4: Commit**

```bash
git add pocketbase/pb_hooks/verification_config.pb.js .env.example
git commit -m "feat(auth): configure SMTP and verification email link for SaaS"
```

---

### Task 9: Cutover migration — backfill existing users to `verified=true`

So no current SaaS user is locked out by the new gate. Runs once at deploy.

**Files:**
- Create: `pocketbase/pb_migrations/1720100000_verify_existing_users.js`

- [ ] **Step 1: Write the migration**

```js
// pocketbase/pb_migrations/1720100000_verify_existing_users.js
// One-off cutover for the SaaS email-verification gate: mark every user that
// already exists at migration time as verified, so accounts predating the gate
// are not locked out. Only new signups (after this migration) go through
// verification. Harmless on self-host, where `verified` is unused.
migrate((app) => {
  const users = app.findRecordsByFilter("users", "verified = false", "", 0, 0);
  for (const u of users) {
    u.set("verified", true);
    app.save(u);
  }
}, (app) => {
  // Down: not reversible in a meaningful way (we can't know which users were
  // unverified before). No-op.
});
```

- [ ] **Step 2: Verify the backfill against a seeded DB**

```bash
# 1) Boot PB WITHOUT the new migration file staged elsewhere is not possible;
#    instead seed first, then confirm the migration flips the seeded user.
# Use a scratch dir so this never touches real data.
SCRATCH=/tmp/pb-verify-migrate
rm -rf "$SCRATCH"

# Boot once with only the pre-existing migrations to create the schema + a user.
pocketbase/pocketbase serve --http=127.0.0.1:8099 \
  --migrationsDir=pocketbase/pb_migrations --hooksDir=/dev/null \
  --dir="$SCRATCH" &
PB_PID=$!; sleep 2
curl -sS -X POST http://127.0.0.1:8099/api/collections/users/records \
  -H 'content-type: application/json' \
  -d '{"email":"old@user.co","password":"password1","passwordConfirm":"password1"}' >/dev/null
kill $PB_PID; wait $PB_PID 2>/dev/null

# Reboot: the new migration runs against the existing DB and backfills.
pocketbase/pocketbase serve --http=127.0.0.1:8099 \
  --migrationsDir=pocketbase/pb_migrations --hooksDir=/dev/null \
  --dir="$SCRATCH" &
PB_PID=$!; sleep 2
```
Then confirm `old@user.co` now has `verified=true` (query via the admin API, or inspect the SQLite `users` row). Expected: `verified = 1`. Stop PB (`kill $PB_PID`) and `rm -rf "$SCRATCH"`.

> Note: the seeding boot above runs the new migration too if it's already on disk — that's fine, the assertion (seeded user ends verified) holds regardless of which boot applied it. The point is proving the migration sets `verified=true` for a user that was created as `verified=false`.

- [ ] **Step 3: Commit**

```bash
git add pocketbase/pb_migrations/1720100000_verify_existing_users.js
git commit -m "feat(auth): backfill existing users to verified at cutover"
```

---

### Task 10: Full-suite green + spec cleanup

- [ ] **Step 1: Run the whole workspace**

Run: `pnpm test`
Expected: all pass. Fix any regressions before proceeding.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Delete the shipped plan + spec**

Per the working agreement (delete finished plans and their paired spec once merged):
```bash
git rm docs/superpowers/plans/2026-07-18-email-verification.md \
       docs/superpowers/specs/2026-07-18-email-verification-design.md
git commit -m "docs(auth): remove shipped email-verification spec and plan"
```
> Do this only after the feature is fully implemented and about to merge — not before execution.

---

## Self-Review

**Spec coverage:**
- Hard block at page layer → Tasks 3, 4. ✅
- Hard block at API layer (`capture`, `retry`, extension bearer) → Tasks 1, 5. ✅
- PB-native request/confirm verification → Tasks 6 (request), 7 (confirm). ✅
- SMTP + appURL + template override, SaaS-only → Task 8. ✅
- `/verify` page (check-email, resend, logout, token confirm) → Task 7. ✅
- Self-host bypass everywhere → Tasks 3/4/5/8 all key off `SELF_HOSTED`. ✅
- Backfill existing users → Task 9. ✅
- `.env.example` SMTP keys → Task 8. ✅
- Error handling (bad/expired token, SMTP unset, resend) → Task 7 (UI states), Task 8 (boot warning). ✅

**Placeholder scan:** No TBD/TODO. The only "figure out at runtime" is Task 8's JSVM template-assignment form, which has an explicit fallback and an observable success criterion — not a placeholder.

**Type consistency:** `resolvePbAuth` return `{ userId, viaBearer, verified }` used identically in Task 4 destructure and hooks test. `routeGuard(pathname, userId, verified, selfHosted)` matches across Tasks 3/4. `requireVerified(locals, selfHosted)` matches Tasks 1/5. `data.token` produced by `+page.ts` (Task 7) consumed by `+page.svelte` (Task 7). `data.selfHosted` from the root layout consumed in Task 6. ✅
