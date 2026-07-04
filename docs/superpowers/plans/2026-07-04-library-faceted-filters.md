# Library Faceted Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the library's thin source/tag/archived filtering with a full server-side faceted filtering system — combinable facets, URL-driven state, search folded in — behind a filter drawer.

**Architecture:** Query translation is a pure function (`buildLibraryQuery`) in `@readmepls/core`; a thin IO shell (`fetchLibraryPage`) runs it against the authenticated per-user PocketBase client and folds in FTS search. The SvelteKit `/library` server load is a thin wrapper. The client owns a filter drawer, active-filter chips, sort, and search box, all reflected in the URL.

**Tech Stack:** SvelteKit (Svelte 5 runes), PocketBase (filter DSL + FTS5), Zod, Vitest, ephemeral-PB integration harness.

## Global Constraints

- **TypeScript strict.** No `any` without a written reason.
- **Validate at boundaries with Zod.** URL params and data read back from PocketBase are parsed before use.
- **Model states as unions, not booleans.** Facet value sets are `as const` unions.
- **Pure core, thin IO shell.** Filter translation is pure and unit-tested; side effects (PB, FTS) live at the edges.
- **Never raw-interpolate into PB filters.** All values pass through `pb.filter(expr, params)` bindings.
- **Tokens only in components.** No hardcoded color/font names — reference `tokens.css`.
- **Reusable primitives** live in `$lib/components/ui/`; feature components compose them.
- **Tenant isolation.** Every query is scoped by PB API rules (`user = @request.auth.id`); tests must prove no cross-user leakage.
- **TDD.** Failing test first. **Conventional Commits**, one logical change each.
- Test commands: `pnpm --filter @readmepls/core test`, `pnpm --filter @readmepls/web test` (or `npx vitest run <path>` from the package dir). Core integration tests need `PB_BIN` (default `pocketbase/pocketbase`).

---

## File Structure

**Create:**
- `packages/types/src/library.ts` — `LibraryParams` Zod schema + facet/sort value unions.
- `packages/core/src/library/params.ts` — `parseLibraryParams` / `serializeLibraryParams`.
- `packages/core/src/library/query.ts` — `buildLibraryQuery` (pure), `applySearchIds` (pure).
- `packages/core/src/library/facet-options.ts` — `SourceFacet` type + `deriveFacetOptions` (pure).
- `packages/core/src/library/fetch.ts` — `fetchLibraryPage`, `fetchFacetOptions` (IO shell).
- `apps/web/src/lib/components/ui/Sheet.svelte` — reusable drawer/sheet primitive.
- `apps/web/src/lib/components/LibraryToolbar.svelte` — search box, filters button, sort select, result count.
- `apps/web/src/lib/components/ActiveFilters.svelte` — active-filter chip row + clear-all.
- `apps/web/src/lib/components/FilterDrawer.svelte` — collapsible facet groups inside a `Sheet`.
- `apps/web/src/routes/library/+page.server.ts` — server load wrapper.
- Test files alongside each of the above.

**Modify:**
- `packages/types/src/index.ts` — export `./library.js`.
- `packages/core/src/index.ts` — export the four new `./library/*.js` modules.
- `pocketbase/pb_hooks/search.pb.js` — raise FTS `LIMIT` 50 → 200 (candidate cap).
- `apps/web/src/routes/library/+page.svelte` — rewrite to consume load data + URL-driven state.
- `apps/web/src/lib/components/SourceFilter.svelte` — import `SourceFacet` from `@readmepls/core`.
- `apps/web/src/routes/search/+page.svelte` → replace with a redirect (see Task 12).

**Delete (in Task 11):**
- `apps/web/src/lib/source/library-sources.ts` + `.test.ts` (superseded by core `facet-options.ts`; `filterBySources` is dead once filtering is server-side).

---

### Task 1: `LibraryParams` schema and facet unions

**Files:**
- Create: `packages/types/src/library.ts`
- Modify: `packages/types/src/index.ts`
- Test: `packages/types/src/library.test.ts`

**Interfaces:**
- Produces: value unions `READ_STATES`, `TIME_BUCKETS`, `DATE_PRESETS`, `HAS_FLAGS`, `ATTENTION`, `SORTS`; Zod object `LibraryParams` and type `LibraryParams` with fields `read: ReadState[]`, `time: TimeBucket[]`, `tag: string[]`, `collection: string[]`, `source: string[]`, `favsrc: boolean`, `saved: DatePreset | null`, `published: DatePreset | null`, `lang: string[]`, `author: string[]`, `has: HasFlag[]`, `attention: Attention[]`, `q: string`, `sort: Sort`, `page: number`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/types/src/library.test.ts
import { describe, it, expect } from "vitest";
import { LibraryParams, SORTS } from "./library.js";

