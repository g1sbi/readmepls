import { describe, it, expect, vi } from "vitest";

const { fetchLibraryPage, fetchFacetOptions } = vi.hoisted(() => {
  return {
    fetchLibraryPage: vi.fn(async () => ({ items: [], totalItems: 7, page: 1, perPage: 24 })),
    fetchFacetOptions: vi.fn(async () => ({ tags: [], collections: [], options: { sources: [], languages: [], authors: [] } })),
  };
});

vi.mock("@readmepls/core", async (orig) => ({ ...(await orig<typeof import("@readmepls/core")>()), fetchLibraryPage, fetchFacetOptions }));

import { load } from "./+page.server.js";

describe("library load", () => {
  it("parses the URL params and returns page + facets", async () => {
    const url = new URL("http://x/library?read=unread&sort=-read_time");
    const locals = { pb: { authStore: { model: null } } } as never;
    const data = await load({ url, locals } as never);
    expect(data.params.read).toEqual(["unread"]);
    expect(data.params.sort).toBe("-read_time");
    expect(data.page.totalItems).toBe(7);
    expect(fetchLibraryPage).toHaveBeenCalled();
    expect(fetchFacetOptions).toHaveBeenCalled();
  });
});
