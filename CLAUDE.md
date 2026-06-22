# CLAUDE.md

Project guidance for working in this repo. Read before making changes.

## What this is

Reader-first bookmark + article app. Paste a link → extract readable content →
AI auto-tag → read with highlights, search, collections. Hosted SaaS + self-hostable.

Design spec: `docs/superpowers/specs/2026-06-21-reader-app-design.md` — read it
before implementing a feature.

## Roadmap (phases)

Each phase has its own spec + plan in `docs/superpowers/`. Build in order.

- **Phase 1** — Core capture loop (backend: canonicalize → dedupe → extract →
  AI-tag → store). **Done.**
- **Phase 2** — Reader shell + typography (auth, library, reader, prefs) +
  Phase-1 gap closures. **Structural only — no visual design.**
- **Phase 3** — Frontend design language & visual polish (landing page, motifs,
  themes, animations, polish). Dedicated phase; uses `frontend-design`.
- **Phase 4** — Highlights/notes, full-text search, tags/collections UI.
- **Phase 5** — X/Twitter + YouTube extractors, paywall fallback.
- **Phase 6** — Connector seam + Markdown export; Notion/Obsidian stubs.
- **Phase 7** — SaaS tier-gating UI, Docker Compose deploy, self-host packaging.

Keep concerns unmixed: structure/behavior phases do not do visual design, and the
design phase does not add features.

## Design language

- **Source of truth:** `assets/_banner.html` — palette (warm paper tones, ink
  `#211E17`, terracotta accent `#C24A38`), Fredoka display font, paper/dog-ear/grain
  motifs, lowercase playful voice.
- **Tokens live in one file** (`apps/web/src/lib/styles/tokens.css`): colors, fonts,
  radii, shadows. **Never hardcode a color or font name in a component** — reference
  a token. This keeps the design phase able to retheme without touching components.
- **Reusable components.** Shared UI primitives in `$lib/components/ui/`; feature
  components compose them. No duplicated markup or CSS.

## Stack

- **Frontend:** SvelteKit (reader UI + thin server/BFF routes).
- **Backend:** PocketBase (auth, SQLite data, files, realtime, API rules).
- **Worker:** Node/TypeScript service — extraction + AI, polls a PB `jobs` collection.
- **AI:** pluggable provider; default `claude-haiku-4-5`.

## Working agreements

- **TDD always.** Write a failing test first, then the implementation. No
  production code without a test that drove it. Use the
  `superpowers:test-driven-development` skill.
- **Verify before claiming done.** Run the relevant tests/commands and read the
  output before saying anything passes or is complete. Evidence before assertions.
- **Debug systematically.** On any bug or unexpected behavior, use
  `superpowers:systematic-debugging` before proposing a fix.
- **Small commits, Conventional Commits.** `feat:`, `fix:`, `docs:`, `test:`,
  `refactor:`, `chore:`. One logical change per commit.
- **Squash before merging.** A feature branch lands as squashed commits — one
  clean, logical Conventional Commit per change (no `wip`, `fix typo`, or
  review-fixup noise in history). Granular commits during development are fine;
  collapse them before merging to `main`.
- **Never push or open a PR unless asked.** Commit locally is fine; pushing is not.
- **Never commit secrets.** Keys live in env only; keep `.env.example` current.

## Code conventions

- **TypeScript strict.** No `any` without a written reason. Shared types live in a
  single `types` package consumed by both `web` and `worker`.
- **Validate at boundaries with Zod.** API input, extractor output, AI output, and
  data read back from PocketBase are all parsed/validated before use. Do not trust
  external shapes.
- **Model states as unions, not booleans.** e.g. `extract_status:
  'pending'|'ok'|'partial'|'failed'`. Graceful-degrade paths must be type-checked.
- **Pure core, thin IO shell.** Extraction, highlight anchoring, and URL
  canonicalization are pure functions, tested in isolation. Side effects (HTTP,
  PocketBase, AI calls) live at the edges behind interfaces.
- **Interface seams + dependency injection.** `Extractor` (per source),
  `AIProvider`, and `ConnectorPlugin` are interfaces; inject them so tests mock
  them. New source/provider/connector = implement the interface, nothing else.
- **Small, single-purpose files.** If a file is hard to hold in your head, split
  it. A growing file is a signal it does too much.
- **Comment the why, not the what.** Match surrounding style.

## Testing

- **Vitest** for `web` and `worker`.
- **Extractor tests use saved fixtures** (HTML, transcripts) — never live network.
  Deterministic and offline.
- **Mock the network** for AI provider tests.
- **Integration tests** run against an ephemeral PocketBase instance: capture →
  job → worker → PB write, cache HIT/MISS, quota gating, private-content isolation.
- **Tenant isolation has explicit tests** — a user must never read another user's
  articles/highlights/collections.
- **E2E (Playwright)** comes later for the reader flow.

## Security boundaries

- **PocketBase API rules are the security boundary.** Every per-user collection is
  scoped `user = @request.auth.id`. Never rely on the client to enforce access.
- **Worker jobs are idempotent** and safe to re-run; claim via `locked_at`/
  `locked_by`, reclaim stale locks.
- **Secrets stay server-side.** AI keys are used only in SvelteKit server routes
  and the worker — never shipped to the browser. BYO keys are stored encrypted.
- **Never globally cache gated content.** Paywalled/cookie/private extractions are
  per-user only; only public extractions go in the shared `content` table.

## PocketBase

- **Migrations are tracked in git.** Schema changes go through migration files, not
  manual admin-UI edits in shared environments.
- `content` is readable by authenticated users (public extractions only) and
  writable only by the worker's service credential.

## Safety reminders

- Confirm before destructive or irreversible actions.
- When something fails, say so with the output. Don't hide skipped steps or
  failing tests behind optimistic summaries.
