import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";

// vi.mock factories are hoisted above these module-level consts, so the
// consts themselves must be created via vi.hoisted to avoid a TDZ error
// (matches the pattern already used in routes/library/page.test.ts).
const { goto, fetchLive } = vi.hoisted(() => ({
  goto: vi.fn(),
  fetchLive: vi.fn(),
}));
vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$lib/search/live-client.js", () => ({ fetchLive }));

// Recently-read pb query stub.
vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    collection: () => ({ getList: vi.fn(async () => ({ items: [] })) }),
  }),
}));

import SearchPalette from "./SearchPalette.svelte";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";
import {
  clearRecentSearches,
  pushRecentSearch,
} from "$lib/search/recent-searches.js";

describe("SearchPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRecentSearches();
    searchPalette.close();
    fetchLive.mockResolvedValue({ articles: [], tags: [], collections: [] });
  });
  afterEach(() => searchPalette.close());

  it("renders nothing when closed", () => {
    render(SearchPalette);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens from the store and shows recent searches when empty", async () => {
    pushRecentSearch("rust");
    render(SearchPalette);
    searchPalette.open();
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByText("rust")).toBeInTheDocument();
  });

  it("fetches live results as the query changes and navigates to a picked article", async () => {
    fetchLive.mockResolvedValue({
      articles: [
        {
          id: "a1",
          title: "Tokio internals",
          snippet: "async",
          sourceName: "blog",
        },
      ],
      tags: [],
      collections: [],
    });
    render(SearchPalette);
    searchPalette.open();
    const input = await screen.findByRole("combobox");
    await fireEvent.input(input, { target: { value: "tokio" } });
    const item = await screen.findByText("Tokio internals");
    await fireEvent.click(item);
    expect(goto).toHaveBeenCalledWith("/read/a1");
    expect(searchPalette.isOpen).toBe(false);
  });

  it("navigates to the filtered library on 'see all'", async () => {
    fetchLive.mockResolvedValue({
      articles: [
        {
          id: "a1",
          title: "Tokio internals",
          snippet: "async",
          sourceName: "blog",
        },
      ],
      tags: [],
      collections: [],
    });
    render(SearchPalette);
    searchPalette.open();
    const input = await screen.findByRole("combobox");
    await fireEvent.input(input, { target: { value: "tokio" } });
    const seeAll = await screen.findByText(/see all/i);
    await fireEvent.click(seeAll);
    expect(goto).toHaveBeenCalledWith("/library?q=tokio");
  });

  it("navigates to a tag-filtered library when a tag is picked", async () => {
    fetchLive.mockResolvedValue({
      articles: [],
      tags: [{ id: "t1", name: "rust" }],
      collections: [],
    });
    render(SearchPalette);
    searchPalette.open();
    const input = await screen.findByRole("combobox");
    await fireEvent.input(input, { target: { value: "rus" } });
    const tag = await screen.findByText("rust");
    await fireEvent.click(tag);
    expect(goto).toHaveBeenCalledWith("/library?tag=t1");
  });

  it("still renders the keyword-phase result when it resolves after the hybrid-phase timer has fired", async () => {
    // Regression test for a shared-AbortController bug: the keyword request
    // (fired at 120ms) is made deliberately slower than the hybrid timer
    // (250ms). If the two phases share one AbortController, the hybrid
    // phase's runSearch() aborts the still in-flight keyword request before
    // it can resolve, so the fast keyword preview never renders. Each phase
    // must own its own controller so an abort in one phase can't cancel a
    // request in the other.
    const keywordResult = {
      articles: [
        {
          id: "kw1",
          title: "Keyword-phase result",
          snippet: "fast",
          sourceName: "blog",
        },
      ],
      tags: [],
      collections: [],
    };
    const hybridResult = {
      articles: [
        {
          id: "hy1",
          title: "Hybrid-phase result",
          snippet: "smart",
          sourceName: "blog",
        },
      ],
      tags: [],
      collections: [],
    };

    fetchLive.mockImplementation(
      (_q: string, mode: "keyword" | "hybrid", signal?: AbortSignal) => {
        if (mode === "keyword") {
          // Simulates network latency long enough that the hybrid-phase
          // timer (250ms) fires while this request is still in flight.
          return new Promise((resolve, reject) => {
            const t = setTimeout(() => resolve(keywordResult), 300);
            signal?.addEventListener("abort", () => {
              clearTimeout(t);
              reject(new DOMException("aborted", "AbortError"));
            });
          });
        }
        return new Promise((resolve) =>
          setTimeout(() => resolve(hybridResult), 5),
        );
      },
    );

    render(SearchPalette);
    searchPalette.open();
    const input = await screen.findByRole("combobox");
    await fireEvent.input(input, { target: { value: "tokio" } });

    expect(
      await screen.findByText("Keyword-phase result", {}, { timeout: 900 }),
    ).toBeInTheDocument();
  });
});
