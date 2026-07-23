# Extension: drop `scripting` + host permissions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `scripting` permission and broad `optional_host_permissions` from the browser extension by dropping the only feature that used them — dynamic marker injection into self-hosted instances — while keeping SaaS extension-detection and pointing self-hosters to the extension via docs.

**Architecture:** SaaS detection stays via the existing permission-free static `content_scripts` marker. The self-hosted marker machinery (dynamic registration, background service worker, `scripting`, broad host permission) is deleted. The web "get the extension!" CTA becomes SaaS-only (hidden entirely on self-hosted). Docs (site `/docs` route + README) gain an extension section. All capture/auth continues to work over CORS, which never needed host permissions.

**Tech Stack:** SvelteKit (web + site apps), Tailwind v4 + shadcn-svelte, Vitest + @testing-library/svelte, esbuild (extension build), Chrome MV3.

## Global Constraints

- **TDD always.** Failing test first, then minimal implementation. (CLAUDE.md)
- **Tests:** run with `pnpm exec vitest run <pattern>` (subset) or `pnpm test` (whole workspace). `pnpm --filter <pkg> test` does NOT work — single vitest workspace. (CLAUDE.md)
- **Conventional Commits**, one logical change per commit. Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Never hardcode a color/font in a component** — reference a token. (Not exercised here, but honor it in any markup.)
- **Lowercase playful voice** for user-facing copy (matches `assets/_banner.html` and the existing docs page).
- **Extension store URL** (verbatim, already live in `GetExtensionDialog.svelte`):
  `https://chromewebstore.google.com/detail/cjnlkadkjleamnkjehbnblnblcappaje`
- **Marker attribute** the web app reads: `data-readmepls-extension` on `<html>` (accessed as `document.documentElement.dataset.readmeplsExtension`).
- **`selfHosted`** flows to `$page.data.selfHosted` via `apps/web/src/routes/+layout.server.ts` (already implemented).
- Do not repoint `@readmepls/core`/`types` `main` at `dist`. (Not touched here.)

---

### Task 1: Extension — strip `scripting` + host permissions

Removes the self-hosted marker machinery and both flagged permissions. After this task the extension declares only `activeTab` + `storage`.

**Files:**
- Modify: `apps/extension/src/marker.ts`
- Modify: `apps/extension/src/marker.test.ts`
- Modify: `apps/extension/src/options.ts`
- Modify: `apps/extension/build.mjs`
- Modify: `apps/extension/manifest.json`
- Modify: `apps/extension/package.json`
- Delete: `apps/extension/src/marker-registration.ts`
- Delete: `apps/extension/src/marker-registration.test.ts`
- Delete: `apps/extension/src/background.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the static content script keeps stamping `data-readmepls-extension` on `<html>` at `document_start` on `https://app.readmepls.com/*` — the signal Task 3's web detection reads. `stampMarker(doc: Document, version: string): void` remains exported from `marker.ts` (no event, no return).

- [ ] **Step 1: Rewrite `marker.test.ts` to drop the event assertion (failing)**

Replace the entire file `apps/extension/src/marker.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { stampMarker } from "./marker.js";

function fakeDoc() {
  const doc = {
    documentElement: { dataset: {} as Record<string, string> },
  } as unknown as Document;
  return { doc };
}

describe("stampMarker", () => {
  it("stamps the version on the document element", () => {
    const { doc } = fakeDoc();
    stampMarker(doc, "0.2.1");
    expect(doc.documentElement.dataset.readmeplsExtension).toBe("0.2.1");
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `pnpm exec vitest run apps/extension/src/marker.test.ts`
Expected: FAIL — the current `marker.ts` still exports `EXTENSION_READY_EVENT` and the old test file is replaced, but more importantly the next step is what makes intent explicit. (If it happens to pass because the old `marker.ts` still stamps, that's fine — Step 3 is the real change. Proceed regardless.)

- [ ] **Step 3: Simplify `marker.ts` — remove the custom event**

Replace the entire file `apps/extension/src/marker.ts` with:

```ts
/** DOM marker the web app reads to detect the installed extension. Stamped by
 *  the content script at document_start so it's present before app JS runs. */
