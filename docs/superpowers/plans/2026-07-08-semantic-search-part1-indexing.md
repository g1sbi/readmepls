# Semantic Search — Part 1: Indexing Substrate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every extracted article is chunked and embedded once (keyed to the global `content` row) into an `embeddings` collection, using a local ONNX model that costs $0 and needs no network at inference time.

**Architecture:** Pure `@readmepls/core` functions do chunking and vector math. A worker-side `EmbeddingProvider` interface has a `LocalEmbedder` (transformers.js, `multilingual-e5-small`, int8) and a deterministic `FakeEmbedder` for tests. Indexing runs inline in `processJob` after a successful `upsertContent`, best-effort, idempotent. A one-shot env-gated backfill embeds pre-existing content.

**Tech Stack:** TypeScript (strict), Zod, Vitest, PocketBase (JS migrations), `@huggingface/transformers` (transformers.js), esbuild (worker bundle).

**Design spec:** `docs/superpowers/specs/2026-07-08-semantic-search-design.md`.

## Global Constraints

- **TDD:** failing test first, then implementation. No production code without a driving test.
- **TypeScript strict, no `any`** without a written reason.
- **Zod at boundaries:** embedder output shape and PB reads validated before use.
- **Workspace packages ship TS source.** The worker bundles `main.ts` with esbuild, inlining `@readmepls/core`/`types` and externalizing npm deps. `@huggingface/transformers` (native `onnxruntime-node`) MUST be added to the esbuild `--external:` list; it stays in `node_modules` at runtime. Do NOT repoint `core`/`types` `main` at `dist`.
- **Embeddings key to `content`, not the user.** Rules mirror `content`: read = `@request.auth.id != ''`, write = worker service credential only.
- **Vectors stored L2-normalized** so query-time similarity is a dot product.
- **Embed model + dim stored per row.** Compare only within one model space.
- **Embedding is best-effort** in the job: a failure is logged and swallowed, never fails extraction.
- **Model id:** `Xenova/multilingual-e5-small`, dim **384**, dtype **`q8`** (int8). e5 requires `"query: "` / `"passage: "` prefixes.
- **Commits:** Conventional Commits, one logical change per commit. Do not push or open PRs.

---

## Part 1 Interfaces (defined across the tasks below)

```ts
// @readmepls/core  (Task 1)
interface Chunk { index: number; charStart: number; charEnd: number; text: string; }
function chunkText(text: string, opts?: { maxChars?: number; overlapChars?: number }): Chunk[];

// @readmepls/core  (Task 2)
function l2normalize(v: number[]): number[];
function dot(a: number[], b: number[]): number;

// @readmepls/types  (Task 3)
const EMBED_DIM = 384;
type EmbeddingRow = { id: string; content: string; chunk_index: number;
  char_start: number; char_end: number; text: string; vector: number[];
  embed_model: string; dim: number };

// worker  (Task 5)
type EmbedKind = "query" | "passage";
interface EmbeddingProvider { readonly model: string; readonly dim: number;
  embed(texts: string[], kind: EmbedKind): Promise<number[][]>; }

// worker  (Task 7)
function indexContent(pb: PocketBase, contentId: string, text: string,
  embedder: EmbeddingProvider): Promise<number>;   // returns rows written
```

---

### Task 1: Core `chunkText`

**Files:**
- Create: `packages/core/src/embedding/chunk.ts`
- Test: `packages/core/src/embedding/chunk.test.ts`
- Modify: `packages/core/src/index.ts` (add export)

**Interfaces:**
- Produces: `Chunk`, `chunkText(text, opts?)` — see Part 1 Interfaces.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/embedding/chunk.test.ts
import { describe, it, expect } from "vitest";
import { chunkText } from "./chunk.js";

