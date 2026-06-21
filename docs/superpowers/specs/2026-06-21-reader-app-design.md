# Reader-First Bookmark + Article App — Design

**Date:** 2026-06-21
**Status:** Approved design, pre-implementation

## 1. Summary

A reader-first web app. A user pastes any link (article, X/Twitter thread, YouTube
video). The app extracts the readable content, stores it in the user's library,
auto-tags it with AI, and presents a clean reading experience with highlights,
notes, search, collections, and reading-state tracking.

Deployed as a hosted SaaS (operated by us) and shippable as a self-hostable build.
Connector plugins (Notion, Obsidian, etc.) are scaffolded but not implemented in v1,
except a working Markdown export connector that proves the plugin seam.

## 2. Goals / Non-Goals

### Goals (v1)
- Frictionless capture: paste URL → stored, extracted, tagged.
- Extraction for: standard articles/blogs, X threads, YouTube transcripts.
  Paywalled content handled best-effort; failures degrade gracefully.
- Reader-first UX: clean reader view + typography controls, highlights + notes,
  full-text search + tag/collection browsing, reading state + progress.
- AI auto-tagging + summary via a pluggable provider.
- Global content cache: identical public URLs are extracted once and reused across
  users.
- Connector plugin seam with a working Markdown export; Notion/Obsidian stubbed.
- Dual deploy: hosted SaaS + self-hostable (Docker Compose).

### Non-Goals (v1)
- Notion/Obsidian/other live connectors (scaffold only).
- Mobile native apps and browser extensions (web app first).
- Full-page visual archival (screenshots/PDF/Monolith-style) — later.
- Semantic search / chat-over-library — later.
- Billing integration — tier limits enforced, payment wiring later.
- Horizontal scaling of PocketBase — single-instance is accepted for v1.

## 3. Stack

- **Frontend:** SvelteKit (reader UI + thin server/BFF routes).
- **Backend:** PocketBase (Go single binary) — auth, SQLite data, file storage,
  realtime subscriptions, admin UI, REST API + API rules.
- **Worker:** separate Node/TypeScript service — extraction + AI, queue-driven,
  writes results back to PocketBase via its API.
- **AI:** pluggable provider abstraction. Default `claude-haiku-4-5`.

### Frontend ↔ Backend interaction (Approach C: hybrid)
- Browser uses the PocketBase JS SDK directly for auth, CRUD, and realtime.
  PB API rules enforce per-user access (`user = @request.auth.id`).
- SvelteKit **server** routes handle only secret-bearing actions:
  - `POST /api/capture` — canonicalize URL, dedupe, quota check, enqueue job.
  - AI provider proxy — API keys stay server-side.
  - Connector export — e.g. Markdown zip generation.

```
Browser (SvelteKit app)
  ├─ PB JS SDK ──────────────► PocketBase  (auth, content, articles,
  │  (auth, CRUD, realtime)        │         tags, highlights, collections,
  │                                │         jobs, connectors)
  └─ fetch /api/* ─► SvelteKit server routes
                         ├─ POST /api/capture  → create job in PB
                         ├─ AI provider proxy  (keys server-side)
                         └─ connector export   (markdown zip)

Node/TS Worker (separate process)
  └─ polls PB `jobs` ─► extract (readability / yt-dlp / X)
                       ─► AI tag+summarize (pluggable provider)
                       ─► write content + tags back to PB
```

## 4. Data Model (PocketBase collections)