export function stampMarker(doc: Document, version: string): void {
  doc.documentElement.dataset.readmeplsExtension = version;
}
```

(`content-marker.ts` already imports only `{ stampMarker }` and calls `stampMarker(document, chrome.runtime.getManifest().version)` — no change needed there.)

- [ ] **Step 4: Run the marker test — expect PASS**

Run: `pnpm exec vitest run apps/extension/src/marker.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Delete the self-hosted marker + background files**

```bash
git rm apps/extension/src/marker-registration.ts \
       apps/extension/src/marker-registration.test.ts \
       apps/extension/src/background.ts
```

- [ ] **Step 6: Trim `options.ts` — drop the host-permission request + marker sync**

Replace the entire file `apps/extension/src/options.ts` with:

```ts
import {
  getConfig,
  setConfig,
  DEFAULT_INSTANCE_URL,
  type StorageArea,
} from "./config.js";

const storage: StorageArea = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
};

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

async function load() {
  const cfg = await getConfig(storage);
  $<HTMLInputElement>("instance").value =
    cfg.instanceUrl || DEFAULT_INSTANCE_URL;
}

async function save() {
  const raw = $<HTMLInputElement>("instance").value.trim().replace(/\/+$/, "");
  const status = $("status");
  try {
    new URL(raw);
  } catch {
    status.textContent = "enter a valid url";
    return;
  }
  try {
    // Capture/auth reach the instance over CORS (server allow-lists the
    // extension origin via EXTENSION_ORIGINS) — no host permission needed.
    const res = await fetch(`${raw}/api/config`);
    if (!res.ok) throw new Error(`config fetch failed: ${res.status}`);
    const { pbUrl } = (await res.json()) as { pbUrl: string };
    if (!pbUrl) throw new Error("config returned empty pbUrl");
    await setConfig(storage, { instanceUrl: raw, pbUrl });
    await chrome.storage.local.set({ token: "" });
    status.textContent = "saved ✓";
  } catch {
    status.textContent = "can't reach that instance — check the url";
  }
}

$("save").addEventListener("click", save);
void load();
```

- [ ] **Step 7: Remove `background.ts` from the esbuild entry points**

In `apps/extension/build.mjs`, change the module-bundle block:

```js
// popup + options load as <script type="module">.
await esbuild.build({
  entryPoints: ["src/popup.ts", "src/options.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outdir: "dist",
  sourcemap: true,
});
```

(Only the comment on the first line and the `entryPoints` array change — drop `"src/background.ts"`.)

- [ ] **Step 8: Update `manifest.json` — drop permissions, background; bump version**

Replace the entire file `apps/extension/manifest.json` with:

```json
{
  "manifest_version": 3,
  "name": "readmepls — save to library",
  "version": "0.2.1",
  "description": "Save the page you're on to your readmepls library in one click.",
  "action": {
    "default_popup": "popup.html",
    "default_title": "save to readmepls"
  },
  "options_page": "options.html",
  "permissions": ["activeTab", "storage"],
  "content_scripts": [
    {
      "matches": ["https://app.readmepls.com/*"],
      "js": ["content-marker.js"],
      "run_at": "document_start"
    }
  ]
}
```

- [ ] **Step 9: Bump `package.json` version to match**

In `apps/extension/package.json`, change `"version": "0.2.0"` to `"version": "0.2.1"`.

- [ ] **Step 10: Run the full extension test suite — expect PASS**

Run: `pnpm exec vitest run apps/extension`
Expected: PASS — `auth`, `can-capture`, `capture-client`, `config`, `marker` tests green; no `marker-registration` file remains.

- [ ] **Step 11: Verify the extension builds and the manifest is clean**