describe("LibraryParams", () => {
  it("applies defaults for an empty object", () => {
    const p = LibraryParams.parse({});
    expect(p).toMatchObject({
      read: [], time: [], tag: [], collection: [], source: [],
      favsrc: false, saved: null, published: null, lang: [], author: [],
      has: [], attention: [], q: "", sort: "-created", page: 1,
    });
  });

  it("accepts a fully populated object", () => {
    const p = LibraryParams.parse({
      read: ["unread"], time: ["long"], tag: ["t1"], favsrc: true,
      saved: "week", has: ["highlights"], attention: ["failed"],
      q: "neural", sort: "relevance", page: 3,
    });
    expect(p.read).toEqual(["unread"]);
    expect(p.sort).toBe("relevance");
    expect(p.page).toBe(3);
  });

  it("rejects an unknown sort value", () => {
    expect(() => LibraryParams.parse({ sort: "bogus" })).toThrow();
  });

  it("exposes the full sort union", () => {
    expect(SORTS).toContain("-read_time");
    expect(SORTS).toContain("relevance");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/types && npx vitest run src/library.test.ts`
Expected: FAIL — cannot find module `./library.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/types/src/library.ts
import { z } from "zod";

export const READ_STATES = ["unread", "reading", "finished", "archived"] as const;
export const TIME_BUCKETS = ["quick", "medium", "long"] as const;
export const DATE_PRESETS = ["today", "week", "month", "year", "older"] as const;
export const HAS_FLAGS = ["highlights", "notes"] as const;
export const ATTENTION = ["partial", "failed"] as const;
export const SORTS = [
  "-created", "created", "-published", "-read_time", "read_time",
  "-updated", "title", "relevance",
] as const;

export type ReadState = (typeof READ_STATES)[number];
export type TimeBucket = (typeof TIME_BUCKETS)[number];
export type DatePreset = (typeof DATE_PRESETS)[number];
export type HasFlag = (typeof HAS_FLAGS)[number];
export type Attention = (typeof ATTENTION)[number];
export type Sort = (typeof SORTS)[number];

export const LibraryParams = z.object({
  read: z.array(z.enum(READ_STATES)).default([]),
  time: z.array(z.enum(TIME_BUCKETS)).default([]),
  tag: z.array(z.string()).default([]),
  collection: z.array(z.string()).default([]),
  source: z.array(z.string()).default([]),
  favsrc: z.boolean().default(false),
  saved: z.enum(DATE_PRESETS).nullable().default(null),
  published: z.enum(DATE_PRESETS).nullable().default(null),
  lang: z.array(z.string()).default([]),
  author: z.array(z.string()).default([]),
  has: z.array(z.enum(HAS_FLAGS)).default([]),
  attention: z.array(z.enum(ATTENTION)).default([]),
  q: z.string().default(""),
  sort: z.enum(SORTS).default("-created"),
  page: z.number().int().min(1).default(1),
});
export type LibraryParams = z.infer<typeof LibraryParams>;
```

Append to `packages/types/src/index.ts`:

```ts
export * from "./library.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/types && npx vitest run src/library.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/library.ts packages/types/src/library.test.ts packages/types/src/index.ts
git commit -m "feat(types): LibraryParams schema and facet unions"
```

---

### Task 2: URL param parse / serialize

**Files:**
- Create: `packages/core/src/library/params.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/library/params.test.ts`

**Interfaces:**
- Consumes: `LibraryParams` (Task 1).
- Produces: `parseLibraryParams(sp: URLSearchParams): LibraryParams` — CSV lists split on `,`, unknown enum members dropped, `favsrc`/`page` coerced, invalid falls back to defaults (never throws). `serializeLibraryParams(p: LibraryParams): URLSearchParams` — omits empty/default fields so a default view yields an empty query string. Round-trip: `parse(serialize(p))` deep-equals `p`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/library/params.test.ts
import { describe, it, expect } from "vitest";
import { parseLibraryParams, serializeLibraryParams } from "./params.js";
import { LibraryParams } from "@readmepls/types";

const sp = (s: string) => new URLSearchParams(s);

describe("parseLibraryParams", () => {
  it("parses csv lists and scalars", () => {
    const p = parseLibraryParams(sp("read=unread,reading&tag=a,b&favsrc=1&saved=week&sort=longest_bogus"));
    expect(p.read).toEqual(["unread", "reading"]);
    expect(p.tag).toEqual(["a", "b"]);
    expect(p.favsrc).toBe(true);
    expect(p.saved).toBe("week");
    expect(p.sort).toBe("-created"); // bogus sort → default
  });

  it("drops unknown enum members but keeps valid ones", () => {
    const p = parseLibraryParams(sp("read=unread,bogus,archived"));
    expect(p.read).toEqual(["unread", "archived"]);
  });

  it("defaults an empty query", () => {
    expect(parseLibraryParams(sp(""))).toEqual(LibraryParams.parse({}));
  });

  it("clamps page to >= 1", () => {
    expect(parseLibraryParams(sp("page=0")).page).toBe(1);
    expect(parseLibraryParams(sp("page=abc")).page).toBe(1);
  });
});

describe("round-trip", () => {
  it("serialize then parse is identity", () => {
    const p = LibraryParams.parse({
      read: ["unread"], time: ["long"], tag: ["t1", "t2"], favsrc: true,
      saved: "month", has: ["notes"], q: "brain", sort: "-read_time", page: 2,
    });
    expect(parseLibraryParams(serializeLibraryParams(p))).toEqual(p);
  });

  it("a default view serializes to an empty query", () => {
    expect(serializeLibraryParams(LibraryParams.parse({})).toString()).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/library/params.test.ts`
Expected: FAIL — cannot find module `./params.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/library/params.ts
import {
  LibraryParams, READ_STATES, TIME_BUCKETS, DATE_PRESETS, HAS_FLAGS,
  ATTENTION, SORTS, DatePreset,
} from "@readmepls/types";

const csv = (sp: URLSearchParams, key: string): string[] => {
  const raw = sp.get(key);
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
};
const only = <T extends readonly string[]>(vals: string[], allowed: T): T[number][] =>
  vals.filter((v): v is T[number] => (allowed as readonly string[]).includes(v));
const preset = (sp: URLSearchParams, key: string): DatePreset | null => {
  const v = sp.get(key);
  return v && (DATE_PRESETS as readonly string[]).includes(v) ? (v as DatePreset) : null;
};

export function parseLibraryParams(sp: URLSearchParams): LibraryParams {
  const sortRaw = sp.get("sort") ?? "";
  const pageNum = Number.parseInt(sp.get("page") ?? "", 10);
  return LibraryParams.parse({
    read: only(csv(sp, "read"), READ_STATES),
    time: only(csv(sp, "time"), TIME_BUCKETS),
    tag: csv(sp, "tag"),
    collection: csv(sp, "collection"),
    source: csv(sp, "source"),
    favsrc: sp.get("favsrc") === "1",
    saved: preset(sp, "saved"),
    published: preset(sp, "published"),
    lang: csv(sp, "lang"),
    author: csv(sp, "author"),
    has: only(csv(sp, "has"), HAS_FLAGS),
    attention: only(csv(sp, "attention"), ATTENTION),
    q: sp.get("q") ?? "",
    sort: (SORTS as readonly string[]).includes(sortRaw) ? sortRaw : "-created",
    page: Number.isFinite(pageNum) && pageNum >= 1 ? pageNum : 1,
  });
}

export function serializeLibraryParams(p: LibraryParams): URLSearchParams {
  const sp = new URLSearchParams();
  const list = (k: string, v: string[]) => { if (v.length) sp.set(k, v.join(",")); };
  list("read", p.read); list("time", p.time); list("tag", p.tag);
  list("collection", p.collection); list("source", p.source);
  list("lang", p.lang); list("author", p.author); list("has", p.has);
  list("attention", p.attention);
  if (p.favsrc) sp.set("favsrc", "1");
  if (p.saved) sp.set("saved", p.saved);
  if (p.published) sp.set("published", p.published);
  if (p.q) sp.set("q", p.q);
  if (p.sort !== "-created") sp.set("sort", p.sort);
  if (p.page !== 1) sp.set("page", String(p.page));
  return sp;
}
```

Note: the `sort=longest_bogus` test asserts fallback to default — confirmed by the `SORTS.includes` guard. (`"longest"` is not a raw sort value; the UI maps its label to `-read_time`.)

Append to `packages/core/src/index.ts`:

```ts
export * from "./library/params.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/library/params.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/library/params.ts packages/core/src/library/params.test.ts packages/core/src/index.ts
git commit -m "feat(core): parse and serialize library filter params"
```

---

### Task 3: `buildLibraryQuery` — pure filter/sort builder

**Files:**
- Create: `packages/core/src/library/query.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/library/query.test.ts`

**Interfaces:**
- Consumes: `LibraryParams` (Task 1).
- Produces:
  - `interface LibraryQuery { filterExpr: string; filterParams: Record<string, unknown>; sort: string; page: number; perPage: number; }`
  - `buildLibraryQuery(p: LibraryParams, now?: Date): LibraryQuery` — pure. Groups AND-joined; values OR-joined within a group. Every value is a named bind param (`{:name}`), never inlined. `sort` is a PB sort string, or `""` when `p.sort === "relevance"`. Default (`read` empty) excludes archived. `PER_PAGE = 24`.
  - `applySearchIds(ids: string[]): { expr: string; params: Record<string, string> }` — builds `(id={:sid0} || id={:sid1} ...)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/library/query.test.ts
import { describe, it, expect } from "vitest";
import { buildLibraryQuery, applySearchIds } from "./query.js";
import { LibraryParams } from "@readmepls/types";

const P = (o: Partial<Record<string, unknown>>) => LibraryParams.parse(o);
const NOW = new Date("2026-07-04T12:00:00Z");

describe("buildLibraryQuery", () => {
  it("default view excludes archived and sorts newest-first", () => {
    const q = buildLibraryQuery(P({}), NOW);
    expect(q.filterExpr).toContain("status != {:");
    expect(Object.values(q.filterParams)).toContain("archived");
    expect(q.sort).toBe("-created");
    expect(q.perPage).toBe(24);
    expect(q.page).toBe(1);
  });

  it("read=finished maps to a progress threshold, not a status", () => {
    const q = buildLibraryQuery(P({ read: ["finished"] }), NOW);
    expect(q.filterExpr).toContain("progress >=");
    expect(Object.values(q.filterParams)).toContain(0.98);
  });

  it("OR within the read group, AND across groups", () => {
    const q = buildLibraryQuery(P({ read: ["unread", "reading"], time: ["long"] }), NOW);
    // read group OR-joins its two members, then AND-joins the time group
    expect(q.filterExpr).toMatch(/\(status = \{:\w+\} \|\| status = \{:\w+\}\)/);
    expect(q.filterExpr).toContain("&&");
    expect(q.filterExpr).toContain("content.read_time >");
  });

  it("time buckets map to read_time ranges", () => {
    expect(buildLibraryQuery(P({ time: ["quick"] }), NOW).filterExpr).toContain("content.read_time <");
    const med = buildLibraryQuery(P({ time: ["medium"] }), NOW);
    expect(med.filterExpr).toContain("content.read_time >=");
    expect(med.filterExpr).toContain("content.read_time <=");
  });

  it("tags use the article_tags back-relation, OR-joined", () => {
    const q = buildLibraryQuery(P({ tag: ["t1", "t2"] }), NOW);
    expect(q.filterExpr).toContain("article_tags_via_article.tag");
    expect(Object.values(q.filterParams)).toEqual(expect.arrayContaining(["t1", "t2"]));
  });

  it("collections use the collection_items back-relation", () => {
    const q = buildLibraryQuery(P({ collection: ["c1"] }), NOW);
    expect(q.filterExpr).toContain("collection_items_via_article.collection");
  });

  it("has=highlights / has=notes filter the highlights back-relation", () => {
    expect(buildLibraryQuery(P({ has: ["highlights"] }), NOW).filterExpr)
      .toContain("highlights_via_article.id");
    expect(buildLibraryQuery(P({ has: ["notes"] }), NOW).filterExpr)
      .toContain("highlights_via_article.note");
  });

  it("attention filters extract_status", () => {
    const q = buildLibraryQuery(P({ attention: ["failed", "partial"] }), NOW);
    expect(q.filterExpr).toContain("content.extract_status = {:");
    expect(Object.values(q.filterParams)).toEqual(expect.arrayContaining(["failed", "partial"]));
  });

  it("saved=week uses a created lower bound; older uses an upper bound", () => {
    expect(buildLibraryQuery(P({ saved: "week" }), NOW).filterExpr).toContain("created >=");
    expect(buildLibraryQuery(P({ saved: "older" }), NOW).filterExpr).toContain("created <");
  });

  it("published date filters content.published_at", () => {
    expect(buildLibraryQuery(P({ published: "month" }), NOW).filterExpr)
      .toContain("content.published_at >=");
  });

  it("lang and author OR-join their members", () => {
    const q = buildLibraryQuery(P({ lang: ["en", "es"], author: ["jane"] }), NOW);
    expect(q.filterExpr).toContain("content.lang = {:");
    expect(q.filterExpr).toContain("content.author = {:");
  });

  it("favsrc alone does not add a filter (favorites resolved to source ids upstream)", () => {
    // favsrc is applied by expanding to source ids in the IO layer; the pure
    // builder only consumes p.source. With no sources selected it is a no-op.
    const q = buildLibraryQuery(P({ favsrc: true }), NOW);
    expect(q.filterExpr).not.toContain("source");
  });

  it("relevance sort yields an empty PB sort string", () => {
    expect(buildLibraryQuery(P({ q: "x", sort: "relevance" }), NOW).sort).toBe("");
  });

  it("title sort maps to the content title", () => {
    expect(buildLibraryQuery(P({ sort: "title" }), NOW).sort).toBe("content.title");
  });

  it("never inlines a raw value into the expression", () => {
    const q = buildLibraryQuery(P({ tag: ["'; DROP TABLE"] }), NOW);
    expect(q.filterExpr).not.toContain("DROP TABLE");
    expect(Object.values(q.filterParams)).toContain("'; DROP TABLE");
  });
});

describe("applySearchIds", () => {
  it("builds an OR of id equalities with bound params", () => {
    const { expr, params } = applySearchIds(["a", "b"]);
    expect(expr).toBe("(id = {:sid0} || id = {:sid1})");
    expect(params).toEqual({ sid0: "a", sid1: "b" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/library/query.test.ts`
Expected: FAIL — cannot find module `./query.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/library/query.ts
import type { LibraryParams, DatePreset } from "@readmepls/types";

export interface LibraryQuery {
  filterExpr: string;
  filterParams: Record<string, unknown>;
  sort: string;
  page: number;
  perPage: number;
}

const PER_PAGE = 24;
const FINISHED_THRESHOLD = 0.98;

const SORT_MAP: Record<LibraryParams["sort"], string> = {
  "-created": "-created", created: "created",
  "-published": "-content.published_at",
  "-read_time": "-content.read_time", read_time: "content.read_time",
  "-updated": "-updated", title: "content.title", relevance: "",
};

/** Lower bound (inclusive) for the "since" presets; upper bound for "older". */
function presetBound(preset: DatePreset, now: Date): { op: ">=" | "<"; iso: string } {
  const d = new Date(now);
  if (preset === "today") d.setUTCHours(0, 0, 0, 0);
  else if (preset === "week") d.setUTCDate(d.getUTCDate() - 7);
  else if (preset === "month") d.setUTCDate(d.getUTCDate() - 30);
  else if (preset === "year" || preset === "older") d.setUTCDate(d.getUTCDate() - 365);
  return { op: preset === "older" ? "<" : ">=", iso: d.toISOString().replace("T", " ").slice(0, 19) };
}

export function buildLibraryQuery(p: LibraryParams, now: Date = new Date()): LibraryQuery {
  const params: Record<string, unknown> = {};
  let n = 0;
  const bind = (v: unknown): string => { const k = `p${n++}`; params[k] = v; return `{:${k}}`; };
  const groups: string[] = [];
  const orGroup = (parts: string[]) => { if (parts.length) groups.push(parts.length === 1 ? parts[0]! : `(${parts.join(" || ")})`); };

  // read state (default: exclude archived)
  if (p.read.length === 0) {
    groups.push(`status != ${bind("archived")}`);
  } else {
    orGroup(p.read.map((r) =>
      r === "finished" ? `(progress >= ${bind(FINISHED_THRESHOLD)} && status != ${bind("archived")})`
        : `status = ${bind(r)}`));
  }

  // reading time buckets (minutes)
  orGroup(p.time.map((t) =>
    t === "quick" ? `content.read_time < ${bind(5)}`
      : t === "long" ? `content.read_time > ${bind(15)}`
        : `(content.read_time >= ${bind(5)} && content.read_time <= ${bind(15)})`));

  orGroup(p.tag.map((t) => `article_tags_via_article.tag ?= ${bind(t)}`));
  orGroup(p.collection.map((c) => `collection_items_via_article.collection ?= ${bind(c)}`));
  orGroup(p.source.map((s) => `content.source = ${bind(s)}`));
  orGroup(p.lang.map((l) => `content.lang = ${bind(l)}`));
  orGroup(p.author.map((a) => `content.author = ${bind(a)}`));
  orGroup(p.attention.map((a) => `content.extract_status = ${bind(a)}`));
  orGroup(p.has.map((h) =>
    h === "highlights" ? `highlights_via_article.id ?!= ${bind("")}`
      : `highlights_via_article.note ?!= ${bind("")}`));

  if (p.saved) { const b = presetBound(p.saved, now); groups.push(`created ${b.op} ${bind(b.iso)}`); }
  if (p.published) { const b = presetBound(p.published, now); groups.push(`content.published_at ${b.op} ${bind(b.iso)}`); }

  return {
    filterExpr: groups.join(" && "),
    filterParams: params,
    sort: SORT_MAP[p.sort],
    page: p.page,
    perPage: PER_PAGE,
  };
}

export function applySearchIds(ids: string[]): { expr: string; params: Record<string, string> } {
  const params: Record<string, string> = {};
  const parts = ids.map((id, i) => { params[`sid${i}`] = id; return `id = {:sid${i}}`; });
  return { expr: `(${parts.join(" || ")})`, params };
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./library/query.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/library/query.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/library/query.ts packages/core/src/library/query.test.ts packages/core/src/index.ts
git commit -m "feat(core): buildLibraryQuery pure filter/sort builder"
```

---

### Task 4: `deriveFacetOptions` — pure option-list derivation

**Files:**
- Create: `packages/core/src/library/facet-options.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/library/facet-options.test.ts`

**Interfaces:**
- Produces:
  - `interface SourceFacet { id: string; host: string; name: string | null; favicon: string; count: number; favorite: boolean; }`
  - `interface FacetOptions { sources: SourceFacet[]; languages: string[]; authors: string[]; }`
  - `deriveFacetOptions(rows: ArticleFacetRow[], favoriteIds: Set<string>): FacetOptions` where `ArticleFacetRow = { expand?: { content?: { lang?: string; author?: string; expand?: { source?: unknown } } } }`. Sources: distinct, favorites pinned first then count desc then host. Languages/authors: distinct non-empty, sorted by frequency desc then alpha.

This supersedes `apps/web/src/lib/source/library-sources.ts` (`deriveLibrarySources`); the source-facet logic moves here so both the server load and the client share one source of truth.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/library/facet-options.test.ts
import { describe, it, expect } from "vitest";
import { deriveFacetOptions } from "./facet-options.js";

const row = (sourceId: string | null, host = "h.com", lang?: string, author?: string) => ({
  expand: { content: {
    lang, author,
    expand: sourceId ? { source: { id: sourceId, host, name: null, favicon: "", favicon_status: "none" } } : {},
  } },
});

describe("deriveFacetOptions", () => {
  it("counts distinct sources, favorites first then count desc", () => {
    const o = deriveFacetOptions(
      [row("s1", "a.com"), row("s1", "a.com"), row("s2", "b.com")],
      new Set(["s2"]),
    );
    expect(o.sources[0]!.id).toBe("s2");        // favorite pinned first
    expect(o.sources.find((s) => s.id === "s1")!.count).toBe(2);
  });

  it("collects distinct non-empty languages by frequency", () => {
    const o = deriveFacetOptions(
      [row("s1", "a.com", "en"), row("s1", "a.com", "en"), row("s1", "a.com", "es"), row("s1", "a.com", "")],
      new Set(),
    );
    expect(o.languages).toEqual(["en", "es"]);
  });

  it("collects distinct authors and ignores missing", () => {
    const o = deriveFacetOptions(
      [row("s1", "a.com", "en", "Jane"), row("s1", "a.com", "en")],
      new Set(),
    );
    expect(o.authors).toEqual(["Jane"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/library/facet-options.test.ts`
Expected: FAIL — cannot find module `./facet-options.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/library/facet-options.ts
import { Source } from "@readmepls/types";

export interface SourceFacet {
  id: string; host: string; name: string | null; favicon: string;
  count: number; favorite: boolean;
}
export interface FacetOptions {
  sources: SourceFacet[];
  languages: string[];
  authors: string[];
}
export interface ArticleFacetRow {
  expand?: { content?: { lang?: string; author?: string; expand?: { source?: unknown } } };
}

function byFrequency(values: (string | undefined)[]): string[] {
  const counts = new Map<string, number>();
  for (const v of values) { if (v) counts.set(v, (counts.get(v) ?? 0) + 1); }
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([v]) => v);
}

export function deriveFacetOptions(rows: ArticleFacetRow[], favoriteIds: Set<string>): FacetOptions {
  const map = new Map<string, SourceFacet>();
  for (const r of rows) {
    const parsed = Source.safeParse(r.expand?.content?.expand?.source);
    if (!parsed.success) continue;
    const s = parsed.data;
    const existing = map.get(s.id);
    if (existing) existing.count++;
    else map.set(s.id, { id: s.id, host: s.host, name: s.name ?? null, favicon: s.favicon, count: 1, favorite: favoriteIds.has(s.id) });
  }
  const sources = [...map.values()].sort((a, b) =>
    (a.favorite !== b.favorite ? (a.favorite ? -1 : 1) : 0) || (b.count - a.count) || a.host.localeCompare(b.host));

  return {
    sources,
    languages: byFrequency(rows.map((r) => r.expand?.content?.lang)),
    authors: byFrequency(rows.map((r) => r.expand?.content?.author)),
  };
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./library/facet-options.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run src/library/facet-options.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/library/facet-options.ts packages/core/src/library/facet-options.test.ts packages/core/src/index.ts
git commit -m "feat(core): deriveFacetOptions for library facet option lists"
```

---

### Task 5: `fetchLibraryPage` / `fetchFacetOptions` IO shell + search fold

**Files:**
- Create: `packages/core/src/library/fetch.ts`
- Modify: `packages/core/src/index.ts`, `pocketbase/pb_hooks/search.pb.js`
- Test: `packages/core/src/library/fetch.integration.test.ts`

**Interfaces:**
- Consumes: `buildLibraryQuery`, `applySearchIds` (Task 3), `deriveFacetOptions` (Task 4), `LibraryParams`.
- Produces:
  - `interface LibraryPage { items: RecordModel[]; totalItems: number; page: number; perPage: number; }`
  - `fetchLibraryPage(pb: PocketBase, params: LibraryParams, now?: Date): Promise<LibraryPage>` — resolves `favsrc` to source ids, runs `buildLibraryQuery`, folds FTS ids when `params.q` is set, queries `articles` with `expand: "content.source"`. Relevance sort orders by FTS rank within the candidate set.
  - `fetchFacetOptions(pb: PocketBase): Promise<{ tags: {id;name}[]; collections: {id;name;slug}[]; options: FacetOptions }>`

- [ ] **Step 1: Raise the FTS candidate cap**

Modify `pocketbase/pb_hooks/search.pb.js`: change `ORDER BY rank LIMIT 50` to `ORDER BY rank LIMIT 200`.

- [ ] **Step 2: Write the failing integration test**

```ts
// packages/core/src/library/fetch.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import PocketBase, { type RecordModel } from "pocketbase";
import { startEphemeralPb, type PbHandle } from "../pb/test-harness.js";
import { fetchLibraryPage, fetchFacetOptions } from "./fetch.js";
import { LibraryParams } from "@readmepls/types";

let h: PbHandle;
beforeAll(async () => { h = await startEphemeralPb(); }, 30000);
afterAll(() => h?.stop());

async function user(email: string): Promise<{ id: string; pb: PocketBase }> {
  const u = await h.pb.collection("users").create({
    email, password: "password12345", passwordConfirm: "password12345",
    tier: "standard", monthly_quota_used: 0,
  });
  const pb = new PocketBase(h.url);
  await pb.collection("users").authWithPassword(email, "password12345");
  return { id: u.id, pb };
}
async function content(fields: Record<string, unknown>): Promise<RecordModel> {
  return h.pb.collection("content").create({
    canonical_url: `https://x/${Math.random()}`, content_hash: "h", source_type: "web",
    extract_status: "ok", ...fields,
  });
}
async function article(pb: PocketBase, uid: string, contentId: string, extra: Record<string, unknown> = {}) {
  return pb.collection("articles").create({ user: uid, content: contentId, url: "https://x", status: "unread", progress: 0, ...extra });
}
const P = (o: Partial<Record<string, unknown>>) => LibraryParams.parse(o);

describe("fetchLibraryPage", () => {
  it("filters by reading-time bucket", async () => {
    const a = await user(`ft-a${Date.now()}@t.local`);
    const short = await content({ title: "Short", read_time: 3 });
    const long = await content({ title: "Long", read_time: 40 });
    await article(a.pb, a.id, short.id);
    await article(a.pb, a.id, long.id);

    const page = await fetchLibraryPage(a.pb, P({ time: ["long"] }));
    expect(page.items.map((i) => (i.expand as { content: { title: string } }).content.title)).toEqual(["Long"]);
  });

  it("does not leak another user's articles through a matching filter", async () => {
    const a = await user(`ft-b${Date.now()}@t.local`);
    const b = await user(`ft-c${Date.now()}@t.local`);
    const c = await content({ title: "Secret", read_time: 40 });
    await article(a.pb, a.id, c.id);

    const seen = await fetchLibraryPage(b.pb, P({ time: ["long"] }));
    expect(seen.totalItems).toBe(0);
  });

  it("intersects full-text search with facets", async () => {
    const a = await user(`ft-d${Date.now()}@t.local`);
    const hit = await content({ title: "Neural networks", content_text: "deep neural learning", read_time: 40 });
    const miss = await content({ title: "Gardening", content_text: "tomatoes", read_time: 40 });
    await article(a.pb, a.id, hit.id);
    await article(a.pb, a.id, miss.id);

    const page = await fetchLibraryPage(a.pb, P({ q: "neural", time: ["long"], sort: "relevance" }));
    expect(page.items).toHaveLength(1);
    expect((page.items[0]!.expand as { content: { title: string } }).content.title).toBe("Neural networks");
  });
});

describe("fetchFacetOptions", () => {
  it("returns the caller's tags and distinct sources only", async () => {
    const a = await user(`fo-a${Date.now()}@t.local`);
    const src = await h.pb.collection("sources").create({ host: "opt.com", favicon_status: "none" });
    const c = await content({ title: "T", read_time: 5, lang: "en", author: "Jane", source: src.id });
    await article(a.pb, a.id, c.id);
    await a.pb.collection("tags").create({ user: a.id, name: "Dev", slug: "dev" });

    const { tags, options } = await fetchFacetOptions(a.pb);
    expect(tags.map((t) => t.name)).toContain("Dev");
    expect(options.sources.map((s) => s.host)).toContain("opt.com");
    expect(options.languages).toContain("en");
    expect(options.authors).toContain("Jane");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && npx vitest run src/library/fetch.integration.test.ts`
Expected: FAIL — cannot find module `./fetch.js`.

- [ ] **Step 4: Write minimal implementation**

```ts
// packages/core/src/library/fetch.ts
import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import type { LibraryParams } from "@readmepls/types";
import { buildLibraryQuery, applySearchIds } from "./query.js";
import { deriveFacetOptions, type FacetOptions, type ArticleFacetRow } from "./facet-options.js";

export interface LibraryPage {
  items: RecordModel[];
  totalItems: number;
  page: number;
  perPage: number;
}

async function searchIds(pb: PocketBase, q: string): Promise<string[]> {
  const res = await pb.send("/api/search", { method: "GET", query: { q } });
  const results = (res as { results?: { articleId: string }[] }).results ?? [];
  return results.map((r) => r.articleId).slice(0, 200);
}

export async function fetchLibraryPage(
  pb: PocketBase, params: LibraryParams, now: Date = new Date(),
): Promise<LibraryPage> {
  // favsrc: fold favorited source ids into the source facet (union with any explicit selection).
  let effective = params;
  if (params.favsrc) {
    const favs = await pb.collection("source_favorites").getFullList();
    const favIds = favs.map((f) => f.source as string);
    effective = { ...params, source: [...new Set([...params.source, ...favIds])] };
  }

  const q = buildLibraryQuery(effective, now);
  let expr = q.filterExpr;
  const bind: Record<string, unknown> = { ...q.filterParams };
  let rankOrder: string[] | null = null;

  if (params.q.trim()) {
    const ids = await searchIds(pb, params.q);
    if (ids.length === 0) return { items: [], totalItems: 0, page: params.page, perPage: q.perPage };
    rankOrder = ids;
    const sids = applySearchIds(ids);
    expr = expr ? `(${expr}) && ${sids.expr}` : sids.expr;
    Object.assign(bind, sids.params);
  }

  const filter = expr ? pb.filter(expr, bind) : "";
  const opts = { expand: "content.source", filter };

  // Relevance sort: fetch the bounded candidate matches and order by FTS rank in memory.
  if (params.sort === "relevance" && rankOrder) {
    const all = await pb.collection("articles").getFullList({ ...opts });
    const idx = new Map(rankOrder.map((id, i) => [id, i]));
    all.sort((a, b) => (idx.get(a.id) ?? Infinity) - (idx.get(b.id) ?? Infinity));
    const start = (params.page - 1) * q.perPage;
    return { items: all.slice(start, start + q.perPage), totalItems: all.length, page: params.page, perPage: q.perPage };
  }

  const list = await pb.collection("articles").getList(q.page, q.perPage, { ...opts, sort: q.sort || "-created" });
  return { items: list.items, totalItems: list.totalItems, page: list.page, perPage: q.perPage };
}

export async function fetchFacetOptions(pb: PocketBase): Promise<{
  tags: { id: string; name: string }[];
  collections: { id: string; name: string; slug: string }[];
  options: FacetOptions;
}> {
  const [tagRows, colRows, favRows, artRows] = await Promise.all([
    pb.collection("tags").getFullList({ sort: "name" }),
    pb.collection("collections").getFullList({ sort: "name" }),
    pb.collection("source_favorites").getFullList(),
    pb.collection("articles").getFullList({ expand: "content.source", fields: "id,expand.content.lang,expand.content.author,expand.content.source" }),
  ]);
  const favoriteIds = new Set(favRows.map((f) => f.source as string));
  return {
    tags: tagRows.map((t) => ({ id: t.id, name: t.name as string })),
    collections: colRows.map((c) => ({ id: c.id, name: c.name as string, slug: c.slug as string })),
    options: deriveFacetOptions(artRows as unknown as ArticleFacetRow[], favoriteIds),
  };
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./library/fetch.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/library/fetch.integration.test.ts`
Expected: PASS (4 tests). Requires `pocketbase/pocketbase` binary (default `PB_BIN`).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/library/fetch.ts packages/core/src/library/fetch.integration.test.ts packages/core/src/index.ts pocketbase/pb_hooks/search.pb.js
git commit -m "feat(core): fetchLibraryPage with facet queries and search fold"
```

---

### Task 6: `Sheet` drawer primitive

**Files:**
- Create: `apps/web/src/lib/components/ui/Sheet.svelte`
- Test: `apps/web/src/lib/components/ui/sheet.test.ts`

**Interfaces:**
- Produces: `<Sheet open={boolean} onClose={() => void} title={string}>{children}</Sheet>` — right-slide panel with backdrop; ESC and backdrop-click call `onClose`; focus moves into the panel on open. Tokens-only styling.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/components/ui/sheet.test.ts
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import Sheet from "./Sheet.svelte";

describe("Sheet", () => {
  it("does not render its region when closed", () => {
    const { queryByRole } = render(Sheet, { open: false, onClose: () => {}, title: "Filters" });
    expect(queryByRole("dialog")).toBeNull();
  });

  it("renders a labelled dialog when open", () => {
    const { getByRole } = render(Sheet, { open: true, onClose: () => {}, title: "Filters" });
    expect(getByRole("dialog", { name: "Filters" })).toBeTruthy();
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    const { getByRole } = render(Sheet, { open: true, onClose, title: "Filters" });
    await fireEvent.keyDown(getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    const { getByTestId } = render(Sheet, { open: true, onClose, title: "Filters" });
    await fireEvent.click(getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/components/ui/sheet.test.ts`
Expected: FAIL — cannot find `./Sheet.svelte`.

- [ ] **Step 3: Write minimal implementation**

```svelte
<!-- apps/web/src/lib/components/ui/Sheet.svelte -->
<script lang="ts">
  import type { Snippet } from "svelte";
  let { open, onClose, title, children }: {
    open: boolean; onClose: () => void; title: string; children: Snippet;
  } = $props();

  let panel = $state<HTMLElement | null>(null);
  $effect(() => { if (open) panel?.focus(); });
</script>

{#if open}
  <div class="backdrop" data-testid="sheet-backdrop" onclick={onClose} aria-hidden="true"></div>
  <section
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    bind:this={panel}
    onkeydown={(e) => { if (e.key === "Escape") onClose(); }}
  >
    <header class="sheet-head">
      <h2>{title}</h2>
      <button class="close" aria-label="close filters" onclick={onClose}>✕</button>
    </header>
    <div class="sheet-body">{@render children()}</div>
  </section>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.35); z-index: 40; }
  .sheet {
    position: fixed; top: 0; right: 0; bottom: 0; width: min(22rem, 90vw);
    background: var(--color-surface); box-shadow: var(--shadow-lg); z-index: 50;
    display: flex; flex-direction: column; padding: var(--space-4); overflow-y: auto;
  }
  .sheet:focus-visible { outline: none; }
  .sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
  .sheet-head h2 { font-family: var(--font-ui); font-size: var(--text-lg); color: var(--color-text); margin: 0; }
  .close { background: none; border: none; cursor: pointer; color: var(--color-text-muted); font-size: var(--text-lg); }
  .close:hover { color: var(--color-accent); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/components/ui/sheet.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/ui/Sheet.svelte apps/web/src/lib/components/ui/sheet.test.ts
git commit -m "feat(web): Sheet drawer UI primitive"
```

---

### Task 7: `ActiveFilters` chip row

**Files:**
- Create: `apps/web/src/lib/components/ActiveFilters.svelte`
- Test: `apps/web/src/lib/components/active-filters.test.ts`

**Interfaces:**
- Consumes: a pure label map (defined inline below) plus `LibraryParams`.
- Produces: `<ActiveFilters params={LibraryParams} labels={LabelLookup} onRemove={(patch: Partial<LibraryParams>) => void} onClear={() => void} />`. Renders one chip per active facet value with an ✖ that emits the patch removing just that value; a "clear all" control when any filter is active. `LabelLookup` resolves ids → display names: `{ tag: Record<string,string>; collection: Record<string,string>; source: Record<string,string> }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/components/active-filters.test.ts
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import ActiveFilters from "./ActiveFilters.svelte";
import { LibraryParams } from "@readmepls/types";

const labels = { tag: { t1: "Dev" }, collection: {}, source: {} };

describe("ActiveFilters", () => {
  it("renders nothing when no filters are active", () => {
    const { container } = render(ActiveFilters, {
      params: LibraryParams.parse({}), labels, onRemove: () => {}, onClear: () => {},
    });
    expect(container.querySelector("[data-testid='active-chip']")).toBeNull();
  });

  it("renders a chip per active value with resolved labels", () => {
    const { getAllByTestId, getByText } = render(ActiveFilters, {
      params: LibraryParams.parse({ read: ["unread"], tag: ["t1"] }), labels,
      onRemove: () => {}, onClear: () => {},
    });
    expect(getAllByTestId("active-chip")).toHaveLength(2);
    expect(getByText("Dev")).toBeTruthy();     // tag id resolved to name
    expect(getByText("unread")).toBeTruthy();
  });

  it("removing a chip emits a patch dropping only that value", async () => {
    const onRemove = vi.fn();
    const { getByLabelText } = render(ActiveFilters, {
      params: LibraryParams.parse({ read: ["unread", "reading"] }), labels,
      onRemove, onClear: () => {},
    });
    await fireEvent.click(getByLabelText("remove unread"));
    expect(onRemove).toHaveBeenCalledWith({ read: ["reading"] });
  });

  it("clear-all calls onClear", async () => {
    const onClear = vi.fn();
    const { getByText } = render(ActiveFilters, {
      params: LibraryParams.parse({ read: ["unread"] }), labels, onRemove: () => {}, onClear,
    });
    await fireEvent.click(getByText("clear all"));
    expect(onClear).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/components/active-filters.test.ts`
Expected: FAIL — cannot find `./ActiveFilters.svelte`.

- [ ] **Step 3: Write minimal implementation**

```svelte
<!-- apps/web/src/lib/components/ActiveFilters.svelte -->
<script lang="ts">
  import type { LibraryParams } from "@readmepls/types";
  import Chip from "./ui/Chip.svelte";

  type LabelLookup = { tag: Record<string, string>; collection: Record<string, string>; source: Record<string, string> };
  type Patch = Partial<LibraryParams>;
  let { params, labels, onRemove, onClear }: {
    params: LibraryParams; labels: LabelLookup;
    onRemove: (patch: Patch) => void; onClear: () => void;
  } = $props();

  interface ActiveChip { key: string; label: string; patch: Patch; }

  // Build one descriptor per active value; patch removes exactly that value.
  const chips = $derived.by<ActiveChip[]>(() => {
    const out: ActiveChip[] = [];
    const listGroup = (field: "read" | "time" | "tag" | "collection" | "source" | "lang" | "author" | "has" | "attention",
                       label: (v: string) => string) => {
      const vals = params[field] as string[];
      for (const v of vals) {
        out.push({ key: `${field}:${v}`, label: label(v), patch: { [field]: vals.filter((x) => x !== v) } as Patch });
      }
    };
    listGroup("read", (v) => v);
    listGroup("time", (v) => v);
    listGroup("tag", (v) => labels.tag[v] ?? v);
    listGroup("collection", (v) => labels.collection[v] ?? v);
    listGroup("source", (v) => labels.source[v] ?? v);
    listGroup("lang", (v) => v);
    listGroup("author", (v) => v);
    listGroup("has", (v) => v);
    listGroup("attention", (v) => v);
    if (params.saved) out.push({ key: "saved", label: `saved: ${params.saved}`, patch: { saved: null } });
    if (params.published) out.push({ key: "published", label: `published: ${params.published}`, patch: { published: null } });
    if (params.favsrc) out.push({ key: "favsrc", label: "favorite sources", patch: { favsrc: false } });
    if (params.q) out.push({ key: "q", label: `“${params.q}”`, patch: { q: "" } });
    return out;
  });
</script>

{#if chips.length}
  <div class="active" aria-label="active filters">
    {#each chips as c (c.key)}
      <button data-testid="active-chip" class="chip-btn" aria-label={`remove ${c.label}`} onclick={() => onRemove(c.patch)}>
        <Chip selected>{c.label} ✕</Chip>
      </button>
    {/each}
    <button class="clear" onclick={onClear}>clear all</button>
  </div>
{/if}

<style>
  .active { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin: 0 0 var(--space-4); }
  .chip-btn { background: none; border: none; padding: 0; cursor: pointer; }
  .clear { background: none; border: none; cursor: pointer; font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-accent); }
  .clear:hover { color: var(--color-accent-hover); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/components/active-filters.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/ActiveFilters.svelte apps/web/src/lib/components/active-filters.test.ts
git commit -m "feat(web): ActiveFilters chip row with clear-all"
```

---

### Task 8: `LibraryToolbar` — search, filters button, sort, count

**Files:**
- Create: `apps/web/src/lib/components/LibraryToolbar.svelte`
- Test: `apps/web/src/lib/components/library-toolbar.test.ts`

**Interfaces:**
- Consumes: `LibraryParams`, `SORTS`.
- Produces: `<LibraryToolbar params={LibraryParams} total={number} onSearch={(q:string)=>void} onSort={(s:Sort)=>void} onOpenFilters={()=>void} />`. Search input seeded from `params.q`, submits on Enter. Sort `<select>` uses friendly labels but emits raw `Sort` values. Shows `{total} articles`. A `[≡ filters]` button calls `onOpenFilters`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/components/library-toolbar.test.ts
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import LibraryToolbar from "./LibraryToolbar.svelte";
import { LibraryParams } from "@readmepls/types";

const base = LibraryParams.parse({});

describe("LibraryToolbar", () => {
  it("shows the result count", () => {
    const { getByText } = render(LibraryToolbar, {
      params: base, total: 42, onSearch: () => {}, onSort: () => {}, onOpenFilters: () => {},
    });
    expect(getByText("42 articles")).toBeTruthy();
  });

  it("submitting the search emits the query", async () => {
    const onSearch = vi.fn();
    const { getByLabelText } = render(LibraryToolbar, {
      params: base, total: 0, onSearch, onSort: () => {}, onOpenFilters: () => {},
    });
    const input = getByLabelText("search your library") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "neural" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(onSearch).toHaveBeenCalledWith("neural");
  });

  it("changing sort emits the raw Sort value", async () => {
    const onSort = vi.fn();
    const { getByLabelText } = render(LibraryToolbar, {
      params: base, total: 0, onSearch: () => {}, onSort, onOpenFilters: () => {},
    });
    await fireEvent.change(getByLabelText("sort"), { target: { value: "-read_time" } });
    expect(onSort).toHaveBeenCalledWith("-read_time");
  });

  it("filters button opens the drawer", async () => {
    const onOpenFilters = vi.fn();
    const { getByText } = render(LibraryToolbar, {
      params: base, total: 0, onSearch: () => {}, onSort: () => {}, onOpenFilters,
    });
    await fireEvent.click(getByText("filters"));
    expect(onOpenFilters).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/components/library-toolbar.test.ts`
Expected: FAIL — cannot find `./LibraryToolbar.svelte`.

- [ ] **Step 3: Write minimal implementation**

```svelte
<!-- apps/web/src/lib/components/LibraryToolbar.svelte -->
<script lang="ts">
  import type { LibraryParams, Sort } from "@readmepls/types";
  import { SlidersHorizontal } from "@lucide/svelte";

  let { params, total, onSearch, onSort, onOpenFilters }: {
    params: LibraryParams; total: number;
    onSearch: (q: string) => void; onSort: (s: Sort) => void; onOpenFilters: () => void;
  } = $props();

  let query = $state(params.q);
  $effect(() => { query = params.q; });

  const SORT_LABELS: { value: Sort; label: string }[] = [
    { value: "-created", label: "newest saved" },
    { value: "created", label: "oldest saved" },
    { value: "-published", label: "recently published" },
    { value: "-read_time", label: "longest" },
    { value: "read_time", label: "shortest" },
    { value: "-updated", label: "recently read" },
    { value: "title", label: "title a–z" },
    { value: "relevance", label: "relevance" },
  ];
</script>

<div class="toolbar">
  <input
    class="search"
    type="search"
    aria-label="search your library"
    placeholder="search…"
    bind:value={query}
    onkeydown={(e) => { if (e.key === "Enter") onSearch(query.trim()); }}
  />
  <button class="filters-btn" onclick={onOpenFilters}>
    <SlidersHorizontal class="icon-sm" aria-hidden="true" /> filters
  </button>
  <label class="sort">
    <span class="sr-only">sort</span>
    <select aria-label="sort" value={params.sort} onchange={(e) => onSort(e.currentTarget.value as Sort)}>
      {#each SORT_LABELS as s (s.value)}
        {#if s.value !== "relevance" || params.q}
          <option value={s.value}>{s.label}</option>
        {/if}
      {/each}
    </select>
  </label>
  <span class="count">{total} article{total === 1 ? "" : "s"}</span>
</div>

<style>
  .toolbar { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; margin: 0 0 var(--space-4); }
  .search { flex: 1 1 12rem; padding: 0.5rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); font-family: var(--font-ui); color: var(--color-text); }
  .filters-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.5rem 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); cursor: pointer; font-family: var(--font-ui); color: var(--color-text); }
  .filters-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
  select { padding: 0.5rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); font-family: var(--font-ui); color: var(--color-text); }
  .count { font-family: var(--font-ui); font-size: var(--text-sm); color: var(--color-text-muted); margin-left: auto; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/components/library-toolbar.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/LibraryToolbar.svelte apps/web/src/lib/components/library-toolbar.test.ts
git commit -m "feat(web): LibraryToolbar with search, sort, and result count"
```

---

### Task 9: `FilterDrawer` — facet groups

**Files:**
- Create: `apps/web/src/lib/components/FilterDrawer.svelte`
- Test: `apps/web/src/lib/components/filter-drawer.test.ts`

**Interfaces:**
- Consumes: `Sheet` (Task 6), existing `SourceFilter` (favicon + count + favorite star), `LibraryParams`, `FacetOptions`/`SourceFacet` (Task 4), tag/collection lists.
- Produces: `<FilterDrawer open onClose params options tags collections onChange={(patch: Partial<LibraryParams>) => void} onToggleFavorite={(f: SourceFacet) => void} />`. Renders facet groups (read, time, tags, collections, source + favorites-only, saved date, published date, language, author, has, needs-attention). The source group reuses `SourceFilter` so favicons/counts/the favorite star survive. Toggling a value calls `onChange` with the patch; toggling a source star calls `onToggleFavorite`. Uses `Sheet` as the shell.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/components/filter-drawer.test.ts
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import FilterDrawer from "./FilterDrawer.svelte";
import { LibraryParams } from "@readmepls/types";

// SourceFilter (used for the source group) calls browserPb() at init.
vi.mock("$lib/pb.js", () => ({ browserPb: () => ({ files: { getURL: () => "" }, baseURL: "" }) }));

const options = { sources: [], languages: ["en"], authors: ["Jane"] };
const props = (over = {}) => ({
  open: true, onClose: () => {}, params: LibraryParams.parse({}),
  options, tags: [{ id: "t1", name: "Dev" }], collections: [{ id: "c1", name: "Read later", slug: "read-later" }],
  onChange: () => {}, onToggleFavorite: () => {}, ...over,
});

describe("FilterDrawer", () => {
  it("renders facet groups when open", () => {
    const { getByText } = render(FilterDrawer, props());
    expect(getByText("read")).toBeTruthy();
    expect(getByText("reading time")).toBeTruthy();
    expect(getByText("tags")).toBeTruthy();
  });

  it("toggling a read value emits the additive patch", async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(FilterDrawer, props({ onChange }));
    await fireEvent.click(getByLabelText("unread"));
    expect(onChange).toHaveBeenCalledWith({ read: ["unread"] });
  });

  it("toggling an already-selected value removes it", async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(FilterDrawer, props({
      params: LibraryParams.parse({ read: ["unread"] }), onChange,
    }));
    await fireEvent.click(getByLabelText("unread"));
    expect(onChange).toHaveBeenCalledWith({ read: [] });
  });

  it("saved-date is single-select and emits a scalar", async () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(FilterDrawer, props({ onChange }));
    await fireEvent.click(getByLabelText("saved this week"));
    expect(onChange).toHaveBeenCalledWith({ saved: "week" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/components/filter-drawer.test.ts`
Expected: FAIL — cannot find `./FilterDrawer.svelte`.

- [ ] **Step 3: Write minimal implementation**

```svelte
<!-- apps/web/src/lib/components/FilterDrawer.svelte -->
<script lang="ts">
  import type { LibraryParams, ReadState, TimeBucket, DatePreset, HasFlag, Attention } from "@readmepls/types";
  import { READ_STATES, TIME_BUCKETS, DATE_PRESETS, HAS_FLAGS, ATTENTION } from "@readmepls/types";
  import type { FacetOptions, SourceFacet } from "@readmepls/core";
  import Sheet from "./ui/Sheet.svelte";
  import Chip from "./ui/Chip.svelte";
  import SourceFilter from "./SourceFilter.svelte";

  type Patch = Partial<LibraryParams>;
  let { open, onClose, params, options, tags, collections, onChange, onToggleFavorite }: {
    open: boolean; onClose: () => void; params: LibraryParams; options: FacetOptions;
    tags: { id: string; name: string }[]; collections: { id: string; name: string; slug: string }[];
    onChange: (patch: Patch) => void; onToggleFavorite: (f: SourceFacet) => void;
  } = $props();

  const TIME_LABELS: Record<TimeBucket, string> = { quick: "quick (<5m)", medium: "medium (5–15m)", long: "long (>15m)" };
  const DATE_LABELS: Record<DatePreset, string> = { today: "today", week: "this week", month: "this month", year: "this year", older: "older" };

  // Multi-select toggle over an array-valued group.
  function toggleList<T extends string>(field: keyof LibraryParams, val: T) {
    const cur = params[field] as T[];
    const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
    onChange({ [field]: next } as Patch);
  }
  // Single-select date preset (click active value to clear).
  function pickPreset(field: "saved" | "published", val: DatePreset) {
    onChange({ [field]: params[field] === val ? null : val } as Patch);
  }
</script>

<Sheet {open} {onClose} title="filters">
  <fieldset><legend>read</legend>
    {#each READ_STATES as v (v)}
      <button aria-label={v} aria-pressed={params.read.includes(v as ReadState)} onclick={() => toggleList<ReadState>("read", v)}>
        <Chip selected={params.read.includes(v as ReadState)}>{v}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>reading time</legend>
    {#each TIME_BUCKETS as v (v)}
      <button aria-label={v} aria-pressed={params.time.includes(v as TimeBucket)} onclick={() => toggleList<TimeBucket>("time", v)}>
        <Chip selected={params.time.includes(v as TimeBucket)}>{TIME_LABELS[v as TimeBucket]}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>tags</legend>
    {#each tags as t (t.id)}
      <button aria-label={t.name} aria-pressed={params.tag.includes(t.id)} onclick={() => toggleList("tag", t.id)}>
        <Chip selected={params.tag.includes(t.id)}>{t.name}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>collections</legend>
    {#each collections as c (c.id)}
      <button aria-label={c.name} aria-pressed={params.collection.includes(c.id)} onclick={() => toggleList("collection", c.id)}>
        <Chip selected={params.collection.includes(c.id)}>{c.name}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>source</legend>
    <button aria-label="favorite sources only" aria-pressed={params.favsrc} onclick={() => onChange({ favsrc: !params.favsrc })}>
      <Chip selected={params.favsrc}>favorites only</Chip>
    </button>
    <SourceFilter
      facets={options.sources}
      selected={new Set(params.source)}
      onToggle={(id) => (id === "__all__" ? onChange({ source: [] }) : toggleList("source", id))}
      {onToggleFavorite}
    />
  </fieldset>

  <fieldset><legend>saved</legend>
    {#each DATE_PRESETS as v (v)}
      <button aria-label={`saved ${DATE_LABELS[v as DatePreset]}`} aria-pressed={params.saved === v} onclick={() => pickPreset("saved", v as DatePreset)}>
        <Chip selected={params.saved === v}>{DATE_LABELS[v as DatePreset]}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>published</legend>
    {#each DATE_PRESETS as v (v)}
      <button aria-label={`published ${DATE_LABELS[v as DatePreset]}`} aria-pressed={params.published === v} onclick={() => pickPreset("published", v as DatePreset)}>
        <Chip selected={params.published === v}>{DATE_LABELS[v as DatePreset]}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>language</legend>
    {#each options.languages as l (l)}
      <button aria-label={l} aria-pressed={params.lang.includes(l)} onclick={() => toggleList("lang", l)}>
        <Chip selected={params.lang.includes(l)}>{l}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>author</legend>
    {#each options.authors as a (a)}
      <button aria-label={a} aria-pressed={params.author.includes(a)} onclick={() => toggleList("author", a)}>
        <Chip selected={params.author.includes(a)}>{a}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>has</legend>
    {#each HAS_FLAGS as v (v)}
      <button aria-label={v} aria-pressed={params.has.includes(v as HasFlag)} onclick={() => toggleList<HasFlag>("has", v)}>
        <Chip selected={params.has.includes(v as HasFlag)}>{v}</Chip>
      </button>
    {/each}
  </fieldset>

  <fieldset><legend>needs attention</legend>
    {#each ATTENTION as v (v)}
      <button aria-label={v} aria-pressed={params.attention.includes(v as Attention)} onclick={() => toggleList<Attention>("attention", v)}>
        <Chip selected={params.attention.includes(v as Attention)}>{v}</Chip>
      </button>
    {/each}
  </fieldset>
</Sheet>

<style>
  fieldset { border: none; padding: 0; margin: 0 0 var(--space-4); display: flex; flex-wrap: wrap; gap: 0.4rem; }
  legend { width: 100%; font-family: var(--font-ui); font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--color-text-muted); margin-bottom: 0.35rem; }
  button { background: none; border: none; padding: 0; cursor: pointer; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/components/filter-drawer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/FilterDrawer.svelte apps/web/src/lib/components/filter-drawer.test.ts
git commit -m "feat(web): FilterDrawer facet groups"
```

---

### Task 10: `/library` server load wrapper

**Files:**
- Create: `apps/web/src/routes/library/+page.server.ts`
- Test: `apps/web/src/routes/library/page.server.test.ts`

**Interfaces:**
- Consumes: `parseLibraryParams`, `fetchLibraryPage`, `fetchFacetOptions` (Tasks 2, 5).
- Produces: `PageServerLoad` returning `{ params: LibraryParams; page: LibraryPage; facets: { tags; collections; options } }`. The test mocks `fetchLibraryPage`/`fetchFacetOptions` and asserts the load parses the URL and passes `locals.pb` through.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/routes/library/page.server.test.ts
import { describe, it, expect, vi } from "vitest";

const fetchLibraryPage = vi.fn(async () => ({ items: [], totalItems: 7, page: 1, perPage: 24 }));
const fetchFacetOptions = vi.fn(async () => ({ tags: [], collections: [], options: { sources: [], languages: [], authors: [] } }));
vi.mock("@readmepls/core", async (orig) => ({ ...(await orig<typeof import("@readmepls/core")>()), fetchLibraryPage, fetchFacetOptions }));

import { load } from "./+page.server.js";

describe("library load", () => {
  it("parses the URL params and returns page + facets", async () => {
    const url = new URL("http://x/library?read=unread&sort=-read_time");
    const locals = { pb: {} } as never;
    const data = await load({ url, locals } as never);
    expect(data.params.read).toEqual(["unread"]);
    expect(data.params.sort).toBe("-read_time");
    expect(data.page.totalItems).toBe(7);
    expect(fetchLibraryPage).toHaveBeenCalled();
    expect(fetchFacetOptions).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/routes/library/page.server.test.ts`
Expected: FAIL — cannot find `./+page.server.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/routes/library/+page.server.ts
import type { PageServerLoad } from "./$types";
import { parseLibraryParams, fetchLibraryPage, fetchFacetOptions } from "@readmepls/core";

export const load: PageServerLoad = async ({ url, locals }) => {
  const params = parseLibraryParams(url.searchParams);
  const [page, facets] = await Promise.all([
    fetchLibraryPage(locals.pb, params),
    fetchFacetOptions(locals.pb),
  ]);
  return { params, page, facets };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/routes/library/page.server.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/library/+page.server.ts apps/web/src/routes/library/page.server.test.ts
git commit -m "feat(web): server load for faceted library"
```

---

### Task 11: Rewrite `library/+page.svelte` to consume the load

**Files:**
- Modify: `apps/web/src/routes/library/+page.svelte` (full rewrite)
- Modify: `apps/web/src/lib/components/SourceFilter.svelte` (import `SourceFacet` from `@readmepls/core`)
- Delete: `apps/web/src/lib/source/library-sources.ts`, `apps/web/src/lib/source/library-sources.test.ts`
- Delete: `apps/web/src/routes/library/tag-filter.test.ts`, `apps/web/src/routes/library/archived-filter.test.ts` (client-side helpers are gone).
- Rewrite: `apps/web/src/routes/library/page.test.ts` (component now renders from a `data` prop — Step 8).
- Add: `apps/web/src/routes/library/url-state.test.ts` (Step 1).

**Interfaces:**
- Consumes: `PageData` from Task 10 (`data.params`, `data.page`, `data.facets`); `serializeLibraryParams` (Task 2); `LibraryToolbar`, `ActiveFilters`, `FilterDrawer`.
- Produces: URL-driven library page. A pure helper `applyPatch(params, patch)` (define in `apps/web/src/lib/library/url-state.ts`) merges a patch, resets `page` to 1 on any facet change, and returns the next `LibraryParams`; navigation uses `serializeLibraryParams` + `goto`.

- [ ] **Step 1: Write the failing test (pure URL-state helper)**

```ts
// apps/web/src/routes/library/url-state.test.ts
import { describe, it, expect } from "vitest";
import { applyPatch } from "$lib/library/url-state.js";
import { LibraryParams } from "@readmepls/types";

describe("applyPatch", () => {
  it("merges a facet patch and resets page to 1", () => {
    const cur = LibraryParams.parse({ read: ["unread"], page: 4 });
    const next = applyPatch(cur, { time: ["long"] });
    expect(next.time).toEqual(["long"]);
    expect(next.read).toEqual(["unread"]);
    expect(next.page).toBe(1);
  });

  it("does not reset page when only the page changes", () => {
    const cur = LibraryParams.parse({ read: ["unread"] });
    expect(applyPatch(cur, { page: 3 }).page).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/routes/library/url-state.test.ts`
Expected: FAIL — cannot find `$lib/library/url-state.js`.

- [ ] **Step 3: Write the helper**

```ts
// apps/web/src/lib/library/url-state.ts
import type { LibraryParams } from "@readmepls/types";

/** Merge a filter patch. Any change other than pagination resets page to 1. */
export function applyPatch(current: LibraryParams, patch: Partial<LibraryParams>): LibraryParams {
  const isPageOnly = Object.keys(patch).length === 1 && "page" in patch;
  return { ...current, ...patch, page: isPageOnly ? (patch.page ?? current.page) : 1 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/routes/library/url-state.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Update `SourceFilter.svelte` import**

Change its import line:

```ts
import type { SourceFacet } from "@readmepls/core";
```

(Remove the old `import ... from "$lib/source/source-view.js"`? No — keep `sourceFaviconUrl`; only the `SourceFacet` type import moves to `@readmepls/core`.)

- [ ] **Step 6: Delete the superseded module and its test**

```bash
git rm apps/web/src/lib/source/library-sources.ts apps/web/src/lib/source/library-sources.test.ts
git rm apps/web/src/routes/library/tag-filter.test.ts apps/web/src/routes/library/archived-filter.test.ts
```

- [ ] **Step 7: Rewrite `+page.svelte`**

```svelte
<!-- apps/web/src/routes/library/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto, invalidateAll } from "$app/navigation";
  import { page as pageStore } from "$app/stores";
  import type { PageData } from "./$types";
  import type { LibraryParams, Sort } from "@readmepls/types";
  import { serializeLibraryParams, type SourceFacet } from "@readmepls/core";
  import { applyPatch } from "$lib/library/url-state.js";
  import { browserPb } from "$lib/pb.js";
  import { deleteArticle } from "$lib/article/delete.js";
  import ArticleCard from "$lib/components/ArticleCard.svelte";
  import CardGrid from "$lib/components/ui/CardGrid.svelte";
  import PaperCorner from "$lib/components/ui/PaperCorner.svelte";
  import LibraryToolbar from "$lib/components/LibraryToolbar.svelte";
  import ActiveFilters from "$lib/components/ActiveFilters.svelte";
  import FilterDrawer from "$lib/components/FilterDrawer.svelte";
  import { reveal } from "$lib/actions/reveal.js";

  let { data }: { data: PageData } = $props();
  let drawerOpen = $state(false);
  let articleError = $state("");

  const pb = browserPb();

  // Per-article actions: mutate then invalidate so the server load re-runs and
  // the grid reflects the change (same refresh path as realtime).
  async function archiveArticle(id: string) { await pb.collection("articles").update(id, { status: "archived" }); await invalidateAll(); }
  async function unarchiveArticle(id: string) { await pb.collection("articles").update(id, { status: "unread" }); await invalidateAll(); }
  async function addToCollection(articleId: string, collectionId: string) {
    await pb.collection("collection_items").create({ collection: collectionId, article: articleId, order: 0 });
  }
  async function handleDelete(id: string) {
    articleError = "";
    try { await deleteArticle(pb, id); await invalidateAll(); }
    catch { articleError = "couldn't delete that. try again."; }
  }
  async function toggleFavorite(facet: SourceFacet) {
    const uid = pb.authStore.model?.id;
    if (!uid) return;
    if (facet.favorite) {
      const row = await pb.collection("source_favorites").getFirstListItem(pb.filter("source = {:s}", { s: facet.id }));
      await pb.collection("source_favorites").delete(row.id);
    } else {
      await pb.collection("source_favorites").create({ user: uid, source: facet.id });
    }
    await invalidateAll();
  }

  const labels = $derived({
    tag: Object.fromEntries(data.facets.tags.map((t) => [t.id, t.name])),
    collection: Object.fromEntries(data.facets.collections.map((c) => [c.id, c.name])),
    source: Object.fromEntries(data.facets.options.sources.map((s) => [s.id, s.name ?? s.host])),
  });

  function navigate(next: LibraryParams) {
    const qs = serializeLibraryParams(next).toString();
    goto(qs ? `/library?${qs}` : "/library", { keepFocus: true, noScroll: true });
  }
  const patch = (p: Partial<LibraryParams>) => navigate(applyPatch(data.params, p));
  const clearAll = () => navigate({ ...data.params, read: [], time: [], tag: [], collection: [], source: [], favsrc: false, saved: null, published: null, lang: [], author: [], has: [], attention: [], q: "", page: 1 });

  // New captures should surface without a manual reload.
  let unsub: (() => void) | undefined;
  onMount(async () => { unsub = await pb.collection("articles").subscribe("*", () => invalidateAll()); });
  onDestroy(() => unsub?.());
</script>

<h1>your library</h1>

{#if articleError}
  <p class="article-error" role="alert">{articleError}</p>
{/if}

<LibraryToolbar
  params={data.params}
  total={data.page.totalItems}
  onSearch={(q) => patch({ q })}
  onSort={(s: Sort) => patch({ sort: s })}
  onOpenFilters={() => (drawerOpen = true)}
/>
<ActiveFilters params={data.params} {labels} onRemove={patch} onClear={clearAll} />
<FilterDrawer
  open={drawerOpen}
  onClose={() => (drawerOpen = false)}
  params={data.params}
  options={data.facets.options}
  tags={data.facets.tags}
  collections={data.facets.collections}
  onChange={patch}
  onToggleFavorite={toggleFavorite}
/>

{#if data.page.items.length === 0}
  <div class="empty">
    <PaperCorner />
    <p>nothing matches those filters. <button class="link" onclick={clearAll}>clear filters</button> or save a link on your <a href="/">home page</a>.</p>
  </div>
{:else}
  <CardGrid>
    {#each data.page.items as a, i (a.id)}
      <div use:reveal={{ delay: Math.min(i, 8) * 40 }}>
        <ArticleCard
          article={a}
          collections={data.facets.collections}
          onAddToCollection={addToCollection}
          onArchive={archiveArticle}
          onUnarchive={unarchiveArticle}
          onDelete={handleDelete}
        />
      </div>
    {/each}
  </CardGrid>
{/if}

<style>
  h1 { font-family: var(--font-ui); font-size: var(--text-xl); font-weight: var(--weight-semibold); color: var(--color-text); margin: 0 0 var(--space-5); }
  .empty { text-align: center; padding: var(--space-7) var(--space-4); background: var(--color-surface); border-radius: var(--radius-xl); box-shadow: var(--shadow-sm); position: relative; overflow: hidden; }
  .empty p { font-family: var(--font-ui); color: var(--color-text-muted); }
  .empty a, .link { color: var(--color-accent); }
  .link { background: none; border: none; cursor: pointer; font: inherit; padding: 0; }
  .article-error { margin: 0 0 var(--space-3); font-size: var(--text-sm); color: var(--color-accent); }
</style>
```

- [ ] **Step 8: Rewrite `page.test.ts` for the prop-driven component**

The page now renders from a `data` prop instead of self-loading. Replace the file so the delete-via-menu regression stays covered:

```ts
// apps/web/src/routes/library/page.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { page } from "$app/stores";
import { LibraryParams } from "@readmepls/types";

const del = vi.fn().mockResolvedValue(undefined);
vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: { model: { id: "u1" } },
    collection: () => ({ subscribe: vi.fn().mockResolvedValue(() => {}), update: vi.fn(), create: vi.fn(), delete: vi.fn() }),
  }),
}));
vi.mock("$lib/article/delete.js", () => ({ deleteArticle: (_pb: unknown, id: string) => del(id) }));
vi.mock("$app/navigation", () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));

import Library from "./+page.svelte";

const article = { id: "a1", url: "https://example.com/p", status: "unread", progress: 0,
  expand: { content: { extract_status: "ok", title: "Hello", ai_tags_json: [] } } };
const data = {
  params: LibraryParams.parse({}),
  page: { items: [article], totalItems: 1, page: 1, perPage: 24 },
  facets: { tags: [], collections: [], options: { sources: [], languages: [], authors: [] } },
};
const basePageValue = {
  params: {}, url: new URL("http://localhost/library"), route: { id: null },
  status: 200, error: null, data: { tier: "pro" }, form: null, state: {},
};
beforeEach(() => page.set(basePageValue as never));

async function deleteViaMenu() {
  await fireEvent.click(screen.getByRole("button", { name: "article actions" }));
  await fireEvent.click(await screen.findByRole("menuitem", { name: /delete/i }));
  await fireEvent.click(screen.getByRole("button", { name: "delete" }));
}

describe("library page", () => {
  it("renders articles from the load data", () => {
    render(Library, { data } as never);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("deletes an article via PocketBase when confirmed", async () => {
    render(Library, { data } as never);
    await deleteViaMenu();
    await waitFor(() => expect(del).toHaveBeenCalledWith("a1"));
  });

  it("shows an error and keeps the article when delete fails", async () => {
    del.mockRejectedValueOnce(new Error("forbidden"));
    render(Library, { data } as never);
    await deleteViaMenu();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("couldn't delete that. try again."));
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run the full web suite + type check**

Run: `cd apps/web && npx vitest run && npx svelte-check --tsconfig ./tsconfig.json`
Expected: PASS; no type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/routes/library apps/web/src/lib/library/url-state.ts apps/web/src/lib/components/SourceFilter.svelte
git commit -m "feat(web): URL-driven faceted library page"
```

---

### Task 12: Redirect the standalone `/search` page into the library

**Files:**
- Create: `apps/web/src/routes/search/+page.server.ts`
- Delete: `apps/web/src/routes/search/+page.svelte`
- Test: `apps/web/src/routes/search/page.server.test.ts`

**Interfaces:**
- Produces: a `load` that 308-redirects `/search?q=x` → `/library?q=x` (preserving `q`), or to `/library` when absent.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/routes/search/page.server.test.ts
import { describe, it, expect } from "vitest";
import { load } from "./+page.server.js";

function run(qs: string): { status: number; location: string } {
  try {
    load({ url: new URL(`http://x/search${qs}`) } as never);
    throw new Error("expected redirect");
  } catch (e) {
    return e as { status: number; location: string };
  }
}

describe("/search redirect", () => {
  it("preserves the query", () => {
    const r = run("?q=neural");
    expect(r.status).toBe(308);
    expect(r.location).toBe("/library?q=neural");
  });
  it("redirects bare /search to /library", () => {
    expect(run("").location).toBe("/library");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/routes/search/page.server.test.ts`
Expected: FAIL — cannot find `./+page.server.js`.

- [ ] **Step 3: Write the redirect and remove the old page**

```ts
// apps/web/src/routes/search/+page.server.ts
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ url }) => {
  const q = url.searchParams.get("q");
  throw redirect(308, q ? `/library?q=${encodeURIComponent(q)}` : "/library");
};
```

```bash
git rm apps/web/src/routes/search/+page.svelte
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/routes/search/page.server.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/search
git commit -m "feat(web): fold /search into the faceted library"
```

---

## Final verification

- [ ] Run the full suite: `pnpm --filter @readmepls/core test && pnpm --filter @readmepls/web test`
- [ ] Type check: `cd apps/web && npx svelte-check --tsconfig ./tsconfig.json` and `npx tsc -p tsconfig.json --pretty` at root.
- [ ] Manual smoke (`vite dev`): open `/library`, toggle facets in the drawer, confirm the URL updates, chips appear, back-button restores state, search narrows results, `/search?q=x` redirects.

## Notes / known limitations (v1)

- Facet option lists (`fetchFacetOptions`) are built from a fields-trimmed full list of the user's articles — bounded transfer, not paginated. Acceptable for v1; revisit with a distinct-values endpoint if libraries get very large.
- Relevance-sorted search paginates in memory over the ≤200-candidate FTS set.
- FTS route is ASCII-only (existing Goja limitation in `search.pb.js`), unchanged here.
- Per-facet context-sensitive counts are intentionally not computed (see spec §Counts).
