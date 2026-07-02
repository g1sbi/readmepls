# First-class sources (websites) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an article's source website a first-class entity — derive/store it on extraction, show a source pill on cards and reader, filter the library by source (multi-select) with per-user favorites, and extract each site's favicon.

**Architecture:** A new global `sources` collection (worker-written, like `content`) holds one row per hostname (leading `www.` stripped). `content.source` relates to it. Pure core functions derive the host and pick favicon candidates; the worker upserts the source and downloads/stores the favicon (best-effort, never fails a job). The web app expands `content.source`, renders a `SourcePill`, and derives a multi-select chip filter from the user's own library, with favorites in a per-user `source_favorites` collection.

**Tech Stack:** SvelteKit (Svelte 5 runes), PocketBase (JS migrations, JS SDK), Node/TypeScript worker (esbuild bundle), Zod, Vitest, ephemeral-PB integration harness.

## Global Constraints

- **TDD always** — failing test first, then minimal implementation.
- **TypeScript strict.** No `any` without a written reason (the existing `expand?: { content?: any }` note in `ArticleCard.svelte` is the established exception pattern).
- **Never hardcode a color or font** in a component — reference a token from `apps/web/src/lib/styles/tokens.css`.
- **Validate at boundaries with Zod.** Data read back from PocketBase is parsed before use.
- **Model states as unions, not booleans** — `favicon_status: 'pending' | 'ok' | 'none'`.
- **Pure core, thin IO shell.** Host derivation + favicon-candidate picking are pure functions in `@readmepls/core`, tested offline. Network/PB live at the edges behind injected seams.
- **PB API rules are the security boundary.** `sources` is authed-read / worker-write; `source_favorites` is scoped `user = @request.auth.id`.
- **Source key = full hostname, lowercased, with a single leading `www.` stripped.** Subdomains stay distinct. No public-suffix list.
- **Conventional Commits**, one logical change per commit. Do not push or open a PR.
- **Workspace packages ship TS source** — do not repoint `core`/`types` `main` at `dist`.

---

### Task 1: Zod types — `Source`, `SourceFavorite`, `FaviconStatus`, and `content.source`

**Files:**
- Create: `packages/types/src/source-site.ts`
- Modify: `packages/types/src/content.ts:5-24` (add `source` field)
- Modify: `packages/types/src/index.ts` (export new module)
- Test: `packages/types/src/source-site.test.ts`

**Interfaces:**
- Produces: `FaviconStatus` (`z.enum(["pending","ok","none"])`), `Source` (`{ id, host, name: string|null, favicon: string, favicon_status }`), `SourceFavorite` (`{ id, user, source }`). `Content` gains `source: string` (PB returns `""` when the relation is unset).

> Note: the file is `source-site.ts`, not `source.ts`, because `packages/types/src/source.ts` already exists and defines `SourceType` (article/x/youtube). Do not confuse the two.

- [ ] **Step 1: Write the failing test**

Create `packages/types/src/source-site.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Source, SourceFavorite, FaviconStatus } from "./source-site.js";

describe("Source schema", () => {
  it("parses a fully populated source", () => {
    const s = Source.parse({
      id: "abc",
      host: "nytimes.com",
      name: "The New York Times",
      favicon: "favicon_a1b2.png",
      favicon_status: "ok",
    });
    expect(s.host).toBe("nytimes.com");
    expect(s.favicon_status).toBe("ok");
  });

  it("allows a null name and empty favicon", () => {
    const s = Source.parse({
      id: "abc",
      host: "blog.acme.com",
      name: null,
      favicon: "",
      favicon_status: "pending",
    });
    expect(s.name).toBeNull();
    expect(s.favicon).toBe("");
  });

  it("rejects an unknown favicon_status", () => {
    expect(() => FaviconStatus.parse("downloading")).toThrow();
  });
});

describe("SourceFavorite schema", () => {
  it("parses a favorite row", () => {
    const f = SourceFavorite.parse({ id: "f1", user: "u1", source: "s1" });
    expect(f.source).toBe("s1");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @readmepls/types test -- source-site`
Expected: FAIL — cannot find module `./source-site.js`.

- [ ] **Step 3: Create the schema module**

Create `packages/types/src/source-site.ts`:

```typescript
import { z } from "zod";

export const FaviconStatus = z.enum(["pending", "ok", "none"]);
export type FaviconStatus = z.infer<typeof FaviconStatus>;

/** A source website. Global, worker-written. One row per hostname (www. stripped). */
export const Source = z.object({
  id: z.string(),
  host: z.string(),
  name: z.string().nullable(),
  // PocketBase file field: stored filename, or "" when no favicon yet.
  favicon: z.string(),
  favicon_status: FaviconStatus,
});
export type Source = z.infer<typeof Source>;

/** Per-user favorite flag on a global source. */
export const SourceFavorite = z.object({
  id: z.string(),
  user: z.string(),
  source: z.string(),
});
export type SourceFavorite = z.infer<typeof SourceFavorite>;
```

- [ ] **Step 4: Add `source` to `Content`**

In `packages/types/src/content.ts`, add the field after `published_at` (line 21):

```typescript
  published_at: z.string().nullable(),
  // Relation id to the sources collection; "" when not yet linked.
  source: z.string().optional().default(""),
```

- [ ] **Step 5: Export the new module**

In `packages/types/src/index.ts`, add after the `source.js` export line:

```typescript
export * from "./source-site.js";
```

- [ ] **Step 6: Run tests, verify pass**

Run: `pnpm --filter @readmepls/types test`
Expected: PASS (new file + existing content tests).

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/source-site.ts packages/types/src/source-site.test.ts packages/types/src/content.ts packages/types/src/index.ts
git commit -m "feat(types): Source/SourceFavorite schemas and content.source"
```

---

### Task 2: Core — `deriveSourceHost`

**Files:**
- Create: `packages/core/src/source/site-host.ts`
- Modify: `packages/core/src/index.ts` (export)
- Test: `packages/core/src/source/site-host.test.ts`

**Interfaces:**
- Produces: `deriveSourceHost(url: string): string | null` — lowercased hostname, a single leading `www.` removed, port dropped; `null` for unparseable input.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/source/site-host.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { deriveSourceHost } from "./site-host.js";

describe("deriveSourceHost", () => {
  it("returns the lowercased hostname", () => {
    expect(deriveSourceHost("https://Example.COM/path?q=1")).toBe("example.com");
  });

  it("strips a single leading www.", () => {
    expect(deriveSourceHost("https://www.nytimes.com/x")).toBe("nytimes.com");
  });

  it("keeps other subdomains distinct", () => {
    expect(deriveSourceHost("https://blog.acme.com/p")).toBe("blog.acme.com");
    expect(deriveSourceHost("https://m.nytimes.com/p")).toBe("m.nytimes.com");
  });

  it("does not strip a www that is not the leading label", () => {
    expect(deriveSourceHost("https://wwwfoo.com/")).toBe("wwwfoo.com");
  });

  it("drops the port", () => {
    expect(deriveSourceHost("https://example.com:8443/")).toBe("example.com");
  });

  it("returns null for an unparseable url", () => {
    expect(deriveSourceHost("not a url")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @readmepls/core test -- site-host`
