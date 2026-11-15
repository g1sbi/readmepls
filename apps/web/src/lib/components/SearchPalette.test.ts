import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import SearchPalette from "./SearchPalette.svelte";
import { searchPalette } from "$lib/stores/search-palette.svelte.js";

const { fetchLive, goto } = vi.hoisted(() => ({
  fetchLive: vi.fn(),
  goto: vi.fn(),
}));

vi.mock("$lib/pb.js", () => ({
  browserPb: () => ({
    collection: () => ({ getList: vi.fn().mockResolvedValue({ items: [] }) }),
  }),
}));
vi.mock("$lib/search/live-client.js", () => ({ fetchLive }));
vi.mock("$lib/search/recent-searches.js", () => ({
  loadRecentSearches: () => [],
  pushRecentSearch: vi.fn(),
}));
vi.mock("$app/navigation", () => ({ goto }));

describe("SearchPalette", () => {
  beforeEach(() => {
    searchPalette.close();
    fetchLive.mockResolvedValue({
      articles: [{ id: "article-1", title: "Orders" }],
      tags: [],
      collections: [],
    });
  });

  it("selects the first result and keeps See all out of search results", async () => {
    render(SearchPalette);
    searchPalette.open("orders");

    await screen.findByText("Orders");
    const firstResult = screen
      .getByText("Orders")
      .closest('[data-slot="command-item"]');
    expect(
      screen.getByText(/see all/i).closest('[data-slot="command-item"]'),
    ).toBeNull();
    expect(firstResult).not.toBeNull();
    expect(firstResult).toHaveAttribute("aria-selected", "true");

    await fireEvent.keyDown(
      screen.getByPlaceholderText(/search your library/i),
      {
        key: "Enter",
      },
    );

    expect(goto).toHaveBeenCalledWith("/read/article-1");
    expect(goto).not.toHaveBeenCalledWith("/library?q=orders");
  });
});
