# "Get the extension!" CTA + install detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desktop-only "get the extension!" button + explanatory dialog to the web app that links to the Chrome Web Store and hides itself once the extension is detected as installed.

**Architecture:** The extension announces itself by stamping a DOM marker (`data-readmepls-extension` on `<html>`) via a content script — statically matched for the SaaS domain, dynamically registered for a self-hosted `instanceUrl`. The web app reads that marker (and a `readmepls:extension-ready` event) through a small reactive store, and a `TopBar` button renders only when the marker is absent.

**Tech Stack:** SvelteKit + Svelte 5 runes, Tailwind v4 + shadcn-svelte (`ui/dialog`), Vitest + @testing-library/svelte (jsdom); extension is MV3 + esbuild, Vitest (node).

## Global Constraints

- **Extension version is `0.2.0`** — set in both `apps/extension/manifest.json` and `apps/extension/package.json`.
- **Store URL (exact):** `https://chromewebstore.google.com/detail/cjnlkadkjleamnkjehbnblnblcappaje`
- **CTA link attributes:** `target="_blank" rel="noopener"`.
- **Marker attribute:** `data-readmepls-extension` (dataset key `readmeplsExtension`), value = extension version string.
- **Ready event name (exact):** `readmepls:extension-ready`.
- **Desktop only:** the button lives in `TopBar.svelte`'s `.right` cluster (already `display:none` at ≤640px) — no separate mobile logic.
- **Design language:** all colors/fonts/radii/spacing reference `tokens.css` — never hardcode a color or font. Copy is lowercase, playful voice.
- **Dialog copy:** heading + one-liner + CTA + "maybe later" only — no bullet list.
- **shadcn-svelte for the dialog** (`$lib/components/ui/dialog`) — do not import `bits-ui` directly or hand-roll a modal.
- **TDD:** failing test first, then implementation, per every task below.
- **TypeScript strict, no `any`** without a written reason.

---

### Task 1: Extension — DOM marker stamp

**Files:**
- Create: `apps/extension/src/marker.ts`
- Create: `apps/extension/src/content-marker.ts` (content-script entry — bundled, not unit-tested)
- Test: `apps/extension/src/marker.test.ts`

**Interfaces:**
- Produces: `stampMarker(doc: Document, version: string): void`; `EXTENSION_READY_EVENT: "readmepls:extension-ready"`.

- [ ] **Step 1: Write the failing test**

`apps/extension/src/marker.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stampMarker, EXTENSION_READY_EVENT } from "./marker.js";

function fakeDoc() {
  const dispatched: Event[] = [];
  const doc = {
    documentElement: { dataset: {} as Record<string, string> },
    defaultView: { dispatchEvent: (e: Event) => (dispatched.push(e), true) },
  } as unknown as Document;
  return { doc, dispatched };
}

describe("stampMarker", () => {
  it("stamps the version on the document element", () => {
    const { doc } = fakeDoc();
    stampMarker(doc, "0.2.0");
    expect(doc.documentElement.dataset.readmeplsExtension).toBe("0.2.0");
  });

  it("fires a readmepls:extension-ready event on the window", () => {
    const { doc, dispatched } = fakeDoc();
    stampMarker(doc, "0.2.0");
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(EXTENSION_READY_EVENT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/extension/src/marker.test.ts`
Expected: FAIL — cannot resolve `./marker.js`.

- [ ] **Step 3: Write minimal implementation**

`apps/extension/src/marker.ts`:

```ts
/** DOM marker the web app reads to detect the installed extension. Stamped by
 *  the content script at document_start so it's present before app JS runs. */
export const EXTENSION_READY_EVENT = "readmepls:extension-ready";

export function stampMarker(doc: Document, version: string): void {
  doc.documentElement.dataset.readmeplsExtension = version;
  doc.defaultView?.dispatchEvent(
    new CustomEvent(EXTENSION_READY_EVENT, { detail: { version } }),
  );
}
```

`apps/extension/src/content-marker.ts` (entry — imports the pure fn, runs it):

```ts
import { stampMarker } from "./marker.js";

stampMarker(document, chrome.runtime.getManifest().version);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/extension/src/marker.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/marker.ts apps/extension/src/content-marker.ts apps/extension/src/marker.test.ts
git commit -m "feat(extension): add DOM marker stamp for install detection"
```

---

### Task 2: Extension — marker content-script registration

