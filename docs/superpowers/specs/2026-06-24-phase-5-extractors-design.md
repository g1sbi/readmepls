# Phase 5 — X/Twitter + YouTube Extractors, Paywall Fallback — Design

**Date:** 2026-06-24
**Status:** Approved design, pre-implementation
**Phase:** 5 (see `CLAUDE.md` roadmap)

## 1. Summary

Phase 5 extends capture beyond standard articles to two new source types —
X/Twitter threads and YouTube videos — and adds a best-effort paywall fallback
via the web archive. It introduces a source→extractor router so the worker
dispatches by `source_type` instead of always running the article extractor.

Decisions locked during brainstorming:

- **X/Twitter:** fetch via X's public syndication endpoint (the one embeds use).
  No auth key. Isolated behind the extractor interface so it is swappable if X
  changes it (spec §12 risk).
- **YouTube:** transcripts via a `yt-dlp` subprocess (matches the design spec and
  the Docker self-host plan).
- **Paywall fallback:** archive.org (Wayback) only, plus a graceful-failure path.
  Hit-rate is low by design; the honest-failure path is the real requirement.

## 2. Goals / Non-Goals

### Goals
- Route capture jobs by `source_type` to per-source extractors.
- Extract public X threads (self-thread stitching) into readable content.
- Extract YouTube transcripts + metadata into readable content.
- Best-effort recovery of thin/paywalled articles from the web archive.
- Graceful degradation everywhere: extraction failure never blocks capture.
- All new extractors keep a pure parse core, tested against offline fixtures.

### Non-Goals
- Protected/private X tweets and members-only YouTube (graceful-fail only; no
  per-user session capture in this phase).
- Hacker News repost lookup (deferred; archive-only fallback for now).
- Official X API path (syndication only; an API impl can be added later behind
  the same seam).
- Media download / video archival (transcript + metadata only).
- Full Docker Compose (Phase 7 owns it; this phase only requires `yt-dlp` in the
  worker image and notes it for Phase 7).

## 3. Current State (what exists)

- `packages/core/src/source/classify.ts` — `classifySource(url): SourceType`
  (`article|x|youtube|other`). **Exists but unused** by the worker.
- `apps/worker/src/extract/extractor.ts` — `Extractor.extract(url, html):
  ExtractResult` — **sync, HTML-in**. Fits articles, breaks for X (JSON) and
  YouTube (subprocess).
- `apps/worker/src/worker.ts` — `processJob` fetches HTML itself
  (`deps.fetchHtml`) then runs one hardcoded `ArticleExtractor`. `deps.classify`
  is passed but never called.
- `apps/worker/src/fetch/safe-fetch.ts` — SSRF-guarded fetch (DNS/private-address
  checks). Reused as the `fetchHtml`/`fetchJson` IO seam.
- `ExtractResult` (`packages/types/src/extract.ts`) — already carries
  `sourceType`, `status` (`pending|ok|partial|failed`), `failureReason`, etc.
  No shape change needed.

## 4. Architecture

### 4.1 Extractor interface refactor (the crux)

Extractors own their own fetching, become async, and self-declare their source.
The worker stops fetching directly.

```ts
interface Extractor {
  source: SourceType                                   // 'article' | 'x' | 'youtube'
  extract(url: string, io: ExtractIO): Promise<ExtractResult>
}

interface ExtractIO {                                  // injected IO seams (edges)
  fetchHtml: (url: string) => Promise<string>          // existing safe-fetch
  fetchJson: (url: string) => Promise<unknown>         // syndication endpoint
  runYtDlp: (videoId: string) => Promise<YtDlpOutput>  // subprocess seam
}
```

Router:

```ts
class ExtractorRegistry {
  constructor(extractors: Extractor[])
  for(source: SourceType): Extractor   // 'other' → ArticleExtractor fallback
}
```

`processJob` flow becomes:

```
classify(url) → registry.for(source) → await extractor.extract(url, io)
```

**Purity discipline (CLAUDE.md "pure core, thin IO shell"):** each extractor is a
thin async IO shell wrapping a pure parse function, tested against fixtures:

- `parseSyndicationThread(json)` — pure, in `@readmepls/core`
- `parseYtTranscript(meta, captions)` — pure, in `@readmepls/core`
- article parse stays as-is (jsdom/readability in worker)

### 4.2 X/Twitter extractor

- `parseTweetId(url)` from `x.com/<user>/status/<id>` or `twitter.com/...`.
- IO: `fetchJson("https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=<t>&lang=en")`
  — public embed endpoint, no auth. `token` is a deterministic function of the
  tweet id (derive it; no secret).
