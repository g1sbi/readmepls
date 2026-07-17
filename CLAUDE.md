# CLAUDE.md

Project guidance for working in this repo. Read before making changes.

## What this is

Reader-first bookmark + article app. Paste a link → extract readable content →
AI auto-tag → read with highlights, search, collections. Hosted SaaS + self-hostable.

Design spec: `docs/superpowers/specs/2026-06-21-reader-app-design.md` — read it
before implementing a feature.

## Commands

- Install: `pnpm install`
- Test: `pnpm test` (whole workspace) · watch mode: `pnpm test:watch` · subset:
  `pnpm exec vitest run <pattern>`. **`pnpm --filter <pkg> test` does NOT work here**
  — it's a single vitest workspace, not per-package test scripts.
- Typecheck: `pnpm typecheck` · Lint: `pnpm lint`
- Web dev server: `pnpm --filter @readmepls/web dev`
- Worker (build + run): `pnpm --filter @readmepls/worker build && pnpm --filter @readmepls/worker start`
- PocketBase locally: `pocketbase/pocketbase serve --http=127.0.0.1:8090 --migrationsDir=pocketbase/pb_migrations --hooksDir=pocketbase/pb_hooks`
- Full stack via Docker: `cp .env.example .env` then `docker compose up -d`
  (pulls published images; see README.md for self-host setup). To build from
  source instead: `docker compose -f compose.yml -f compose.dev.yml up -d --build`.

## Roadmap (phases)

Each phase gets its own spec + plan in `docs/superpowers/`, deleted once shipped
(see Working agreements). Build in order.

- **Phase 1** — Core capture loop (backend: canonicalize → dedupe → extract →
  AI-tag → store). **Done.**
- **Phase 2** — Reader shell + typography (auth, library, reader, prefs) +
  Phase-1 gap closures. **Done.** Structural only — no visual design.
- **Phase 3** — Frontend design language & visual polish (landing page, motifs,
  themes, animations, polish). **Done.** Uses `frontend-design`.
- **Phase 4** — Highlights/notes, full-text search, tags/collections UI. **Done.**
- **Phase 5** — X/Twitter + YouTube extractors, paywall fallback. **Done.**
- **Phase 6** — Connector seam + Markdown export; Notion/Obsidian stubs. **Done.**
- **Phase 7** — Docker Compose deploy, self-host packaging. **Done.**
- **Phase 8** — SaaS tier-gating & entitlements. **Done.**

Beyond the numbered roadmap, further iteration has shipped on top of these
phases (mobile chrome, reading progress, faceted library filters, first-class
sources, UI-polish passes). This list isn't kept item-by-item current — check
`git log` for what's actually landed.

Keep concerns unmixed: structure/behavior phases do not do visual design, and the
design phase does not add features.

## Design language

- **Source of truth:** `assets/_banner.html` — palette (warm paper tones, ink
  `#211E17`, terracotta accent `#C24A38`), Fredoka display font, paper/dog-ear/grain
  motifs, lowercase playful voice.
- **Tokens live in one file** (`apps/web/src/lib/styles/tokens.css`): colors, fonts,
  radii, shadows. **Never hardcode a color or font name in a component** — reference
  a token. This keeps the design phase able to retheme without touching components.
- **shadcn ↔ tokens bridge** (`apps/web/src/lib/styles/shadcn-bridge.css`): maps
  shadcn alias vars (`--primary`, `--secondary`, …) **onto** `tokens.css` `--color-*`
  once in `:root` — never a second palette. Dark is `@custom-variant dark
  ([data-theme="dark"] &)`, NOT shadcn's `.dark`. **Preflight is deliberately
  excluded** (layered `@import "tailwindcss/theme.css"` + `utilities.css`, no
  `preflight.css`) — `app.css` owns the reset, and preflight would strip the
  reader's un-scoped `{@html}` article prose. Do not switch to a bare
  `@import "tailwindcss"`.
- **Reusable components.** Shared UI primitives in `$lib/components/ui/`; feature
  components compose them. No duplicated markup or CSS. This mixes generated
  shadcn-svelte components (e.g. `ui/badge/`) with surviving hand-rolled ones —
  migration is incremental, so both coexist. `cn()` (`$lib/utils`) merges classes.
- **shadcn-svelte for new UI.** New UI primitives use shadcn-svelte components —
  add them with the CLI (`pnpm dlx shadcn-svelte@latest add <name>`), don't
  hand-roll a new one when shadcn-svelte ships an equivalent, and don't import
  `bits-ui` primitives directly into a feature component. Compose the generated
  primitives (`ui/button/`, `ui/badge/`, `ui/dialog/`, …) into feature components.
  Prefer an installed shadcn-svelte primitive over a hand-rolled `.svelte` when
  both exist. Existing hand-rolled exceptions (`Sheet.svelte`, `ConfirmDialog.svelte`)
  predate this convention and are grandfathered, not a pattern to copy for new work.
- **Mobile-first, always responsive.** This is a reader app — most reading happens
  on phones. Design and build for the smallest viewport first, then enhance upward.
  Every component must be usable and uncluttered at 360px wide: no horizontal
  overflow, tap targets ≥44px, no layout that only works on desktop. Responsiveness
  is **not** deferred to the design phase — it is a structural requirement in every
  phase. Use fluid layouts and token-driven breakpoints, never fixed pixel widths
  that assume a desktop.

## Stack

- **Frontend:** SvelteKit (reader UI + thin server/BFF routes), Tailwind v4 +
  shadcn-svelte, bridged onto `tokens.css` (see Design language).
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
- **Keep plan checkboxes current; delete finished plans.** When executing a plan
  in `docs/superpowers/plans/`, check off each `- [ ]` task as it completes —
  don't leave a shipped plan with boxes unchecked. Once a plan is fully
  implemented and merged, delete it and its paired spec in
  `docs/superpowers/specs/`. Leave in place: living reference docs (the design
  spec, the design-system doc) and plans that are explicitly parked or not yet
  started.
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
- **Workspace packages ship TS source, not built JS.** `@readmepls/core` and
  `@readmepls/types` have `main: src/index.ts` and no build step — dev/test rely on
  vite/tsc transforming them. So any bare-Node entrypoint that imports them must
  **bundle** (Node 22 refuses to type-strip files under `node_modules`, crash-looping
  otherwise). The worker bundles `main.ts` with esbuild — inlining workspace deps,
  externalizing npm deps. Do not repoint `core`/`types` `main` at `dist`; it breaks
  the edit-src/run-test loop the whole repo relies on.
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
