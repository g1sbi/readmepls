import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchLive } from "./live-client.js";

describe("fetchLive", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("requests the endpoint with q and mode and parses the result", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            articles: [
              { id: "a1", title: "T", snippet: "s", sourceName: "src" },
            ],
            tags: [],
            collections: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchLive("rust", "hybrid");
    const calledUrl = new URL(
      fetchMock.mock.calls[0]![0] as string,
      "http://localhost",
    );
    expect(calledUrl.pathname).toBe("/api/search/live");
    expect(calledUrl.searchParams.get("q")).toBe("rust");
    expect(calledUrl.searchParams.get("mode")).toBe("hybrid");
    expect(r.articles[0]!.id).toBe("a1");
  });

  it("returns empty sections on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    expect(await fetchLive("x", "keyword")).toEqual({
      articles: [],
      tags: [],
      collections: [],
    });
  });

  it("returns empty sections on malformed JSON response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not valid json {", { status: 200 })),
    );
    expect(await fetchLive("x", "keyword")).toEqual({
      articles: [],
      tags: [],
      collections: [],
    });
  });

  it("returns empty sections when response JSON fails schema validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ invalid: "schema", missing: "required fields" }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    expect(await fetchLive("x", "keyword")).toEqual({
      articles: [],
      tags: [],
      collections: [],
    });
  });
});
