# Reading Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing `articles.progress` field correct, persistent, and
actually visible — fix the reader's progress bar seeding, resume scroll
position on reopen, guarantee progress is saved even for short articles or
when the user closes the tab mid-scroll, and show a progress signal on
library cards.

**Architecture:** No schema change. Two shared pure constants move into
`@readmepls/core`. The reader page (`apps/web/src/routes/read/[id]/+page.svelte`)
gets its progress-save logic unified behind one `computeProgress()` helper and
an explicit `flushSave()` used on unmount/tab-hide, plus a mount-time
`resolveInitialScroll()` that seeds the bar, restores scroll position, and
marks non-scrollable articles finished immediately. `ArticleCard.svelte` grows
an optional bottom progress bar driven by the same shared thresholds.

**Tech Stack:** SvelteKit 5 (runes), PocketBase JS SDK, Vitest +
`@testing-library/svelte`.

## Global Constraints

- `STARTED_THRESHOLD = 0.02` and `FINISHED_THRESHOLD = 0.98` — exact values,
  shared from one module, never redefined locally.
- Resume-scroll is **instant** (`window.scrollTo`, no smooth-scroll animation).
- Tab-hide/unmount flush uses **`visibilitychange`**, not `beforeunload`/`unload`
  (unreliable, especially on mobile).
- No server-side route for saving progress — stays a direct client PocketBase
  write (existing pattern).
- No schema/migration changes — `articles.progress` already exists.
- No visual redesign beyond reusing existing tokens (`--color-accent`,
  `--radius-lg`, etc.) — this is not a Phase-3 visual-design task.
- Progress bars (reader top bar, card bottom bar) are decorative:
  `aria-hidden="true"`, matching the existing reader-bar pattern.

---

### Task 1: Shared progress thresholds in `@readmepls/core`

**Files:**
- Create: `packages/core/src/library/progress.ts`
- Create: `packages/core/src/library/progress.test.ts`
- Modify: `packages/core/src/library/query.ts:11-12` (remove local constant, import shared one)
- Modify: `packages/core/src/index.ts` (add export line)

**Interfaces:**
- Produces: `STARTED_THRESHOLD: number` (0.02), `FINISHED_THRESHOLD: number`
  (0.98), both exported from `@readmepls/core`. Every later task imports these
  from `@readmepls/core` — never redefines them.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/library/progress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { STARTED_THRESHOLD, FINISHED_THRESHOLD } from "./progress.js";