Run: `pnpm --filter @readmepls/extension build`
Expected: prints `extension built → apps/extension/dist`, no esbuild error about a missing `src/background.ts`.

Then confirm the built manifest has neither `scripting` nor host permissions nor a background worker:

Run: `cat apps/extension/dist/manifest.json`
Expected: `"permissions": ["activeTab", "storage"]`, no `optional_host_permissions`, no `background`, `"version": "0.2.1"`.

- [ ] **Step 12: Commit**

```bash
git add apps/extension
git commit -m "$(cat <<'EOF'
feat: drop extension scripting + host permissions

Remove the self-hosted marker machinery (dynamic content-script
registration, background worker) that was the sole consumer of the
`scripting` permission and broad `optional_host_permissions`. SaaS
detection stays via the static content_scripts marker; capture/auth
reach any instance over CORS. Extension now declares only activeTab +
storage.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

Use `feat:` (not `feat!:`) — a patch bump on the `0.x` line, per the user's
decision.

---

### Task 2: Web — make the CTA SaaS-only

Guard the "get the extension!" button so it never renders on self-hosted instances, and rewrite its test to stop relying on the soon-to-be-removed ready event.

**Files:**
- Modify: `apps/web/src/lib/components/GetExtensionButton.svelte`
- Modify: `apps/web/src/lib/components/GetExtensionButton.test.ts`

**Interfaces:**
- Consumes: `$page.data.selfHosted: boolean` (from `+layout.server.ts`); `extensionStore.installed: boolean` and `initExtensionDetection()`/`resetExtensionDetection()` from `$lib/stores/extension.svelte.js`; the `page` writable from the `$app/stores` test mock (`apps/web/src/__mocks__/app-stores.ts`).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Rewrite `GetExtensionButton.test.ts` (failing)**

Replace the entire file `apps/web/src/lib/components/GetExtensionButton.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { page } from "$app/stores";
import GetExtensionButton from "./GetExtensionButton.svelte";
import {
  initExtensionDetection,
  resetExtensionDetection,
} from "$lib/stores/extension.svelte.js";

const basePageValue = {
  params: {} as Record<string, string>,
  url: new URL("http://localhost/"),
  route: { id: null as string | null },
  status: 200,
  error: null,
  data: {} as Record<string, unknown>,
  form: null,
  state: {} as Record<string, unknown>,
};

beforeEach(() => {
  resetExtensionDetection();
  delete document.documentElement.dataset.readmeplsExtension;
  page.set({ ...basePageValue, data: { selfHosted: false } });
});

