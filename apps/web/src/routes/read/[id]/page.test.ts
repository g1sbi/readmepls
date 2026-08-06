import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/svelte";

// jsdom doesn't implement IntersectionObserver (github.com/jsdom/jsdom/issues/2032).
// The reader page's chapters scroll-spy constructs one on mount, so mounting it
// here needs this to exist. Scoped to this file only (not vitest-setup.ts) —
// reveal.test.ts specifically asserts behavior for when it's ABSENT, so a
// global polyfill would break that test.
class IntersectionObserverStub implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}
globalThis.IntersectionObserver =
  IntersectionObserverStub as unknown as typeof IntersectionObserver;

// Reader page reads matchMedia for the desktop/mobile split; default to mobile
// so the mobile chrome (bottom bar, sheets, floating back link) renders here.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

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

// Provide the page store that the component reads for $page.params.id.
// The reader page imports from $app/stores (Svelte 4 store API), which the
// vitest config does not alias; vi.mock intercepts it here.
vi.mock("$app/stores", () => ({
  page: {
    subscribe: (fn: (v: unknown) => void) => {
      fn({
        params: { id: "art1" },
        url: new URL("http://localhost/read/art1"),
      });
      return () => {};
    },
  },
}));

// Mock @readmepls/core to avoid pulling in @apache-annotator/dom, which
// transitively imports optimal-select. The optimal-select alias that fixes its
// broken package.json entry is only present in vite.config.ts, not
// vitest.config.ts, so the import would crash without this mock.
vi.mock("@readmepls/core", () => ({
  withReaderDefaults: (partial?: Record<string, unknown>) => ({
    font: "sans",
    size: 18,
    lineHeight: 1.6,
    width: "normal",
    theme: "light",
    ...(partial ?? {}),
  }),
  anchoring: {
    anchor: vi.fn().mockResolvedValue(null),
    describe: vi.fn(),
  },
  rangeOver: vi.fn(() => document.createRange()),
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, "-"),
  STARTED_THRESHOLD: 0.02,
  FINISHED_THRESHOLD: 0.98,
  // Real (not stubbed) — pure functions with no problematic transitive deps,
  // needed by buildTocFromDom's legacy-fallback toc parsing.
  nestHeadings: (items: { id: string; text: string; level: number }[]) => {
    const roots: unknown[] = [];
    const stack: { level: number; children: unknown[] }[] = [];
    for (const it of items) {
      const node = { ...it, children: [] as unknown[] };
      while (stack.length && stack[stack.length - 1]!.level >= node.level)
        stack.pop();
      if (stack.length === 0) roots.push(node);
      else stack[stack.length - 1]!.children.push(node);
      stack.push(node);
    }
    return roots;
  },
  makeIdDeduper: (reserved?: Iterable<string>) => {
    const seen = new Map<string, number>();
    if (reserved)
      for (const r of reserved) if (r) seen.set(r, (seen.get(r) ?? 0) + 1);
    return (base: string) => {
      const key = base || "section";
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return n === 1 ? key : `${key}-${n}`;
    };
  },
}));

// Stub DOM highlight helpers. unmarkAll is always called (even with 0
// highlights) inside renderMarks(). The real impl manipulates DOM node trees
// in ways that require a real browser layout engine — stub it here.
vi.mock("$lib/highlight/render", () => ({
  markRange: vi.fn(),
  unmarkAll: vi.fn(),
}));

// $app/navigation is already aliased in vitest.config.ts to
// src/__mocks__/app-navigation.ts, which exports goto as vi.fn(). Import it
// after mocks are registered so the same reference is available for assertions.
import ReaderPage from "./+page.svelte";
import { goto } from "$app/navigation";
import { unmarkAll } from "$lib/highlight/render";

// ---------------------------------------------------------------------------

