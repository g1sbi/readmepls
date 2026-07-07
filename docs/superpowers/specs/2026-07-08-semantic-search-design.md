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

- **Storage:** one row per chunk in a per-user PocketBase `embeddings` collection.
- **Embedding + search ownership:** the **worker** loads the local embedding model
  (`multilingual-e5-small`, ONNX via transformers.js) once at boot and owns both
  indexing and query embedding. It exposes an **internal, server-side-only
  `/search` endpoint**: embeds the query, cosine-ranks that user's vectors, returns
  top-k chunk references.
- **Web seam:** a SvelteKit server route (auth'd, BFF) proxies to the worker
  `/search`. The model and service credentials stay server-side; nothing embeds in
  the browser.
- **Pure core:** cosine ranking and chunking are pure `@readmepls/core` functions,
  tested in isolation. Side effects (PB reads, model inference, HTTP) stay at the
  edges behind interfaces.

Rationale vs alternatives: keeping vectors, model, and ranking colocated in the
worker (where the service credential already lives) avoids shipping every vector to
the web process per query (Approach B) and avoids coupling to PocketBase's pure-Go
SQLite driver via a native extension (Approach C, `sqlite-vec`). Brute-force over a
personal library (hundreds–few-thousand 384-dim chunks) is sub-10ms.

## 4. Data model

```
embeddings   id, user, article (ref), chunk_index, char_start, char_end,
             text, vector (json array of float), embed_model, dim, created
             (per-user)
```

- `embed_model` + `dim` are stored on **every** row. Search compares only within a
  single model space (vectors from different models are not comparable). A change of
  embedding model ⇒ a full per-user re-index.
- Scoped `user = @request.auth.id` with an explicit tenant-isolation test.
- `vector` stored as a JSON float array (portable across PocketBase's SQLite driver;
  no binary-blob coupling). Revisit to a packed blob only if row size becomes a
  measured problem.
- Vectors are **stored L2-normalized**, so query-time similarity is a plain dot
  product (no per-query normalization). See §12.

## 5. Pipeline

- **New worker job `type=embed`**, enqueued on successful `extract`. Steps: load
  content → chunk → embed each chunk → upsert vector rows for that article.
- **Idempotent:** re-extract (or re-embed) replaces that article's existing
  `embeddings` rows; safe to re-run, consistent with the worker-job idempotency
  model (`locked_at` / `locked_by`, stale-lock reclaim).
- **Backfill job:** a one-shot pass embeds the pre-existing library on deploy.
- No quota gating on indexing — local inference is $0.

## 6. Chunking (pure core)

- ~512-token windows with a small overlap, each carrying `char_start` / `char_end`
  offsets into the extracted text.
- Offsets let a search hit **deep-link to the passage** in the reader (reusing the
  highlight-anchoring offset concept), not merely open the article.
- Pure, deterministic, unit-tested: boundary handling, overlap correctness, offset
  integrity round-trips against the source text.

## 7. Query flow

1. Web server route (auth'd) → worker `GET /search?user=…&q=…&k=…`.
2. Worker embeds `q` with the local model, loads that user's vectors (in-memory
   cache, invalidated when new embeds land), cosine-ranks via the pure core
   function, returns top-k `{ article, chunk_index, char_start, char_end, score,
   snippet }`.
3. Web renders hits and deep-links into the reader passage.

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
- **Tenant isolation:** user A's search never returns user B's chunks.
- **Offline guarantee:** no test performs network I/O — the local model in
  integration, a fake embedder in units.

## 12. Capacity & cost (cheapest Hetzner box)

Target host: Hetzner CX22 (2 shared vCPU, 4 GB RAM) or equivalent. The embedding
**math is cheap**; the real constraints on a small box are RAM and shared-vCPU
contention, not the cosine search. Nothing here runs on the request path —
indexing is async in the worker, so it can never slow the UI; the only user-visible
effect of overload is **index lag** (a just-captured article is briefly not yet
searchable).

**Indexing (per capture, async, batched):** article ≈ 2000 tokens ≈ ~4 chunks,
≈ **1–2 s CPU/article** off the request path. One worker sustains order
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
  vectors; must trigger an explicit per-user backfill. Guarded by `embed_model`/`dim`
  stored per row.
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