describe("GetExtensionButton", () => {
  it("renders on SaaS when the extension is not installed", () => {
    initExtensionDetection();
    render(GetExtensionButton);
    expect(
      screen.getByRole("button", { name: /get the extension/i }),
    ).toBeInTheDocument();
  });

  it("opens the pitch dialog when clicked", async () => {
    initExtensionDetection();
    render(GetExtensionButton);
    await fireEvent.click(
      screen.getByRole("button", { name: /get the extension/i }),
    );
    expect(
      screen.getByRole("link", { name: /chrome extension/i }),
    ).toBeInTheDocument();
  });

  it("hides the button once the extension is detected", () => {
    document.documentElement.dataset.readmeplsExtension = "0.2.1";
    initExtensionDetection();
    render(GetExtensionButton);
    expect(
      screen.queryByRole("button", { name: /get the extension/i }),
    ).not.toBeInTheDocument();
  });

  it("never renders on a self-hosted instance, even when not installed", () => {
    page.set({ ...basePageValue, data: { selfHosted: true } });
    initExtensionDetection();
    render(GetExtensionButton);
    expect(
      screen.queryByRole("button", { name: /get the extension/i }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `pnpm exec vitest run apps/web/src/lib/components/GetExtensionButton.test.ts`
Expected: FAIL on the self-hosted case (button still renders) — the component does not yet read `selfHosted`.

- [ ] **Step 3: Add the `selfHosted` guard to the component**

In `apps/web/src/lib/components/GetExtensionButton.svelte`, add the `page` import and widen the render condition. The `<script>` block becomes:

```svelte
<script lang="ts">
  import { Puzzle } from "@lucide/svelte";
  import { page } from "$app/stores";
  import { extensionStore } from "$lib/stores/extension.svelte.js";
  import GetExtensionDialog from "./GetExtensionDialog.svelte";

  let open = $state(false);
</script>
```

And change the guard from `{#if !extensionStore.installed}` to:

```svelte
{#if !$page.data.selfHosted && !extensionStore.installed}
```

Also update the top-of-file comment to note the SaaS-only intent, e.g.:

```svelte
<!-- Desktop-only "get the extension!" pill. Lives in TopBar's `.right` cluster
     (hidden ≤640px). SaaS-only: never shown on self-hosted instances (they get
     the extension via the docs); on SaaS it shows only while the extension
     isn't detected. -->
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm exec vitest run apps/web/src/lib/components/GetExtensionButton.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/components/GetExtensionButton.svelte \
        apps/web/src/lib/components/GetExtensionButton.test.ts
git commit -m "$(cat <<'EOF'
feat: hide get-extension CTA on self-hosted instances

The button is a SaaS affordance; self-hosters can't be reliably detected
and get the extension via docs instead. Guard on $page.data.selfHosted.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Web — simplify detection to the attribute-only signal

Remove the `readmepls:extension-ready` event path (there is no more late/dynamic registration), leaving detection as a single `document_start` attribute read.

**Files:**
- Modify: `apps/web/src/lib/extension/detect.ts`
- Modify: `apps/web/src/lib/extension/detect.test.ts`
- Modify: `apps/web/src/lib/stores/extension.svelte.ts`
- Modify: `apps/web/src/lib/stores/extension.svelte.test.ts`

**Interfaces:**
- Consumes: the `data-readmepls-extension` attribute stamped by Task 1's content script.
- Produces: `hasMarker(doc: Document): boolean` (unchanged signature) from `detect.ts`; `extensionStore.installed`, `initExtensionDetection()`, `resetExtensionDetection()` from the store (unchanged signatures; `EXTENSION_READY_EVENT` removed). Task 2 already stopped importing `EXTENSION_READY_EVENT`, so nothing references it after this task.

- [ ] **Step 1: Update `detect.test.ts` (failing)**

Replace the entire file `apps/web/src/lib/extension/detect.test.ts` with:

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
    document.documentElement.dataset.readmeplsExtension = "0.2.1";
    expect(hasMarker(document)).toBe(true);
  });

  it("is true even for an empty-string marker", () => {
    document.documentElement.dataset.readmeplsExtension = "";
    expect(hasMarker(document)).toBe(true);
  });
});
```

- [ ] **Step 2: Update `extension.svelte.test.ts` (failing)**

Replace the entire file `apps/web/src/lib/stores/extension.svelte.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  extensionStore,
  initExtensionDetection,
  resetExtensionDetection,
} from "./extension.svelte.js";

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
    document.documentElement.dataset.readmeplsExtension = "0.2.1";
    initExtensionDetection();
    expect(extensionStore.installed).toBe(true);
  });
});
```

- [ ] **Step 3: Run both tests — expect FAIL**

Run: `pnpm exec vitest run apps/web/src/lib/extension/detect.test.ts apps/web/src/lib/stores/extension.svelte.test.ts`
Expected: FAIL — `detect.ts` and the store still export/import `EXTENSION_READY_EVENT`; the test files no longer do, but the modules will still compile. The real driver is Steps 4–5; if these happen to pass at this point, proceed — the point is that the removed cases no longer exist.

- [ ] **Step 4: Simplify `detect.ts`**

Replace the entire file `apps/web/src/lib/extension/detect.ts` with:

```ts
/** The extension's static content script stamps this attribute on <html> at
 *  document_start; the web app reads it to know the extension is installed. */
export function hasMarker(doc: Document): boolean {
  return doc.documentElement.dataset.readmeplsExtension != null;
}
```

- [ ] **Step 5: Simplify the store — drop the event listener**

Replace the entire file `apps/web/src/lib/stores/extension.svelte.ts` with:

```ts
import { hasMarker } from "$lib/extension/detect.js";

let installed = $state(false);

export const extensionStore = {
  get installed() {
    return installed;
  },
};

/** Wire detection once on the client: the extension's static content script
 *  stamps its marker at document_start, so it's present by the time this runs. */
export function initExtensionDetection(): void {
  if (typeof document !== "undefined" && hasMarker(document)) installed = true;
}

/** Test seam: restore the pre-detection state between cases. */
export function resetExtensionDetection(): void {
  installed = false;
}
```

- [ ] **Step 6: Run the detection tests — expect PASS**

Run: `pnpm exec vitest run apps/web/src/lib/extension/detect.test.ts apps/web/src/lib/stores/extension.svelte.test.ts`
Expected: PASS (3 + 2 tests).

- [ ] **Step 7: Guard against dangling `EXTENSION_READY_EVENT` references**

Run: `grep -rn "EXTENSION_READY_EVENT" apps/web/src`
Expected: no output. (If any remain, remove them — nothing should reference the event now.)

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/extension/detect.ts \
        apps/web/src/lib/extension/detect.test.ts \
        apps/web/src/lib/stores/extension.svelte.ts \
        apps/web/src/lib/stores/extension.svelte.test.ts
git commit -m "$(cat <<'EOF'
refactor: simplify extension detection to attribute-only

With dynamic self-hosted registration gone, detection is a single
document_start marker read; drop the readmepls:extension-ready event path.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Docs — surface the extension for self-hosters

Add an extension section to the site `/docs` route and the README, with the store link and the `EXTENSION_ORIGINS` note self-hosters need for capture to reach their instance.

**Files:**
- Modify: `apps/site/src/lib/site.ts`
- Modify: `apps/site/src/routes/docs/+page.svelte`
- Modify: `apps/site/src/routes/docs/page.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `EXTENSION_URL` exported from `apps/site/src/lib/site.ts`.

- [ ] **Step 1: Add the failing docs test**

In `apps/site/src/routes/docs/page.test.ts`, add this test (append after the existing tests, keeping the existing `data` fixture and imports):

```ts
test("surfaces the browser extension with a store link", () => {
  render(Page, { props: { data } });
  expect(
    screen.getByRole("heading", { name: /browser extension/i }),
  ).toBeTruthy();
  const link = screen.getByRole("link", { name: /chrome web store/i });
  expect(link.getAttribute("href")).toBe(
    "https://chromewebstore.google.com/detail/cjnlkadkjleamnkjehbnblnblcappaje",
  );
});
```

- [ ] **Step 2: Run the test — expect FAIL**

Run: `pnpm exec vitest run apps/site/src/routes/docs/page.test.ts`
Expected: FAIL — no "browser extension" heading / store link yet.

- [ ] **Step 3: Add the `EXTENSION_URL` constant**

In `apps/site/src/lib/site.ts`, add near `GITHUB_URL`:

```ts
// The published Chrome Web Store listing. `site` and `web` are separate apps
// with no shared constants package, so this URL is intentionally duplicated
// from the web app's GetExtensionDialog.
export const EXTENSION_URL =
  "https://chromewebstore.google.com/detail/cjnlkadkjleamnkjehbnblnblcappaje";
```

- [ ] **Step 4: Add the extension section to the docs page**

In `apps/site/src/routes/docs/+page.svelte`:

First extend the import to include `EXTENSION_URL`:

```svelte
  import { GITHUB_URL, EXTENSION_URL } from "$lib/site";
```

Then add this `<section>` immediately before the closing `<p class="more">…</p>` paragraph:

```svelte
  <section>
    <h2>browser extension</h2>
    <p>
      Save the page you're on to your library in one click with the readmepls
      extension — <a href={EXTENSION_URL}>get it on the Chrome Web Store</a>.
      Point it at your instance from its options screen.
    </p>
    <p>
      For it to reach a self-hosted instance, add its origin to
      <code>EXTENSION_ORIGINS</code> in your <code>.env</code> (comma-separated),
      then restart:
    </p>
    <CodeBlock
      code={"EXTENSION_ORIGINS=chrome-extension://cjnlkadkjleamnkjehbnblnblcappaje"}
    />
  </section>
```

(`CodeBlock` is already imported at the top of the file.)

- [ ] **Step 5: Run the docs test — expect PASS**

Run: `pnpm exec vitest run apps/site/src/routes/docs/page.test.ts`
Expected: PASS — including the new store-link assertion and the pre-existing self-hosting tests.

- [ ] **Step 6: Add a README section**

In `README.md`, add a new section immediately before the `## License` heading.
The section content is shown below between the `~~~` markers (the inner
triple-backtick fence is part of the README content to add):

~~~markdown
## Browser extension

The [readmepls extension](https://chromewebstore.google.com/detail/cjnlkadkjleamnkjehbnblnblcappaje)
saves the page you're on to your library in one click. Point it at your
instance from its options screen.

Self-hosting? Add the extension's origin to `EXTENSION_ORIGINS` in your `.env`
(comma-separated) so capture requests are allowed through CORS, then restart:

```
EXTENSION_ORIGINS=chrome-extension://cjnlkadkjleamnkjehbnblnblcappaje
```
~~~

- [ ] **Step 7: Commit**

```bash
git add apps/site/src/lib/site.ts \
        apps/site/src/routes/docs/+page.svelte \
        apps/site/src/routes/docs/page.test.ts \
        README.md
git commit -m "$(cat <<'EOF'
docs: surface the browser extension in docs + README

Add a browser-extension section to the site /docs route and the README,
with the Chrome Web Store link and the EXTENSION_ORIGINS step self-hosters
need for capture to reach their instance.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Whole-workspace verification

Confirm nothing regressed across the workspace and the extension artifact is clean.

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: all files pass, 0 failures. (Baseline before this work was 188 files / 719 tests; expect the same file count with adjusted test counts — `marker-registration.test.ts` removed, `GetExtensionButton` gained a case, `docs/page.test.ts` gained a case, store/detect/marker tests trimmed.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean — no references to deleted `marker-registration`, `background`, or `EXTENSION_READY_EVENT`.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 4: Extension build + manifest assertion**

Run: `pnpm --filter @readmepls/extension build && cat apps/extension/dist/manifest.json`
Expected: build succeeds; manifest shows `"permissions": ["activeTab", "storage"]`, no `optional_host_permissions`, no `background`, `"version": "0.2.1"`.

- [ ] **Step 5: Delete the spec + plan (shipped) and commit**

Per CLAUDE.md, a fully-implemented plan and its paired spec are deleted once shipped:

```bash
git rm docs/superpowers/specs/2026-07-23-extension-drop-permissions-design.md \
       docs/superpowers/plans/2026-07-23-extension-drop-permissions.md
git commit -m "$(cat <<'EOF'
docs: remove shipped extension-permissions spec and plan

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

(Do this only after Steps 1–4 are green. If review checkpoints are still pending, leave the docs in place until the work is actually merged.)

---

## Notes for the implementer

- **Squash before merging.** These per-task commits are development granularity; collapse to clean Conventional Commits before landing on `main` (CLAUDE.md).
- **Do not push or open a PR** unless the user asks.
- **The store submission** (uploading the repermissioned build to the existing listing) is a manual follow-up outside this plan.
- If `pnpm typecheck` complains about `@types/chrome` for the trimmed `options.ts` (e.g. an unused-import lint), remove only the genuinely unused symbols — `DEFAULT_INSTANCE_URL` is still used in `load()`.
