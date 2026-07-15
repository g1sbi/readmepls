# GitHub Releases — Design

Date: 2026-07-16
Status: Approved, ready for planning

## Goal

Now that readmepls is deployed to prod, establish repeatable GitHub Releases:
versioned tags, an auto-generated changelog, and a GitHub Release per version —
wired into the existing container build so images and releases move together.

## Decisions

- **Tool:** [release-please](https://github.com/googleapis/release-please)
  (`googleapis/release-please-action@v4`). Pairs with the repo's mandated
  Conventional Commits — changelog and version bumps come for free.
- **Versioning:** single unified version for the whole repo. The stack deploys
  as a unit and all four images move together, so one `vX.Y.Z` and one changelog.
- **Release type:** `simple` — no npm publish (private monorepo). Version lives
  in the release-please manifest; `CHANGELOG.md` is generated. Root
  `package.json` stays versionless (manifest is the source of truth).
- **Starting version:** `v0.1.0` — shipped but still pre-stable.
- **Bootstrap:** manually tag `v0.1.0` now to mark the current prod state, then
  let release-please take over for all subsequent releases.

## Flow

```
commit (Conventional) → push main
  → release-please opens/updates a "Release PR" (bumps version, writes CHANGELOG.md)
  → merge the Release PR
     → release-please creates tag vX.Y.Z + GitHub Release (notes = changelog)
     → tag push triggers existing docker-publish.yml
        → 4 images (pocketbase, web, worker, site) pushed to ghcr.io, tagged vX.Y.Z + latest
```

`docker-publish.yml` is unchanged. Releases and image builds chain through the
`v*` tag — release-please creates the tag, the existing workflow reacts to it.

## Files added

### `.github/workflows/release-please.yml`
- Trigger: `on: push: branches: [main]`.
- Permissions: `contents: write`, `pull-requests: write`.
- Single step: `googleapis/release-please-action@v4` reading the config +
  manifest below, authenticated with a **PAT** (`secrets.RELEASE_PLEASE_TOKEN`),
  not the default `GITHUB_TOKEN`.

**Why a PAT:** GitHub does not trigger further workflows from events created
with the default `GITHUB_TOKEN`. The tag release-please pushes must trigger
`docker-publish.yml`, so release-please authenticates with a fine-grained PAT
(`contents: write` + `pull-requests: write`) stored as the
`RELEASE_PLEASE_TOKEN` repo secret. Tags pushed under a PAT do trigger
downstream workflows.

### `release-please-config.json`
- `release-type: simple`
- single root component (`"."`)
- `include-component-in-tag: false` → tag format is `v0.1.0` (matches the
  existing `docker-publish.yml` `tags: ["v*"]` trigger)
- `tag-separator` / prefix left at defaults producing `vX.Y.Z`

### `.release-please-manifest.json`
- Seeded: `{ ".": "0.1.0" }`

## Bootstrap procedure (one-time, manual)

0. Create a fine-grained PAT (repo-scoped: Contents = read/write, Pull requests
   = read/write) and store it as the `RELEASE_PLEASE_TOKEN` repo secret.
1. Land the three files above on `main`.
2. Tag the current prod state:
   `git tag v0.1.0 && git push origin v0.1.0`
   - This also triggers `docker-publish.yml`, tagging the current images
     `v0.1.0` — an honest prod baseline. Expected and desired.
3. From the next Conventional commit onward, release-please proposes the next
   version (patch/minor) in a Release PR. Because a `v0.1.0` tag now exists, its
   changelog starts from that tag — no full-history sweep.

## Versioning behavior (0.x)

- `fix:` → patch (`0.1.1`)
- `feat:` → minor (`0.2.0`)
- `feat!:` / `BREAKING CHANGE:` → minor while in 0.x (major stays at 0 until we
  deliberately promote to 1.0.0)

## Verification

GitHub workflows aren't unit-testable; verify by exercise:

- `release-please-config.json` and `.release-please-manifest.json` parse as valid
  JSON; `release-please.yml` parses as valid YAML.
- After the config lands and a Conventional commit hits `main`, release-please
  opens a Release PR with a correct version bump and changelog entry.
- Merging the Release PR creates the tag and the GitHub Release.
- The tag push triggers `docker-publish.yml` and images publish under the new tag.

## Out of scope

- Per-package independent versioning.
- npm publishing of `@readmepls/*` packages.
- Promotion to 1.0.0 (a later, deliberate call).
- Changes to `docker-publish.yml`.
