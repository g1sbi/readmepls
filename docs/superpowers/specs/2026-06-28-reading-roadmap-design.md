# Reading Roadmap — Phases 8–12 — Design

**Date:** 2026-06-28
**Status:** Superseded — scrapped in favor of the reading-experience roadmap
starting at `2026-07-02-phase-8-tiering-entitlements-design.md`. Kept for
history; do not implement.

## 1. Summary

This roadmap extends the existing build (phases 1–7) with five new feature phases.
Together they turn the library from a flat list of saved links into a managed
reading workflow that produces clean, portable, routable output:

- **Phase 8 — Reading Inbox:** rich reading states, snooze, goals, keyboard triage,
  "next best read", weekly digest, focus mode.
- **Phase 9 — Live Connectors:** working Notion and Obsidian destinations on the
  existing connector seam, plus rule-based routing.
- **Phase 10 — Research & Citations:** projects, evidence/quote capture, BibTeX and
  CSL JSON export, notes generated from highlights.
- **Phase 11 — Extraction Transparency:** confidence, candidates, preview,
  side-by-side source/reader, repair, and non-destructive extraction history.
- **Phase 12 — Local-First / File Sync:** the user's library as Markdown files they
  own, synced through their own storage, readable offline.

Each phase is built in order, on its own branch off `main`, TDD throughout, and
honors the architecture already in place: PocketBase collections + API rules, the
polling worker, pure-core / thin-IO shell, the `ConnectorPlugin` seam, Zod
validation at boundaries, and states modeled as unions.

These phases are **structure and behavior only**. Visual design remains owned by the
Phase 3 design language; no phase here introduces new visual design — they reuse
existing tokens and components and add behavior.

## 2. Goals / Non-Goals

### Goals
- Make reading a managed workflow with closure, not an accumulating pile.
- Route extracted reading and notes to the destinations users already trust.
- Serve people who read to produce output (writers, researchers, students).
- Make extraction inspectable, trustworthy, and repairable.
- Make the user's library portable files they own, with no lock-in.

### Non-Goals
- No visual redesign (Phase 3 owns the design language).
- No new AI provider beyond the existing pluggable seam.
- No native mobile apps or browser extensions in these phases (web first).
- No semantic search / chat-over-library (out of scope here).
- No billing wiring beyond existing tier/quota gating.

## 3. Architecture Alignment (applies to every phase)

- **Branches:** each phase lands on its own branch off `main`, squashed into clean
  Conventional Commits before merge.
- **TDD:** failing test first, then implementation, per the repo working agreements.
- **Migrations in git:** every schema change is a tracked PocketBase migration, never
  a manual admin-UI edit.
- **Tenant isolation:** every new per-user collection is scoped
  `user = @request.auth.id` with explicit isolation tests.
- **Pure core / thin IO:** new logic (triage, ranking, routing matchers, citation
  formatters, sync diffing) lands as pure functions in `@readmepls/core`, tested in
  isolation; side effects stay behind injected interfaces.
- **Zod at boundaries:** all new external shapes (Notion API, OAuth payloads, file
  reads from sync targets) are parsed before use.
- **Union states:** new lifecycle fields are unions, and graceful-degrade paths are
  type-checked.
- **Tests offline:** extractor/connector/sync tests use fixtures and mocked network,
  never live calls.

---

## 4. Phase 8 — Reading Inbox

Turn the flat library into a managed reading workflow with a sense of progress and
closure.

### Features
- **Rich reading states.** Expand `articles.status` from
  `unread | reading | archived` to
  `unread | reading | read | skimmed | abandoned | revisit | archived`.
  Migration backfills existing rows (`reading`/`unread` preserved). All consumers
  (library filters, reader, search facets) updated; degrade paths type-checked.
- **Snooze.** Add `articles.snooze_until` (nullable datetime). Snoozed items leave
  the active inbox view and reappear when due. Due-detection is a pure predicate.
- **Reading goals.** Per-user weekly target (e.g. N articles read). Progress derived
  from state transitions, not a manually edited counter.
- **Reading events.** New `reading_events` collection
  `(user, article, from_status, to_status, at)` recording every transition. Source
  of truth for goals and digest; per-user scoped.
