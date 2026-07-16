import { describe, it, expect } from "vitest";
import type { LiveArticle } from "@readmepls/types";
import { shapeLiveSearch, DEFAULT_LIVE_CAPS } from "./live-search.js";

const art = (id: string): LiveArticle => ({
  id,
  title: id.toUpperCase(),
  snippet: "",
  sourceName: "",
});

describe("shapeLiveSearch", () => {
  it("orders articles by the ranked id list", () => {
    const map = new Map([
      ["a", art("a")],
      ["b", art("b")],
      ["c", art("c")],
    ]);
    const r = shapeLiveSearch(["c", "a", "b"], map, [], []);
    expect(r.articles.map((a) => a.id)).toEqual(["c", "a", "b"]);
  });

  it("drops ranked ids with no matching record", () => {
    const map = new Map([["a", art("a")]]);
    const r = shapeLiveSearch(["a", "ghost"], map, [], []);
    expect(r.articles.map((a) => a.id)).toEqual(["a"]);
  });

  it("caps each section", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const map = new Map(ids.map((id) => [id, art(id)]));
    const tags = ids.map((id) => ({ id, name: id }));
    const cols = ids.map((id) => ({ id, name: id, slug: id }));
    const r = shapeLiveSearch(ids, map, tags, cols, {
      articles: 2,
      tags: 3,
      collections: 1,
    });
    expect(r.articles).toHaveLength(2);
    expect(r.tags).toHaveLength(3);
    expect(r.collections).toHaveLength(1);
  });

  it("uses default caps when none supplied", () => {
    expect(DEFAULT_LIVE_CAPS.articles).toBeGreaterThan(0);
    const r = shapeLiveSearch([], new Map(), [], []);
    expect(r).toEqual({ articles: [], tags: [], collections: [] });
  });
});