**Files:**
- Create: `apps/extension/src/marker-registration.ts`
- Test: `apps/extension/src/marker-registration.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_INSTANCE_URL` from `./config.js`.
- Produces:
  - `MARKER_ID: "readmepls-marker"`
  - `buildMarkerRegistration(instanceUrl: string): chrome.scripting.RegisteredContentScript | null`
  - `syncMarkerRegistration(scripting: ScriptingLike, permissions: PermissionsLike, instanceUrl: string): Promise<void>`
  - interfaces `ScriptingLike`, `PermissionsLike`.

- [ ] **Step 1: Write the failing test**

`apps/extension/src/marker-registration.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  buildMarkerRegistration,
  syncMarkerRegistration,
  MARKER_ID,
  type ScriptingLike,
  type PermissionsLike,
} from "./marker-registration.js";
import { DEFAULT_INSTANCE_URL } from "./config.js";

describe("buildMarkerRegistration", () => {
  it("returns null for the default SaaS instance (static script covers it)", () => {
    expect(buildMarkerRegistration(DEFAULT_INSTANCE_URL)).toBeNull();
  });

  it("returns null for an invalid url", () => {
    expect(buildMarkerRegistration("not a url")).toBeNull();
  });

  it("builds an origin-scoped registration for a custom instance", () => {
    expect(buildMarkerRegistration("https://read.example.com/app")).toEqual({
      id: MARKER_ID,
      matches: ["https://read.example.com/*"],
      js: ["content-marker.js"],
      runAt: "document_start",
    });
  });
});

function fakeScripting() {
  return {
    registerContentScripts: vi.fn(async () => {}),
    unregisterContentScripts: vi.fn(async () => {}),
  } satisfies ScriptingLike;
}

describe("syncMarkerRegistration", () => {
  it("registers for a custom instance when permission is granted", async () => {
    const scripting = fakeScripting();
    const permissions: PermissionsLike = { contains: vi.fn(async () => true) };
    await syncMarkerRegistration(scripting, permissions, "https://read.example.com");
    expect(scripting.unregisterContentScripts).toHaveBeenCalledWith({ ids: [MARKER_ID] });
    expect(scripting.registerContentScripts).toHaveBeenCalledWith([
      {
        id: MARKER_ID,
        matches: ["https://read.example.com/*"],
        js: ["content-marker.js"],
        runAt: "document_start",
      },
    ]);
  });

  it("skips registration when permission is not granted", async () => {
    const scripting = fakeScripting();
    const permissions: PermissionsLike = { contains: vi.fn(async () => false) };
    await syncMarkerRegistration(scripting, permissions, "https://read.example.com");
    expect(scripting.registerContentScripts).not.toHaveBeenCalled();
  });

  it("only clears (never registers) for the default instance", async () => {
    const scripting = fakeScripting();
    const permissions: PermissionsLike = { contains: vi.fn(async () => true) };
    await syncMarkerRegistration(scripting, permissions, DEFAULT_INSTANCE_URL);
    expect(scripting.unregisterContentScripts).toHaveBeenCalledWith({ ids: [MARKER_ID] });
    expect(scripting.registerContentScripts).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/extension/src/marker-registration.test.ts`
Expected: FAIL — cannot resolve `./marker-registration.js`.

- [ ] **Step 3: Write minimal implementation**

`apps/extension/src/marker-registration.ts`:

```ts
import { DEFAULT_INSTANCE_URL } from "./config.js";

export const MARKER_ID = "readmepls-marker";
const MARKER_JS = "content-marker.js";

export interface ScriptingLike {
  registerContentScripts(
    scripts: chrome.scripting.RegisteredContentScript[],
  ): Promise<void>;
  unregisterContentScripts(
    filter?: chrome.scripting.ContentScriptFilter,
  ): Promise<void>;
}

export interface PermissionsLike {
  contains(p: chrome.permissions.Permissions): Promise<boolean>;
}

/** Registration for a custom instance's origin, or null when it's the default
 *  SaaS origin (already covered by the static content_scripts entry). */
export function buildMarkerRegistration(
  instanceUrl: string,
): chrome.scripting.RegisteredContentScript | null {
  let origin: string;
  try {
    origin = new URL(instanceUrl).origin;
  } catch {
    return null;
  }
  if (origin === new URL(DEFAULT_INSTANCE_URL).origin) return null;
  return {
    id: MARKER_ID,
    matches: [`${origin}/*`],
    js: [MARKER_JS],
    runAt: "document_start",
  };
}

/** Idempotently (un)register the marker content script for a custom instance,
 *  but only when host permission for that origin is already granted. */