- **Keyboard triage.** A pure triage reducer maps keypress + current item → action
  (next/prev, mark read/skimmed/abandoned, snooze, archive). The Svelte layer is a
  thin binding over the tested reducer.
- **Next best read.** A pure ranking function over the active queue
  (read-time fit to available time, freshness, `revisit` flag, source mix).
  Deterministic and unit-tested; no AI call.
- **Weekly digest.** A server route aggregates `reading_events` over the period into
  a digest view (read / skimmed / abandoned counts, standout items, backlog size).
- **Focus mode.** A distraction-free reader toggle (hides chrome, single-column).
  Behavioral only — reuses existing reader components and tokens.

### Data model deltas
```
articles      + status (expanded union)
              + snooze_until (datetime, nullable)

users         + weekly_reading_goal (int, nullable)

reading_events  id, user, article, from_status, to_status, at   (per-user)
```

### Testing
- Status migration: existing rows map correctly; new states round-trip.
- Triage reducer and ranking function: pure unit tests over fixtures.
- Snooze due-predicate: boundary tests (before/at/after).
- Digest aggregation: integration test against ephemeral PB with seeded events.
- Tenant isolation on `reading_events`.

### Risks
- State-set churn touches many UI surfaces; keep the union the single source and
  drive filters from it.
- Goal math must be derived (events), not stored, to avoid drift.

---

## 5. Phase 9 — Live Connectors (Notion + Obsidian)

Implement two working destinations on the existing `ConnectorPlugin` seam (currently
only Markdown export is live; Notion/Obsidian are stubs), plus rule-based routing.

### Features
- **NotionConnector.** OAuth connect; map an article to a database row
  (title, author, url, summary, tags, reading status, capture date). Idempotent
  upsert keyed by canonical URL so re-runs update rather than duplicate.
- **ObsidianConnector.** Emit Markdown + YAML frontmatter into a target vault folder
  (local path or sync location), reusing the Markdown export quality work.
- **Routing rules.** New `connector_rules` collection: match condition
  (tag / source_type / collection) → destination connector. A pure matcher resolves
  an article to its destinations; tested in isolation.
- **Sync semantics.** Per-item sync state and `connectors.last_run`; exports are
  idempotent and re-runnable, mirroring the worker-job idempotency model.

### Data model deltas
```
connectors        (exists) — Notion/Obsidian configs become active
connector_rules   id, user, match_json, connector (ref), order, enabled
connector_items   connector, article, remote_id, synced_at, sync_status   (per-user)
```

### Testing
- Notion API + OAuth: network mocked; mapping verified against fixtures.
- Obsidian output: byte-stable Markdown + frontmatter against golden files.
- Routing matcher: pure unit tests across match permutations.
- Idempotent upsert: second run produces no duplicate / correct update.
- Tenant isolation on `connector_rules` and `connector_items`.

### Risks
- Notion API shape drift — isolate behind the connector interface and Zod-parse all
  responses.
- Secrets (OAuth tokens) stored encrypted, used server-side only, never shipped to
  the browser.

---

## 6. Phase 10 — Research & Citations

Serve people who read in order to produce something: essays, papers, reports, notes.

### Features
- **Projects.** `projects` collection — goal-scoped reading lists, distinct from
  `collections` (collections organize; projects target an output). `project_items`
  links articles into a project with order.
- **Evidence / quotes.** Promote a highlight into project-scoped evidence with a
  backlink to its source article and locator. Reuses existing highlight anchoring.
- **Citation export.** Pure formatters produce BibTeX and CSL JSON from `content`
  metadata (title, author, site, date, url). Deterministic; tested against fixtures.
- **Notes from highlights.** Generate a structured Markdown note from a project's
  highlights via the existing `AIProvider` seam (network mocked in tests).

### Data model deltas
```
projects        id, user, name, slug, goal, created          (per-user)
project_items   project, article, order                       (per-user)
evidence        id, user, project, highlight (ref), article (ref),
                quote, note, created                           (per-user)
```

### Testing
- BibTeX / CSL JSON formatters: golden-file unit tests, including edge cases
  (missing author, no date).
- Evidence backlink integrity: highlight → article → project resolves.
- Notes-from-highlights: AI seam mocked; output shape validated.
- Tenant isolation on `projects`, `project_items`, `evidence`.