Expected: FAIL — cannot find module `./site-host.js`.

- [ ] **Step 3: Implement**

Create `packages/core/src/source/site-host.ts`:

```typescript
/**
 * Canonical source key for a URL: lowercased hostname with a single leading
 * "www." removed. Other subdomains are preserved (blog., m., news. are their
 * own sources — no public-suffix grouping). Returns null when the URL can't be
 * parsed, letting the caller leave content.source unset.
 */
export function deriveSourceHost(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  return host.startsWith("www.") ? host.slice(4) : host;
}
```

- [ ] **Step 4: Export it**

In `packages/core/src/index.ts`, add near the other `source/` exports:

```typescript
export * from "./source/site-host.js";
```

- [ ] **Step 5: Run tests, verify pass**

Run: `pnpm --filter @readmepls/core test -- site-host`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/source/site-host.ts packages/core/src/source/site-host.test.ts packages/core/src/index.ts
git commit -m "feat(core): deriveSourceHost pure function"
```

---

### Task 3: Core — `pickFaviconCandidates`

**Files:**
- Create: `packages/core/src/source/favicon.ts`
- Modify: `packages/core/src/index.ts` (export)
- Test: `packages/core/src/source/favicon.test.ts`

**Interfaces:**
- Produces: `pickFaviconCandidates(html: string, baseUrl: string): string[]` — ordered, deduped, absolute candidate URLs: declared `<link rel="icon"|"shortcut icon">` (largest declared `sizes` first), then `<link rel="apple-touch-icon">`, then the origin `/favicon.ico` fallback.

> Uses `jsdom` (already a worker/core dependency via `@mozilla/readability`; confirm it resolves from `@readmepls/core` — if not, add `jsdom` to `packages/core/package.json` dependencies in Step 3.5). Parsing is pure/offline.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/source/favicon.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { pickFaviconCandidates } from "./favicon.js";

const base = "https://example.com/some/page";

describe("pickFaviconCandidates", () => {
  it("prefers the largest declared icon, resolves relative urls", () => {
    const html = `<html><head>
      <link rel="icon" sizes="16x16" href="/small.png">
      <link rel="icon" sizes="64x64" href="/big.png">
    </head></html>`;
    const got = pickFaviconCandidates(html, base);
    expect(got[0]).toBe("https://example.com/big.png");
    expect(got).toContain("https://example.com/small.png");
  });

  it("falls back to apple-touch-icon then /favicon.ico", () => {
    const html = `<html><head>
      <link rel="apple-touch-icon" href="https://cdn.example.com/apple.png">
    </head></html>`;
    const got = pickFaviconCandidates(html, base);
    expect(got[0]).toBe("https://cdn.example.com/apple.png");
    expect(got.at(-1)).toBe("https://example.com/favicon.ico");
  });

  it("always includes the /favicon.ico fallback at the origin", () => {
    const got = pickFaviconCandidates("<html><head></head></html>", base);
    expect(got).toEqual(["https://example.com/favicon.ico"]);
  });

  it("dedupes repeated hrefs", () => {
    const html = `<html><head>
      <link rel="icon" href="/favicon.ico">
    </head></html>`;
    const got = pickFaviconCandidates(html, base);
    expect(got).toEqual(["https://example.com/favicon.ico"]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @readmepls/core test -- favicon`
Expected: FAIL — cannot find module `./favicon.js`.

- [ ] **Step 3: Implement**

Create `packages/core/src/source/favicon.ts`:

```typescript
import { JSDOM } from "jsdom";

/** Largest dimension in a `sizes` attribute like "16x16 32x32", else 0. */
function largestSize(sizes: string | null): number {
  if (!sizes) return 0;
  let max = 0;
  for (const token of sizes.split(/\s+/)) {
    const n = parseInt(token.split("x")[0] ?? "", 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max;
}

/**
 * Ordered favicon candidate URLs for a page. Declared <link rel=icon> icons
 * first (largest declared size wins), then apple-touch-icon, then the origin's
 * /favicon.ico as a universal fallback. Absolute, deduped. Pure — no network.
 */
export function pickFaviconCandidates(html: string, baseUrl: string): string[] {
  const doc = new JSDOM(html, { url: baseUrl }).window.document;

  const icons = [...doc.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
    .map((el) => ({ href: el.getAttribute("href"), size: largestSize(el.getAttribute("sizes")) }))
    .filter((x): x is { href: string; size: number } => !!x.href)
    .sort((a, b) => b.size - a.size);

  const apple = [...doc.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]')]
    .map((el) => el.getAttribute("href"))
    .filter((h): h is string => !!h);

  const origin = new URL(baseUrl).origin;
  const ordered = [...icons.map((i) => i.href), ...apple, "/favicon.ico"];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const href of ordered) {
    let abs: string;
    try {
      abs = new URL(href, origin).toString();
    } catch {
      continue;
    }
    if (!seen.has(abs)) {
      seen.add(abs);
      out.push(abs);
    }
  }
  return out;
}
```

> `link[rel~="icon"]` matches both `rel="icon"` and `rel="shortcut icon"`; the `apple-touch-icon` query is separate so it always ranks after declared icons.

- [ ] **Step 3.5: Ensure `jsdom` resolves**

Run: `pnpm --filter @readmepls/core test -- favicon`. If it fails with "Cannot find package 'jsdom'", add `"jsdom": "^24.0.0"` (match the version in `apps/worker/package.json`) to `packages/core/package.json` `dependencies`, then `pnpm install`.

- [ ] **Step 4: Export it**

In `packages/core/src/index.ts`, add:

```typescript
export * from "./source/favicon.js";
```

- [ ] **Step 5: Run tests, verify pass**

