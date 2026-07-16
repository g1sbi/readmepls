import { describe, it, expect, vi } from "vitest";

const { fetchLibraryPage, fetchFacetOptions, hybridSearchIds } = vi.hoisted(
  () => {
    return {
      fetchLibraryPage: vi.fn(async () => ({
        items: [],
        totalItems: 7,
        page: 1,
        perPage: 24,
      })),
      fetchFacetOptions: vi.fn(async () => ({
        tags: [],
        collections: [],
        options: { sources: [], languages: [], authors: [] },
      })),
      hybridSearchIds: vi.fn(async () => []),
    };
  },
);

vi.mock("@readmepls/core", async (orig) => ({
  ...(await orig<typeof import("@readmepls/core")>()),
  fetchLibraryPage,
  fetchFacetOptions,
}));
vi.mock("$lib/server/semantic-search", () => ({ hybridSearchIds }));

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

  // Regression: /search was deleted (it only ever redirected to /library?q=...).
  // This proves the surviving canonical search surface still works standalone.
  it("resolves ?q= via the hybrid search resolver and returns params.q", async () => {
    const url = new URL("http://x/library?q=rust");
    const locals = { pb: { authStore: { model: { id: "u1" } } } } as never;
    const data = await load({ url, locals } as never);
    expect(data.params.q).toBe("rust");
    expect(fetchLibraryPage).toHaveBeenCalledWith(
      locals.pb,
      data.params,
      expect.any(Date),
      expect.any(Function),
    );

    // fetchLibraryPage is mocked (it owns invoking the resolver internally in
    // production), so exercise the resolver +page.server.ts built to prove it
    // delegates to hybridSearchIds with the right args.
    const resolver = fetchLibraryPage.mock.calls.at(-1)?.[3] as (
      pb: unknown,
      q: string,
    ) => unknown;
    await resolver(locals.pb, "rust");
    expect(hybridSearchIds).toHaveBeenCalledWith(locals.pb, "rust", "u1");
  });
});
