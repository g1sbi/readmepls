import { describe, it, expect } from "vitest";
import { LiveSearchMode, LiveSearchResult } from "./live-search.js";

describe("live-search types", () => {
  it("accepts a valid mode", () => {
    expect(LiveSearchMode.parse("hybrid")).toBe("hybrid");
    expect(LiveSearchMode.parse("keyword")).toBe("keyword");
  });

  it("rejects an unknown mode", () => {
    expect(() => LiveSearchMode.parse("fuzzy")).toThrow();
  });

  it("defaults every section to an empty array", () => {
    expect(LiveSearchResult.parse({})).toEqual({
      articles: [],
      tags: [],
      collections: [],
    });
  });

  it("parses a populated result", () => {
    const r = LiveSearchResult.parse({
      articles: [{ id: "a1", title: "T", snippet: "s", sourceName: "src" }],
      tags: [{ id: "t1", name: "rust" }],
      collections: [{ id: "c1", name: "later", slug: "later" }],
    });
    expect(r.articles[0]!.title).toBe("T");
  });
});
