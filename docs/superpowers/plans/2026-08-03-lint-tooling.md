# Lint Tooling Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pnpm lint` work — it has never run in this repo — and stop the regression recurring.

**Architecture:** Land tooling config first (Prettier + ESLint, both scoped by matching ignore lists), then a single mechanical repo-wide reformat isolated in its own commit, then CI to hold the line. The 762-test suite is the safety net proving the reformat is purely textual.

**Tech Stack:** Prettier 3, ESLint 9 (flat config), typescript-eslint, eslint-plugin-svelte, pnpm 10 workspace, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-03-lint-tooling-design.md`

## Global Constraints

- Node 22 in CI (`.nvmrc` absent; local dev is on v26, CI pins 22 to match the worker's documented runtime). pnpm 10.
- PocketBase version is single-sourced from `pocketbase/Dockerfile` (`ARG PB_VERSION=0.39.4`). Never hardcode the number in a second place.
- Prettier formatting options stay at defaults (double quotes, semicolons, 2-space, 80 cols, trailing commas). The config exists to register the Svelte plugin, not to pick a style.
- ESLint stays at `recommended` tiers. No type-aware linting. No new `eslint-disable` comments to silence genuine findings — if violations are real, stop and report.
- `.prettierignore` and `eslint.config.js` `ignores` must agree on every path they *both* care about — build output, `pocketbase/pb_migrations/`, `pocketbase/pb_hooks/`, `.superpowers/`. Entries for file types ESLint never reads (`CHANGELOG.md`, `pnpm-lock.yaml`, `assets/_banner.html`) belong in `.prettierignore` only.
- Conventional Commits. The reformat commit is `style:` and contains nothing but formatting.

---

### Task 1: Prettier config + ignore, with Svelte coverage

Registers `prettier-plugin-svelte` so the 107 currently-invisible `.svelte` files get checked, and scopes Prettier to real source.

**Files:**
- Create: `.prettierrc`
- Create: `.prettierignore`
- Modify: `package.json` (devDependencies)

**Interfaces:**
- Consumes: nothing.
- Produces: `.prettierignore` path list, reused verbatim as `ignores` in Task 2's `eslint.config.js`.

- [x] **Step 1: Install the plugin**

```bash
pnpm add -Dw prettier-plugin-svelte
```

- [x] **Step 2: Verify Prettier currently cannot see Svelte files**

```bash
pnpm exec prettier --check apps/web/src/routes/+layout.svelte
```

Expected: `[error] No parser could be inferred`. This is the baseline bug — record it before fixing.

- [x] **Step 3: Create `.prettierrc`**

```json
{
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
}
```

- [x] **Step 4: Verify Svelte files are now parsed**

```bash
pnpm exec prettier --check apps/web/src/routes/+layout.svelte
```

Expected: no longer a parser error. It will report the file as needing formatting (`[warn]`) — that is success for this step; Task 3 fixes formatting.

- [x] **Step 5: Create `.prettierignore`**

```
node_modules/
dist/
.svelte-kit/
pnpm-lock.yaml

# release-please owns this file
CHANGELOG.md

# PocketBase's own JS dialect, not our style
pocketbase/pb_migrations/
pocketbase/pb_hooks/

# tooling scratch, not project source
.superpowers/

# design source of truth; reformatting churns the palette reference
assets/_banner.html
```

- [x] **Step 6: Confirm the ignore list took effect**

```bash
pnpm exec prettier --check . 2>&1 | grep -E 'pnpm-lock|CHANGELOG|pb_migrations|_banner' | head
```

Expected: no output. Those paths are now out of scope.

- [x] **Step 7: Commit**

```bash
git add .prettierrc .prettierignore package.json pnpm-lock.yaml
git commit -m "chore: add prettier config with svelte plugin and ignore list"
```

---

### Task 2: ESLint flat config

ESLint 9 currently refuses to run at all — no config file exists. This makes `eslint .` execute.

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (devDependencies)

**Interfaces:**
- Consumes: the ignore path list from Task 1's `.prettierignore`.
- Produces: a working `eslint .`; Task 5's CI job depends on `pnpm lint` exiting 0.

- [x] **Step 1: Verify the baseline failure**

```bash
pnpm exec eslint . 2>&1 | head -5
```

Expected: `ESLint couldn't find an eslint.config.(js|mjs|cjs) file.` Record this before fixing.

- [x] **Step 2: Install ESLint plugins**

```bash
pnpm add -Dw typescript-eslint eslint-plugin-svelte@3 eslint-config-prettier globals @eslint/js
```

`svelte-eslint-parser` arrives as a dependency of `eslint-plugin-svelte`; it does not need to be listed directly.

- [x] **Step 3: Create `eslint.config.js`**

Three details that are easy to get wrong, all verified against the eslint-plugin-svelte v3 docs:

