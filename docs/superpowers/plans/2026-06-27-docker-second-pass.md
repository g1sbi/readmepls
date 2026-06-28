# Docker Second-Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the browser→PocketBase URL drift that breaks any non-localhost self-host, add a guard so it can't recur, and prove the full stack still boots and runs a job end-to-end on the current dependency set.

**Architecture:** The browser PocketBase client currently reads `import.meta.env.VITE_PB_URL` — a Vite *build-time* constant frozen into the published image. Replace it with a single `publicPbUrl()` helper backed by SvelteKit `$env/dynamic/public` → `PUBLIC_PB_URL` (resolved at runtime by adapter-node, shipped to the browser in the SSR bootstrap). Harden `env-parity-check.mjs` to scan code for `PUBLIC_*` usage, and extend `smoke-test.sh` to assert the runtime PB URL actually reaches the served HTML.

**Tech Stack:** SvelteKit (`@sveltejs/adapter-node` 5.2, `@sveltejs/kit` 2.5), Vitest, Docker Compose, Node 22, pnpm workspace.

## Global Constraints

- **TDD always.** Failing test first, then minimal implementation. (CLAUDE.md)
- **Conventional Commits**, one logical change per commit. (CLAUDE.md)
- **TypeScript strict**, no `any` without a written reason. (CLAUDE.md)
- **Validate at boundaries with Zod** — n/a here (no new external shapes), but do not weaken existing parsing.
- **Workspace packages ship TS source** — do not repoint `core`/`types` `main`. (CLAUDE.md)
- **Secrets stay server-side.** `PUBLIC_PB_URL` is a *public* origin (browser-facing), not a secret — safe to ship to the browser. Never add a secret under a `PUBLIC_` name.
- **Never push or open a PR unless asked.** Local commits only.
- Web test command: `pnpm --filter @readmepls/web test -- <file>`. Web typecheck: `pnpm --filter @readmepls/web check`.

---

### Task 1: `publicPbUrl()` helper

**Files:**
- Create: `apps/web/src/lib/public-pb-url.ts`
- Test: `apps/web/src/lib/public-pb-url.test.ts`

**Interfaces:**
- Consumes: SvelteKit virtual module `$env/dynamic/public` (`{ env: Record<string,string> }`).
- Produces: `publicPbUrl(): string` — returns `env.PUBLIC_PB_URL` when set and non-empty, else the dev fallback `http://127.0.0.1:8090`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/public-pb-url.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mutable mock of the SvelteKit runtime-public-env virtual module.
const mockEnv: Record<string, string> = {};
vi.mock("$env/dynamic/public", () => ({ env: mockEnv }));

