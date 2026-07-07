# Semantic Search — Design

**Date:** 2026-07-08
**Status:** Approved — ready for implementation planning.

## 1. Summary

A private, free, offline **semantic search** over the user's library. A small
embedding model runs locally in the worker (no key, no network, $0 marginal cost).
Every extracted article is chunked and embedded on capture; queries are embedded the
same way and ranked by cosine similarity, returning the passage — not just the
article.

Semantic search ships standalone as a **free-tier acquisition hook** ("search what
you meant, not the keywords you remember"), and simultaneously builds the
**vector-index substrate** that later Pro AI surfaces (chat-with-library, synthesis
digest, capture card) layer onto. Those surfaces need *generation* (BYO key / Pro);
this phase needs only *embeddings*, which are local and free — so the moat's
foundation pays for itself.

### Product framing (tier ladder)

```
Free, no key   →  best-in-class reader (non-AI) + semantic search (local, $0)
Free, BYO key  →  + AI generation surfaces, user's tokens, user's data   (later)
Pro            →  managed generation (we pay), better model, higher quotas (later)
Self-host      →  BYO key always; semantic search identical to free rung
```

Semantic search sits at the **Free, no key** rung on purpose: it must cost the
operator ~nothing and work fully offline / self-hosted, because "your reading, and it
never leaves your box" is the moat closed SaaS competitors cannot copy.

## 2. Goals / Non-Goals

### Goals
- Semantic (meaning-based) search over the user's whole library, returning the
  matching **passage** with a deep-link into the reader.
- Local embeddings only: no key, no network, $0 marginal cost, works self-hosted and
  offline.
- Build a reusable per-user vector index that later Pro generation surfaces consume.
- Honor the existing architecture: PocketBase collections + API rules, the polling
  worker, pure-core / thin-IO shell, Zod validation at boundaries, union states,
  interface seams + DI.

### Non-Goals
- **No generation** (chat / synthesis digest / summaries) in this phase — those are
  later Pro surfaces built on this substrate.
- **No paid / API embedder** — local model only. (Anthropic has no embeddings
  endpoint regardless; a paid seam was considered and dropped to protect the $0 +
  offline + private properties.)
- **No ANN index** (`sqlite-vec` or dedicated vector DB) — brute-force cosine fits
  personal-library scale; an ANN impl can be swapped behind the interface later only
  if a real scaling need appears.
- No tier/quota gating on search or indexing (both are local and free).

## 3. Architecture (Approach A — vectors in PB, cosine in the worker)

- **Storage:** one row per chunk in an `embeddings` collection **keyed to
  `content`, not to the user.** `content` is the global, URL-deduplicated
  extraction table, so an article is embedded **once** no matter how many users
  saved it — the same dedup the extraction pipeline already relies on. Embeddings
  inherit `content`'s exact read/write posture: readable by any authenticated user
  (`@request.auth.id != ''`), writable only by the worker's service credential.
- **Per-user scoping happens at query time, not in storage.** A search for user U
  ranks only over embeddings whose `content` is referenced by U's own `articles`,
  and returns U's `articleId`s. This mirrors the existing keyword search, which
  scopes an FTS match to the caller's library. A user can therefore never receive a
  hit for content not in their own library.
- **Embedding + search ownership:** the **worker** loads the local embedding model
  (`multilingual-e5-small`, ONNX via transformers.js) once at boot and owns both
  indexing and query embedding. It runs a small **internal HTTP server** exposing a
  `/search` endpoint (shared-secret header, internal network only): given a query
  and a user id, it embeds the query, resolves that user's article→content set,
  ranks over the matching content embeddings, and returns ranked `articleId`s +
  passage snippets. Loading the model in one process keeps RAM flat on a small box.
- **Web seam:** a SvelteKit server route (auth'd, BFF) resolves the caller's user id
  server-side and proxies to the worker `/search` with the shared secret. The model
  and service credentials stay server-side; nothing embeds in the browser. The
  returned `articleId`s flow through the *existing* library search-id render path
  (same shape as keyword search), so no new result UI is required.
- **Pure core:** cosine ranking, chunking, and the user-scoped hit-ranking are pure
  `@readmepls/core` functions, tested in isolation. Side effects (PB reads, model
  inference, HTTP) stay at the edges behind interfaces.

Rationale vs alternatives: keeping vectors, model, and ranking colocated in the
worker (where the service credential already lives) avoids loading the ~100 MB model
into the web process too (Approach B would double model RAM on the cheap box) and
avoids coupling to PocketBase's pure-Go SQLite driver via a native extension
(Approach C, `sqlite-vec`). Brute-force over a personal library (hundreds–few-
thousand 384-dim chunks) is sub-10 ms. The cost of Approach A is a new internal
web→worker HTTP channel + shared secret; accepted for the RAM win.

## 4. Data model

```
embeddings   id, content (ref → content), chunk_index, char_start, char_end,
             text, vector (json array of float), embed_model, dim, created
             (global; worker-written; readable by any authenticated user)
```

- **Keyed to `content`, not the user** — one set of chunk rows per extracted
  article, shared across every user who saved it (dedup). Rules mirror `content`:
  `listRule`/`viewRule` = `@request.auth.id != ''`; `createRule`/`updateRule`/
  `deleteRule` = `null` (worker service credential only).
- `embed_model` + `dim` are stored on **every** row. Search compares only within a
  single model space (vectors from different models are not comparable). A change of
  embedding model ⇒ a re-index of every `content` row.
- Unique index on `(content, chunk_index, embed_model)` so re-embedding a content
  row is an idempotent replace, not a duplicate.
- `vector` stored as a JSON float array (portable across PocketBase's SQLite driver;
  no binary-blob coupling). Revisit to a packed blob only if row size becomes a
  measured problem.
- Vectors are **stored L2-normalized**, so query-time similarity is a plain dot
  product (no per-query normalization). See §12.

## 5. Pipeline

- **Indexing runs inline in `processJob`**, right after a successful
  `upsertContent`. The existing worker has a single job type (`extract`) and no
  per-type queue; embedding a content row is fast, local, and only meaningful once
  extraction succeeded, so it is folded into the same job rather than adding a new
  job type. Steps: chunk `content_text` → embed chunks (`passage` mode) → replace
  that content's `embeddings` rows.
- **Idempotent:** a re-run (retry / re-extract) replaces the content's existing
  `embeddings` rows keyed by `(content, chunk_index, embed_model)`; safe to re-run,
  consistent with the worker-job idempotency model.
- **Best-effort:** an embedding failure is logged and swallowed — it must never fail
  an otherwise-successful extraction job (same pattern as source linking today).
- **Backfill job:** a one-shot pass (env-gated, like `BACKFILL_SOURCES`) embeds every
  pre-existing `content` row that has no embeddings yet.
- No quota gating on indexing — local inference is $0.

## 6. Chunking (pure core)

- ~512-token windows with a small overlap, each carrying `char_start` / `char_end`
  offsets into the extracted text.
- Offsets let a search hit **deep-link to the passage** in the reader (reusing the
  highlight-anchoring offset concept), not merely open the article.
- Pure, deterministic, unit-tested: boundary handling, overlap correctness, offset
  integrity round-trips against the source text.

## 7. Query flow

1. Library page load (auth'd SvelteKit server) with a semantic query → web BFF
   resolves the caller's user id from `locals` and calls worker
   `GET /search?user=…&q=…&k=…` with the shared-secret header.
2. Worker: embed `q` (`query` mode) → fetch that user's `articles`
   (`user = {id}`, fields `id,content`) → build the `content → articleId` map →
   fetch `embeddings` for those content ids → rank chunks by dot product (pure core)
   → collapse to best chunk per article → return top-k
   `{ articleId, contentId, chunkIndex, charStart, charEnd, score, snippet }`.
3. Web maps hits to ranked `articleId`s and feeds them through the **existing**
   library search-id path (`applySearchIds` + relevance sort), so results render in
   the current library UI. Passage offsets are carried for a later deep-link
   enhancement.

## 8. Interfaces / DI

- `EmbeddingProvider { embed(texts: string[]): Promise<number[][]>; model: string;
  dim: number }` — a **single** `LocalEmbedder` implementation (ONNX
  `multilingual-e5-small`). The interface exists for dependency injection and
  testing (a deterministic fake embedder in unit tests), per the repo's interface-
  seam house style — not to ship a second provider. `LocalEmbedder` loads the
  **int8-quantized** ONNX model (see §12) and returns L2-normalized vectors.
- `cosineRank(queryVec: number[], rows: EmbeddingRow[], k: number):
  RankedHit[]` — pure, no IO.

## 9. Gating

- Search **and** indexing are fully free and **ungated** — local, $0. This is the
  free-tier hook.
- The vector index is the substrate for later Pro generation surfaces, but **no Pro
  gating lands in this phase**.

## 10. Validation (Zod at boundaries)

- Query input (`q`, `k`) parsed at the web route.
- Worker `/search` response parsed before the web layer trusts it.
- `embeddings` rows read back from PocketBase parsed before ranking.
- Embedder output shape (array length = dim) validated before persistence.

## 11. Testing

- **Chunker (pure):** window boundaries, overlap, offset integrity vs source.
- **`cosineRank` (pure):** ordering, ties, empty corpus, `k` larger than corpus.
- **Embed job (integration, ephemeral PB):** extract → embed → rows exist with
  correct `embed_model`/`dim`; re-extract replaces rows (no duplicates).
- **Query (end-to-end, mocked embedder):** deterministic fake vectors → deterministic
  ranking and deep-link offsets.
- **Query-time scoping:** user A's search returns only `articleId`s from A's own
  library — never a hit for `content` A has not saved, even though `embeddings` are
  globally shared. Explicit test: two users, overlapping and disjoint content.
- **Offline guarantee:** no test performs network I/O — the local model in
  integration, a fake embedder in units.

## 12. Capacity & cost (cheapest Hetzner box)

Target host: Hetzner CX22 (2 shared vCPU, 4 GB RAM) or equivalent. The embedding
**math is cheap**; the real constraints on a small box are RAM and shared-vCPU
contention, not the cosine search. Nothing here runs on the request path —
indexing is async in the worker, so it can never slow the UI; the only user-visible
effect of overload is **index lag** (a just-captured article is briefly not yet
searchable).

**Indexing (per capture, batched):** article ≈ 2000 tokens ≈ ~4 chunks,
≈ **1–2 s CPU/article**. Because embeddings key to `content`, a URL is embedded
**once** regardless of how many users save it — a popular article costs the box a
single indexing pass, not one per user. One worker sustains order
**hundreds–low-thousands of articles/hour** while sharing the box with extraction and
SSR.

**Query (interactive):** dominated by embedding the query (~1 chunk, ≈ **100 ms**).
Because vectors are stored L2-normalized, similarity is a dot product: ~10k vectors
< 5 ms, ~100k vectors ~30–50 ms. The search itself is a non-issue at personal scale.

**RAM (the binding constraint):** int8 model resident ≈ **50–75 MB** (fp32 would be
~100–150 MB) plus the per-user vector cache. Alongside PocketBase, the worker, and
SvelteKit SSR the total lands ≈ 1 GB — comfortable on 4 GB, tight on any 2 GB box.

**When it bites:** not a fixed user count — it is *sustained capture rate × spare
vCPU*. At a typical ~10 saves/day/user, ~1000 users ≈ ~7 articles/min average against
a worker doing ~30–60/min, so the box is comfortable into the **low thousands of
users** before backlog; the wall hit first is CPU/RAM contention, not the algorithm.

**Decisions baked in from day one (near-free wins):**
- **int8-quantized ONNX model** — ~2–4× faster CPU, ~half the RAM vs fp32.
- **Store L2-normalized vectors** — query similarity is a bare dot product.
- **Batch all of an article's chunks in one inference call.**
- **Warm the model at worker boot;** worker concurrency 1–2 (do not oversubscribe
  2 vCPU).

**Scale path (when the threshold is reached):** move the worker to its own box — it is
already a separate process, so this is a deploy split, not a rewrite. An ANN index
behind the `cosineRank`/search seam is a later, separate lever if per-user corpora
ever grow large.

## 13. Risks

- **Brute-force ceiling:** comfortable to low-thousands of chunks per user; instrument
  query latency and corpus size (`log()`), revisit an ANN impl behind the interface
  only if a real ceiling is hit. No silent cap.
- **Worker memory:** model (~100 MB) + per-user vector cache. Cap the cache and evict
  LRU.
- **Cold-start latency:** first query loads the model — warm it on worker boot.
- **Model-change re-index:** switching `embed_model` invalidates all existing
  vectors; must trigger an explicit re-index of every `content` row. Guarded by
  `embed_model`/`dim` stored per row.
- **Web→worker channel:** the query path adds an internal HTTP dependency (web must
  reach the worker). Guard with a shared secret, bind to the internal Docker network,
  and degrade gracefully (fall back to keyword search) if the worker is unreachable.
- **Multilingual quality:** `multilingual-e5-small` chosen because library content
  will not all be English; validate retrieval quality on a mixed-language fixture set.

## 14. Sequencing

1. Core pure units first (TDD): `chunk()`, `cosineRank()`.
2. `EmbeddingProvider` interface + `LocalEmbedder` (model load, warm-up).
3. `embeddings` PB collection migration + API rules + isolation test.
4. Worker `embed` job (enqueue on extract, idempotent upsert) + backfill job.
5. Worker `/search` endpoint (embed query, load+cache vectors, rank).
6. Web server route (proxy, Zod-validated) + search UI with passage deep-links.
7. Multilingual retrieval-quality validation on fixtures.