1. v3 exports `svelte.configs.recommended`. The v2 name was `svelte.configs["flat/recommended"]` — that key does not exist in v3.
2. Use `defineConfig` from `eslint/config`; it flattens nested config arrays, so no spread operator is needed.
3. `parserOptions.projectService` is deliberately **omitted**. Enabling it turns on type-aware linting, which the spec rules out as a non-goal.

The docs also suggest passing `svelteConfig`. Skip it: this is a monorepo with two SvelteKit apps (`apps/web`, `apps/site`) each owning a separate `svelte.config.js`, and there is no single root config that could be correct for both.

`eslint-config-prettier` must stay last — it turns off stylistic rules that would otherwise fight Prettier.

```js
import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default defineConfig(
  {
    ignores: [
      "node_modules/",
      "dist/",
      "**/.svelte-kit/",
      "pocketbase/pb_migrations/",
      "pocketbase/pb_hooks/",
      ".superpowers/",
      "**/*.min.js",
    ],
  },
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        extraFileExtensions: [".svelte"],
      },
    },
  },
  prettier,
);
```

- [x] **Step 4: Run ESLint and triage**

```bash
pnpm exec eslint . 2>&1 | tail -30
```

Expected: it runs to completion. Some violations are likely.

**STOP CONDITION — this is a decision gate, not a step to push through.**
If violations are auto-fixable style leftovers, run `pnpm exec eslint . --fix`.
If they are *genuine* findings (unused vars, unsafe patterns, real bugs) across many files, **halt and report the list to the user**. Do not add `eslint-disable` comments and do not weaken rules to force a green run. The spec names this explicitly as a non-goal.

- [x] **Step 5: Confirm ESLint is clean**

```bash
pnpm exec eslint . && echo "ESLINT CLEAN"
```

Expected: `ESLINT CLEAN`.

- [x] **Step 6: Commit**

```bash
git add eslint.config.js package.json pnpm-lock.yaml
git commit -m "chore: add eslint flat config at recommended tier"
```

---

### Task 3: Repo-wide reformat

The only task touching application source. Mechanical, and gated by the full test suite.

**Files:**
- Modify: ~340 files across `apps/`, `packages/`, `docs/`, plus root Markdown.

**Interfaces:**
- Consumes: `.prettierrc` + `.prettierignore` from Task 1.
- Produces: the commit SHA that Task 4 records in `.git-blame-ignore-revs`.

- [ ] **Step 1: Record the pre-reformat test baseline**

```bash
pnpm test 2>&1 | tail -5
```

Expected: `Test Files 199 passed (199)`, `Tests 762 passed (762)`. Write these numbers down — Step 4 must match them exactly.

- [ ] **Step 2: Confirm the tree is clean**

```bash
git status --porcelain
```

Expected: empty. The reformat must be the only thing in this commit; a dirty tree would contaminate it.

- [ ] **Step 3: Run the reformat**

```bash
pnpm exec prettier --write .
```

- [ ] **Step 4: Verify tests still pass, identically**

```bash
pnpm test 2>&1 | tail -5
```

Expected: `199 passed (199)` and `762 passed (762)` — the same numbers as Step 1. Any deviation means the reformat changed behaviour: stop and investigate, do not commit.

- [ ] **Step 5: Verify typecheck still passes**

```bash
pnpm typecheck && echo "TYPECHECK CLEAN"
```

Expected: `TYPECHECK CLEAN`.

- [ ] **Step 6: Sanity-check the diff is formatting-only**

```bash
git diff --stat | tail -3
git diff --ignore-all-space --stat | tail -3
```

Expected: the first shows ~340 files changed. The second should be dramatically smaller — whitespace-insensitive diffing collapses most of it. Non-whitespace changes that survive deserve a look before committing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "style: format repo with prettier"
```

---

### Task 4: Preserve `git blame`

A 340-file reformat destroys blame attribution unless recorded.

**Files:**
- Create: `.git-blame-ignore-revs`
- Modify: `CLAUDE.md` (document the one-time local setup)

**Interfaces:**
- Consumes: the `style:` commit SHA from Task 3.

- [ ] **Step 1: Capture the reformat SHA and write the file**

```bash
REFORMAT_SHA=$(git log --format=%H --grep='^style: format repo with prettier' -1)
printf '# Repo-wide prettier reformat — see docs/superpowers/specs/2026-08-03-lint-tooling-design.md\n%s\n' "$REFORMAT_SHA" > .git-blame-ignore-revs
cat .git-blame-ignore-revs
```

Expected: a comment line plus one 40-character SHA.

- [ ] **Step 2: Configure git locally and verify blame is restored**

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
git blame -- packages/core/src/pb/test-harness.ts | head -3
```

Expected: authorship dates predating today, not the reformat commit.

- [ ] **Step 3: Document the one-time setup in CLAUDE.md**

Add to the Working agreements section:

```markdown
- **Blame ignores the reformat.** A one-time repo-wide prettier reformat would
  otherwise own every line. Run `git config blame.ignoreRevsFile
  .git-blame-ignore-revs` once per clone so `git blame` shows real authors.
```

- [ ] **Step 4: Commit**