describe("publicPbUrl", () => {
  beforeEach(() => {
    for (const k of Object.keys(mockEnv)) delete mockEnv[k];
    vi.resetModules();
  });

  it("returns PUBLIC_PB_URL when set", async () => {
    mockEnv.PUBLIC_PB_URL = "https://pb.example.com";
    const { publicPbUrl } = await import("./public-pb-url.js");
    expect(publicPbUrl()).toBe("https://pb.example.com");
  });

  it("falls back to localhost when unset", async () => {
    const { publicPbUrl } = await import("./public-pb-url.js");
    expect(publicPbUrl()).toBe("http://127.0.0.1:8090");
  });

  it("falls back when set to empty string", async () => {
    mockEnv.PUBLIC_PB_URL = "";
    const { publicPbUrl } = await import("./public-pb-url.js");
    expect(publicPbUrl()).toBe("http://127.0.0.1:8090");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @readmepls/web test -- src/lib/public-pb-url.test.ts`
Expected: FAIL — `Failed to resolve import "./public-pb-url.js"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/public-pb-url.ts
import { env } from "$env/dynamic/public";

/**
 * Browser-facing PocketBase origin, resolved at runtime (not baked at build).
 * Operators set PUBLIC_PB_URL per host; adapter-node ships it to the browser via
 * the SSR bootstrap. Fallback covers local `vite dev` with no env set.
 */
export function publicPbUrl(): string {
  return env.PUBLIC_PB_URL || "http://127.0.0.1:8090";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @readmepls/web test -- src/lib/public-pb-url.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/public-pb-url.ts apps/web/src/lib/public-pb-url.test.ts
git commit -m "feat(web): runtime publicPbUrl() helper on \$env/dynamic/public"
```

---

### Task 2: Repoint browser PB call sites; drop `VITE_PB_URL`

**Files:**
- Modify: `apps/web/src/lib/pb.ts:8`
- Modify: `apps/web/src/routes/search/+page.svelte:18`

**Interfaces:**
- Consumes: `publicPbUrl()` from Task 1 (`$lib/public-pb-url`).
- Produces: no new exports; removes the last `import.meta.env.VITE_PB_URL` references in the repo.

- [ ] **Step 1: Update `pb.ts`**

In `apps/web/src/lib/pb.ts`, add the import and replace the URL expression:

```ts
import PocketBase from "pocketbase";
import { publicPbUrl } from "$lib/public-pb-url";

let _pb: PocketBase | null = null;

/** Browser-side PocketBase singleton. Shares the auth cookie written by hooks. */
export function browserPb(): PocketBase {
  if (!_pb) {
    _pb = new PocketBase(publicPbUrl());
    _pb.authStore.loadFromCookie(document.cookie);
    _pb.authStore.onChange(() => {
      document.cookie = _pb!.authStore.exportToCookie({ httpOnly: false });
    });
  }
  return _pb;
}
```

- [ ] **Step 2: Update `search/+page.svelte`**

In `apps/web/src/routes/search/+page.svelte`, add to the existing `<script lang="ts">` imports:

```ts
  import { publicPbUrl } from "$lib/public-pb-url";
```

Then replace the line:

```ts
    const base = import.meta.env.VITE_PB_URL ?? "http://127.0.0.1:8090";
```

with:

```ts
    const base = publicPbUrl();
```

- [ ] **Step 3: Verify no `VITE_PB_URL` reference remains**

Run: `grep -rn "VITE_PB_URL" apps/web/src`
Expected: no output (exit 1 / empty).

- [ ] **Step 4: Typecheck + run web tests**

Run: `pnpm --filter @readmepls/web check && pnpm --filter @readmepls/web test`
Expected: check passes (0 errors); all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/pb.ts apps/web/src/routes/search/+page.svelte
git commit -m "fix(web): use runtime publicPbUrl() for browser PB, drop build-time VITE_PB_URL"
```

---

### Task 3: Harden `env-parity-check.mjs` with a code-vs-env scan

**Files:**
- Modify: `scripts/env-parity-check.mjs`

**Interfaces:**
- Consumes: `.env.example` declarations (already parsed in the script); source tree `apps/web/src`.
- Produces: the script now also fails when any `PUBLIC_*` identifier used in `apps/web/src` is absent from `.env.example`.

- [ ] **Step 1: Add the recursive source scan**

Append to `scripts/env-parity-check.mjs`, after the existing compose↔env check (keep the existing imports of `readFileSync`; add `readdirSync`/`statSync`):

```js
import { readdirSync, statSync } from "node:fs";

// --- code-vs-env: every PUBLIC_* read in web source must be declared ---
const webSrc = new URL("../apps/web/src/", import.meta.url);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = new URL(name, dir);
    if (statSync(full).isDirectory()) out.push(...walk(new URL(name + "/", dir)));
    else if (/\.(ts|js|svelte)$/.test(name)) out.push(full);
  }
  return out;
}

const usedPublic = new Set();
for (const file of walk(webSrc)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\bPUBLIC_[A-Z0-9_]+\b/g)) usedPublic.add(m[0]);
}

const undeclaredPublic = [...usedPublic].filter((v) => !declared.has(v));
if (undeclaredPublic.length) {
  console.error(
    "web source uses PUBLIC_* vars absent from .env.example:",
    undeclaredPublic
  );
  process.exit(1);
}
console.log(`env-parity OK: ${usedPublic.size} PUBLIC_* code vars all declared`);
```

- [ ] **Step 2: Run the check — expect PASS**

Run: `node scripts/env-parity-check.mjs`
Expected: prints both `env-parity OK:` lines and exits 0. (`PUBLIC_PB_URL` is used in `public-pb-url.ts` and declared in `.env.example`.)

- [ ] **Step 3: Prove the guard bites (temporary negative check)**

Run:
```bash
sed -i 's/^PUBLIC_PB_URL=/PUBLIC_PB_URL_DISABLED=/' .env.example
node scripts/env-parity-check.mjs; echo "exit=$?"
git checkout .env.example
```
Expected: middle command prints `web source uses PUBLIC_* vars absent from .env.example: [ 'PUBLIC_PB_URL' ]` and `exit=1`; final `git checkout` restores `.env.example`.

- [ ] **Step 4: Re-run to confirm restored state passes**

Run: `node scripts/env-parity-check.mjs`
Expected: exits 0, both OK lines.

- [ ] **Step 5: Commit**

```bash
git add scripts/env-parity-check.mjs
git commit -m "test(infra): env-parity also checks PUBLIC_* code usage vs .env.example"
```

---

### Task 4: Make `PUBLIC_PB_URL` runtime-overridable in compose + assert it in the smoke test

**Files:**
- Modify: `compose.yml` (web service `environment:` block)
- Modify: `scripts/smoke-test.sh`

**Interfaces:**
- Consumes: web container env; `WEB_PORT`; the served SSR HTML at `/login`.
- Produces: a smoke-test assertion that a sentinel `PUBLIC_PB_URL` reaches the browser bundle — the check the old `VITE_PB_URL` path could not satisfy.

- [ ] **Step 1: Add the interpolated env line to compose**

In `compose.yml`, under the `web:` service `environment:` block (which already sets `PB_URL`), add a runtime-overridable public URL mirroring how `AI_PROVIDER` is handled on the worker:

```yaml
    environment:
      PB_URL: http://pocketbase:8090
      # Browser-facing PB origin. From .env by default; overridable at runtime
      # (the smoke test injects a sentinel to prove it reaches the browser).
      PUBLIC_PB_URL: ${PUBLIC_PB_URL:-http://localhost:8090}
```

- [ ] **Step 2: Confirm env-parity still passes with the new compose reference**

Run: `node scripts/env-parity-check.mjs`
Expected: exits 0. (`PUBLIC_PB_URL` is now `${...}`-referenced in compose AND declared in `.env.example` AND used in code — all three agree.)

- [ ] **Step 3: Add the sentinel + assertion to `smoke-test.sh`**

In `scripts/smoke-test.sh`, set a sentinel before `docker compose up`. Replace the line:

```sh
AI_PROVIDER=mock docker compose up -d --build
```

with:

```sh
# Sentinel proves the browser-facing PB URL is injected at runtime (not baked).
export PUBLIC_PB_URL="http://pb.smoke.test:8090"
AI_PROVIDER=mock docker compose up -d --build
```

Then, after the existing `web responding` loop and before `==> authenticating as PocketBase superuser`, insert:

```sh
echo "==> asserting runtime PUBLIC_PB_URL reached the browser bundle"
LOGIN_HTML=$(curl -fsS "http://localhost:${WEB_PORT}/login")
case "$LOGIN_HTML" in
  *pb.smoke.test:8090*) echo "runtime PB URL present in served HTML" ;;
  *) echo "PUBLIC_PB_URL sentinel missing from /login HTML — runtime env not wired";
     docker compose logs web; exit 1 ;;
esac
```

- [ ] **Step 4: Commit**

```bash
git add compose.yml scripts/smoke-test.sh
git commit -m "test(infra): assert runtime PUBLIC_PB_URL reaches the web bundle in smoke test"
```

---

### Task 5: Boot the full stack — end-to-end verification gate

**Files:** none (verification only).

**Prerequisites:** Docker daemon running; outbound network (the worker fetches `https://example.com`). No Anthropic key needed — the smoke test forces `AI_PROVIDER=mock`.

**Interfaces:**
- Consumes: `compose.yml`, the three Dockerfiles, `scripts/smoke-test.sh` (with the Task-4 assertion).
- Produces: proof that all three images build on the current dep set (yt-dlp, sanitize-html, jszip, Phase-4/6 migrations, `search.pb.js`), the capture loop reaches `done`, and the runtime PB URL reaches the browser.

- [ ] **Step 1: Run the smoke test**

Run: `bash scripts/smoke-test.sh`
Expected, in order: `pocketbase up` → `web responding (...)` → `runtime PB URL present in served HTML` → `job status: done` → `==> SMOKE PASS`, exit 0. The trap runs `docker compose down -v` on exit.

- [ ] **Step 2: If it fails, debug systematically**

Use `superpowers:systematic-debugging`. The script already dumps `docker compose logs <svc>` on each failure path. Common drift suspects, in order:
- worker image build: an esbuild-bundled dep (e.g. `sanitize-html`) failing to bundle → inspect `docker compose logs worker` and the build output.
- pocketbase: a migration or hook failing to apply → `docker compose logs pocketbase`.
- web: `node build` crash or `/login` not 200 → `docker compose logs web`; confirm `/login` is an unauthenticated route.
Fix the root cause (new task/commit as appropriate), then re-run Step 1 to green before proceeding.

- [ ] **Step 3: Confirm clean teardown**

Run: `docker compose ps`
Expected: no `readmepls` services running (the smoke test tore them down). If any linger: `docker compose down -v`.

---

## Notes for the executor

- Tasks 1–4 are pure file edits + offline checks; Task 5 needs Docker. If Docker is unavailable in the execution environment, complete 1–4 and hand Task 5 back for a host with a Docker daemon — do **not** mark the plan complete without a green smoke run.
- No changes to the Dockerfiles, CI workflow, or `.env.example` are expected. If Task 5 surfaces one, add a task, commit it, and re-run the smoke test.
- E2E (Playwright) for the browser→PB flow is explicitly deferred to the later E2E phase (per the spec and CLAUDE.md). The Task-4 curl assertion is the interim browserless guard, not a replacement.
