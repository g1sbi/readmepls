import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

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
    await waitFor(() => expect(screen.getByText("Test Article")).toBeInTheDocument());
    expect(screen.queryByLabelText(/new collection/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "add to collection" })).toBeInTheDocument();
  });

  it("archives the article and navigates to the library", async () => {
    render(ReaderPage);
    await waitFor(() => expect(screen.getByText("Test Article")).toBeInTheDocument());
    await fireEvent.click(screen.getByRole("button", { name: "archive article" }));
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/library"));
  });
});

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
