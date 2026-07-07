# UI Library Refactor — Effort Analysis Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a concrete, per-component effort analysis for migrating the hand-rolled `ui/` primitives to shadcn-svelte, sized well enough to decide migration order and strategy.

**Architecture:** This is an *investigation* plan, not a code plan — it produces one markdown deliverable, `docs/superpowers/specs/2026-07-07-ui-library-refactor-effort.md`, built up section by section. Each task runs concrete data-gathering commands against the repo and records findings. There is no TDD cycle; each task's verification is "the section is complete, backed by real repo data, with no TBDs." No production code changes.

**Tech Stack:** SvelteKit 5, `bits-ui` (already adopted), `tokens.css` CSS-variable theming, Vitest. Target library: shadcn-svelte (copy-in, `bits-ui`-based).

## Global Constraints

- **No code changes.** This plan produces analysis only. Do not install shadcn-svelte, do not touch any `.svelte` file.
- **Real data only.** Every table cell comes from a command run against the repo (paths, LOC, test files, import counts) or from the shadcn-svelte docs — no estimates presented as facts.
- **Deliverable path:** `docs/superpowers/specs/2026-07-07-ui-library-refactor-effort.md`.
- **Source of visual truth:** `assets/_banner.html` — warm-paper / ink `#211E17` / terracotta `#C24A38` / Fredoka. Components carrying this identity are migration risks, not gimmes.
- **Semantic tokens to map onto** (from `apps/web/src/lib/styles/tokens.css`): `--color-bg`, `--color-surface`, `--color-surface-sunken`, `--color-surface-raised`, `--color-text`, `--color-text-muted`, `--color-text-subtle`, `--color-text-on-accent`, `--color-accent`, `--color-accent-hover`, `--color-accent-wash`, `--color-border`, `--color-border-strong`, `--color-ring`, `--color-selection`, `--color-success|warning|danger|info`, `--radius-*`, `--shadow-*`, `--space-*`. Three themes exist: default, dark (`[data-theme]` remaps), sepia.

---

## File Structure

- **Create:** `docs/superpowers/specs/2026-07-07-ui-library-refactor-effort.md` — the effort-analysis deliverable. One file, built up across the three tasks below. Sections: (1) Component inventory, (2) Per-component migration table, (3) Synthesis & recommendation.

The `ui/` components under analysis (from `apps/web/src/lib/components/ui/`):
`Button`, `Card`, `CardGrid`, `Chip`, `ConfirmDialog`, `DropdownMenu`, `Input`, `MenuItem`, `PaperCorner`, `Rail`, `Sheet`, `Skeleton`, `SourcePill`, `Spinner`, `Tag`.

---

### Task 1: Component inventory + blast radius

**Files:**
- Create: `docs/superpowers/specs/2026-07-07-ui-library-refactor-effort.md`

**Interfaces:**
- Produces: the "## 1. Component inventory" section — one row per `ui/*.svelte` with columns `Component | LOC | Purpose (1 line) | Test file | # import sites`. Task 2 keys its rows off the same component names.

- [ ] **Step 1: Gather LOC per component**

Run:
```bash
wc -l apps/web/src/lib/components/ui/*.svelte
```
Record the line count for each `.svelte` file.

- [ ] **Step 2: Map each component to its test file**

Run:
```bash
ls apps/web/src/lib/components/ui/*.test.ts
```
Note that naming is inconsistent (PascalCase `DropdownMenu.test.ts` vs kebab `confirm-dialog.test.ts`), and `primitives.test.ts` covers the un-suffixed primitives (Button, Card, etc.). For each component record its test file, or "covered by primitives.test.ts", or "none".

- [ ] **Step 3: Count import sites (blast radius) per component**

For each component, run (example for Button):
```bash
grep -rl "components/ui/Button" apps/web/src --include=*.svelte --include=*.ts | grep -v "/ui/" | wc -l
```
Repeat for each component name. This is how many feature files break if the component's public props change. Record the count.

- [ ] **Step 4: Read each component's props to record its one-line purpose + public API surface**

Run:
```bash
grep -A20 "\$props()" apps/web/src/lib/components/ui/*.svelte
```
For each component, write a one-line purpose and note its prop surface (e.g. Button: `variant: "default"|"accent"`). This is the contract a shadcn-svelte equivalent must preserve.

- [ ] **Step 5: Write the inventory section**

Create the deliverable file with a title, a one-paragraph intro pointing back to the design spec `docs/superpowers/specs/2026-07-07-ui-library-refactor-design.md`, and the "## 1. Component inventory" table populated from steps 1–4.

- [ ] **Step 6: Verify the section**