The model separates **shared content** (global, deduped by URL) from **per-user
state** (the user's pointer to that content plus their private annotations).

```
users            (PB built-in auth)
                 + tier, ai_provider, ai_key_enc (nullable),
                   monthly_quota_used, quota_period

content          GLOBAL, deduped. One row per public canonical URL.
                 id, canonical_url (unique), content_hash,
                 source_type (article|x|youtube|other),
                 title, author, site_name, lang, excerpt,
                 content_html (sanitized), content_text (search/AI),
                 word_count, read_time, hero_image,
                 ai_tags_json (content-derived, shareable),
                 fetched_at, extract_status (pending|ok|partial|failed),
                 failure_reason

articles         PER-USER pointer + reading state.
                 id, user, content (ref → content), url (as-pasted),
                 status (unread|reading|archived), progress (0..1),
                 is_private (true when content not globally cached),
                 private_content (ref, nullable; for gated extractions),
                 created

tags             id, user, name, slug             (unique per user)
article_tags     article, tag, source (ai|manual), confidence   (M:N)

collections      id, user, name, slug, parent (nullable), order
collection_items collection, article, order

highlights       id, user, article, text, prefix, suffix,
                 start_offset, end_offset, color, note, created

jobs             id, user, canonical_url, type (extract),
                 status (queued|running|done|failed),
                 attempts, last_error, content (ref, nullable),
                 created, locked_at, locked_by

connectors       id, user, type (markdown|notion|obsidian|...),
                 enabled, config_json, last_run
```

Notes:
- `content_text` powers PB full-text search and feeds AI tagging.
- AI tags live on `content` because they are content-derived and therefore
  shareable. A user's **manual** tags, highlights, reading-state, and collections
  live on the per-user side.
- **Highlight anchoring** uses stored `text` + `prefix`/`suffix` + offsets so a
  highlight survives minor DOM/render changes. Robust anchoring is the hardest
  reader sub-problem; treat it as its own well-tested unit.
- `jobs.locked_at` / `locked_by` allow poll-safe claiming so concurrent workers do
  not double-run a job. Stale locks (`locked_at` older than a threshold) are
  reclaimable.
- PB API rules scope every per-user collection to `user = @request.auth.id` for
  hard tenant isolation. `content` is readable to authenticated users (it holds
  only public extractions) but writable only by the worker (service credential).

## 5. Global Content Cache

To avoid re-extracting and re-tagging popular links, public content is extracted
once and reused.

Capture lookup:
```
canonicalize(url) → look up content by canonical_url
  HIT  → create articles row pointing at existing content, and seed the user's
         article_tags from content.ai_tags_json (source=ai). No job, no worker,
         no AI cost. Capture is instant.
  MISS → create content(status=pending) + one job (deduped by canonical_url).
         Worker fills content once; all future users reuse it.
```

Guardrails:
- **Never globally cache gated content.** Paywalled / cookie / private-X
  extractions may rely on one user's session; sharing them would leak gated
  content. Such extractions are stored per-user in `private_content` with
  `articles.is_private = true`, never in the global `content` table.
- **Concurrency:** the unique `canonical_url` constraint plus one-job-per-URL
  dedup prevents two simultaneous pastes from double-extracting.
- **Staleness:** `fetched_at` + `content_hash` recorded. A manual "refresh"
  re-fetches on demand. No automatic invalidation in v1.

## 6. Capture → Extract → Tag Flow

```
1. User pastes URL in SvelteKit app.
2. POST /api/capture (server route):
     - canonicalize URL, classify source_type.
     - global cache lookup (see §5). On HIT: create articles row, return — done.
     - On MISS: quota check (tier vs monthly_quota_used) unless user uses BYO key.
     - create content(pending) + jobs(queued, type=extract).
     - return article id → UI shows optimistic "processing" card.
3. Worker loop:
     - claim job: atomic update status=running, set locked_at/locked_by.
     - route by source_type:
         article  → fetch HTML → @mozilla/readability (+ jsdom) → sanitize.
         x        → X pipeline (API/scrape) → stitch thread.
         youtube  → yt-dlp transcript → format as readable text.
         paywall/fail → fallback: search Hacker News / archive.org for a reposted
                        or archived copy → retry extraction on that.
     - on ok/partial: write content_html, content_text, metadata to content row.
     - AI step: provider.tagAndSummarize(content_text)
                → write ai_tags_json + excerpt on content;
                  seed article_tags (source=ai, confidence) for the capturing user.
     - set content.extract_status; job status=done
       (or failed + last_error, attempts++).
4. PB realtime pushes the update → UI card flips from processing to ready.
```

Retry: a failed job with `attempts < 3` is retried with exponential backoff
(gated by next-poll time). After 3 attempts it is marked failed,
`content.extract_status=failed`, and surfaced in the UI with the reason and a
manual retry button. Extraction failure never blocks capture — the article still
exists in the library in a failed/partial state.

## 7. AI Provider Abstraction

```ts
interface AIProvider {
  tagAndSummarize(text: string, opts: AIOpts): Promise<{
    tags: string[]
    summary: string
  }>
}

// Implementations: ClaudeProvider (default, claude-haiku-4-5),
//                  OpenAIProvider, OllamaProvider.

function resolveProvider(user): AIProvider {
  // BYO key present → user's chosen provider + their key.
  // else            → SaaS default provider + our key, gated by quota/tier.
}
```

- Default model: `claude-haiku-4-5` — cheap, fast, sufficient for tagging.
- **SaaS:** our key lives in the worker environment; usage gated by tier limits
  (`monthly_quota_used`), upgradeable.
- **BYO key:** stored encrypted (`users.ai_key_enc`), decrypted server-side only,
  bypasses our quota.
- **Self-host:** operator supplies their own key (or runs Ollama).

## 8. Connector Plugin Seam

```ts
interface ConnectorPlugin {
  type: string
  export(articles: Article[], config: ConnectorConfig): Promise<ExportResult>
}

registry.register(new MarkdownConnector())  // WORKS in v1: emits .md files → zip.
registry.register(new NotionConnector())    // stub: throws NotImplemented.
registry.register(new ObsidianConnector())  // stub: throws NotImplemented.
```

- The `connectors` collection holds per-user config and enabled state.
- Settings UI lists all registered connectors; only `markdown` is enabled, the
  rest render greyed-out "coming soon".
- The Markdown connector proves the seam end-to-end so future connectors only need
  to implement the interface.

## 9. Error Handling

- Extraction failures never block capture; the article persists in a
  partial/failed state with a reason and manual retry.
- Quota exceeded → `402` from `/api/capture` + an upgrade prompt in the UI.
- Worker crash mid-job → the job's lock goes stale (`locked_at` beyond threshold)
  and is reclaimed by the next poll.
- Gated/private extraction is isolated per-user and never written to global
  `content` (see §5 guardrails).

## 10. Testing Strategy

- **Unit:** each extractor (article/X/YouTube) against fixture HTML/transcripts;
  AI provider with the network mocked; highlight anchoring against mutated DOM
  fixtures; URL canonicalization + cache lookup logic.
- **Integration:** capture → job → worker → PB write against an ephemeral
  PocketBase instance; cache HIT/MISS paths; quota gating; private-content
  isolation.
- **E2E (later):** Playwright over the reader flow (capture, read, highlight,
  search, collection, export).
- Follow TDD per feature: failing test first, then implementation.

## 11. Deployment

- **Docker Compose** with three services: `pocketbase`, `web` (SvelteKit),
  `worker` (Node/TS). yt-dlp available in the worker image.
- **SaaS:** our PocketBase instance + our AI key in the worker env + tier gating.
- **Self-host:** same compose; operator supplies AI key (or Ollama). No tier
  gating.

## 12. Open Risks

- **PocketBase single-instance scaling** — vertical only; acceptable for v1,
  revisit before high SaaS load.
- **X/Twitter extraction fragility** — API/scraping is brittle and may break;
  isolate behind the extractor interface so it can be swapped without touching the
  rest of the system.
- **Highlight anchoring robustness** — the trickiest reader sub-problem; build and
  test it as an isolated unit.
- **Paywall fallback hit-rate is low by design** — treated as best-effort; the
  graceful-failure path is the real requirement.
```
