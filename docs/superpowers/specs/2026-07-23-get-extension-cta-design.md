# "Get the extension!" CTA + install detection — design

Date: 2026-07-23

## Summary

The Chrome Web Store extension ("readmepls — save to library") is now published.
Add a **"get the extension!"** button to the web app's desktop chrome that opens a
small dialog explaining the extension lets you save any page to your library in one
click without opening the app, with a call-to-action linking to the store listing.

The button **hides itself once the extension is installed**. Because a web page has
no browser API to detect an installed extension, the extension is updated to announce
itself: a content script stamps a marker on the app's pages, and the web app reads
that marker.

Store listing:
`https://chromewebstore.google.com/detail/cjnlkadkjleamnkjehbnblnblcappaje`

## Goals

- Desktop-only "get the extension!" button in the `TopBar` right cluster.
- A small explanatory dialog with a CTA to the Chrome Web Store.
- The button disappears once the extension is detected as installed.
- Detection works on the hosted SaaS **and** on self-hosted instances.

## Non-goals

- No button on mobile. The Chrome Web Store extension only installs on desktop
  Chrome (Chrome on iOS/Android don't support these extensions), so a mobile button
  can't lead to an install. The button lives in `TopBar`'s `.right` cluster, which is
  already `display:none` at ≤640px, so this falls out for free.
- No "dismiss and remember" state — the only reason the button hides is detected
  installation.
- No non-Chromium browser gating. The dialog simply names it a Chrome extension.
- No automated Web Store publish — republishing the updated extension is a manual step.

## Architecture

Two cooperating pieces:

1. **Web app** — renders the button + dialog, and reads an install marker to decide
   whether to show the button.
2. **Extension** — stamps that marker onto the app's pages via a content script
   (static match for the SaaS default domain; dynamically registered for a
   self-hosted `instanceUrl`).

### Detection handshake

- The extension's content script runs at `document_start` (isolated world) and:
  - sets `document.documentElement.dataset.readmeplsExtension = <manifest version>`
  - dispatches `window.dispatchEvent(new CustomEvent("readmepls:extension-ready",
    { detail: { version } }))`
- The web app determines `installed` two ways so timing can't bite:
  - on init, read `document.documentElement.dataset.readmeplsExtension` (present
    because the content script ran before app JS at `document_start`)
  - also `addEventListener("readmepls:extension-ready", …)` to catch late injection
    (e.g. a self-host content script registered after page load).

Existing installs only become detectable after users update to the new extension
version. Until then they still see the button — harmless.

## Web app

### `stores/extension.svelte.ts` (new)

Reactive detection state.

- `installed` — boolean reactive state.
- Init: set `installed = true` if
  `document.documentElement.dataset.readmeplsExtension` is present.
- Register `window.addEventListener("readmepls:extension-ready", () => installed =
  true)`.
- SSR-safe: guard on `typeof document !== "undefined"`.

### `GetExtensionButton.svelte` (new)

- Compact pill, lowercase label "get the extension!", small puzzle-piece icon
  (`@lucide/svelte`, e.g. `Puzzle`).
- All colors/fonts via `tokens.css`; matches the existing right-cluster control styling.
- Renders only when `!installed`.
- Click opens `GetExtensionDialog`.

### `GetExtensionDialog.svelte` (new)

- shadcn `Dialog` (`$lib/components/ui/dialog`), small and centered.
- Paper voice content:
  - heading (e.g. "save in one click")
  - one line: "save any page to your library in one click — no need to open the app"
  - 2–3 tiny bullets (e.g. "works on any page", "one click, no copy-paste",
    "your library, instantly")
  - primary CTA button linking to the store URL, `target="_blank"
    rel="noopener"`
  - "maybe later" closes the dialog

### `TopBar.svelte` (edit)

- Slot `GetExtensionButton` into the `.right` cluster (near the theme switch).
- No change needed for mobile — `.right` is already hidden at ≤640px.

## Extension

Manifest `version` bumps `0.1.0` → `0.2.0` (new feature). `package.json` is
currently `0.0.0` (never kept in sync) — set it to `0.2.0` to match the manifest.

### `src/content-marker.ts` (new)

- Pure `stampMarker(doc: Document, version: string): void` — sets the data attribute
  and dispatches the `readmepls:extension-ready` event.
- Thin chrome glue (entry) calls `stampMarker(document,
  chrome.runtime.getManifest().version)`.
- Built to `dist/` by `build.mjs`.

### `manifest.json` (edit)

- `version`: `0.2.0`.
- Add `content_scripts`:
  - `matches: ["https://app.readmepls.com/*"]`
  - `js: ["content-marker.js"]`
  - `run_at: "document_start"`
  - (isolated world — default)
- Add `"scripting"` to `permissions` (for dynamic registration).
- Keep `optional_host_permissions: ["*://*/*"]`.

Declared content-script matches are granted at install, so SaaS detection works
immediately with no permission prompt.

### Dynamic registration for self-host

For a non-default `instanceUrl`:

- On the options page's **save** action (a user gesture):
  - request the host permission for `<instanceUrl>/*` from
    `optional_host_permissions` via `chrome.permissions.request`
  - `chrome.scripting.registerContentScripts([...])` for `<instanceUrl>/*` running
    `content-marker.js` at `document_start`
- Re-register on startup; unregister/replace the previous registration when the URL
  changes.
- Pure helpers (URL → match pattern; register/unregister decision given current vs.
  new `instanceUrl`) are unit-tested; `chrome.*` calls are mocked.

### `build.mjs` (edit)

- Add `src/content-marker.ts` to the esbuild entry points so `content-marker.js`
  lands in `dist/`.

### `src/options.ts` (edit)

- On save: request permission + (re)register the dynamic content script for the
  configured `instanceUrl`.

## Testing (TDD)

Write failing tests first, then implementation.

**Web (`@readmepls/web`, vitest):**
- Detection store: reads the `data-readmepls-extension` attribute on init; flips
  `installed` on the `readmepls:extension-ready` event.
- `GetExtensionButton`: renders when not installed; absent when installed.
- `GetExtensionDialog`: renders copy; CTA href equals the store URL with
  `target="_blank" rel="noopener"`.

**Extension (vitest):**
- `stampMarker(doc, version)`: sets the attribute and dispatches the event against a
  fake document.
- Dynamic-registration helpers: URL → match-pattern; register/unregister decisions
  given current vs. new `instanceUrl` (chrome APIs mocked).

## Files

**Web**
- new: `apps/web/src/lib/stores/extension.svelte.ts` (+ test)
- new: `apps/web/src/lib/components/GetExtensionButton.svelte` (+ test)
- new: `apps/web/src/lib/components/GetExtensionDialog.svelte` (+ test)
- edit: `apps/web/src/lib/components/TopBar.svelte`

**Extension**
- new: `apps/extension/src/content-marker.ts` (+ test)
- new: dynamic-registration helper (+ test)
- edit: `apps/extension/manifest.json` (version, `content_scripts`, `scripting`)
- edit: `apps/extension/build.mjs` (build the content script)
- edit: `apps/extension/src/options.ts` (request permission + register on save)
- edit: `apps/extension/package.json` (version)

## Operational note

The updated extension (`0.2.0`) must be republished to the Chrome Web Store for
detection to take effect for real users.