Confirm every one of the 15 components has a row, every cell is filled from a command output (no blanks, no "TBD"), and import counts are integers. Re-run any command whose output you're unsure of.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-07-07-ui-library-refactor-effort.md
git commit -m "docs: add UI refactor effort analysis — component inventory"
```

---

### Task 2: Per-component migration mapping

**Files:**
- Modify: `docs/superpowers/specs/2026-07-07-ui-library-refactor-effort.md`

**Interfaces:**
- Consumes: the component list + import counts from Task 1.
- Produces: the "## 2. Migration mapping" section — one row per component with columns `Component | shadcn-svelte equivalent | Retheme notes | Test to port | Visual-identity risk | Size (S/M/L)`.

- [ ] **Step 1: Pull the shadcn-svelte component catalog**

Fetch the current shadcn-svelte component list (docs site / registry). For each `ui/` component decide: a named shadcn-svelte equivalent (e.g. Button→`button`, DropdownMenu→`dropdown-menu`, Sheet→`sheet`/`dialog`, Input→`input`, Skeleton→`skeleton`), or **"no equivalent — keep bespoke"** for app-specific motif components (candidates: `PaperCorner`, `SourcePill`, `Chip`/`Tag` if they encode the paper aesthetic, `CardGrid` if it's just a layout wrapper). Justify each "keep bespoke" in one line.

- [ ] **Step 2: Assess retheme cost per mapped component**

shadcn-svelte components ship styled via their own CSS variables (`--background`, `--foreground`, `--primary`, `--ring`, `--radius`, etc.). For each mapped component, note which of those vars must be remapped to the semantic tokens listed in Global Constraints, and whether the default/dark/sepia themes are all covered by the remap (they should be, since remapping happens once at the `:root` level — confirm this rather than assuming). Flag any component using a shadcn var with no clean token counterpart.

- [ ] **Step 3: Record the test-porting cost per component**

Using Task 1's test-file column: for each component note whether its existing Vitest test asserts on markup/structure that a shadcn-svelte swap would change (needs a rewrite) or on behavior/props (likely survives). Read the test where unsure:
```bash
cat apps/web/src/lib/components/ui/sheet.test.ts
```
Record "port as-is", "rewrite selectors", or "no test — add smoke test".

- [ ] **Step 4: Flag visual-identity risk per component**

For each component, mark risk against `assets/_banner.html` identity: **Low** (generic control, shadcn default fine after retheme), **Med** (needs custom CSS on top of shadcn to match), **High** (carries a bespoke motif — dog-ear, grain, terracotta wordmark — swapping loses identity; recommend keep-bespoke). Cross-check against the "keep bespoke" calls from Step 1 for consistency.

- [ ] **Step 5: Assign a size bucket per component**

Combine retheme + test-port + risk + import count into S / M / L:
- **S:** direct equivalent, remap-only, test ports as-is, low blast radius.
- **M:** equivalent exists but needs extra CSS or test rewrite, or higher blast radius.
- **L:** no equivalent / high visual risk / large blast radius / behavior differences.

- [ ] **Step 6: Write the mapping section and verify**

Append "## 2. Migration mapping" with the full table. Verify every component from Task 1 appears, every "keep bespoke" has a one-line reason, every size bucket is justified by its row, and there are no TBDs.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-07-07-ui-library-refactor-effort.md
git commit -m "docs: add UI refactor effort analysis — per-component mapping"
```

---

### Task 3: Synthesis, order, and strategy

**Files:**
- Modify: `docs/superpowers/specs/2026-07-07-ui-library-refactor-effort.md`

**Interfaces:**
- Consumes: the sized mapping table from Task 2.
- Produces: the "## 3. Synthesis & recommendation" section — totals, a recommended migration order, and an incremental-vs-big-bang call. This is the section that unblocks writing an actual migration plan.

- [ ] **Step 1: Tally the effort buckets**

Count how many components fall in S / M / L, and how many are "keep bespoke" (zero migration cost, they stay). State the total surface honestly: e.g. "9 migrate, 6 stay bespoke; of the 9: 4S / 3M / 2L."

- [ ] **Step 2: Propose a migration order**

Order by de-risking: one S component first as the proof-of-concept (validates install + token remap + one theme sweep across default/dark/sepia), then the rest of the S bucket, then M, then L. Name the specific first component and say why it's the safest probe.

- [ ] **Step 3: Recommend incremental vs big-bang**

Given shadcn-svelte is copy-in (components coexist with the hand-rolled ones in the same repo, no version conflict), recommend incremental — old and new primitives live side by side, migrate one at a time behind the same import path, delete the hand-rolled file only once its replacement passes tests. State the one-time upfront cost (install CLI, seed the shared shadcn CSS-var block remapped to tokens once) that precedes the first component.

- [ ] **Step 4: Note open risks / unknowns**

List anything the analysis couldn't settle from repo data alone (e.g. shadcn-svelte version compatibility with the installed `bits-ui ^2.18`, whether Fredoka/IBM Plex font wiring needs changes). These are inputs the future migration plan must resolve, not blockers to it.

- [ ] **Step 5: Write the synthesis section and verify**

Append "## 3. Synthesis & recommendation". Verify the tallies match the Task 2 table row-for-row, the migration order names concrete components, and the strategy recommendation is a single clear call with its upfront cost stated.

- [ ] **Step 6: Final read-through**

Read the whole deliverable top to bottom. Confirm: no TBDs, every table row traces to a command output, Section 3 tallies reconcile with Section 2, and a reader could hand this to someone writing the migration plan without further questions.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-07-07-ui-library-refactor-effort.md
git commit -m "docs: add UI refactor effort analysis — synthesis and migration order"
```

---

## Self-Review

- **Spec coverage:** The design spec's "Shape of the follow-up effort analysis" bullets map to tasks: per-component equivalent/keep-bespoke → Task 2 Step 1; retheme var mapping → Task 2 Step 2; Vitest coverage to port → Task 2 Step 3; visual-identity risk flags → Task 2 Step 4. The spec's deferred "migration order" and "incremental vs big-bang" → Task 3. Covered.
- **No placeholders:** Every step names an exact command or exact section output. No "add appropriate…".
- **Consistency:** Component name list is identical in File Structure, Task 1, and keyed by Task 2/3. Deliverable path is the same string in every task and Global Constraints.