- Pure `parseSyndicationThread(json)` stitches the author's self-thread (their own
  follow-up tweets present in the response) into ordered readable output:
  - `title` = author name + first ~60 chars of the opening tweet
  - `author` = display name / `@handle`, `siteName` = "X"
  - `contentHtml` = sanitized `<p>` per tweet + inline media `<img>` / links
  - `heroImage` = first photo, `sourceType = "x"`
- Protected / deleted / endpoint error → `status:"failed"`, reason
  `"tweet unavailable"`. Never blocks capture.
- Public thread → public → eligible for the **global content cache**.

### 4.3 YouTube extractor

- `parseVideoId(url)` from `youtube.com/watch?v=` and `youtu.be/<id>`.
- IO: `runYtDlp(videoId)` subprocess seam → `{ meta, captions }`. Invoked with
  metadata-dump + auto/manual subtitle flags and `--skip-download` (no media).
- Pure `parseYtTranscript(meta, captions)`:
  - `title`, `author` = channel, `heroImage` = thumbnail, `sourceType = "youtube"`
  - `contentText` / `contentHtml` = transcript folded into paragraphs, with light
    `[mm:ss]` markers per paragraph for reader scannability
- No captions available → `status:"partial"`: store metadata + video description,
  reason `"no transcript"`. Reader still gets a usable card.
- Public video → public → eligible for the **global content cache**.

### 4.4 Paywall / archive fallback

- After the article extract, **detect thin/gated** content:
  `status === "failed"` OR `wordCount < ~120` OR known paywall DOM markers
  (e.g. `[data-paywall]`, common gate classes).
- `archiveFallback(url, io)`:
  1. query Wayback availability: `https://archive.org/wayback/available?url=<url>`
  2. if a snapshot exists → `fetchHtml(snapshot)` → re-run the pure article parse
  3. if richer than the original → adopt it (`status:"ok"|"partial"`, note
     `"recovered from web archive"`)
- Miss → keep the graceful failed/partial result + reason + existing retry button.
- Composed as a step the `ArticleExtractor` runs when its primary parse is thin
  (it already owns fetching) — not a separate router branch.

**Caching rationale (brushes spec §5 "never cache gated content"):** an
archive-recovered extraction comes from a *public* Wayback snapshot, not from the
capturing user's session/cookies. It is therefore safe to store in the shared
`content` table as public content. (Per-user session-based paywall capture, which
*would* be gated, remains out of scope.)

## 5. Data Model

No schema changes. `ExtractResult` already carries everything (`sourceType`,
`status`, `failureReason`). X and YouTube write to the same `content` /
`articles` path as articles, with `source_type` set accordingly. Public
extractions follow the existing global-cache path in `worker.ts`.

## 6. Error Handling

- Every new extractor returns a typed `ExtractResult`; failure is `status:"failed"`
  or `"partial"` with a `failureReason`, never a thrown crash through `processJob`.
- Existing retry/backoff (`attempts < 3`) and stale-lock reclaim are unchanged.
- Subprocess (`yt-dlp`) failure or missing binary → caught, mapped to
  `status:"failed"`, reason surfaced. Worker keeps polling.

## 7. Testing Strategy

Offline fixtures only — never live network (CLAUDE.md).

- **X:** saved syndication JSON — single tweet, multi-tweet self-thread,
  protected/error → `parseSyndicationThread` unit tests.
- **YouTube:** saved `yt-dlp` output — with captions and without →
  `parseYtTranscript` unit tests (full transcript, partial/no-transcript).
- **Paywall:** thin article HTML + Wayback availability JSON + archived HTML →
  recovery test; and a miss → graceful-fail test.
- **Router:** `classify → registry.for → correct extractor`.
- **Integration (ephemeral PB):** capture an x/youtube URL → job → worker → PB
  `content` row; second capture of the same URL → cache HIT, no re-extract.
- TDD per unit: failing test first, then implementation.

## 8. Deployment Impact

- The worker image must include the `yt-dlp` binary (and its Python runtime).
- Phase 7 owns the full Docker Compose; this phase adds `yt-dlp` to the worker
  Dockerfile and flags it for the Phase 7 spec. No other deploy change.

## 9. Open Risks

- **X syndication endpoint fragility** — undocumented; may change or rate-limit.
  Mitigated by the swappable extractor seam and the `token` derivation living in
  one pure function.
- **yt-dlp drift** — YouTube changes can break captions; the subprocess is the
  most robust option available and failures degrade to `partial`.
- **Archive hit-rate is low by design** — acceptable; the graceful-failure path
  is the actual requirement.