describe("reader page — delete error path", () => {
  beforeEach(() => {
    // Reset call history (not implementations) so assertions don't leak
    // across tests. articleDelete keeps its mockResolvedValue default.
    vi.clearAllMocks();
  });

  it("surfaces an error and does NOT navigate when delete rejects", async () => {
    // Make the next call to articles.delete() fail
    articleDelete.mockRejectedValueOnce(new Error("server error"));

    render(ReaderPage);

    // Wait for onMount to fetch the article and render the content branch
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );

    // Article actions (archive/delete/add to collection) live in the mobile
    // "more" sheet — open it before interacting with anything inside.
    await fireEvent.click(screen.getByText("more"));

    // Trigger the confirm-delete dialog
    await fireEvent.click(
      screen.getByRole("button", { name: "delete article" }),
    );

    // Confirm the deletion (the button inside ConfirmDialog)
    await fireEvent.click(screen.getByRole("button", { name: "delete" }));

    // Error alert must appear with the exact production message
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "couldn't delete that. try again.",
      ),
    );

    // Navigation must NOT have been attempted on failure
    expect(goto).not.toHaveBeenCalled();
  });

  it("no longer offers to create collections from the reader", async () => {
    render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );
    await fireEvent.click(screen.getByText("more"));
    expect(screen.queryByLabelText(/new collection/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "add to collection" }),
    ).toBeInTheDocument();
  });

  it("archives the article and navigates to the library", async () => {
    render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );
    await fireEvent.click(screen.getByText("more"));
    await fireEvent.click(
      screen.getByRole("button", { name: "archive article" }),
    );
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/library"));
  });

  it("does not flush a progress write on teardown after a successful delete", async () => {
    // computeProgress() still runs during the onDestroy flush attempt; give it
    // real geometry so it doesn't throw, even though the point is that the
    // update call should never reach articles.update at all.
    Object.defineProperty(document.body, "scrollHeight", {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      configurable: true,
    });

    const { unmount } = render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );
    await fireEvent.click(screen.getByText("more"));

    await fireEvent.click(
      screen.getByRole("button", { name: "delete article" }),
    );
    await fireEvent.click(screen.getByRole("button", { name: "delete" }));

    await waitFor(() => expect(goto).toHaveBeenCalledWith("/library"));

    articleUpdate.mockClear(); // ignore any pre-delete writes (e.g. mount-time status update)

    unmount();

    expect(articleUpdate).not.toHaveBeenCalledWith(
      "art1",
      expect.objectContaining({ progress: expect.anything() }),
    );
  });
});