describe("progress thresholds", () => {
  it("exposes the exact shared threshold values", () => {
    expect(STARTED_THRESHOLD).toBe(0.02);
    expect(FINISHED_THRESHOLD).toBe(0.98);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/src/library/progress.test.ts`
Expected: FAIL — `Cannot find module './progress.js'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/library/progress.ts`:

```ts
/** Below this, an article is treated as unread: no progress bar, no resume-scroll. */
export const STARTED_THRESHOLD = 0.02;

/** At or above this, an article counts as "finished" for filtering and UI. */
export const FINISHED_THRESHOLD = 0.98;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/src/library/progress.test.ts`
Expected: PASS

- [ ] **Step 5: Point `query.ts` at the shared constant**

Modify `packages/core/src/library/query.ts`:

```ts
// Before (lines 1, 11-12):
import type { LibraryParams, DatePreset } from "@readmepls/types";

export interface LibraryQuery {
  filterExpr: string;
  filterParams: Record<string, unknown>;
  sort: string;
  page: number;
  perPage: number;
}

const PER_PAGE = 24;
const FINISHED_THRESHOLD = 0.98;
```

```ts
// After:
import type { LibraryParams, DatePreset } from "@readmepls/types";
import { FINISHED_THRESHOLD } from "./progress.js";

export interface LibraryQuery {
  filterExpr: string;
  filterParams: Record<string, unknown>;
  sort: string;
  page: number;
  perPage: number;
}

const PER_PAGE = 24;
```

- [ ] **Step 6: Add the export to the package index**

Modify `packages/core/src/index.ts` — add this line after the existing
`export * from "./library/fetch.js";` line:

```ts
export * from "./library/progress.js";
```

- [ ] **Step 7: Run the full core test suite to confirm no regression**

Run: `npx vitest run packages/core`
Expected: PASS — in particular `packages/core/src/library/query.test.ts`'s
`"read=finished maps to a progress threshold, not a status"` test still
passes unchanged (it asserts the filter contains `0.98`).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/library/progress.ts packages/core/src/library/progress.test.ts packages/core/src/library/query.ts packages/core/src/index.ts
git commit -m "refactor(core): share reading-progress thresholds from one module"
```

---

### Task 2: Reader — seed the progress bar from the loaded article

**Files:**
- Modify: `apps/web/src/routes/read/[id]/+page.svelte:186-191`
- Test: `apps/web/src/routes/read/[id]/page.test.ts`

**Interfaces:**
- Consumes: nothing new yet (Task 1's constants aren't needed until Task 4).
- Produces: refactors the test file's `vi.mock("$lib/pb.js", ...)` block to
  use module-scope spies (`articleGetOne`, `articleUpdate`, `articleDelete`)
  instead of inline per-call mocks, and a `defaultArticle()` factory. Every
  later task's tests in this file build on these three names — do not
  reintroduce inline `vi.fn()` literals for the `articles` collection.

This task also lays the shared test-mock foundation the remaining reader
tasks depend on.

- [ ] **Step 1: Refactor the test file's mock to expose shared spies**

Modify `apps/web/src/routes/read/[id]/page.test.ts` — replace the whole
`vi.mock("$lib/pb.js", ...)` block (currently lines 9-54) with:

```ts
// --- mocks (vi.mock calls are hoisted by vitest above all imports) ----------

const defaultArticle = () => ({
  id: "art1",
  url: "https://example.com/p",
  status: "unread",
  progress: 0,
  expand: {
    content: {
      id: "c1",
      title: "Test Article",
      content_html: "<p>hello world</p>",
      extract_status: "ok",
    },
  },
});

// Shared spies so individual tests can override resolved/rejected values
// with mockResolvedValueOnce/mockRejectedValueOnce before render().
const articleGetOne = vi.fn().mockResolvedValue(defaultArticle());
const articleUpdate = vi.fn().mockResolvedValue({});
const articleDelete = vi.fn().mockResolvedValue(undefined);

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    authStore: { model: { id: "u1" } },
    filter: (s: string) => s,
    collection: (name: string) => {
      if (name === "articles") {
        return {
          getOne: articleGetOne,
          update: articleUpdate,
          delete: articleDelete,
          getFullList: vi.fn().mockResolvedValue([]),
        };
      }
      if (name === "users") {
        return {
          getOne: vi.fn().mockResolvedValue({ id: "u1", reader_prefs: null }),
          update: vi.fn().mockResolvedValue({}),
        };
      }
      // highlights, article_tags, collections — all empty
      return {
        getFullList: vi.fn().mockResolvedValue([]),
        getFirstListItem: vi.fn().mockResolvedValue({ id: "tag1" }),
        create: vi.fn().mockResolvedValue({ id: "new1" }),
        delete: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue({}),
      };
    },
  }),
}));
```

Leave every other `vi.mock(...)` block in the file (for `$app/stores`,
`@readmepls/core`, `$lib/highlight/render`) untouched. The existing
`"reader page — delete error path"` describe block's `beforeEach(() =>
vi.clearAllMocks())` keeps working unchanged — `clearAllMocks` clears call
history, not the `mockResolvedValue` defaults set above.

Add a new describe block at the end of the file, before the final closing of
the file (after the existing `"reader page — delete error path"` block):

```ts
describe("reader page — progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    articleGetOne.mockResolvedValue(defaultArticle());
    articleUpdate.mockResolvedValue({});
  });

  it("seeds the progress bar from the loaded article before any scroll", async () => {
    articleGetOne.mockResolvedValueOnce({ ...defaultArticle(), progress: 0.42 });
    const { container } = render(ReaderPage);
    await waitFor(() => expect(screen.getByText("Test Article")).toBeInTheDocument());
    const bar = container.querySelector(".progress");
    expect(bar?.getAttribute("style")).toContain("--p: 0.42");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/routes/read/[id]/page.test.ts`
Expected: FAIL — `--p: 0.42` not found (bar still shows `--p: 0` because
`progress` state is never seeded from the loaded article).

- [ ] **Step 3: Write minimal implementation**

Modify `apps/web/src/routes/read/[id]/+page.svelte` — in `onMount`, current:

```ts
    article = await pb.collection("articles").getOne(id, { expand: "content.source" });
    // article is always non-null here — getOne throws on not-found
    content = article!.expand?.content ?? null;
```

Change to:

```ts
    article = await pb.collection("articles").getOne(id, { expand: "content.source" });
    // article is always non-null here — getOne throws on not-found
    content = article!.expand?.content ?? null;
    progress = article!.progress ?? 0;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/routes/read/[id]/page.test.ts`
Expected: PASS — all tests in the file, including the pre-existing
`"reader page — delete error path"` tests, still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/read/[id]/+page.svelte apps/web/src/routes/read/[id]/page.test.ts
git commit -m "fix(web): seed reader progress bar from the loaded article"
```

---

### Task 3: Reader — unify and harden the progress-save path

**Files:**
- Modify: `apps/web/src/routes/read/[id]/+page.svelte:175-184, 206-212`
- Test: `apps/web/src/routes/read/[id]/page.test.ts`

**Interfaces:**
- Consumes: `articleGetOne`, `articleUpdate` from Task 2's test refactor.
- Produces: `computeProgress(): number` (module-private to the component) —
  returns `1` when the content fits the viewport (`max <= 0`), otherwise
  clamped `scrollY / max`. `flushSave(): void` — clears the pending debounce
  timer and writes `computeProgress()` immediately. Task 4 calls `flushSave()`
  directly; do not rename either function.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/routes/read/[id]/page.test.ts`, inside the
`"reader page — progress"` describe block added in Task 2:

```ts
  it("saves progress after the debounced scroll delay", async () => {
    Object.defineProperty(document.body, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    render(ReaderPage);
    await waitFor(() => expect(screen.getByText("Test Article")).toBeInTheDocument());

    // Switch to fake timers only after the initial render/network resolution
    // has settled — waitFor's internal polling relies on real timers, so
    // enabling fake timers earlier would deadlock it.
    vi.useFakeTimers();
    Object.defineProperty(window, "scrollY", { value: 600, configurable: true });
    await fireEvent.scroll(window);
    expect(articleUpdate).not.toHaveBeenCalledWith("art1", { progress: 0.5 });

    await vi.advanceTimersByTimeAsync(400);
    expect(articleUpdate).toHaveBeenCalledWith("art1", { progress: 0.5 });

    vi.useRealTimers();
  });

  it("flushes the pending save immediately when the component unmounts", async () => {
    Object.defineProperty(document.body, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    const { unmount } = render(ReaderPage);
    await waitFor(() => expect(screen.getByText("Test Article")).toBeInTheDocument());
    articleUpdate.mockClear(); // ignore the mount-time "status: reading" write

    // max = 2000 - 800 = 1200; scrollY 300 -> progress 0.25
    Object.defineProperty(window, "scrollY", { value: 300, configurable: true });
    await fireEvent.scroll(window); // debounce timer now pending, hasn't fired

    unmount();
    expect(articleUpdate).toHaveBeenCalledWith("art1", { progress: 0.25 });
  });

  it("flushes the pending save when the tab is hidden", async () => {
    Object.defineProperty(document.body, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    render(ReaderPage);
    await waitFor(() => expect(screen.getByText("Test Article")).toBeInTheDocument());
    articleUpdate.mockClear();

    // max = 2000 - 800 = 1200; scrollY 1200 -> progress 1 (clamped, reached bottom)
    Object.defineProperty(window, "scrollY", { value: 1200, configurable: true });
    await fireEvent.scroll(window); // debounce timer now pending

    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(articleUpdate).toHaveBeenCalledWith("art1", { progress: 1 });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/routes/read/[id]/page.test.ts`
Expected: FAIL on the unmount and visibilitychange tests — `articleUpdate`
never gets called before the 400ms timer fires (no flush path exists yet).
The debounced-save test may already pass (existing behavior) — that's fine,
it documents current behavior before the refactor touches it.

- [ ] **Step 3: Write minimal implementation**

Modify `apps/web/src/routes/read/[id]/+page.svelte` — current:

```ts
  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  function onScroll() {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      const max = document.body.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      progress = p;
      if (article) pb.collection("articles").update(article.id, { progress: p });
    }, 400);
  }
```

Replace with:

```ts
  let progressTimer: ReturnType<typeof setTimeout> | undefined;

  // max<=0 means the content fits the viewport with no scrollbar — treat
  // that as fully read rather than 0, since scroll position can't express it.
  function computeProgress(): number {
    const max = document.body.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
  }

  function onScroll() {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      progress = computeProgress();
      if (article) pb.collection("articles").update(article.id, { progress });
    }, 400);
  }

  // Writes the current progress immediately, bypassing the debounce — used
  // when the component is about to disappear (navigation, tab close/hide)
  // and a pending debounced write would otherwise be lost.
  function flushSave() {
    clearTimeout(progressTimer);
    progress = computeProgress();
    if (article) pb.collection("articles").update(article.id, { progress });
  }

  function onVisibilityChange() {
    if (document.hidden) flushSave();
  }
```

Then update the `onMount`/`onDestroy` wiring — current:

```ts
    window.addEventListener("scroll", onScroll, { passive: true });
  });

  // An async onMount can't register a cleanup; tear down the listener here.
  onDestroy(() => {
    if (typeof window !== "undefined") window.removeEventListener("scroll", onScroll);
  });
```

Replace with:

```ts
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
  });

  // An async onMount can't register a cleanup; tear down listeners here and
  // flush any pending debounced save so navigating away doesn't lose it.
  onDestroy(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    flushSave();
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/routes/read/[id]/page.test.ts`
Expected: PASS — all tests, including Task 2's and the pre-existing delete/
archive tests (`onDestroy` now also calls `flushSave`, which is a harmless
extra `articleUpdate` call those tests don't assert against).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/read/[id]/+page.svelte apps/web/src/routes/read/[id]/page.test.ts
git commit -m "fix(web): flush reading progress on tab-hide and navigation away"
```

---

### Task 4: Reader — resume scroll position and finish short articles on load

**Files:**
- Modify: `apps/web/src/routes/read/[id]/+page.svelte:1-6, 186-207`
- Test: `apps/web/src/routes/read/[id]/page.test.ts`

**Interfaces:**
- Consumes: `STARTED_THRESHOLD` from `@readmepls/core` (Task 1), `flushSave()`
  from Task 3.
- Produces: `resolveInitialScroll(): void`, called once from `onMount` right
  after the existing `await tick()` call (content is in the DOM at that
  point).

- [ ] **Step 1: Write the failing tests**

Add to the `"reader page — progress"` describe block:

```ts
  it("resumes scroll to the saved position for an in-progress article", async () => {
    articleGetOne.mockResolvedValueOnce({ ...defaultArticle(), progress: 0.5 });
    Object.defineProperty(document.body, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    window.scrollTo = vi.fn();

    render(ReaderPage);
    await waitFor(() => expect(screen.getByText("Test Article")).toBeInTheDocument());

    // max = 2000 - 800 = 1200; target = 0.5 * 1200 = 600
    expect(window.scrollTo).toHaveBeenCalledWith(0, 600);
  });

  it("does not resume a barely-started article", async () => {
    articleGetOne.mockResolvedValueOnce({ ...defaultArticle(), progress: 0.01 });
    Object.defineProperty(document.body, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    window.scrollTo = vi.fn();

    render(ReaderPage);
    await waitFor(() => expect(screen.getByText("Test Article")).toBeInTheDocument());

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("marks a short article finished immediately, with no scroll required", async () => {
    articleGetOne.mockResolvedValueOnce({ ...defaultArticle(), progress: 0 });
    Object.defineProperty(document.body, "scrollHeight", { value: 400, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    const { container } = render(ReaderPage);
    await waitFor(() => expect(screen.getByText("Test Article")).toBeInTheDocument());

    await waitFor(() => expect(articleUpdate).toHaveBeenCalledWith("art1", { progress: 1 }));
    const bar = container.querySelector(".progress");
    expect(bar?.getAttribute("style")).toContain("--p: 1");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/routes/read/[id]/page.test.ts`
Expected: FAIL — `window.scrollTo` is never called, and the short-article
test never sees `articleUpdate` called with `{ progress: 1 }` (nothing runs
`resolveInitialScroll` yet).

- [ ] **Step 3: Write minimal implementation**

Modify the import line at the top of
`apps/web/src/routes/read/[id]/+page.svelte` — current:

```ts
  import { withReaderDefaults, anchoring, rangeOver, slugify } from "@readmepls/core";
```

Change to:

```ts
  import { withReaderDefaults, anchoring, rangeOver, slugify, STARTED_THRESHOLD } from "@readmepls/core";
```

Add the new function near `flushSave` (defined in Task 3):

```ts
  // Runs once on load, after content is in the DOM: restores scroll position
  // for an in-progress article, or — if the content fits the viewport with
  // no scrollbar — marks it finished immediately (no scroll event will ever
  // fire to do this later).
  function resolveInitialScroll() {
    const max = document.body.scrollHeight - window.innerHeight;
    if (max <= 0) {
      flushSave();
      return;
    }
    if (progress > STARTED_THRESHOLD) {
      window.scrollTo(0, progress * max);
    }
  }
```

Wire it into `onMount` — current:

```ts
    await tick();
    await loadHighlights(id);
```

Change to:

```ts
    await tick();
    resolveInitialScroll();
    await loadHighlights(id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/routes/read/[id]/page.test.ts`
Expected: PASS — every test in the file.

- [ ] **Step 5: Run the whole web test suite to confirm no regression**

Run: `npx vitest run apps/web`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/read/[id]/+page.svelte apps/web/src/routes/read/[id]/page.test.ts
git commit -m "feat(web): resume reading position and auto-finish short articles"
```

---

### Task 5: Library card — bottom progress bar

**Files:**
- Modify: `apps/web/src/lib/components/ArticleCard.svelte`
- Test: `apps/web/src/lib/components/ArticleCard.test.ts`

**Interfaces:**
- Consumes: `STARTED_THRESHOLD`, `FINISHED_THRESHOLD` from `@readmepls/core`
  (Task 1).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/lib/components/ArticleCard.test.ts`, inside the existing
`describe("ArticleCard", ...)` block:

```ts
  it("shows a bottom progress bar for an in-progress article", () => {
    const { container } = render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }, { progress: 0.45 }),
    });
    const bar = container.querySelector(".progress-bar");
    expect(bar?.getAttribute("style")).toContain("--p: 0.45");
  });

  it("hides the progress bar for an unread article", () => {
    const { container } = render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }, { progress: 0 }),
    });
    expect(container.querySelector(".progress-bar")).not.toBeInTheDocument();
  });

  it("hides the progress bar for a finished article", () => {
    const { container } = render(ArticleCard, {
      article: article({ extract_status: "ok", title: "Hello", ai_tags_json: [] }, { progress: 0.99 }),
    });
    expect(container.querySelector(".progress-bar")).not.toBeInTheDocument();
  });

  it("hides the progress bar while processing, even if progress is set", () => {
    const { container } = render(ArticleCard, {
      article: article(null, { progress: 0.5 }),
    });
    expect(container.querySelector(".progress-bar")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/src/lib/components/ArticleCard.test.ts`
Expected: FAIL — `.progress-bar` is never found (element doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Modify `apps/web/src/lib/components/ArticleCard.svelte` — add the import and
widen the prop type. Current:

```ts
  import { deriveCardState } from "$lib/article/card-state.js";
  import { sourceView } from "$lib/source/source-view.js";
  import { browserPb } from "$lib/pb.js";
  import { page } from "$app/stores";

  let {
    article,
    onRetry,
    onDelete,
    collections,
    onAddToCollection,
    onArchive,
    onUnarchive,
  }: {
    // any: PocketBase SDK returns expand records as loosely-typed RecordModel; narrowing here would duplicate the full content schema.
    article: { id: string; url: string; status?: string; expand?: { content?: any } };
    onRetry?: (id: string) => void;
    onDelete?: (id: string) => void;
    collections?: { id: string; name: string }[];
    onAddToCollection?: (articleId: string, collectionId: string) => void;
    onArchive?: (id: string) => void;
    onUnarchive?: (id: string) => void;
  } = $props();
```

Change to:

```ts
  import { deriveCardState } from "$lib/article/card-state.js";
  import { sourceView } from "$lib/source/source-view.js";
  import { browserPb } from "$lib/pb.js";
  import { page } from "$app/stores";
  import { STARTED_THRESHOLD, FINISHED_THRESHOLD } from "@readmepls/core";

  let {
    article,
    onRetry,
    onDelete,
    collections,
    onAddToCollection,
    onArchive,
    onUnarchive,
  }: {
    // any: PocketBase SDK returns expand records as loosely-typed RecordModel; narrowing here would duplicate the full content schema.
    article: { id: string; url: string; status?: string; progress?: number; expand?: { content?: any } };
    onRetry?: (id: string) => void;
    onDelete?: (id: string) => void;
    collections?: { id: string; name: string }[];
    onAddToCollection?: (articleId: string, collectionId: string) => void;
    onArchive?: (id: string) => void;
    onUnarchive?: (id: string) => void;
  } = $props();
```

Add a derived value near the other `$derived`s. Current:

```ts
  const isArchived = $derived(article.status === "archived");
  const hasMenu = $derived(!!(onAddToCollection || onArchive || onUnarchive || onDelete));
```

Change to:

```ts
  const isArchived = $derived(article.status === "archived");
  const hasMenu = $derived(!!(onAddToCollection || onArchive || onUnarchive || onDelete));
  const showProgress = $derived(
    (article.progress ?? 0) > STARTED_THRESHOLD && (article.progress ?? 0) < FINISHED_THRESHOLD,
  );
```

Add the bar markup inside the `{:else}` branch (the "ready" state), after the
`tags` div. Current:

```svelte
    <div class="tags">
      {#each tags as t}<Tag>{t}</Tag>{/each}
    </div>
  {/if}
```

Change to:

```svelte
    <div class="tags">
      {#each tags as t}<Tag>{t}</Tag>{/each}
    </div>
    {#if showProgress}
      <div class="progress-bar" style="--p: {article.progress}" aria-hidden="true"></div>
    {/if}
  {/if}
```

Add the CSS at the end of the `<style>` block:

```css
  .progress-bar {
    position: absolute; left: 0; bottom: 0;
    height: 3px; width: calc(var(--p) * 100%);
    background: var(--color-accent);
    z-index: 2;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/src/lib/components/ArticleCard.test.ts`
Expected: PASS — all tests, including the pre-existing ones.

- [ ] **Step 5: Run the whole web test suite and typecheck to confirm no regression**

Run: `npx vitest run apps/web`
Expected: PASS

Run: `cd apps/web && npx svelte-check --tsconfig ./tsconfig.json`
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/components/ArticleCard.svelte apps/web/src/lib/components/ArticleCard.test.ts
git commit -m "feat(web): show reading progress on library cards"
```

---

## Final verification

- [ ] Run the full repo test suite: `npm test` (root) — expect all green.
- [ ] Run root typecheck: `npm run typecheck` — expect no new errors.
- [ ] Manually open the app (`npm run dev` in `apps/web`), capture an article,
  scroll partway, navigate back to the library, confirm the card shows a
  bottom progress bar, reopen the article, confirm it resumes near the same
  scroll position and the top bar reflects it immediately (no flash to 0%).
