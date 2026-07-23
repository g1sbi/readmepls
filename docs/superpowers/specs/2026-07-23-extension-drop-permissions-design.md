# Extension: drop `scripting` + host permissions — design

**Date:** 2026-07-23
**Status:** approved, ready for plan

## Problem

The v0.2 extension declares two permissions the Chrome Web Store flags for
justification on the Privacy-practices tab:

- `"scripting"`
- `optional_host_permissions: ["*://*/*"]` (broad host access)

Both exist for exactly **one** feature: dynamically registering the
`content-marker.js` content script on **self-hosted** instances, so the web app
can detect the extension and hide the "get the extension!" CTA there. Everything
else the extension does needs neither:

- The capture/auth flow (`/api/capture`, `/api/config`, PocketBase login) works
  over **CORS**. The server echoes allow-listed `chrome-extension://…` origins
  from `EXTENSION_ORIGINS` (`apps/web/src/lib/server/cors.ts`). Proof: the
  default SaaS origin `app.readmepls.com` is **not** in the extension's
  `host_permissions` at all, yet capture works.
- SaaS detection uses a **static** `content_scripts` entry for
  `https://app.readmepls.com/*`, which requires no host permission and no
  `scripting`.

So the broad host permission + `scripting` buy only the auto-hide of one button
on self-hosted instances — a poor trade for the review friction and scrutiny
that broad host access invites.

## Decision

Remove `scripting` and `optional_host_permissions` entirely by dropping the
self-hosted marker feature. Concretely:

- **SaaS:** detection stays via the permission-free static content script; the
  CTA hides when the extension is installed, as today.
- **Self-hosted:** the CTA is **never shown** (rather than showing a button that
  can never auto-hide). Self-hosters discover the extension through docs
  instead — a section in the site's `/docs` route and in the README, including
  the `EXTENSION_ORIGINS` step they need for capture to reach their instance.

Net permission result: the extension ships with only `activeTab` + `storage`.
Neither Privacy-practices justification is required anymore.

## Changes

### 1. Extension (`apps/extension`)

- `manifest.json`:
  - Remove `"scripting"` from `permissions` (leaving `["activeTab", "storage"]`).
  - Remove `optional_host_permissions`.
  - Remove the `background` service worker block — its only job was marker sync.
  - Keep the static `content_scripts` entry matching
    `https://app.readmepls.com/*` (`content-marker.js`, `run_at:
    document_start`).
  - Bump `version` `0.2.0` → `0.2.1` (patch), and match it in
    `apps/extension/package.json`. This hand bump is correct: release-please
    (`release-type: simple`, single root package, no `extra-files`) does not
    manage the extension's version files, so there is no conflict.
- Delete `src/background.ts`.
- Delete `src/marker-registration.ts` and `src/marker-registration.test.ts`.
- Simplify `src/content-marker.ts` / `src/marker.ts`: stamp only the
  `data-readmepls-extension` attribute on `<html>`. Drop the
  `readmepls:extension-ready` custom event and the version detail — nothing
  consumes them. `stampMarker` becomes a one-line attribute set; keep it a pure
  function taking `Document` so `marker.test.ts` stays a unit test.
- `src/options.ts`: trim — remove the `syncMarkerRegistration` import, the
  `chrome.permissions.request(...)` block, and the `syncMarkerRegistration(...)`
  call, keeping the `/api/config` fetch → `setConfig` → token-clear flow.
  Self-host capture/auth continue over CORS.
- `build.mjs`: remove `src/background.ts` from the esbuild `entryPoints`
  (deleting the file without this breaks the build).
- `src/popup.ts`, `src/config.ts`, `src/auth.ts`, `src/capture-client.ts`,
  `src/can-capture.ts`: unchanged.

### 2. Web app (`apps/web`)

- `src/lib/components/GetExtensionButton.svelte`: render only when
  `!$page.data.selfHosted && !extensionStore.installed`. `selfHosted` already
  flows to page data via `src/routes/+layout.server.ts`.
- `src/lib/extension/detect.ts`: reduce to the attribute check
  (`hasMarker(doc)`); remove `EXTENSION_READY_EVENT`.
- `src/lib/stores/extension.svelte.ts`: `initExtensionDetection()` reads the
  `document_start` marker only; drop the event-listener wiring (there is no more
  late/dynamic registration). Keep `resetExtensionDetection()` as the test seam.

### 3. Docs

- `apps/site/src/lib/site.ts`: add an `EXTENSION_URL` constant for the Chrome Web
  Store listing. The listing already exists — reuse the store URL hardcoded in
  the web app's `GetExtensionDialog.svelte`
  (`https://chromewebstore.google.com/detail/cjnlkadkjleamnkjehbnblnblcappaje`).
  (`site` and `web` are separate apps with no shared constants package, so this
  URL is duplicated across the app boundary, matching how other links like
  `GITHUB_URL` are handled.)
- `apps/site/src/routes/docs/+page.svelte`: add a "browser extension" `<section>`
  — one line on what it does, a link using `EXTENSION_URL`, and a note that
  self-hosters must add their extension origin to `EXTENSION_ORIGINS` in `.env`
  for capture to reach their instance. Match the page's existing lowercase voice
  and section markup.
- `README.md`: add a short "browser extension" section (near Self Hosting) with
  the same link and the `EXTENSION_ORIGINS` note.

## Testing (TDD)

Write the failing test first for each behavioral change.

- **Web — `GetExtensionButton.test.ts`:**
  - hidden when `selfHosted` is `true`, even if not installed;
  - shown when not self-hosted and not installed;
  - hidden when installed.
  (Provide `selfHosted` via the `$page` store the component reads.)
- **Web — `extension.svelte.test.ts`:** detection true when the marker attribute
  is present at init; false otherwise. Remove the event-driven case.
- **Web — `detect.test.ts`:** `hasMarker` true/false on the attribute; drop the
  event-constant assertion.
- **Extension — `marker.test.ts`:** `stampMarker(doc, …)` sets
  `data-readmepls-extension`; no event assertions. Delete
  `marker-registration.test.ts`.
- **Site — `docs/page.test.ts`:** the extension section and its link render.
- Unchanged/still-green: `can-capture`, `capture-client`, `config`, `auth`
  (extension); tier/CORS/hooks (web).

## Out of scope

- The `web_accessible_resources` probe alternative (would preserve self-hosted
  detection at the cost of a hardcoded extension ID and console noise) — rejected
  in favor of the simpler docs approach.
- Any change to the CORS mechanism or `EXTENSION_ORIGINS` handling itself.
- Publishing/store-submission steps (the store listing already exists;
  submitting the repermissioned build is a manual follow-up outside this plan).

## Verification

- `pnpm test` green across the workspace.
- `pnpm typecheck` and `pnpm lint` clean.
- `pnpm --filter @readmepls/extension build` (runs `build.mjs`) produces a
  `dist/` whose `manifest.json` lists only `activeTab` + `storage` and has no
  `optional_host_permissions`, no `background`.