describe("reader page — progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    articleGetOne.mockResolvedValue(defaultArticle());
    articleUpdate.mockResolvedValue({});
  });

  it("seeds the progress bar from the loaded article before any scroll", async () => {
    articleGetOne.mockResolvedValueOnce({
      ...defaultArticle(),
      progress: 0.42,
    });
    // The progress strip itself renders in +layout.svelte (see release-transform-
    // containing-block.ts for why); this component only pushes into the
    // "readProgress" context it's given, so assert against that instead of a
    // local DOM node.
    const setProgress = vi.fn();
    render(ReaderPage, {
      context: new Map([["readProgress", { set: setProgress }]]),
    });
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );
    expect(setProgress).toHaveBeenCalledWith(0.42);
  });

  it("saves progress after the debounced scroll delay", async () => {
    Object.defineProperty(document.body, "scrollHeight", {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      configurable: true,
    });

    render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );
    // The scroll listener attaches after resolveInitialScroll but before
    // loadHighlights/loadTags/loadCollections; unmarkAll (called inside
    // loadHighlights) is the first reliable signal it's live — "Test Article"
    // appears several awaits earlier and races the listener attachment.
    await waitFor(() => expect(unmarkAll).toHaveBeenCalled());

    // Switch to fake timers only after the initial render/network resolution
    // has settled — waitFor's internal polling relies on real timers, so
    // enabling fake timers earlier would deadlock it.
    vi.useFakeTimers();
    Object.defineProperty(window, "scrollY", {
      value: 600,
      configurable: true,
    });
    await fireEvent.scroll(window);
    expect(articleUpdate).not.toHaveBeenCalledWith("art1", { progress: 0.5 });

    await vi.advanceTimersByTimeAsync(400);
    expect(articleUpdate).toHaveBeenCalledWith("art1", { progress: 0.5 });

    vi.useRealTimers();
  });

  it("flushes the pending save immediately when the component unmounts", async () => {
    Object.defineProperty(document.body, "scrollHeight", {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      configurable: true,
    });

    const { unmount } = render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );
    // See "saves progress after the debounced scroll delay" — the scroll
    // listener attaches later than the article content renders.
    await waitFor(() => expect(unmarkAll).toHaveBeenCalled());
    articleUpdate.mockClear(); // ignore the mount-time "status: reading" write

    // max = 2000 - 800 = 1200; scrollY 300 -> progress 0.25
    Object.defineProperty(window, "scrollY", {
      value: 300,
      configurable: true,
    });
    await fireEvent.scroll(window); // debounce timer now pending, hasn't fired

    unmount();
    expect(articleUpdate).toHaveBeenCalledWith("art1", { progress: 0.25 });
  });

  it("does not corrupt progress using the destination page's geometry when torn down mid-navigation", async () => {
    Object.defineProperty(document.body, "scrollHeight", {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      configurable: true,
    });

    const { unmount } = render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );
    // See "saves progress after the debounced scroll delay" — the scroll
    // listener attaches later than the article content renders.
    await waitFor(() => expect(unmarkAll).toHaveBeenCalled());
    articleUpdate.mockClear();

    // max = 2000 - 800 = 1200; scrollY 600 -> progress 0.5
    Object.defineProperty(window, "scrollY", {
      value: 600,
      configurable: true,
    });
    await fireEvent.scroll(window);

    // In a real SPA navigation, SvelteKit swaps the outgoing page's DOM for
    // the destination page's (e.g. the short library list) before/while this
    // component's onDestroy fires. Simulate that by shrinking scrollHeight
    // out from under the component right before unmount: a naive re-measure
    // at teardown would see max <= 0 and wrongly mark the article "finished".
    Object.defineProperty(document.body, "scrollHeight", {
      value: 100,
      configurable: true,
    });

    unmount();

    expect(articleUpdate).toHaveBeenCalledWith("art1", { progress: 0.5 });
    expect(articleUpdate).not.toHaveBeenCalledWith("art1", { progress: 1 });
  });

  it("flushes the pending save when the tab is hidden", async () => {
    Object.defineProperty(document.body, "scrollHeight", {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      configurable: true,
    });

    render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );
    // See "saves progress after the debounced scroll delay" — the scroll
    // listener attaches later than the article content renders.
    await waitFor(() => expect(unmarkAll).toHaveBeenCalled());
    articleUpdate.mockClear();

    // max = 2000 - 800 = 1200; scrollY 1200 -> progress 1 (clamped, reached bottom)
    Object.defineProperty(window, "scrollY", {
      value: 1200,
      configurable: true,
    });
    await fireEvent.scroll(window); // debounce timer now pending

    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(articleUpdate).toHaveBeenCalledWith("art1", { progress: 1 });
  });

  it("resumes scroll to the saved position for an in-progress article", async () => {
    articleGetOne.mockResolvedValueOnce({ ...defaultArticle(), progress: 0.5 });
    Object.defineProperty(document.body, "scrollHeight", {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      configurable: true,
    });
    window.scrollTo = vi.fn();

    render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );

    // max = 2000 - 800 = 1200; target = 0.5 * 1200 = 600
    // Svelte's tick() resolves one microtask after its internal flushSync (see
    // svelte/internal/client/runtime.js), one tick later than the DOM mutation
    // testing-library's MutationObserver-backed waitFor above reacts to — so
    // this check needs its own waitFor rather than a bare assertion.
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith(0, 600));
  });

  it("does not resume a barely-started article", async () => {
    articleGetOne.mockResolvedValueOnce({
      ...defaultArticle(),
      progress: 0.01,
    });
    Object.defineProperty(document.body, "scrollHeight", {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      configurable: true,
    });
    window.scrollTo = vi.fn();

    render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );

    // resolveInitialScroll() runs synchronously before loadHighlights() is
    // awaited in onMount, and unmarkAll() is the first thing loadHighlights'
    // renderMarks() does (see +page.svelte). Waiting for it confirms
    // resolveInitialScroll has already had its chance to call scrollTo —
    // without this, the assertion below would resolve one microtask too
    // early (same race documented on the sibling "resumes scroll..." test
    // above) and pass vacuously regardless of whether the STARTED_THRESHOLD
    // gate is implemented correctly.
    await waitFor(() => expect(unmarkAll).toHaveBeenCalled());

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("does not resume a finished article", async () => {
    articleGetOne.mockResolvedValueOnce({
      ...defaultArticle(),
      progress: 0.99,
    });
    Object.defineProperty(document.body, "scrollHeight", {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      configurable: true,
    });
    window.scrollTo = vi.fn();

    render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );

    // Same race as "does not resume a barely-started article" above — wait for
    // unmarkAll (called inside loadHighlights, which runs right after
    // resolveInitialScroll in onMount) so the assertion below doesn't resolve
    // one microtask too early and pass vacuously.
    await waitFor(() => expect(unmarkAll).toHaveBeenCalled());

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("links to the original article in a new tab", async () => {
    render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );
    const link = screen.getByRole("link", { name: /open original/i });
    expect(link).toHaveAttribute("href", "https://example.com/p");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not render the original link for a non-http url", async () => {
    articleGetOne.mockResolvedValueOnce({
      ...defaultArticle(),
      url: "javascript:alert(1)",
    });
    render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("link", { name: /open original/i }),
    ).not.toBeInTheDocument();
  });

  it("marks a short article finished immediately, with no scroll required", async () => {
    articleGetOne.mockResolvedValueOnce({ ...defaultArticle(), progress: 0 });
    Object.defineProperty(document.body, "scrollHeight", {
      value: 400,
      configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      configurable: true,
    });

    const setProgress = vi.fn();
    render(ReaderPage, {
      context: new Map([["readProgress", { set: setProgress }]]),
    });
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );

    await waitFor(() =>
      expect(articleUpdate).toHaveBeenCalledWith("art1", { progress: 1 }),
    );
    expect(setProgress).toHaveBeenCalledWith(1);
  });
});