export async function syncMarkerRegistration(
  scripting: ScriptingLike,
  permissions: PermissionsLike,
  instanceUrl: string,
): Promise<void> {
  // Clearing first keeps re-registration idempotent across instanceUrl changes.
  await scripting.unregisterContentScripts({ ids: [MARKER_ID] }).catch(() => {});
  const reg = buildMarkerRegistration(instanceUrl);
  if (!reg) return;
  if (!(await permissions.contains({ origins: reg.matches }))) return;
  await scripting.registerContentScripts([reg]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/extension/src/marker-registration.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/marker-registration.ts apps/extension/src/marker-registration.test.ts
git commit -m "feat(extension): register marker content script per instance"
```

---

### Task 3: Extension — wire background + options + manifest + build

**Files:**
- Create: `apps/extension/src/background.ts` (service-worker entry)
- Modify: `apps/extension/src/options.ts` (sync registration after save)
- Modify: `apps/extension/manifest.json` (version, `scripting`, `content_scripts`, `background`)
- Modify: `apps/extension/build.mjs` (build the new entry points)
- Modify: `apps/extension/package.json` (version → `0.2.0`)

**Interfaces:**
- Consumes: `getConfig`, `StorageArea` from `./config.js`; `syncMarkerRegistration` from `./marker-registration.js`.

This task is bundling/manifest glue — verified by a successful build + the existing test suite, not a new unit test.

- [ ] **Step 1: Create the background service worker**

`apps/extension/src/background.ts`:

```ts
import { getConfig, type StorageArea } from "./config.js";
import { syncMarkerRegistration } from "./marker-registration.js";

const storage: StorageArea = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
};

// Re-sync the dynamic marker on install and browser startup so self-hosted
// instances (and users upgrading from 0.1.0) become detectable without action.
async function sync(): Promise<void> {
  const { instanceUrl } = await getConfig(storage);
  await syncMarkerRegistration(chrome.scripting, chrome.permissions, instanceUrl);
}

chrome.runtime.onInstalled.addListener(() => void sync());
chrome.runtime.onStartup.addListener(() => void sync());
```

- [ ] **Step 2: Sync registration when options are saved**

In `apps/extension/src/options.ts`, add the import at the top (next to the existing `./config.js` import):

```ts
import { syncMarkerRegistration } from "./marker-registration.js";
```

Then, inside `save()`, immediately after the existing `await setConfig(storage, { instanceUrl: raw, pbUrl });` line, add:

```ts
    // Host permission for `${origin}/*` was just granted above, so the marker
    // script can register straight away for this custom instance.
    await syncMarkerRegistration(chrome.scripting, chrome.permissions, raw);
```

- [ ] **Step 3: Update the manifest**

Replace `apps/extension/manifest.json` with:

```json
{
  "manifest_version": 3,
  "name": "readmepls — save to library",
  "version": "0.2.0",
  "description": "Save the page you're on to your readmepls library in one click.",
  "action": {
    "default_popup": "popup.html",
    "default_title": "save to readmepls"
  },
  "options_page": "options.html",
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "permissions": ["activeTab", "storage", "scripting"],
  "optional_host_permissions": ["*://*/*"],
  "content_scripts": [
    {
      "matches": ["https://app.readmepls.com/*"],
      "js": ["content-marker.js"],
      "run_at": "document_start"
    }
  ]
}
```

- [ ] **Step 4: Build the new entry points**

Replace the single `esbuild.build({...})` call in `apps/extension/build.mjs` with two calls (ESM for the module scripts, IIFE for the classic content script), keeping the `rm`/`mkdir`/`cp` lines around them:

```js
// popup + options load as <script type="module">; background is a module worker.
await esbuild.build({
  entryPoints: ["src/popup.ts", "src/options.ts", "src/background.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outdir: "dist",
  sourcemap: true,
});

// Content scripts must be classic scripts, not ES modules.
await esbuild.build({
  entryPoints: ["src/content-marker.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  outdir: "dist",
  sourcemap: true,
});
```

- [ ] **Step 5: Bump the package version**

In `apps/extension/package.json`, change `"version": "0.0.0"` to `"version": "0.2.0"`.

- [ ] **Step 6: Build and run the extension suite**

Run: `cd apps/extension && node build.mjs && cd -`
Expected: prints the build log; `apps/extension/dist/content-marker.js` and `apps/extension/dist/background.js` now exist.

Run: `pnpm exec vitest run apps/extension`
Expected: PASS (all extension tests, including Tasks 1–2).

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/extension/src/background.ts apps/extension/src/options.ts apps/extension/manifest.json apps/extension/build.mjs apps/extension/package.json
git commit -m "feat(extension): stamp install marker via content script (v0.2.0)"
```

---

### Task 4: Web — marker detection helpers

**Files:**
- Create: `apps/web/src/lib/extension/detect.ts`
- Test: `apps/web/src/lib/extension/detect.test.ts`

**Interfaces:**
- Produces: `hasMarker(doc: Document): boolean`; `EXTENSION_READY_EVENT: "readmepls:extension-ready"`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/extension/detect.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { hasMarker } from "./detect.js";

afterEach(() => {
  delete document.documentElement.dataset.readmeplsExtension;
});

describe("hasMarker", () => {
  it("is false when the marker attribute is absent", () => {
    expect(hasMarker(document)).toBe(false);
  });

  it("is true when the extension stamped a version", () => {
    document.documentElement.dataset.readmeplsExtension = "0.2.0";
    expect(hasMarker(document)).toBe(true);
  });

  it("is true even for an empty-string marker", () => {
    document.documentElement.dataset.readmeplsExtension = "";
    expect(hasMarker(document)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/extension/detect.test.ts`
Expected: FAIL — cannot resolve `./detect.js`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/extension/detect.ts`:

```ts
/** The marker the extension's content script stamps on <html>, and the event
 *  it fires. The web app reads both to know the extension is installed. */
export const EXTENSION_READY_EVENT = "readmepls:extension-ready";

export function hasMarker(doc: Document): boolean {
  return doc.documentElement.dataset.readmeplsExtension != null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/extension/detect.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/extension/detect.ts apps/web/src/lib/extension/detect.test.ts
git commit -m "feat(web): add extension marker detection helper"
```

---

### Task 5: Web — reactive detection store

**Files:**
- Create: `apps/web/src/lib/stores/extension.svelte.ts`
- Test: `apps/web/src/lib/stores/extension.svelte.test.ts`

**Interfaces:**
- Consumes: `hasMarker`, `EXTENSION_READY_EVENT` from `$lib/extension/detect.js`.
- Produces: `extensionStore` (with `installed` getter); `initExtensionDetection(): void`; `resetExtensionDetection(): void`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/stores/extension.svelte.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  extensionStore,
  initExtensionDetection,
  resetExtensionDetection,
} from "./extension.svelte.js";
import { EXTENSION_READY_EVENT } from "$lib/extension/detect.js";

beforeEach(() => {
  resetExtensionDetection();
  delete document.documentElement.dataset.readmeplsExtension;
});

describe("extensionStore", () => {
  it("starts not installed", () => {
    initExtensionDetection();
    expect(extensionStore.installed).toBe(false);
  });

  it("detects a marker already present at init", () => {
    document.documentElement.dataset.readmeplsExtension = "0.2.0";
    initExtensionDetection();
    expect(extensionStore.installed).toBe(true);
  });

  it("flips to installed on the ready event", () => {
    initExtensionDetection();
    expect(extensionStore.installed).toBe(false);
    window.dispatchEvent(new CustomEvent(EXTENSION_READY_EVENT));
    expect(extensionStore.installed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/stores/extension.svelte.test.ts`
Expected: FAIL — cannot resolve `./extension.svelte.js`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/stores/extension.svelte.ts`:

```ts
import { hasMarker, EXTENSION_READY_EVENT } from "$lib/extension/detect.js";

let installed = $state(false);
let wired = false;

export const extensionStore = {
  get installed() {
    return installed;
  },
};

/** Wire detection once on the client: read the document_start marker, and
 *  listen for the late-injection event (self-host scripts register post-load). */
export function initExtensionDetection(): void {
  if (typeof document !== "undefined" && hasMarker(document)) installed = true;
  if (typeof window !== "undefined" && !wired) {
    wired = true;
    window.addEventListener(EXTENSION_READY_EVENT, () => (installed = true));
  }
}

/** Test seam: restore the pre-detection state between cases. */
export function resetExtensionDetection(): void {
  installed = false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/stores/extension.svelte.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/extension.svelte.ts apps/web/src/lib/stores/extension.svelte.test.ts
git commit -m "feat(web): add reactive extension-installed store"
```

---

### Task 6: Web — GetExtensionDialog component

**Files:**
- Create: `apps/web/src/lib/components/GetExtensionDialog.svelte`
- Test: `apps/web/src/lib/components/GetExtensionDialog.test.ts`

**Interfaces:**
- Produces: `GetExtensionDialog` with a bindable `open?: boolean` prop.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/components/GetExtensionDialog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import GetExtensionDialog from "./GetExtensionDialog.svelte";

describe("GetExtensionDialog", () => {
  it("shows the pitch and a store CTA when open", () => {
    render(GetExtensionDialog, { open: true });

    expect(
      screen.getByRole("heading", { name: /save in one click/i }),
    ).toBeInTheDocument();

    const cta = screen.getByRole("link", { name: /chrome extension/i });
    expect(cta).toHaveAttribute(
      "href",
      "https://chromewebstore.google.com/detail/cjnlkadkjleamnkjehbnblnblcappaje",
    );
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", "noopener");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/GetExtensionDialog.test.ts`
Expected: FAIL — cannot resolve `./GetExtensionDialog.svelte`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/components/GetExtensionDialog.svelte`:

```svelte
<!-- Small pitch dialog for the published Chrome extension. Composes the
     shadcn-svelte dialog primitive (CLAUDE.md: no direct bits-ui imports).
     Copy is heading + one-liner + CTA only — no bullet list. -->
<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";

  const STORE_URL =
    "https://chromewebstore.google.com/detail/cjnlkadkjleamnkjehbnblnblcappaje";

  let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="get-ext-dialog">
    <Dialog.Header>
      <Dialog.Title>save in one click</Dialog.Title>
      <Dialog.Description>
        save any page to your library in one click — no need to open the app.
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <a class="cta" href={STORE_URL} target="_blank" rel="noopener">
        get the chrome extension
      </a>
      <Dialog.Close class="later">maybe later</Dialog.Close>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    color: var(--color-text-on-accent);
    font-family: var(--font-ui);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }
  .cta:hover {
    filter: brightness(0.96);
  }
  :global(.get-ext-dialog) .later {
    min-height: 44px;
    font-family: var(--font-ui);
    color: var(--color-text-muted);
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/components/GetExtensionDialog.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/GetExtensionDialog.svelte apps/web/src/lib/components/GetExtensionDialog.test.ts
git commit -m "feat(web): add get-extension pitch dialog"
```

---

### Task 7: Web — GetExtensionButton component

**Files:**
- Create: `apps/web/src/lib/components/GetExtensionButton.svelte`
- Test: `apps/web/src/lib/components/GetExtensionButton.test.ts`

**Interfaces:**
- Consumes: `extensionStore`, `initExtensionDetection`, `resetExtensionDetection` from `$lib/stores/extension.svelte.js`; `GetExtensionDialog` (Task 6); `EXTENSION_READY_EVENT` from `$lib/extension/detect.js`.
- Produces: `GetExtensionButton` (no props) — a button labelled "get the extension!" that opens the dialog, rendered only when `!extensionStore.installed`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/lib/components/GetExtensionButton.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { tick } from "svelte";
import { render, screen, fireEvent } from "@testing-library/svelte";
import GetExtensionButton from "./GetExtensionButton.svelte";
import {
  initExtensionDetection,
  resetExtensionDetection,
} from "$lib/stores/extension.svelte.js";
import { EXTENSION_READY_EVENT } from "$lib/extension/detect.js";

beforeEach(() => {
  resetExtensionDetection();
  delete document.documentElement.dataset.readmeplsExtension;
});

describe("GetExtensionButton", () => {
  it("renders when the extension is not installed", () => {
    render(GetExtensionButton);
    expect(
      screen.getByRole("button", { name: /get the extension/i }),
    ).toBeInTheDocument();
  });

  it("opens the pitch dialog when clicked", async () => {
    render(GetExtensionButton);
    await fireEvent.click(
      screen.getByRole("button", { name: /get the extension/i }),
    );
    expect(
      screen.getByRole("link", { name: /chrome extension/i }),
    ).toBeInTheDocument();
  });

  it("hides the button once the extension is detected", async () => {
    initExtensionDetection();
    render(GetExtensionButton);
    expect(
      screen.getByRole("button", { name: /get the extension/i }),
    ).toBeInTheDocument();

    window.dispatchEvent(new CustomEvent(EXTENSION_READY_EVENT));
    await tick();

    expect(
      screen.queryByRole("button", { name: /get the extension/i }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/GetExtensionButton.test.ts`
Expected: FAIL — cannot resolve `./GetExtensionButton.svelte`.

- [ ] **Step 3: Write minimal implementation**

`apps/web/src/lib/components/GetExtensionButton.svelte`:

```svelte
<!-- Desktop-only "get the extension!" pill. Lives in TopBar's `.right` cluster
     (hidden ≤640px), and only while the extension isn't detected. -->
<script lang="ts">
  import { Puzzle } from "@lucide/svelte";
  import { extensionStore } from "$lib/stores/extension.svelte.js";
  import GetExtensionDialog from "./GetExtensionDialog.svelte";

  let open = $state(false);
</script>

{#if !extensionStore.installed}
  <button type="button" class="get-ext" onclick={() => (open = true)}>
    <Puzzle class="icon-sm" aria-hidden="true" />
    <span>get the extension!</span>
  </button>
  <GetExtensionDialog bind:open />
{/if}

<style>
  .get-ext {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: 44px;
    padding: 0.25rem 0.7rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-accent-wash);
    color: var(--color-text);
    font-family: var(--font-ui);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .get-ext:hover {
    border-color: var(--color-ring);
  }
  .get-ext:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/components/GetExtensionButton.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/GetExtensionButton.svelte apps/web/src/lib/components/GetExtensionButton.test.ts
git commit -m "feat(web): add get-the-extension button"
```

---

### Task 8: Web — mount button in TopBar + init detection in layout

**Files:**
- Modify: `apps/web/src/lib/components/TopBar.svelte` (add button to `.right`)
- Modify: `apps/web/src/lib/components/topbar.test.ts` (assert the button)
- Modify: `apps/web/src/routes/+layout.svelte` (call `initExtensionDetection()` on mount)

**Interfaces:**
- Consumes: `GetExtensionButton` (Task 7); `initExtensionDetection` (Task 5).

- [ ] **Step 1: Add the failing TopBar test**

In `apps/web/src/lib/components/topbar.test.ts`, add this test inside the existing `describe("TopBar", ...)` block:

```ts
  it("shows a get-the-extension button in the desktop cluster", () => {
    render(TopBar, { theme: "light", onTheme: () => {}, onSignOut: () => {} });
    expect(
      screen.getByRole("button", { name: /get the extension/i }),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/lib/components/topbar.test.ts`
Expected: FAIL — no "get the extension" button found.

- [ ] **Step 3: Wire the button into TopBar**

In `apps/web/src/lib/components/TopBar.svelte`, add the import beneath the existing `Sheet` import:

```ts
  import GetExtensionButton from "./GetExtensionButton.svelte";
```

Then add the button as the first child of the `.right` cluster:

```svelte
  <div class="right">
    <GetExtensionButton />
    {@render themeControls()}
    {@render signOutButton()}
  </div>
```

- [ ] **Step 4: Run the TopBar test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/lib/components/topbar.test.ts`
Expected: PASS (existing tests + the new one).

- [ ] **Step 5: Init detection in the root layout**

In `apps/web/src/routes/+layout.svelte`, add the import near the other `$lib` imports:

```ts
  import { initExtensionDetection } from "$lib/stores/extension.svelte.js";
```

Then, inside the existing `onMount(() => { ... })`, add `initExtensionDetection();` as the last statement (after `applyTheme(theme);`):

```ts
  onMount(() => {
    const prefTheme = pb.authStore.model?.reader_prefs?.theme ?? null;
    theme = resolveTheme(readStoredTheme(), prefTheme);
    applyTheme(theme);
    initExtensionDetection();
  });
```

- [ ] **Step 6: Full verification**

Run: `pnpm exec vitest run apps/web`
Expected: PASS (all web tests).

Run: `pnpm typecheck`
Expected: no errors.

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/components/TopBar.svelte apps/web/src/lib/components/topbar.test.ts apps/web/src/routes/+layout.svelte
git commit -m "feat(web): surface get-extension button in the top bar"
```

---

## Post-implementation note (manual, not a task)

The updated extension (`0.2.0`) must be **republished to the Chrome Web Store** for detection to take effect for real users. Existing `0.1.0` installs keep showing the button until they update — harmless.
