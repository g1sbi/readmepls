import { describe, it, expect, vi, beforeEach } from "vitest";
import type PocketBase from "pocketbase";

vi.mock("$env/dynamic/private", () => ({
  env: { WORKER_URL: "http://worker:8091", WORKER_SEARCH_SECRET: "s" },
}));

vi.mock("@readmepls/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@readmepls/core")>()),
  keywordSearchIds: vi.fn(),
}));

import { keywordSearchIds } from "@readmepls/core";
import { liveSearch } from "./live-search.js";

// A minimal pb stub: getFullList for articles, getList for tags/collections.
function pbStub(over: Partial<Record<string, unknown>> = {}) {
  const articleRow = {
    id: "a1",
    expand: {
      content: {
        title: "Tokio",
        excerpt: "async runtime",
        expand: { source: { name: "blog", host: "b.io" } },
      },
    },
  };
  return {
    filter: (expr: string, params?: Record<string, unknown>) =>
      `FILTER(${expr})`,
    collection: (name: string) => {
      if (name === "articles")
        return { getFullList: vi.fn(async () => [articleRow]) };
      if (name === "tags")
        return {
          getList: vi.fn(async () => ({ items: [{ id: "t1", name: "rust" }] })),
        };
      if (name === "collections")
        return {
          getList: vi.fn(async () => ({
            items: [{ id: "c1", name: "later", slug: "later" }],
          })),
        };
      throw new Error(`unexpected collection ${name}`);
    },
    ...over,
  } as unknown as PocketBase;
}

describe("liveSearch", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns empty sections for a blank query without hitting pb", async () => {
    const pb = pbStub();
    expect(await liveSearch(pb, "   ", "keyword", "u1")).toEqual({
      articles: [],
      tags: [],
      collections: [],
    });
  });

  it("keyword mode: resolves ids, fetches records, shapes result", async () => {
    vi.mocked(keywordSearchIds).mockResolvedValue(["a1"]);
    const pb = pbStub();
    const r = await liveSearch(pb, "tokio", "keyword", "u1");
    expect(keywordSearchIds).toHaveBeenCalled();
    expect(r.articles).toEqual([
      {
        id: "a1",
        title: "Tokio",
        snippet: "async runtime",
        sourceName: "blog",
      },
    ]);
    expect(r.tags).toEqual([{ id: "t1", name: "rust" }]);
    expect(r.collections).toEqual([{ id: "c1", name: "later", slug: "later" }]);
  });

  it("hybrid mode: uses the worker (RRF) instead of keyword-only", async () => {
    vi.mocked(keywordSearchIds).mockResolvedValue(["a1"]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ results: [{ articleId: "a1" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const pb = pbStub();
    const r = await liveSearch(pb, "tokio", "hybrid", "u1");
    // hybrid fuses keyword + semantic; a1 survives fusion and is shaped.
    expect(r.articles.map((a) => a.id)).toEqual(["a1"]);
  });

  it("returns no articles when the resolver finds nothing (still queries tags/collections)", async () => {
    vi.mocked(keywordSearchIds).mockResolvedValue([]);
    const pb = pbStub();
    const r = await liveSearch(pb, "zzz", "keyword", "u1");
    expect(r.articles).toEqual([]);
    expect(r.tags).toEqual([{ id: "t1", name: "rust" }]);
  });
});