describe("reader page — chapters sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    articleUpdate.mockResolvedValue({});
  });

  it("shows a chapters sidebar built from article headings, opened from the mobile bar", async () => {
    // No worker-emitted toc on this content record — legacy fallback path
    // should parse the rendered headings out of content_html itself.
    articleGetOne.mockResolvedValueOnce({
      ...defaultArticle(),
      expand: {
        content: {
          id: "c1",
          title: "Test Article",
          content_html:
            "<h2>First Chapter</h2><p>...</p><h2>Second Chapter</h2>",
          extract_status: "ok",
        },
      },
    });

    render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );

    // On mobile the toc lives inside a sheet, not on the page by default —
    // it only appears once the bar's "chapters" item is tapped.
    // The bar's "chapters" item only appears once resolveToc() has run (a tick
    // or more after the article heading first renders) — findByText retries
    // until then rather than racing a synchronous getByText.
    await fireEvent.click(await screen.findByText("chapters"));

    const nav = await screen.findByRole("navigation", { name: "chapters" });
    expect(nav).toBeTruthy();
    // Scoped to the nav — content_html's real <h2>First Chapter</h2> also
    // renders in the article body itself, so an unscoped query would match twice.
    expect(within(nav).getByText("First Chapter")).toBeTruthy();
  });
});

describe("reader page — mobile control chrome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    articleUpdate.mockResolvedValue({});
  });

  it("shows the mobile control bar and opens chapters from it", async () => {
    articleGetOne.mockResolvedValueOnce({
      ...defaultArticle(),
      expand: {
        content: {
          id: "c1",
          title: "Test Article",
          content_html:
            "<h2>First Chapter</h2><p>...</p><h2>Second Chapter</h2>",
          extract_status: "ok",
        },
      },
    });

    render(ReaderPage);
    await waitFor(() =>
      expect(screen.getByText("Test Article")).toBeInTheDocument(),
    );

    // bar present
    expect(
      await screen.findByRole("navigation", { name: "reader controls" }),
    ).toBeTruthy();
    // floating exit present
    expect(screen.getByRole("link", { name: "library" })).toBeTruthy();
    // no visible chapters nav until the bar item is tapped
    // The bar's "chapters" item only appears once resolveToc() has run (a tick
    // or more after the article heading first renders) — findByText retries
    // until then rather than racing a synchronous getByText.
    await fireEvent.click(await screen.findByText("chapters"));
    const nav = await screen.findByRole("navigation", { name: "chapters" });
    expect(nav).toBeTruthy();
    // Scoped to the nav — content_html's real <h2>First Chapter</h2> also
    // renders in the article body itself, so an unscoped query would match twice.
    expect(within(nav).getByText("First Chapter")).toBeTruthy();
  });
});