describe("chunkText", () => {
  it("returns no chunks for empty text", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns a single chunk for short text", () => {
    const c = chunkText("hello world");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ index: 0, charStart: 0, charEnd: 11, text: "hello world" });
  });

  it("offsets round-trip exactly against the source", () => {
    const text = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    for (const c of chunkText(text, { maxChars: 40, overlapChars: 10 })) {
      expect(text.slice(c.charStart, c.charEnd)).toBe(c.text);
    }
  });

  it("splits long text into overlapping windows on whitespace", () => {
    const text = "a".repeat(30) + " " + "b".repeat(30) + " " + "c".repeat(30);
    const c = chunkText(text, { maxChars: 40, overlapChars: 5 });
    expect(c.length).toBeGreaterThan(1);
    expect(c[0]!.index).toBe(0);
    expect(c[1]!.index).toBe(1);
    // next window starts before the previous end (overlap)
    expect(c[1]!.charStart).toBeLessThan(c[0]!.charEnd);
    // no chunk exceeds the max window
    for (const ch of c) expect(ch.charEnd - ch.charStart).toBeLessThanOrEqual(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/embedding/chunk.test.ts`
Expected: FAIL — cannot find module `./chunk.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/embedding/chunk.ts
export interface Chunk {
  index: number;
  charStart: number;
  charEnd: number;
  text: string;
}

/**
 * Split text into overlapping character windows for embedding. Windows are sized
 * in characters (~4 chars/token) to approximate the ~512-token budget of the
 * embedding model; the default 2000/200 ≈ 500-token windows with ~50-token overlap
 * so a passage that straddles a boundary is still captured whole in one window.
 * `text.slice(charStart, charEnd) === text` for every chunk by construction — no
 * trimming — so offsets can deep-link back into the source.
 */
export function chunkText(
  text: string,
  opts: { maxChars?: number; overlapChars?: number } = {}
): Chunk[] {
  const maxChars = opts.maxChars ?? 2000;
  const overlapChars = opts.overlapChars ?? 200;
  const chunks: Chunk[] = [];
  if (text.length === 0) return chunks;

  let start = 0;
  let index = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    // snap back to a whitespace boundary so we don't cut mid-word (unless the
    // whole window is one long token, in which case keep the hard cut)
    if (end < text.length) {
      const ws = text.lastIndexOf(" ", end);
      if (ws > start) end = ws;
    }
    chunks.push({ index: index++, charStart: start, charEnd: end, text: text.slice(start, end) });
    if (end >= text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}
```

- [ ] **Step 4: Add the export**

In `packages/core/src/index.ts`, add after the existing `search/query` export:

```ts
export * from "./embedding/chunk.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/embedding/chunk.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/embedding/chunk.ts packages/core/src/embedding/chunk.test.ts packages/core/src/index.ts
git commit -m "feat(core): add chunkText for embedding windows"
```

---

### Task 2: Core vector math (`l2normalize`, `dot`)

**Files:**
- Create: `packages/core/src/embedding/cosine.ts`
- Test: `packages/core/src/embedding/cosine.test.ts`
- Modify: `packages/core/src/index.ts` (add export)

**Interfaces:**
- Produces: `l2normalize(v)`, `dot(a, b)` — see Part 1 Interfaces.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/embedding/cosine.test.ts
import { describe, it, expect } from "vitest";
import { l2normalize, dot } from "./cosine.js";

describe("l2normalize", () => {
  it("scales a vector to unit length", () => {
    const n = l2normalize([3, 4]);
    expect(dot(n, n)).toBeCloseTo(1, 10);
    expect(n[0]).toBeCloseTo(0.6, 10);
    expect(n[1]).toBeCloseTo(0.8, 10);
  });
  it("returns zeros unchanged (no divide-by-zero)", () => {
    expect(l2normalize([0, 0])).toEqual([0, 0]);
  });
});

describe("dot", () => {
  it("computes the dot product", () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
  });
  it("identical unit vectors score 1, orthogonal score 0", () => {
    const a = l2normalize([1, 1]);
    const b = l2normalize([1, -1]);
    expect(dot(a, a)).toBeCloseTo(1, 10);
    expect(dot(a, b)).toBeCloseTo(0, 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/embedding/cosine.test.ts`
Expected: FAIL — cannot find module `./cosine.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/embedding/cosine.ts

/** Scale a vector to unit L2 length. Zero vectors are returned unchanged. */
export function l2normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return v.slice();
  return v.map((x) => x / norm);
}

/**
 * Dot product. For L2-normalized inputs this equals cosine similarity, which is
 * how stored (already-normalized) vectors are ranked — no per-query normalization.
 */
export function dot(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += a[i]! * b[i]!;
  return sum;
}
```

- [ ] **Step 4: Add the export**

In `packages/core/src/index.ts`, add:

```ts
export * from "./embedding/cosine.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/core/src/embedding/cosine.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/embedding/cosine.ts packages/core/src/embedding/cosine.test.ts packages/core/src/index.ts
git commit -m "feat(core): add l2normalize and dot for vector ranking"
```

---

### Task 3: Types for embeddings

**Files:**
- Create: `packages/types/src/embedding.ts`
- Test: `packages/types/src/embedding.test.ts`
- Modify: `packages/types/src/index.ts` (add export)

**Interfaces:**
- Produces: `EMBED_DIM`, `EMBED_MODEL`, `EmbeddingRow` (Zod schema + type). `SemanticHit` is added in Part 2 — do NOT define it here.

- [ ] **Step 1: Write the failing test**

```ts
// packages/types/src/embedding.test.ts
import { describe, it, expect } from "vitest";
import { EmbeddingRow, EMBED_DIM, EMBED_MODEL } from "./embedding.js";

describe("EmbeddingRow", () => {
  it("parses a valid row", () => {
    const row = EmbeddingRow.parse({
      id: "e1", content: "c1", chunk_index: 0, char_start: 0, char_end: 5,
      text: "hello", vector: [0.1, 0.2], embed_model: EMBED_MODEL, dim: EMBED_DIM,
    });
    expect(row.content).toBe("c1");
  });
  it("rejects a non-numeric vector", () => {
    expect(() => EmbeddingRow.parse({
      id: "e1", content: "c1", chunk_index: 0, char_start: 0, char_end: 5,
      text: "hello", vector: ["x"], embed_model: EMBED_MODEL, dim: EMBED_DIM,
    })).toThrow();
  });
  it("exposes the default model and dim", () => {
    expect(EMBED_DIM).toBe(384);
    expect(EMBED_MODEL).toBe("Xenova/multilingual-e5-small");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/types/src/embedding.test.ts`
Expected: FAIL — cannot find module `./embedding.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/types/src/embedding.ts
import { z } from "zod";

/** Default local embedding model + its output dimensionality. */
export const EMBED_MODEL = "Xenova/multilingual-e5-small";
export const EMBED_DIM = 384;

/** One stored chunk vector, keyed to a global `content` row (not per-user). */
export const EmbeddingRow = z.object({
  id: z.string(),
  content: z.string(),
  chunk_index: z.number().int().nonnegative(),
  char_start: z.number().int().nonnegative(),
  char_end: z.number().int().nonnegative(),
  text: z.string(),
  vector: z.array(z.number()),
  embed_model: z.string(),
  dim: z.number().int().positive(),
});
export type EmbeddingRow = z.infer<typeof EmbeddingRow>;
```

- [ ] **Step 4: Add the export**

In `packages/types/src/index.ts`, add:

```ts
export * from "./embedding.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/types/src/embedding.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/embedding.ts packages/types/src/embedding.test.ts packages/types/src/index.ts
git commit -m "feat(types): add EmbeddingRow schema and model constants"
```

---

### Task 4: `embeddings` PocketBase collection migration

**Files:**
- Create: `pocketbase/pb_migrations/1720000000_embeddings.js`
- Test: `packages/core/src/pb/migration-embeddings.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: an `embeddings` collection (fields per `EmbeddingRow` + `created`), unique index `(content, chunk_index, embed_model)`, read rule `@request.auth.id != ''`, all write rules `null`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/pb/migration-embeddings.test.ts
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "./test-harness.js";

describe("embeddings migration", () => {
  let h: PbHandle;
  beforeAll(async () => { h = await startEphemeralPb(); });
  afterAll(async () => { await h.stop(); });

  it("creates the embeddings collection with worker-only writes", async () => {
    const col = await h.pb.collections.getOne("embeddings");
    const fieldNames = col.fields.map((f: { name: string }) => f.name);
    expect(fieldNames).toEqual(
      expect.arrayContaining(["content", "chunk_index", "char_start", "char_end", "text", "vector", "embed_model", "dim"])
    );
    expect(col.listRule).toBe("@request.auth.id != ''");
    expect(col.viewRule).toBe("@request.auth.id != ''");
    expect(col.createRule).toBeNull();
    expect(col.updateRule).toBeNull();
    expect(col.deleteRule).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/pb/migration-embeddings.test.ts`
Expected: FAIL — `embeddings` collection not found.

- [ ] **Step 3: Write the migration**

```js
// pocketbase/pb_migrations/1720000000_embeddings.js
/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const content = app.findCollectionByNameOrId("content");

    // Global, worker-written vector index keyed to content (dedup across users).
    // Reads allowed to any authenticated user (same posture as content); writes
    // only via the worker's superuser token. Per-user scoping happens at query
    // time, not here.
    const embeddings = new Collection({
      type: "base",
      name: "embeddings",
      fields: [
        { name: "content", type: "relation", required: true, collectionId: content.id, maxSelect: 1, cascadeDelete: true },
        { name: "chunk_index", type: "number", required: true, onlyInt: true },
        { name: "char_start", type: "number", required: true, onlyInt: true },
        { name: "char_end", type: "number", required: true, onlyInt: true },
        { name: "text", type: "text", required: true, max: 20000 },
        { name: "vector", type: "json", required: true, maxSize: 200000 },
        { name: "embed_model", type: "text", required: true },
        { name: "dim", type: "number", required: true, onlyInt: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_embeddings_content_chunk_model ON embeddings (content, chunk_index, embed_model)",
        "CREATE INDEX idx_embeddings_content ON embeddings (content)",
      ],
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
    });
    app.save(embeddings);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("embeddings");
    if (c) app.delete(c);
  }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/core/src/pb/migration-embeddings.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add pocketbase/pb_migrations/1720000000_embeddings.js packages/core/src/pb/migration-embeddings.test.ts
git commit -m "feat(pb): add embeddings collection migration"
```

---

### Task 5: `EmbeddingProvider` interface + `FakeEmbedder`

**Files:**
- Create: `apps/worker/src/embed/provider.ts`
- Create: `apps/worker/src/embed/fake-embedder.ts`
- Test: `apps/worker/src/embed/fake-embedder.test.ts`

**Interfaces:**
- Consumes: `l2normalize` (`@readmepls/core`, Task 2).
- Produces: `EmbedKind`, `EmbeddingProvider` (Part 1 Interfaces); `FakeEmbedder` — a deterministic offline hashing embedder where texts sharing tokens get similar vectors (so ranking tests are meaningful).

- [ ] **Step 1: Write the failing test**

```ts
// apps/worker/src/embed/fake-embedder.test.ts
import { describe, it, expect } from "vitest";
import { FakeEmbedder } from "./fake-embedder.js";
import { dot } from "@readmepls/core";

describe("FakeEmbedder", () => {
  const e = new FakeEmbedder(64);

  it("is deterministic and returns unit vectors of the configured dim", async () => {
    const [a] = await e.embed(["hello world"], "passage");
    const [b] = await e.embed(["hello world"], "passage");
    expect(a).toEqual(b);
    expect(a).toHaveLength(64);
    expect(dot(a!, a!)).toBeCloseTo(1, 6);
  });

  it("ranks a shared-vocabulary text above an unrelated one", async () => {
    const [q] = await e.embed(["cortisol and sleep quality"], "query");
    const [related] = await e.embed(["sleep and cortisol levels at night"], "passage");
    const [unrelated] = await e.embed(["quarterly tax accounting spreadsheet"], "passage");
    expect(dot(q!, related!)).toBeGreaterThan(dot(q!, unrelated!));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/worker/src/embed/fake-embedder.test.ts`
Expected: FAIL — cannot find module `./fake-embedder.js`.

- [ ] **Step 3: Write the interface and fake**

```ts
// apps/worker/src/embed/provider.ts
export type EmbedKind = "query" | "passage";

/** Turns text into vectors. `kind` lets an implementation apply model-specific
 *  query/passage prefixes (e5 requires them). Implementations return L2-normalized
 *  vectors so callers can rank by dot product. */
export interface EmbeddingProvider {
  readonly model: string;
  readonly dim: number;
  embed(texts: string[], kind: EmbedKind): Promise<number[][]>;
}
```

```ts
// apps/worker/src/embed/fake-embedder.ts
import { l2normalize } from "@readmepls/core";
import type { EmbeddingProvider, EmbedKind } from "./provider.js";

/**
 * Deterministic, offline embedder for tests: hashes each lowercased token into a
 * dimension bucket (bag-of-words), then L2-normalizes. Texts sharing vocabulary get
 * similar vectors, so retrieval-ranking tests are meaningful without a real model
 * or any network. `kind` is ignored (no prefixes needed for the hash).
 */
export class FakeEmbedder implements EmbeddingProvider {
  readonly model = "fake";
  constructor(readonly dim = 384) {}

  async embed(texts: string[], _kind: EmbedKind): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array<number>(this.dim).fill(0);
      const tokens = t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
      for (const tok of tokens) {
        let h = 2166136261;
        for (let i = 0; i < tok.length; i++) {
          h ^= tok.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        v[Math.abs(h) % this.dim] += 1;
      }
      return l2normalize(v);
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/worker/src/embed/fake-embedder.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/embed/provider.ts apps/worker/src/embed/fake-embedder.ts apps/worker/src/embed/fake-embedder.test.ts
git commit -m "feat(worker): add EmbeddingProvider interface and FakeEmbedder"
```

---

### Task 6: `LocalEmbedder` + `selectEmbedder`

**Files:**
- Create: `apps/worker/src/embed/local-embedder.ts`
- Create: `apps/worker/src/embed/select-embedder.ts`
- Test: `apps/worker/src/embed/select-embedder.test.ts`
- Modify: `apps/worker/package.json` (dependency + esbuild external)

**Interfaces:**
- Consumes: `EmbeddingProvider` (Task 5), `FakeEmbedder` (Task 5).
- Produces: `LocalEmbedder` (transformers.js), `selectEmbedder(env, makeLocal)` — mirrors `selectAiProvider`: `EMBED_PROVIDER=fake` → `FakeEmbedder`, else the injected local factory (lazy so tests need no model download).

> **Note on testing `LocalEmbedder` directly:** its real model requires a one-time network download and native `onnxruntime-node`; it is exercised end-to-end in Task 7's integration test only if `EMBED_PROVIDER` is unset. The unit test here covers **only** `selectEmbedder`'s branching with a fake factory — no model load.

- [ ] **Step 1: Write the failing test**

```ts
// apps/worker/src/embed/select-embedder.test.ts
import { describe, it, expect } from "vitest";
import { selectEmbedder } from "./select-embedder.js";
import { FakeEmbedder } from "./fake-embedder.js";
import type { EmbeddingProvider } from "./provider.js";

const sentinel: EmbeddingProvider = { model: "local", dim: 384, embed: async () => [] };

describe("selectEmbedder", () => {
  it("returns FakeEmbedder when EMBED_PROVIDER=fake", () => {
    const e = selectEmbedder({ EMBED_PROVIDER: "fake" }, () => sentinel);
    expect(e).toBeInstanceOf(FakeEmbedder);
  });
  it("otherwise builds the local embedder lazily via the factory", () => {
    let built = 0;
    const e = selectEmbedder({}, () => { built++; return sentinel; });
    expect(built).toBe(1);
    expect(e).toBe(sentinel);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/worker/src/embed/select-embedder.test.ts`
Expected: FAIL — cannot find module `./select-embedder.js`.

- [ ] **Step 3: Write `selectEmbedder` and `LocalEmbedder`**

```ts
// apps/worker/src/embed/select-embedder.ts
import type { EmbeddingProvider } from "./provider.js";
import { FakeEmbedder } from "./fake-embedder.js";

/**
 * Pick the embedder from env. `EMBED_PROVIDER=fake` wires the deterministic
 * FakeEmbedder (used by tests and the offline smoke path). Otherwise builds the
 * real LocalEmbedder via the injected factory — a thunk so the model (and its
 * one-time download) is only constructed when actually used.
 */
export function selectEmbedder(
  env: { EMBED_PROVIDER?: string },
  makeLocal: () => EmbeddingProvider
): EmbeddingProvider {
  if (env.EMBED_PROVIDER === "fake") return new FakeEmbedder();
  return makeLocal();
}
```

```ts
// apps/worker/src/embed/local-embedder.ts
import { pipeline, env as hfEnv, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { l2normalize } from "@readmepls/core";
import { EMBED_MODEL, EMBED_DIM } from "@readmepls/types";
import type { EmbeddingProvider, EmbedKind } from "./provider.js";

/**
 * Local ONNX embedder (transformers.js). Runs on CPU, int8 (`q8`) — ~50-75MB RAM,
 * no key, no inference-time network. multilingual-e5 needs "query: "/"passage: "
 * prefixes; `normalize: true` already returns unit vectors, and we re-normalize
 * defensively so downstream dot-product ranking is exact.
 */
export class LocalEmbedder implements EmbeddingProvider {
  readonly model = EMBED_MODEL;
  readonly dim = EMBED_DIM;
  private pipe: Promise<FeatureExtractionPipeline> | null = null;

  constructor(cacheDir?: string) {
    if (cacheDir) hfEnv.cacheDir = cacheDir;
  }

  private get extractor(): Promise<FeatureExtractionPipeline> {
    if (!this.pipe) {
      this.pipe = pipeline("feature-extraction", this.model, { dtype: "q8" });
    }
    return this.pipe;
  }

  /** Load the model now (call at worker boot to avoid a cold first query). */
  async warmup(): Promise<void> {
    await this.extractor;
  }

  async embed(texts: string[], kind: EmbedKind): Promise<number[][]> {
    if (texts.length === 0) return [];
    const prefixed = texts.map((t) => `${kind}: ${t}`);
    const extractor = await this.extractor;
    const output = await extractor(prefixed, { pooling: "mean", normalize: true });
    return (output.tolist() as number[][]).map((v) => l2normalize(v));
  }
}
```

- [ ] **Step 4: Add the dependency and esbuild external**

In `apps/worker/package.json`: add to `dependencies`:

```json
"@huggingface/transformers": "^3.0.0"
```

And extend the `build` script's externals (append to the existing `esbuild ...` line):

```
--external:@huggingface/transformers --external:onnxruntime-node --external:sharp
```

Then install:

```bash
pnpm install
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run apps/worker/src/embed/select-embedder.test.ts`
Expected: PASS (2 tests). (Does not load the real model.)

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/embed/local-embedder.ts apps/worker/src/embed/select-embedder.ts apps/worker/src/embed/select-embedder.test.ts apps/worker/package.json pnpm-lock.yaml
git commit -m "feat(worker): add LocalEmbedder and selectEmbedder"
```

---

### Task 7: `indexContent` + wire into `processJob`

**Files:**
- Create: `apps/worker/src/embed/index-content.ts`
- Test: `apps/worker/src/embed/index-content.integration.test.ts`
- Modify: `apps/worker/src/worker.ts` (add `embedder` to `ProcessDeps`, call after `upsertContent`)
- Modify: `apps/worker/src/worker.integration.test.ts` (pass a `FakeEmbedder` in existing deps — see Step 6)

**Interfaces:**
- Consumes: `chunkText` (Task 1), `EmbeddingProvider` (Task 5), `EMBED_DIM` (Task 3).
- Produces: `indexContent(pb, contentId, text, embedder)` → number of rows written; adds `embedder: EmbeddingProvider` to `ProcessDeps`.

- [ ] **Step 1: Write the failing integration test**

```ts
// apps/worker/src/embed/index-content.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/pb/test-harness";
import { FakeEmbedder } from "./fake-embedder.js";
import { indexContent } from "./index-content.js";

describe("indexContent", () => {
  let h: PbHandle;
  beforeAll(async () => { h = await startEphemeralPb(); });
  afterAll(async () => { await h.stop(); });

  async function makeContent(text: string): Promise<string> {
    const c = await h.pb.collection("content").create({
      canonical_url: `https://ex.com/${Math.random().toString(36).slice(2)}`,
      content_hash: "h", source_type: "article", title: "t", excerpt: "e",
      content_html: "<p>x</p>", content_text: text, word_count: 3, read_time: 1,
      ai_tags_json: [], fetched_at: new Date().toISOString(), extract_status: "ok",
    });
    return c.id;
  }

  it("writes one embedding row per chunk keyed to content", async () => {
    const id = await makeContent("hello world ".repeat(400)); // long → multiple chunks
    const n = await indexContent(h.pb, id, "hello world ".repeat(400), new FakeEmbedder());
    expect(n).toBeGreaterThan(1);
    const rows = await h.pb.collection("embeddings").getFullList({ filter: `content = "${id}"` });
    expect(rows.length).toBe(n);
    expect(rows[0]!.dim).toBe(384);
    expect(Array.isArray(rows[0]!.vector)).toBe(true);
  });

  it("is idempotent: re-indexing replaces rather than duplicates", async () => {
    const id = await makeContent("some article text here");
    await indexContent(h.pb, id, "some article text here", new FakeEmbedder());
    await indexContent(h.pb, id, "some article text here", new FakeEmbedder());
    const rows = await h.pb.collection("embeddings").getFullList({ filter: `content = "${id}"` });
    const chunkIndexes = rows.map((r) => r.chunk_index).sort();
    expect(new Set(chunkIndexes).size).toBe(chunkIndexes.length); // no duplicate chunk_index
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/worker/src/embed/index-content.integration.test.ts`
Expected: FAIL — cannot find module `./index-content.js`.

- [ ] **Step 3: Write `indexContent`**

```ts
// apps/worker/src/embed/index-content.ts
import type PocketBase from "pocketbase";
import { chunkText } from "@readmepls/core";
import type { EmbeddingProvider } from "./provider.js";

/**
 * (Re)build the embedding rows for one content row. Deletes any existing rows for
 * this content + model first, so a retry/re-extract replaces instead of duplicating
 * (the unique (content, chunk_index, embed_model) index would otherwise reject).
 * Returns the number of rows written. Keyed to content — shared across all users
 * who saved this URL.
 */
export async function indexContent(
  pb: PocketBase,
  contentId: string,
  text: string,
  embedder: EmbeddingProvider
): Promise<number> {
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  const existing = await pb.collection("embeddings").getFullList({
    filter: pb.filter("content = {:c} && embed_model = {:m}", { c: contentId, m: embedder.model }),
    requestKey: null,
  });
  for (const row of existing) {
    await pb.collection("embeddings").delete(row.id);
  }

  const vectors = await embedder.embed(chunks.map((c) => c.text), "passage");
  let written = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    await pb.collection("embeddings").create({
      content: contentId,
      chunk_index: c.index,
      char_start: c.charStart,
      char_end: c.charEnd,
      text: c.text,
      vector: vectors[i]!,
      embed_model: embedder.model,
      dim: embedder.dim,
    });
    written++;
  }
  return written;
}
```

- [ ] **Step 4: Wire into `processJob`**

In `apps/worker/src/worker.ts`:

Add the import near the other local imports:

```ts
import { indexContent } from "./embed/index-content.js";
import type { EmbeddingProvider } from "./embed/provider.js";
```

Add `embedder` to the `ProcessDeps` interface:

```ts
export interface ProcessDeps {
  io: ExtractIO;
  registry: ExtractorRegistry;
  ai: AIProvider;
  classify: (url: string) => SourceType;
  fetchBytes: (url: string) => Promise<{ bytes: Uint8Array; contentType: string } | null>;
  embedder: EmbeddingProvider;
}
```

Immediately AFTER the `const content = await upsertContent(...)` call and BEFORE the source-linking `try` block, insert (only index successful extractions; best-effort so a failure never fails the job):

```ts
    // Embed the extracted text for semantic search. Best-effort and keyed to the
    // shared content row: an embedding failure must never fail an otherwise-good
    // extraction, exactly like source linking below.
    if (result.status !== "failed") {
      try {
        await indexContent(pb, content.id, result.contentText, deps.embedder);
      } catch (err) {
        console.error(`[worker] embedding failed for ${job.canonical_url}:`, err);
      }
    }
```

- [ ] **Step 5: Run the new integration test**

Run: `pnpm exec vitest run apps/worker/src/embed/index-content.integration.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Fix the existing worker integration test's deps**

`apps/worker/src/worker.integration.test.ts` builds a `ProcessDeps` object; it now needs `embedder`. Add the import and field:

```ts
import { FakeEmbedder } from "./embed/fake-embedder.js";
```

In each `ProcessDeps` literal in that file, add:

```ts
      embedder: new FakeEmbedder(),
```

Run the full worker suite to confirm nothing else broke:

Run: `pnpm exec vitest run apps/worker`
Expected: PASS (all worker tests, including the updated integration test).

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/embed/index-content.ts apps/worker/src/embed/index-content.integration.test.ts apps/worker/src/worker.ts apps/worker/src/worker.integration.test.ts
git commit -m "feat(worker): embed content inline after extraction"
```

---

### Task 8: Backfill job + worker wiring/config

**Files:**
- Create: `apps/worker/src/embed/backfill-embeddings.ts`
- Test: `apps/worker/src/embed/backfill-embeddings.integration.test.ts`
- Modify: `apps/worker/src/main.ts` (build embedder via `selectEmbedder`, add to deps, env-gated backfill, warmup)
- Modify: `.env.example` (new env vars)

**Interfaces:**
- Consumes: `indexContent` (Task 7), `EmbeddingProvider` (Task 5), `selectEmbedder`/`LocalEmbedder` (Task 6).
- Produces: `backfillEmbeddings(pb, embedder)` → `{ indexed: number }` — embeds every `content` row that has no embeddings for the current model.

- [ ] **Step 1: Write the failing integration test**

```ts
// apps/worker/src/embed/backfill-embeddings.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/pb/test-harness";
import { FakeEmbedder } from "./fake-embedder.js";
import { backfillEmbeddings } from "./backfill-embeddings.js";

describe("backfillEmbeddings", () => {
  let h: PbHandle;
  beforeAll(async () => { h = await startEphemeralPb(); });
  afterAll(async () => { await h.stop(); });

  it("indexes content rows lacking embeddings and skips already-indexed ones", async () => {
    for (let i = 0; i < 2; i++) {
      await h.pb.collection("content").create({
        canonical_url: `https://ex.com/a${i}`, content_hash: "h", source_type: "article",
        title: "t", excerpt: "e", content_html: "<p>x</p>", content_text: `article ${i} body text`,
        word_count: 3, read_time: 1, ai_tags_json: [], fetched_at: new Date().toISOString(),
        extract_status: "ok",
      });
    }
    const first = await backfillEmbeddings(h.pb, new FakeEmbedder());
    expect(first.indexed).toBe(2);
    const second = await backfillEmbeddings(h.pb, new FakeEmbedder());
    expect(second.indexed).toBe(0); // already have embeddings for this model
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/worker/src/embed/backfill-embeddings.integration.test.ts`
Expected: FAIL — cannot find module `./backfill-embeddings.js`.

- [ ] **Step 3: Write `backfillEmbeddings`**

```ts
// apps/worker/src/embed/backfill-embeddings.ts
import type PocketBase from "pocketbase";
import type { EmbeddingProvider } from "./provider.js";
import { indexContent } from "./index-content.js";

/**
 * One-shot: embed every content row that has no embeddings for the current model.
 * Env-gated in main.ts (mirrors BACKFILL_SOURCES). Best-effort per row so one bad
 * row doesn't halt the pass.
 */
export async function backfillEmbeddings(
  pb: PocketBase,
  embedder: EmbeddingProvider
): Promise<{ indexed: number }> {
  const contents = await pb.collection("content").getFullList({ requestKey: null });
  let indexed = 0;
  for (const c of contents) {
    const already = await pb.collection("embeddings").getList(1, 1, {
      filter: pb.filter("content = {:c} && embed_model = {:m}", { c: c.id, m: embedder.model }),
      requestKey: null,
    });
    if (already.totalItems > 0) continue;
    const text = (c.content_text as string) ?? "";
    if (!text.trim()) continue;
    try {
      await indexContent(pb, c.id, text, embedder);
      indexed++;
    } catch (err) {
      console.error(`[worker] backfill embedding failed for content ${c.id}:`, err);
    }
  }
  return { indexed };
}
```

- [ ] **Step 4: Wire the embedder + backfill into `main.ts`**

In `apps/worker/src/main.ts`:

Add imports:

```ts
import { selectEmbedder } from "./embed/select-embedder.js";
import { LocalEmbedder } from "./embed/local-embedder.js";
import { backfillEmbeddings } from "./embed/backfill-embeddings.js";
```

After the `ai` provider is built, build the embedder:

```ts
  const embedder = selectEmbedder(process.env, () => new LocalEmbedder(process.env.TRANSFORMERS_CACHE));
  if (typeof (embedder as { warmup?: () => Promise<void> }).warmup === "function") {
    await (embedder as { warmup: () => Promise<void> }).warmup();
  }
```

Add `embedder` to the `deps` object:

```ts
  const deps: ProcessDeps = {
    io,
    registry,
    ai,
    classify: classifySource,
    fetchBytes,
    embedder,
  };
```

After the existing `BACKFILL_SOURCES` block, add:

```ts
  if (process.env.BACKFILL_EMBEDDINGS === "1") {
    const { indexed } = await backfillEmbeddings(pb, embedder);
    console.log(`[worker ${workerId}] backfilled embeddings for ${indexed} content rows`);
  }
```

- [ ] **Step 5: Update `.env.example`**

Add:

```
# Semantic search embedding (worker). Leave EMBED_PROVIDER unset to use the local
# ONNX model (multilingual-e5-small, int8, no key, no inference-time network).
# Set EMBED_PROVIDER=fake for offline/deterministic runs (tests, smoke).
EMBED_PROVIDER=
# Where transformers.js caches the downloaded model (persist this in Docker).
TRANSFORMERS_CACHE=/data/models
# One-shot: set to 1 to embed all pre-existing content on next worker boot.
BACKFILL_EMBEDDINGS=
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm exec vitest run apps/worker/src/embed/backfill-embeddings.integration.test.ts`
Expected: PASS (1 test).

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/embed/backfill-embeddings.ts apps/worker/src/embed/backfill-embeddings.integration.test.ts apps/worker/src/main.ts .env.example
git commit -m "feat(worker): add embeddings backfill and wire embedder into main"
```

---

## Part 1 Definition of Done

- [ ] `pnpm test` passes across the workspace.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] A real end-to-end capture (worker running with the local model, `EMBED_PROVIDER` unset) writes `embeddings` rows for the new content — verify with `pnpm --filter @readmepls/worker build && ... start` against a local PocketBase, capture a link, and confirm rows in the `embeddings` collection.
- [ ] `BACKFILL_EMBEDDINGS=1` on boot populates embeddings for pre-existing content.

Part 2 (`2026-07-08-semantic-search-part2-query.md`) builds the query surface on top of this index.
