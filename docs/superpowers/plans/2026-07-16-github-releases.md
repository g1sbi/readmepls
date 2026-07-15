# GitHub Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up automated GitHub Releases via release-please, chained into the existing container build.

**Architecture:** release-please watches Conventional Commits on `main` and maintains a Release PR (version bump + `CHANGELOG.md`). Merging it creates a `vX.Y.Z` tag + GitHub Release. release-please authenticates with a PAT so the tag it pushes triggers the existing `docker-publish.yml`. Single unified version, `simple` release type (no npm publish), bootstrapped at `v0.1.0` via a manual tag.

**Tech Stack:** GitHub Actions, `googleapis/release-please-action@v4`, existing `docker-publish.yml`.

## Global Constraints

- Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:` (repo mandate).
- Never commit secrets — the PAT lives only as a repo secret, never in files.
- Tag format must be `vX.Y.Z` (bare `v` prefix) to match `docker-publish.yml`'s `tags: ["v*"]` trigger.
- Single unified version across the whole repo; root `package.json` stays versionless.

---

### Task 1: release-please configuration + workflow

**Files:**
- Create: `release-please-config.json`
- Create: `.release-please-manifest.json`
- Create: `.github/workflows/release-please.yml`

**Interfaces:**
- Consumes: `secrets.RELEASE_PLEASE_TOKEN` (fine-grained PAT, Contents + Pull requests read/write) — created manually in repo settings, see Task 2 step 0.
- Produces: on merge of a Release PR, a `vX.Y.Z` git tag that triggers `docker-publish.yml` (unchanged).

- [ ] **Step 1: Create the manifest** seeded at the current pre-release version

`.release-please-manifest.json`:
```json
{
  ".": "0.1.0"
}
```

- [ ] **Step 2: Create the config**

`release-please-config.json`:
```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "simple",
  "include-component-in-tag": false,
  "packages": {
    ".": {}
  }
}
```

`include-component-in-tag: false` yields a bare `vX.Y.Z` tag (no component prefix), matching the `v*` trigger.

- [ ] **Step 3: Create the workflow**

`.github/workflows/release-please.yml`:
```yaml
name: release-please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.RELEASE_PLEASE_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

- [ ] **Step 4: Validate the config files parse**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('release-please-config.json','utf8')); JSON.parse(require('fs').readFileSync('.release-please-manifest.json','utf8')); console.log('json ok')"
```
Expected: `json ok`

- [ ] **Step 5: Validate the workflow YAML parses**

Run:
```bash
node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/release-please.yml','utf8');if(!/googleapis\/release-please-action@v4/.test(s)||!/branches: \[main\]/.test(s))throw new Error('workflow content missing');console.log('yaml ok')"
```
Expected: `yaml ok`

(If `js-yaml` or `yq` is available, prefer a real parse; the grep check above is the dependency-free floor.)

- [ ] **Step 6: Commit**

```bash
git add release-please-config.json .release-please-manifest.json .github/workflows/release-please.yml
git commit -m "ci: add release-please for automated github releases"
```

---

### Task 2: Bootstrap the prod baseline (manual, one-time)

This task is operational, not code. It runs **after Task 1 lands on `main`**. There is nothing to unit-test; verification is observing GitHub behavior.

**Files:** none (repo-settings + git operations).

**Interfaces:**
- Consumes: the merged Task 1 config on `main`.
- Produces: the `RELEASE_PLEASE_TOKEN` secret and the `v0.1.0` baseline tag.

- [ ] **Step 0: Create the PAT and store it as a secret**

  - GitHub → Settings → Developer settings → Fine-grained tokens → generate a token scoped to the `readmepls` repo with **Contents: read/write** and **Pull requests: read/write**.
  - Repo → Settings → Secrets and variables → Actions → New repository secret named `RELEASE_PLEASE_TOKEN` with the token value.

  (User runs this — the assistant cannot create secrets. Suggest running any needed CLI via `! <command>`.)

- [ ] **Step 1: Merge Task 1 to `main`**

  Land the `ci: add release-please` commit on `main` (via your normal branch → squash-merge flow — see CLAUDE.md working agreements).

- [ ] **Step 2: Tag the current prod state**

```bash
git checkout main
git pull
git tag v0.1.0
git push origin v0.1.0
```
Expected: the `docker-publish` workflow starts (Actions tab), building/pushing the four images tagged `v0.1.0` + `latest`. This marks the honest prod baseline.

- [ ] **Step 3: Verify the chain end-to-end on the next real change**

  On the next Conventional commit merged to `main`:
  - Confirm release-please opens a **Release PR** with a version bump (`fix:` → `0.1.1`, `feat:` → `0.2.0`) and a `CHANGELOG.md` entry starting from `v0.1.0`.
  - Merge the Release PR.
  - Confirm a new tag + **GitHub Release** appear, and that the tag push (authored by the PAT) triggers `docker-publish.yml`.

  If the Release PR's tag does **not** trigger `docker-publish`, the PAT is missing/misscoped — recheck Step 0 (default `GITHUB_TOKEN` will not trigger downstream workflows).

---

## Notes

- `docker-publish.yml` is intentionally untouched — it already reacts to `v*` tags.
- No npm publish, no per-package versions (see spec "Out of scope").
- Promotion to `1.0.0` is a later deliberate decision, not part of this plan.