### Risks
- Citation correctness matters to this audience; treat formatters as a well-tested
  pure unit with broad fixture coverage.

---

## 7. Phase 11 — Extraction Transparency

Make extraction visible, inspectable, and repairable instead of a black box.

### Features
- **Confidence + candidates.** The worker records an extraction confidence score and
  any alternate extraction candidates on the content row.
- **Preview before save.** Opt-in capture mode that surfaces extracted
  title/author/date/body for confirmation before the article is committed.
- **Side-by-side view.** Source vs reader view for comparison.
- **Repair.** Remove junk sections and re-fetch / re-parse on demand, reusing the
  existing worker job path (`type=extract` re-run).
- **Extraction history.** New `extractions` collection holding versions per content,
  so a re-parse is non-destructive and prior versions remain inspectable.

### Data model deltas
```
content         + confidence (number, nullable)
                + candidates_json (nullable)

extractions     id, content (ref), version, html, text, meta_json,
                confidence, created                            (worker-written)
```

### Testing
- Confidence + candidates: extractor unit tests assert recorded values on fixtures.
- Re-parse: integration test shows a new `extractions` version, original retained.
- Preview flow: capture without commit leaves no `articles` row until confirmed.
- Respect the global-cache guardrails: gated/private extractions stay per-user.

### Risks
- Confidence is heuristic; surface it as guidance, not a hard gate.
- History growth — version rows are content-scoped and pruneable later.

---

## 8. Phase 12 — Local-First / File Sync

Make the user's library files they own, synced through their own storage, readable
offline.

### Features
- **Folder-as-storage sync.** Deterministic slugs + stable filenames + frontmatter
  (builds directly on Phase 9's Obsidian/Markdown output) so the same article always
  maps to the same file. App state ↔ folder kept in sync.
- **Sync targets.** A `SyncTarget` interface (read/write/list a folder) with
  implementations for Dropbox / iCloud / Git / Nextcloud, injected and mocked in
  tests. New target = implement the interface, nothing else.
- **Offline reading.** Content cached client-side so the reader works without
  network.
- **No lock-in.** Export is the identity, not a migration: the folder is a complete,
  portable copy of the library.

### Data model deltas
```
sync_targets    id, user, type (dropbox|icloud|git|nextcloud|folder),
                config_json, enabled, last_sync, sync_status    (per-user)
```
(File contents live in the user's folder, not new PB tables.)

### Testing
- Slug/filename determinism: same article → same path, stable across re-export.
- Sync diffing: pure function over (local set, remote set) → actions; unit-tested.
- `SyncTarget` implementations: mocked I/O; no live cloud calls in tests.
- Offline reader: cached content renders with network disabled.
- Tenant isolation on `sync_targets`; encrypted credentials, server-side only.

### Risks
- Two-way sync conflict handling — start with app-authoritative writes; define a
  clear conflict rule before enabling bidirectional edits.
- Credential security for cloud targets — encrypted at rest, used server-side only.

---

## 9. Sequencing & Dependencies

```
Phase 8  Reading Inbox          (independent; builds on existing library/reader)
Phase 9  Live Connectors        (builds on existing connector seam + markdown export)
Phase 10 Research & Citations   (builds on highlights + AI seam; independent of 9)
Phase 11 Extraction Transparency(builds on worker extract path)
Phase 12 Local-First / File Sync(builds on Phase 9 markdown/frontmatter output)
```

- Phase 12 depends on Phase 9's Markdown/frontmatter output quality.
- Phases 8, 10, 11 are largely independent and could be reordered if priorities
  shift, but the committed order is 8 → 9 → 10 → 11 → 12.
- Each phase gets its own spec + plan in its own future run before implementation.

## 10. Open Risks (roadmap-level)

- **Status-set expansion (Phase 8)** ripples across many UI surfaces — drive
  everything from the single union to contain it.
- **Third-party API drift (Phase 9)** — isolate behind interfaces, Zod-parse all
  responses.
- **Citation correctness (Phase 10)** — broad fixture coverage on pure formatters.
- **Sync conflicts (Phase 12)** — app-authoritative first; bidirectional later
  behind a defined conflict rule.
