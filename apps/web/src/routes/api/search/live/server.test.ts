import { describe, it, expect, vi, beforeEach } from "vitest";

const { liveSearch } = vi.hoisted(() => ({
  liveSearch: vi.fn(),
}));

vi.mock("$lib/server/live-search.js", () => ({
  liveSearch,
}));

import { GET } from "./+server.js";

function evt(search: string, userId: string | null) {
  return {
    url: new URL(`http://localhost/api/search/live${search}`),
    locals: { userId, pb: {} },
  } as unknown as Parameters<typeof GET>[0];
}

describe("GET /api/search/live", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s when unauthenticated", async () => {
    await expect(GET(evt("?q=x", null))).rejects.toMatchObject({ status: 401 });
    expect(liveSearch).not.toHaveBeenCalled();
  });

  it("returns empty sections for a blank query without calling liveSearch", async () => {
    const res = await GET(evt("?q=%20", "u1"));
    expect(await res.json()).toEqual({
      articles: [],
      tags: [],
      collections: [],
    });
    expect(liveSearch).not.toHaveBeenCalled();
  });

  it("defaults to keyword mode", async () => {
    liveSearch.mockResolvedValue({ articles: [], tags: [], collections: [] });
    await GET(evt("?q=rust", "u1"));
    expect(liveSearch).toHaveBeenCalledWith(
      expect.anything(),
      "rust",
      "keyword",
      "u1",
    );
  });

  it("passes hybrid mode through", async () => {
    liveSearch.mockResolvedValue({
      articles: [{ id: "a1", title: "T", snippet: "", sourceName: "" }],
      tags: [],
      collections: [],
    });
    const res = await GET(evt("?q=rust&mode=hybrid", "u1"));
    expect(liveSearch).toHaveBeenCalledWith(
      expect.anything(),
      "rust",
      "hybrid",
      "u1",
    );
    expect((await res.json()).articles).toHaveLength(1);
  });

  it("falls back to keyword on an invalid mode", async () => {
    liveSearch.mockResolvedValue({ articles: [], tags: [], collections: [] });
    await GET(evt("?q=rust&mode=bogus", "u1"));
    expect(liveSearch).toHaveBeenCalledWith(
      expect.anything(),
      "rust",
      "keyword",
      "u1",
    );
  });
});