Run: `pnpm --filter @readmepls/core test -- favicon`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/source/favicon.ts packages/core/src/source/favicon.test.ts packages/core/src/index.ts packages/core/package.json
git commit -m "feat(core): pickFaviconCandidates pure function"
```

---

### Task 4: Migration — `sources` + `source_favorites` collections, `content.source`

**Files:**
- Create: `pocketbase/pb_migrations/1719500000_sources.js`

**Interfaces:**
- Produces: `sources` collection (`host` unique, `name`, `favicon` file, `favicon_status`), `source_favorites` collection (`user`, `source`, unique `(user,source)`), and a `content.source` relation field.

- [ ] **Step 1: Write the migration**

Create `pocketbase/pb_migrations/1719500000_sources.js`:

```javascript
/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const content = app.findCollectionByNameOrId("content");

    // --- sources (global cache; public site metadata only) ---
    const sources = new Collection({
      type: "base",
      name: "sources",
      fields: [
        { name: "host", type: "text", required: true },
        { name: "name", type: "text" },
        { name: "favicon", type: "file", maxSelect: 1, maxSize: 1048576,
          mimeTypes: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"] },
        { name: "favicon_status", type: "text", required: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_sources_host ON sources (host)",
      ],
      // authenticated users may read; only superuser/worker token writes
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(sources);

    // --- content.source relation ---
    content.fields.add(new Field({
      name: "source", type: "relation", collectionId: sources.id, maxSelect: 1,
    }));
    app.save(content);

    // --- source_favorites (per-user) ---
    const favorites = new Collection({
      type: "base",
      name: "source_favorites",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
        { name: "source", type: "relation", required: true, collectionId: sources.id, maxSelect: 1 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_source_favorites_user_source ON source_favorites (user, source)",
      ],
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "user = @request.auth.id",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
    });
    app.save(favorites);
  },
  (app) => {
    const content = app.findCollectionByNameOrId("content");
    content.fields.removeByName("source");
    app.save(content);
    for (const name of ["source_favorites", "sources"]) {
      const c = app.findCollectionByNameOrId(name);
      if (c) app.delete(c);
    }
  }
);
```

- [ ] **Step 2: Apply the migration**

Run (PocketBase applies pending migrations on start; this project boots PB via the test harness and/or a dev script). Verify by starting the ephemeral harness in a scratch test or the dev PB:
Run: `pnpm --filter @readmepls/worker test -- link.integration` (boots ephemeral PB, which replays all migrations)
Expected: PASS — no migration error at startup (this confirms the migration file is syntactically valid and applies cleanly).

- [ ] **Step 3: Commit**

```bash
git add pocketbase/pb_migrations/1719500000_sources.js
git commit -m "feat(pb): sources + source_favorites collections, content.source"
```

---

### Task 5: Worker — SSRF-safe byte fetch (`createSafeFetchBytes`)

**Files:**
- Modify: `apps/worker/src/fetch/safe-fetch.ts` (add byte fetcher, reuse guard)
- Test: `apps/worker/src/fetch/safe-fetch-bytes.test.ts`

**Interfaces:**
- Produces: `createSafeFetchBytes(deps: SafeFetchBytesDeps): (url: string) => Promise<{ bytes: Uint8Array; contentType: string } | null>`. Returns `null` on non-2xx. Re-validates every hop against private addresses, mirroring `createSafeFetchHtml`.

- [ ] **Step 1: Write the failing test**

Create `apps/worker/src/fetch/safe-fetch-bytes.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createSafeFetchBytes } from "./safe-fetch.js";

const publicIp = ["93.184.216.34"];

function resLike(status: number, body: Uint8Array, headers: Record<string, string> = {}) {
  return {
    status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

describe("createSafeFetchBytes", () => {
  it("returns bytes and content-type for a 200", async () => {
    const body = new Uint8Array([1, 2, 3]);
    const fetchBytes = createSafeFetchBytes({
      lookup: async () => publicIp,
      fetchFn: async () => resLike(200, body, { "content-type": "image/png" }),
    });
    const got = await fetchBytes("https://example.com/favicon.ico");
    expect(got?.contentType).toBe("image/png");
    expect(Array.from(got!.bytes)).toEqual([1, 2, 3]);
  });

  it("returns null on a 404", async () => {
    const fetchBytes = createSafeFetchBytes({
      lookup: async () => publicIp,
      fetchFn: async () => resLike(404, new Uint8Array()),
    });
    expect(await fetchBytes("https://example.com/favicon.ico")).toBeNull();
  });

  it("refuses a private address", async () => {
    const fetchBytes = createSafeFetchBytes({
      lookup: async () => ["127.0.0.1"],
      fetchFn: async () => resLike(200, new Uint8Array([1])),
    });
    await expect(fetchBytes("https://internal/favicon.ico")).rejects.toThrow(/blocked address/);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @readmepls/worker test -- safe-fetch-bytes`
Expected: FAIL — `createSafeFetchBytes` is not exported.

- [ ] **Step 3: Implement**

In `apps/worker/src/fetch/safe-fetch.ts`, add below the existing `defaultSafeFetchHtml` (the private `assertSafe` at the bottom of the file is in scope):

```typescript
interface ByteResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface SafeFetchBytesDeps {
  lookup: (host: string) => Promise<string[]>;
  fetchFn: (url: string) => Promise<ByteResponseLike>;
  maxRedirects?: number;
}

/**
 * SSRF-safe binary fetch, mirroring createSafeFetchHtml. Re-validates the host
 * before every hop; follows redirects manually. Returns null on any non-2xx so
 * favicon probing can fall through to the next candidate without throwing.
 */
export function createSafeFetchBytes(
  deps: SafeFetchBytesDeps
): (url: string) => Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const maxRedirects = deps.maxRedirects ?? 5;
  return async function fetchBytes(url) {
    let current = url;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await assertSafe(current, deps.lookup);
      const r = await deps.fetchFn(current);
      if (r.status >= 300 && r.status < 400) {
        const location = r.headers.get("location");
        if (!location) return null;
        current = new URL(location, current).toString();
        continue;
      }
      if (r.status < 200 || r.status >= 300) return null;
      const buf = await r.arrayBuffer();
      return {
        bytes: new Uint8Array(buf),
        contentType: r.headers.get("content-type") ?? "",
      };
    }
    return null;
  };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm --filter @readmepls/worker test -- safe-fetch-bytes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/fetch/safe-fetch.ts apps/worker/src/fetch/safe-fetch-bytes.test.ts
git commit -m "feat(worker): SSRF-safe byte fetch for favicons"
```

---

### Task 6: Worker — `ensureSource` (upsert + favicon), wired into `processJob`

**Files:**
- Create: `apps/worker/src/source/ensure-source.ts`
- Modify: `apps/worker/src/worker.ts:8-13` (ProcessDeps), `:36-55` (link source after content create)
- Modify: `apps/worker/src/main.ts` (wire `fetchBytes` into deps)
- Test: `apps/worker/src/source/ensure-source.integration.test.ts`

**Interfaces:**
- Consumes: `deriveSourceHost`, `pickFaviconCandidates` (Task 2/3); `createSafeFetchBytes` (Task 5).
- Produces: `interface SourceIO { fetchHtml(url: string): Promise<string>; fetchBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> }` and `ensureSource(pb: PocketBase, host: string, name: string | null, io: SourceIO): Promise<string>` (returns the source id). `ProcessDeps` gains `fetchBytes: SourceIO["fetchBytes"]`.

- [ ] **Step 1: Write the failing integration test**

Create `apps/worker/src/source/ensure-source.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { ensureSource, type SourceIO } from "./ensure-source.js";

let h: PbHandle;
beforeAll(async () => { h = await startEphemeralPb(); }, 30000);
afterAll(() => h?.stop());

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function ioWith(html: string): SourceIO {
  return {
    fetchHtml: async () => html,
    fetchBytes: async (url) =>
      url.endsWith("/favicon.ico") ? { bytes: pngBytes, contentType: "image/png" } : null,
  };
}

describe("ensureSource", () => {
  it("creates one source per host and stores the favicon", async () => {
    const io = ioWith("<html><head></head></html>");
    const id = await ensureSource(h.pb, "nytimes.com", "The New York Times", io);
    const row = await h.pb.collection("sources").getOne(id);
    expect(row.host).toBe("nytimes.com");
    expect(row.name).toBe("The New York Times");
    expect(row.favicon_status).toBe("ok");
    expect(row.favicon).not.toBe("");
  });

  it("is idempotent — a second call returns the same row, no duplicate", async () => {
    const io = ioWith("<html><head></head></html>");
    const a = await ensureSource(h.pb, "idem.com", "Idem", io);
    const b = await ensureSource(h.pb, "idem.com", "Idem", io);
    expect(b).toBe(a);
    const list = await h.pb.collection("sources").getFullList({
      filter: h.pb.filter("host = {:h}", { h: "idem.com" }),
    });
    expect(list.length).toBe(1);
  });

  it("records favicon_status 'none' when no candidate yields bytes", async () => {
    const io: SourceIO = { fetchHtml: async () => "<html></html>", fetchBytes: async () => null };
    const id = await ensureSource(h.pb, "noicon.com", null, io);
    const row = await h.pb.collection("sources").getOne(id);
    expect(row.favicon_status).toBe("none");
    expect(row.favicon).toBe("");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @readmepls/worker test -- ensure-source`
Expected: FAIL — cannot find module `./ensure-source.js`.

- [ ] **Step 3: Implement `ensureSource`**

Create `apps/worker/src/source/ensure-source.ts`:

```typescript
import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { pickFaviconCandidates } from "@readmepls/core";

export interface SourceIO {
  fetchHtml(url: string): Promise<string>;
  fetchBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
}

/** Download the best favicon for a host. Returns a File to store, or null. */
async function fetchFavicon(host: string, io: SourceIO): Promise<File | null> {
  const base = `https://${host}/`;
  let html = "";
  try {
    html = await io.fetchHtml(base);
  } catch {
    // Site root unreachable — still try the /favicon.ico fallback below.
  }
  const candidates = pickFaviconCandidates(html, base);
  for (const url of candidates) {
    let res: { bytes: Uint8Array; contentType: string } | null = null;
    try {
      res = await io.fetchBytes(url);
    } catch {
      continue; // blocked/errored candidate — try the next
    }
    if (res && res.bytes.length > 0 && res.contentType.startsWith("image/")) {
      const ext = url.split(".").pop()?.split(/[?#]/)[0] || "ico";
      return new File([res.bytes], `favicon.${ext}`, { type: res.contentType });
    }
  }
  return null;
}

/**
 * Find-or-create the source row for a host, best-effort favicon. Idempotent and
 * race-safe: relies on the unique host index; a concurrent create that loses the
 * race is caught and re-read. Never throws for favicon failures.
 */
export async function ensureSource(
  pb: PocketBase,
  host: string,
  name: string | null,
  io: SourceIO
): Promise<string> {
  const existing = await findByHost(pb, host);
  if (existing) {
    if (name && !existing.name) {
      await pb.collection("sources").update(existing.id, { name });
    }
    if (existing.favicon_status === "pending") {
      await attachFavicon(pb, existing.id, host, io);
    }
    return existing.id;
  }

  let created;
  try {
    created = await pb.collection("sources").create({
      host, name, favicon_status: "pending",
    });
  } catch (err) {
    // Lost a create race on the unique host index — re-read the winner.
    if (err instanceof ClientResponseError && err.status === 400) {
      const winner = await findByHost(pb, host);
      if (winner) return winner.id;
    }
    throw err;
  }
  await attachFavicon(pb, created.id, host, io);
  return created.id;
}

async function findByHost(pb: PocketBase, host: string) {
  try {
    return await pb.collection("sources").getFirstListItem(
      pb.filter("host = {:h}", { h: host })
    );
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}

async function attachFavicon(pb: PocketBase, id: string, host: string, io: SourceIO): Promise<void> {
  const file = await fetchFavicon(host, io);
  await pb.collection("sources").update(id, file
    ? { favicon: file, favicon_status: "ok" }
    : { favicon_status: "none" });
}
```

- [ ] **Step 4: Run the integration test, verify pass**

Run: `pnpm --filter @readmepls/worker test -- ensure-source`
Expected: PASS (all three cases).

- [ ] **Step 5: Wire into `processJob`**

In `apps/worker/src/worker.ts`, extend `ProcessDeps` (line 8):

```typescript
export interface ProcessDeps {
  io: ExtractIO;
  registry: ExtractorRegistry;
  ai: AIProvider;
  classify: (url: string) => SourceType;
  fetchBytes: (url: string) => Promise<{ bytes: Uint8Array; contentType: string } | null>;
}
```

Add imports at the top of `worker.ts`:

```typescript
import { deriveSourceHost } from "@readmepls/core";
import { ensureSource } from "./source/ensure-source.js";
```

After the `content` create block (after line 55, before the `toLink` query), add:

```typescript
    // Link the content to its source website. Best-effort: a favicon or source
    // failure must never fail an otherwise-successful extraction job.
    try {
      const host = deriveSourceHost(job.canonical_url);
      if (host) {
        const sourceId = await ensureSource(pb, host, result.siteName, {
          fetchHtml: deps.io.fetchHtml,
          fetchBytes: deps.fetchBytes,
        });
        await pb.collection("content").update(content.id, { source: sourceId });
      }
    } catch (err) {
      console.error(`[worker] source linking failed for ${job.canonical_url}:`, err);
    }
```

- [ ] **Step 6: Wire `fetchBytes` in `main.ts`**

In `apps/worker/src/main.ts`, add the import:

```typescript
import { createSafeFetchHtml, createSafeFetchBytes } from "./fetch/safe-fetch.js";
```

After the `fetchHtml` construction, add:

```typescript
  const fetchBytes = createSafeFetchBytes({
    lookup: async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address),
    fetchFn: (url) => fetch(url, { redirect: "manual" }),
  });
```

And add `fetchBytes` to the `deps` object:

```typescript
  const deps: ProcessDeps = {
    io,
    registry,
    ai,
    classify: classifySource,
    fetchBytes,
  };
```

- [ ] **Step 7: Update existing processJob tests for the new dep**

Existing tests (e.g. `apps/worker/src/link.integration.test.ts`, `worker`-suite tests) construct `ProcessDeps` without `fetchBytes` and will now fail to type-check / run. Add `fetchBytes: async () => null` to each `processJob(...)` deps object in the worker test files. Find them:

Run: `grep -rl "classify: classifySource" apps/worker/src`
For each, add `fetchBytes: async () => null,` to the deps literal.

- [ ] **Step 8: Run the full worker suite, verify pass**

Run: `pnpm --filter @readmepls/worker test`
Expected: PASS. (Confirms source linkage integrates without breaking extraction/linking.)

- [ ] **Step 9: Commit**

```bash
git add apps/worker/src/source/ensure-source.ts apps/worker/src/source/ensure-source.integration.test.ts apps/worker/src/worker.ts apps/worker/src/main.ts apps/worker/src/*.test.ts
git commit -m "feat(worker): derive + upsert source with favicon on extraction"
```

---

### Task 7: Worker — backfill existing content

**Files:**
- Create: `apps/worker/src/source/backfill-sources.ts`
- Modify: `apps/worker/src/main.ts` (optional startup pass gated by env)
- Test: `apps/worker/src/source/backfill-sources.integration.test.ts`

**Interfaces:**
- Consumes: `ensureSource`, `SourceIO` (Task 6), `deriveSourceHost` (Task 2).
- Produces: `backfillSources(pb: PocketBase, io: SourceIO): Promise<{ linked: number }>` — for every `content` row with an empty `source`, derive host from `canonical_url`, upsert the source, set `content.source`. Idempotent (skips already-linked rows).

- [ ] **Step 1: Write the failing integration test**

Create `apps/worker/src/source/backfill-sources.integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { backfillSources, type SourceIO } from "./backfill-sources.js";

let h: PbHandle;
beforeAll(async () => { h = await startEphemeralPb(); }, 30000);
afterAll(() => h?.stop());

const io: SourceIO = { fetchHtml: async () => "<html></html>", fetchBytes: async () => null };

async function mkContent(pb: PbHandle["pb"], url: string) {
  return pb.collection("content").create({
    canonical_url: url, content_hash: url, source_type: "article",
    title: "t", excerpt: "e", content_html: "<p>x</p>", content_text: "x",
    word_count: 1, read_time: 1, ai_tags_json: [], fetched_at: "now", extract_status: "ok",
  });
}

describe("backfillSources", () => {
  it("links unlinked content rows to derived sources and is idempotent", async () => {
    const c1 = await mkContent(h.pb, "https://www.example.com/a");
    const c2 = await mkContent(h.pb, "https://blog.example.com/b");

    const first = await backfillSources(h.pb, io);
    expect(first.linked).toBe(2);

    const got1 = await h.pb.collection("content").getOne(c1.id, { expand: "source" });
    expect(got1.expand?.source?.host).toBe("example.com");
    const got2 = await h.pb.collection("content").getOne(c2.id, { expand: "source" });
    expect(got2.expand?.source?.host).toBe("blog.example.com");

    // Second run links nothing new.
    const second = await backfillSources(h.pb, io);
    expect(second.linked).toBe(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @readmepls/worker test -- backfill-sources`
Expected: FAIL — cannot find module `./backfill-sources.js`.

- [ ] **Step 3: Implement**

Create `apps/worker/src/source/backfill-sources.ts`:

```typescript
import type PocketBase from "pocketbase";
import { deriveSourceHost } from "@readmepls/core";
import { ensureSource, type SourceIO } from "./ensure-source.js";

export type { SourceIO };

/**
 * One-off pass: link every content row that has no source. Re-runnable — only
 * rows with an empty source relation are touched, and ensureSource dedupes by
 * host. Safe to run at worker startup behind an env flag.
 */
export async function backfillSources(pb: PocketBase, io: SourceIO): Promise<{ linked: number }> {
  const rows = await pb.collection("content").getFullList({
    filter: pb.filter("source = ''"),
  });
  let linked = 0;
  for (const row of rows) {
    const host = deriveSourceHost(row.canonical_url as string);
    if (!host) continue;
    try {
      const sourceId = await ensureSource(pb, host, (row.site_name as string) || null, io);
      await pb.collection("content").update(row.id, { source: sourceId });
      linked++;
    } catch (err) {
      console.error(`[backfill] failed for ${row.canonical_url}:`, err);
    }
  }
  return { linked };
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `pnpm --filter @readmepls/worker test -- backfill-sources`
Expected: PASS.

- [ ] **Step 5: Gate a startup pass in `main.ts`**

In `apps/worker/src/main.ts`, add the import:

```typescript
import { backfillSources } from "./source/backfill-sources.js";
```

Immediately before the `console.log(...polling...)` line, add:

```typescript
  if (process.env.BACKFILL_SOURCES === "1") {
    const { linked } = await backfillSources(pb, { fetchHtml, fetchBytes });
    console.log(`[worker ${workerId}] backfilled ${linked} content rows with sources`);
  }
```

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/source/backfill-sources.ts apps/worker/src/source/backfill-sources.integration.test.ts apps/worker/src/main.ts
git commit -m "feat(worker): backfill sources for existing content"
```

---

### Task 8: Web — `SourcePill` primitive

**Files:**
- Create: `apps/web/src/lib/components/ui/SourcePill.svelte`
- Test: `apps/web/src/lib/components/ui/source-pill.test.ts`

**Interfaces:**
- Produces: `SourcePill` with props `{ name?: string | null; host: string; iconUrl?: string | null }`. Renders the icon when `iconUrl` is set, otherwise a generic `Globe` glyph; label is `name` when present, else `host`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/components/ui/source-pill.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import SourcePill from "./SourcePill.svelte";

describe("SourcePill", () => {
  it("shows the name when present", () => {
    render(SourcePill, { name: "The New York Times", host: "nytimes.com" });
    expect(screen.getByText("The New York Times")).toBeInTheDocument();
  });

  it("falls back to the host when no name", () => {
    render(SourcePill, { name: null, host: "blog.acme.com" });
    expect(screen.getByText("blog.acme.com")).toBeInTheDocument();
  });

  it("renders the favicon img when iconUrl is set", () => {
    const { container } = render(SourcePill, { host: "nytimes.com", iconUrl: "https://x/i.png" });
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://x/i.png");
  });

  it("renders a fallback glyph when no iconUrl", () => {
    const { container } = render(SourcePill, { host: "nytimes.com" });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @readmepls/web test -- source-pill`
Expected: FAIL — cannot find `./SourcePill.svelte`.

- [ ] **Step 3: Implement**

Create `apps/web/src/lib/components/ui/SourcePill.svelte`:

```svelte
<script lang="ts">
  import { Globe } from "@lucide/svelte";
  let { name = null, host, iconUrl = null }: {
    name?: string | null;
    host: string;
    iconUrl?: string | null;
  } = $props();
  const label = $derived(name || host);
</script>

<span class="source-pill" title={host}>
  {#if iconUrl}
    <img class="favicon" src={iconUrl} alt="" width="16" height="16" loading="lazy" />
  {:else}
    <Globe class="favicon-fallback" aria-hidden="true" />
  {/if}
  <span class="label">{label}</span>
</span>

<style>
  .source-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-ui);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    max-width: 100%;
  }
  .favicon, :global(.source-pill .favicon-fallback) {
    width: 1rem;
    height: 1rem;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    object-fit: contain;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm --filter @readmepls/web test -- source-pill`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/ui/SourcePill.svelte apps/web/src/lib/components/ui/source-pill.test.ts
git commit -m "feat(web): SourcePill UI primitive"
```

---

### Task 9: Web — source helper + show pill on card and reader

**Files:**
- Create: `apps/web/src/lib/source/source-view.ts`
- Modify: `apps/web/src/lib/components/ArticleCard.svelte` (render pill; import)
- Modify: `apps/web/src/routes/library/+page.svelte:41` and `:130` (expand `content.source`)
- Modify: `apps/web/src/routes/read/[id]/+page.svelte:186` (expand) and `:289` (render pill)
- Test: `apps/web/src/lib/source/source-view.test.ts`

**Interfaces:**
- Consumes: `deriveSourceHost` (Task 2).
- Produces: `sourceView(pb, content): { host: string; name: string | null; iconUrl: string | null } | null` — reads the expanded `content.expand.source` record, builds the favicon URL via `pb.files.getURL`, falls back to `deriveSourceHost(content.canonical_url)` for the host when there is no source record. Returns `null` only when no host can be derived at all.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/source/source-view.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { sourceView } from "./source-view.js";

// Minimal pb stub: only files.getURL is used.
const pb = { files: { getURL: (rec: { id: string }, file: string) => `https://pb/${rec.id}/${file}` } } as any;

describe("sourceView", () => {
  it("builds host, name and favicon url from an expanded source", () => {
    const content = {
      canonical_url: "https://www.nytimes.com/x",
      expand: { source: { id: "s1", host: "nytimes.com", name: "NYT", favicon: "f.png", favicon_status: "ok" } },
    };
    const v = sourceView(pb, content);
    expect(v).toEqual({ host: "nytimes.com", name: "NYT", iconUrl: "https://pb/s1/f.png" });
  });

  it("returns null iconUrl when the source has no favicon", () => {
    const content = {
      canonical_url: "https://acme.com/x",
      expand: { source: { id: "s2", host: "acme.com", name: null, favicon: "", favicon_status: "none" } },
    };
    expect(sourceView(pb, content)?.iconUrl).toBeNull();
  });

  it("falls back to deriving the host when no source is expanded", () => {
    const v = sourceView(pb, { canonical_url: "https://www.blog.io/p" });
    expect(v).toEqual({ host: "blog.io", name: null, iconUrl: null });
  });

  it("returns null when there is no host at all", () => {
    expect(sourceView(pb, { canonical_url: "not a url" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @readmepls/web test -- source-view`
Expected: FAIL — cannot find `./source-view.js`.

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/lib/source/source-view.ts`:

```typescript
import type PocketBase from "pocketbase";
import { deriveSourceHost } from "@readmepls/core";

interface ContentLike {
  canonical_url?: string;
  expand?: { source?: { id: string; host: string; name: string | null; favicon: string } };
}

export interface SourceView {
  host: string;
  name: string | null;
  iconUrl: string | null;
}

/**
 * View-model for a content row's source. Prefers the expanded source record;
 * falls back to deriving the host from canonical_url so a not-yet-linked article
 * still shows a hostname. Returns null only when no host can be derived.
 */
export function sourceView(pb: PocketBase, content: ContentLike | null | undefined): SourceView | null {
  const src = content?.expand?.source;
  if (src) {
    return {
      host: src.host,
      name: src.name ?? null,
      iconUrl: src.favicon ? pb.files.getURL(src, src.favicon) : null,
    };
  }
  const host = content?.canonical_url ? deriveSourceHost(content.canonical_url) : null;
  return host ? { host, name: null, iconUrl: null } : null;
}
```

- [ ] **Step 4: Run the helper test, verify pass**

Run: `pnpm --filter @readmepls/web test -- source-view`
Expected: PASS.

- [ ] **Step 5: Render the pill on `ArticleCard`**

In `apps/web/src/lib/components/ArticleCard.svelte`, add imports after the `Spinner` import:

```typescript
  import SourcePill from "./ui/SourcePill.svelte";
  import { sourceView } from "$lib/source/source-view.js";
  import { browserPb } from "$lib/pb.js";
```

Add a derived source view after the `content` derived (near line ~40):

```typescript
  const pb = browserPb();
  const source = $derived(sourceView(pb, content));
```

In the ready branch, add the pill under the title (after the `<h3>` in the `{:else}` block):

```svelte
      {#if source}
        <div class="card-source"><SourcePill name={source.name} host={source.host} iconUrl={source.iconUrl} /></div>
      {/if}
```

Add to the `<style>` block:

```css
  .card-source { position: relative; z-index: 2; pointer-events: none; }
```

- [ ] **Step 6: Expand `content.source` in the library**

In `apps/web/src/routes/library/+page.svelte`, change both places that load articles from `expand: "content"` to `expand: "content.source"`:
- the `getList` call in `load()` (line ~41).
- the realtime `subscribe` call in `onMount` (line ~130).

- [ ] **Step 7: Render the pill in the reader + expand source**

In `apps/web/src/routes/read/[id]/+page.svelte`:
- Line ~186: change `getOne(id, { expand: "content" })` to `getOne(id, { expand: "content.source" })`.
- Add imports (with the other component imports):

```typescript
  import SourcePill from "$lib/components/ui/SourcePill.svelte";
  import { sourceView } from "$lib/source/source-view.js";
```

- After `content` is set, add a derived view (near the other `$derived` in the reader script):

```typescript
  const source = $derived(sourceView(pb, content));
```

- Under the reader `<h1>{content.title}</h1>` (line ~289), add:

```svelte
          {#if source}
            <div class="reader-source"><SourcePill name={source.name} host={source.host} iconUrl={source.iconUrl} /></div>
          {/if}
```

- Add to the reader `<style>`:

```css
  .reader-source { margin: 0 0 var(--space-4); }
```

- [ ] **Step 8: Run the web suite + typecheck, verify pass**

Run: `pnpm --filter @readmepls/web test && pnpm --filter @readmepls/web run check`
Expected: PASS (tests green, `svelte-check` no new errors).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/source/ apps/web/src/lib/components/ArticleCard.svelte apps/web/src/routes/library/+page.svelte "apps/web/src/routes/read/[id]/+page.svelte"
git commit -m "feat(web): show source pill on cards and reader"
```

---

### Task 10: Web — library source chip filter with favorites

**Files:**
- Create: `apps/web/src/lib/source/library-sources.ts`
- Create: `apps/web/src/lib/source/library-sources.test.ts`
- Create: `apps/web/src/lib/components/SourceFilter.svelte`
- Modify: `apps/web/src/routes/library/+page.svelte` (state, load, filter, mount `SourceFilter`)

**Interfaces:**
- Consumes: `sourceView`/expanded `content.source` on loaded articles (Task 9), `Chip` primitive, `SourceFavorite` collection (Task 4).
- Produces:
  - `deriveLibrarySources(articles, favoriteIds): SourceFacet[]` — pure; distinct sources over the user's articles, each `{ id, host, name, favicon, count, favorite }`, sorted favorites-first then by count desc then host asc.
  - `filterBySources(articles, selectedIds): ArticleRecord[]` — pure; returns all articles when `selectedIds` is empty, else those whose `content.expand.source.id` is in the set (union).
  - `SourceFilter.svelte` — props `{ facets, selected, onToggle, onToggleFavorite }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/source/library-sources.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { deriveLibrarySources, filterBySources } from "./library-sources.js";

const art = (id: string, sourceId: string | null, host = "h.com", name: string | null = null) => ({
  id, url: "u", status: "unread", progress: 0,
  expand: sourceId ? { content: { expand: { source: { id: sourceId, host, name, favicon: "" } } } } : { content: {} },
});

describe("deriveLibrarySources", () => {
  it("counts distinct sources present in the library", () => {
    const facets = deriveLibrarySources(
      [art("1", "s1", "a.com"), art("2", "s1", "a.com"), art("3", "s2", "b.com")],
      new Set(),
    );
    const byId = Object.fromEntries(facets.map((f) => [f.id, f]));
    expect(byId["s1"].count).toBe(2);
    expect(byId["s2"].count).toBe(1);
  });

  it("sorts favorites first, then by count desc", () => {
    const facets = deriveLibrarySources(
      [art("1", "s1", "a.com"), art("2", "s1", "a.com"), art("3", "s2", "b.com")],
      new Set(["s2"]),
    );
    expect(facets[0].id).toBe("s2"); // favorite pinned first despite lower count
    expect(facets[0].favorite).toBe(true);
  });

  it("ignores articles with no source", () => {
    expect(deriveLibrarySources([art("1", null)], new Set())).toEqual([]);
  });
});

describe("filterBySources", () => {
  const arts = [art("1", "s1"), art("2", "s2"), art("3", "s1")];
  it("returns all when nothing selected", () => {
    expect(filterBySources(arts, new Set()).length).toBe(3);
  });
  it("returns the union of selected sources", () => {
    expect(filterBySources(arts, new Set(["s1"])).map((a) => a.id)).toEqual(["1", "3"]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @readmepls/web test -- library-sources`
Expected: FAIL — cannot find `./library-sources.js`.

- [ ] **Step 3: Implement the pure helpers**

Create `apps/web/src/lib/source/library-sources.ts`:

```typescript
interface ArticleLike {
  id: string;
  expand?: { content?: { expand?: { source?: { id: string; host: string; name: string | null; favicon: string } } } };
}

export interface SourceFacet {
  id: string;
  host: string;
  name: string | null;
  favicon: string;
  count: number;
  favorite: boolean;
}

/** Distinct sources present in the user's own articles, favorites pinned first. */
export function deriveLibrarySources(articles: ArticleLike[], favoriteIds: Set<string>): SourceFacet[] {
  const map = new Map<string, SourceFacet>();
  for (const a of articles) {
    const src = a.expand?.content?.expand?.source;
    if (!src) continue;
    const existing = map.get(src.id);
    if (existing) {
      existing.count++;
    } else {
      map.set(src.id, {
        id: src.id, host: src.host, name: src.name ?? null, favicon: src.favicon,
        count: 1, favorite: favoriteIds.has(src.id),
      });
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.host.localeCompare(b.host);
  });
}

/** Union filter: empty selection → all; else articles whose source is selected. */
export function filterBySources<T extends ArticleLike>(articles: T[], selectedIds: Set<string>): T[] {
  if (selectedIds.size === 0) return articles;
  return articles.filter((a) => {
    const id = a.expand?.content?.expand?.source?.id;
    return id ? selectedIds.has(id) : false;
  });
}
```

- [ ] **Step 4: Run the helper test, verify pass**

Run: `pnpm --filter @readmepls/web test -- library-sources`
Expected: PASS.

- [ ] **Step 5: Build `SourceFilter.svelte`**

Create `apps/web/src/lib/components/SourceFilter.svelte`:

```svelte
<script lang="ts">
  import Chip from "./ui/Chip.svelte";
  import { Star } from "@lucide/svelte";
  import { browserPb } from "$lib/pb.js";
  import type { SourceFacet } from "$lib/source/library-sources.js";

  let { facets, selected, onToggle, onToggleFavorite }: {
    facets: SourceFacet[];
    selected: Set<string>;
    onToggle: (id: string) => void;
    onToggleFavorite: (facet: SourceFacet) => void;
  } = $props();

  const pb = browserPb();
  function iconUrl(f: SourceFacet): string | null {
    return f.favicon ? pb.files.getURL({ id: f.id, favicon: f.favicon } as never, f.favicon) : null;
  }
</script>

{#if facets.length > 0}
  <nav class="source-filter" aria-label="Filter by source">
    <button class="chip-btn" aria-pressed={selected.size === 0} onclick={() => onToggle("__all__")}>
      <Chip selected={selected.size === 0}>all</Chip>
    </button>
    {#each facets as f (f.id)}
      <span class="source-chip">
        <button class="chip-btn" aria-pressed={selected.has(f.id)} onclick={() => onToggle(f.id)}>
          <Chip selected={selected.has(f.id)}>
            {#if iconUrl(f)}<img class="chip-favicon" src={iconUrl(f)} alt="" width="14" height="14" />{/if}
            {f.name || f.host}
            {#snippet trailing()}<span class="count">{f.count}</span>{/snippet}
          </Chip>
        </button>
        <button
          class="fav-btn"
          class:active={f.favorite}
          aria-label={f.favorite ? `unfavorite ${f.host}` : `favorite ${f.host}`}
          aria-pressed={f.favorite}
          onclick={() => onToggleFavorite(f)}
        >
          <Star class="icon-sm" aria-hidden="true" />
        </button>
      </span>
    {/each}
  </nav>
{/if}

<style>
  .source-filter { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 1.25rem; }
  .source-chip { display: inline-flex; align-items: center; gap: 0.15rem; }
  .chip-btn { background: none; border: none; padding: 0; cursor: pointer; }
  .chip-favicon { width: 0.9rem; height: 0.9rem; border-radius: var(--radius-sm); object-fit: contain; }
  .count { font-size: var(--text-xs); opacity: 0.7; }
  .fav-btn {
    background: none; border: none; cursor: pointer; padding: 0.1rem;
    color: var(--color-text-muted); display: inline-flex;
  }
  .fav-btn.active { color: var(--color-accent); }
  .fav-btn:hover { color: var(--color-accent); }
  .fav-btn:focus-visible { outline: var(--focus-ring-width) solid var(--color-ring); outline-offset: 2px; }
</style>
```

- [ ] **Step 6: Wire into the library page**

In `apps/web/src/routes/library/+page.svelte`:

Add imports:

```typescript
  import SourceFilter from "$lib/components/SourceFilter.svelte";
  import { deriveLibrarySources, filterBySources, type SourceFacet } from "$lib/source/library-sources.js";
```

Add state (near the other `$state` declarations):

```typescript
  let selectedSources = $state<Set<string>>(new Set());
  let favoriteSourceIds = $state<Set<string>>(new Set());
```

Add derived facets and fold source filtering into `visible`. Replace the existing `visible` derived with:

```typescript
  let sourceFacets = $derived<SourceFacet[]>(deriveLibrarySources(articles, favoriteSourceIds));
  let visible = $derived(
    filterBySources(
      selectedTag === null ? articles : articles.filter((a) => taggedArticleIds.has(a.id)),
      selectedSources,
    ),
  );
```

Add the toggle handlers and favorites loader (near the other functions):

```typescript
  function toggleSource(id: string) {
    if (id === "__all__") { selectedSources = new Set(); return; }
    const next = new Set(selectedSources);
    next.has(id) ? next.delete(id) : next.add(id);
    selectedSources = next;
  }

  async function loadFavorites() {
    const rows = await pb.collection("source_favorites").getFullList();
    favoriteSourceIds = new Set(rows.map((r) => r.source as string));
  }

  async function toggleFavorite(facet: SourceFacet) {
    const uid = pb.authStore.model?.id;
    if (!uid) return;
    if (favoriteSourceIds.has(facet.id)) {
      const row = await pb.collection("source_favorites").getFirstListItem(
        pb.filter("source = {:s}", { s: facet.id }),
      );
      await pb.collection("source_favorites").delete(row.id);
    } else {
      await pb.collection("source_favorites").create({ user: uid, source: facet.id });
    }
    await loadFavorites();
  }
```

Add `loadFavorites()` to the `onMount` `Promise.all`:

```typescript
  onMount(async () => {
    await Promise.all([load(), loadTags(), loadCollections(), loadFavorites()]);
    unsub = await pb.collection("articles").subscribe("*", () => load(), { expand: "content.source" });
  });
```

Render the filter inside the `Rail`, above the tag rail (after the `<Rail label=...>` opening tag):

```svelte
    <SourceFilter
      facets={sourceFacets}
      selected={selectedSources}
      onToggle={toggleSource}
      onToggleFavorite={toggleFavorite}
    />
```

- [ ] **Step 7: Run web tests + check, verify pass**

Run: `pnpm --filter @readmepls/web test && pnpm --filter @readmepls/web run check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/source/library-sources.ts apps/web/src/lib/source/library-sources.test.ts apps/web/src/lib/components/SourceFilter.svelte apps/web/src/routes/library/+page.svelte
git commit -m "feat(web): library source chip filter with favorites"
```

---

### Task 11: Tenant-isolation test for `source_favorites`

**Files:**
- Create: `apps/web/src/lib/server/source-favorites.isolation.test.ts` (or place beside existing isolation tests — match the repo's isolation-test location)

**Interfaces:**
- Consumes: ephemeral PB harness, two test users.

> First locate where existing tenant-isolation tests live (`grep -rl "isolation" apps packages`) and colocate this one with them, matching their imports/harness usage. The code below assumes the worker/core `startEphemeralPb` + `makeTestUser` harness used in `apps/worker/src/link.integration.test.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, makeTestUser, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import PocketBase from "pocketbase";

let h: PbHandle;
beforeAll(async () => { h = await startEphemeralPb(); }, 30000);
afterAll(() => h?.stop());

describe("source_favorites isolation", () => {
  it("a user cannot read another user's favorites", async () => {
    // Seed a global source via the superuser-authed harness pb.
    const src = await h.pb.collection("sources").create({ host: "iso.com", name: "Iso", favicon_status: "none" });

    const a = await makeTestUser(h.pb); // returns user id; harness helper
    const b = await makeTestUser(h.pb);

    // User A favorites the source (auth as A on a fresh client).
    const pbA = new PocketBase(h.url);
    await pbA.collection("users").authWithPassword("... A email ...", "... A password ...");
    await pbA.collection("source_favorites").create({ user: a, source: src.id });

    // User B lists favorites — must see none of A's.
    const pbB = new PocketBase(h.url);
    await pbB.collection("users").authWithPassword("... B email ...", "... B password ...");
    const seen = await pbB.collection("source_favorites").getFullList();
    expect(seen.length).toBe(0);
  });
});
```

> Adjust `makeTestUser`'s return shape to the actual harness (it may return `{ id, email, password }` or a pre-authed client). Use the exact pattern the existing isolation tests use for authing as each user — do not invent credentials. The assertion that matters: **B's `getFullList` on `source_favorites` returns zero of A's rows.**

- [ ] **Step 2: Run it, verify it fails or passes as expected**

Run: `pnpm --filter @readmepls/worker test -- source-favorites.isolation` (or the package you colocated it in)
Expected: PASS — the `user = @request.auth.id` list rule from Task 4 already enforces this. (If it FAILS, the rule is wrong — fix the migration, not the test.)

- [ ] **Step 3: Commit**

```bash
git add <the isolation test file>
git commit -m "test: source_favorites tenant isolation"
```

---

## Self-Review

**Spec coverage:**
- Normalized `sources` collection → Task 4. ✓
- `content.source` relation, keep `site_name` → Task 1 (type) + Task 4 (field); `site_name` untouched. ✓
- Source key = host minus `www.`, subdomains distinct → Task 2 + tests. ✓
- Favicon parse HTML + download + store as PB file → Task 3 (candidates) + Task 5 (byte fetch) + Task 6 (store). ✓
- Worker upsert idempotent + race-safe → Task 6 tests. ✓
- X/YouTube hosts `x.com`/`youtube.com` → covered by `deriveSourceHost` over their canonical URLs (no special-case needed; names already hardcoded upstream). ✓
- Global sources, worker-written, authed read → Task 4 rules. ✓
- Per-user favorites → Task 4 collection + Task 10 UI + Task 11 isolation. ✓
- Filter list derived only from user's own library → Task 10 `deriveLibrarySources` (operates on the user's loaded articles, never lists `sources`). ✓
- Multi-select union filter → Task 10 `filterBySources`. ✓
- Favorites pinned first → Task 10 sort + test. ✓
- SourcePill on card + reader → Task 8 + Task 9. ✓
- Backfill → Task 7. ✓
- Zod at boundaries → Task 1 schemas (parsing of read-back rows can be added where the UI consumes them; the pill/filter read expanded relation fields, which are validated in Task 1's `Source` schema shape). ✓
- Tests: core/worker/isolation/web all present. ✓

**Placeholder scan:** The only intentionally-parameterized spots are in Task 11 (test credentials/harness shape), flagged explicitly because the exact `makeTestUser` contract must be read from the existing harness rather than guessed. All code steps contain runnable code.

**Type consistency:** `SourceIO` defined in Task 6, re-exported in Task 7. `SourceFacet` defined in Task 10, imported by `SourceFilter`. `sourceView`/`SourceView` in Task 9. `deriveSourceHost` (Task 2) consumed in Tasks 6, 7, 9. `pickFaviconCandidates` (Task 3) consumed in Task 6. `favicon_status` union consistent across Tasks 1/4/6. Favicon URL built via `pb.files.getURL` consistently in Tasks 9 and 10.

**Rollout order:** types → core → migration → worker fetch → worker upsert → backfill → web pill → web filter → isolation. Each task ends with a passing test and a commit.