```bash
git add .git-blame-ignore-revs CLAUDE.md
git commit -m "chore: ignore reformat commit in git blame"
```

---

### Task 5: CI workflow

No workflow currently runs lint, typecheck, or tests — the reason the missing configs went unnoticed for so long.

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `apps/web/package.json`, `apps/site/package.json` (add `prepare`)

**Interfaces:**
- Consumes: working `pnpm lint` from Tasks 1–3.

- [ ] **Step 1: Add `prepare` scripts so a fresh checkout can run tests**

Both apps' `tsconfig.json` extends `./.svelte-kit/tsconfig.json`, which only exists after `svelte-kit sync`. Without it all 84 web test files fail to collect.

In `apps/web/package.json` and `apps/site/package.json`, add to `"scripts"`:

```json
"prepare": "svelte-kit sync"
```

- [ ] **Step 2: Prove it fixes a cold checkout**

```bash
mv apps/web/.svelte-kit /tmp/sk-bak && mv apps/site/.svelte-kit /tmp/sk-site-bak
pnpm install
pnpm exec vitest run --project @readmepls/web 2>&1 | tail -4
```

Expected: 335 tests pass. Without the `prepare` script this reports `84 failed (84)` / `Tests no tests`.

If `.svelte-kit` did not regenerate, restore with `mv /tmp/sk-bak apps/web/.svelte-kit && mv /tmp/sk-site-bak apps/site/.svelte-kit` before continuing.

- [ ] **Step 3: Create `.github/workflows/ci.yml`**

PocketBase is required because `packages/core/src/pb/test-harness.ts` spawns a real binary from `pocketbase/pocketbase`, which is gitignored. The version is read from the Dockerfile so it stays single-sourced.

```yaml
name: ci

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      # Integration tests spawn a real PocketBase; the binary is gitignored.
      # Version comes from the Dockerfile so there is one source of truth.
      - name: Install PocketBase
        run: |
          PB_VERSION=$(grep -oP 'ARG PB_VERSION=\K[0-9.]+' pocketbase/Dockerfile)
          echo "Installing PocketBase $PB_VERSION"
          curl -sSL -o /tmp/pb.zip \
            "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip"
          unzip -o -q /tmp/pb.zip -d pocketbase/
          chmod +x pocketbase/pocketbase
          pocketbase/pocketbase --version

      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
```

- [ ] **Step 4: Verify the version-extraction command works**

The `grep -oP` is the one piece that silently yields an empty string if the Dockerfile changes shape, producing a confusing 404 later.

```bash
grep -oP 'ARG PB_VERSION=\K[0-9.]+' pocketbase/Dockerfile
```

Expected: `0.39.4`. If empty, fix the pattern before committing.

- [ ] **Step 5: Verify the full command chain locally**

```bash
pnpm lint && pnpm typecheck && pnpm test 2>&1 | tail -5
```

Expected: lint and typecheck silent, `199 passed (199)` / `762 passed (762)`.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml apps/web/package.json apps/site/package.json
git commit -m "ci: run lint, typecheck, and tests on push and pull request"
```

---

### Task 6: Delete the shipped spec and plan

Per CLAUDE.md working agreements, a fully implemented plan and its paired spec are deleted once merged.

**Files:**
- Delete: `docs/superpowers/specs/2026-08-03-lint-tooling-design.md`
- Delete: `docs/superpowers/plans/2026-08-03-lint-tooling.md`

- [ ] **Step 1: Confirm every checkbox in this plan is ticked**

```bash
grep -c '^- \[ \]' docs/superpowers/plans/2026-08-03-lint-tooling.md
```

Expected: `0`. Any remaining unticked box means the work is not done — go finish it.

- [ ] **Step 2: Final full verification**

```bash
pnpm lint && pnpm typecheck && pnpm test 2>&1 | tail -5
```

Expected: `199 passed (199)` / `762 passed (762)`, lint and typecheck silent.

- [ ] **Step 3: Delete and commit**

`.git-blame-ignore-revs` and the CLAUDE.md note reference the spec path; update that reference to point at the commit instead, since the file is going away.

```bash
sed -i 's|see docs/superpowers/specs/2026-08-03-lint-tooling-design.md|one-time repo-wide prettier reformat|' .git-blame-ignore-revs
git rm docs/superpowers/specs/2026-08-03-lint-tooling-design.md docs/superpowers/plans/2026-08-03-lint-tooling.md
git add .git-blame-ignore-revs
git commit -m "docs: remove shipped lint tooling plan and spec"
```

---

## Verification

The whole plan is done when:

- `pnpm lint` exits 0 (both halves — Prettier *and* ESLint)
- `pnpm typecheck` exits 0
- `pnpm test` reports 199 files / 762 tests passing, unchanged from before the reformat
- `pnpm exec prettier --check apps/web/src/routes/+layout.svelte` succeeds, proving Svelte coverage is real
- `git blame` on an untouched-by-hand file shows original authors, not the reformat commit
