import { describe, it, expect } from "vitest";
import { deriveLibrarySources, filterBySources } from "./library-sources.js";

const art = (id: string, sourceId: string | null, host = "h.com", name: string | null = null) => ({
  id, url: "u", status: "unread", progress: 0,
  expand: sourceId ? { content: { expand: { source: { id: sourceId, host, name, favicon: "" } } } } : { content: {} },
});

describe("deriveLibrarySources", () => {
  it("counts distinct sources present in the library", () => {
    const facets = deriveLibrarySources(
      [art("1", "s1", "a.com"), art("2", "s1", "a.com"), art("3", "s2", "b.com")],
      new Set(),
    );
    const byId = Object.fromEntries(facets.map((f) => [f.id, f]));
    expect(byId["s1"]!.count).toBe(2);
    expect(byId["s2"]!.count).toBe(1);
  });

  it("sorts favorites first, then by count desc", () => {
    const facets = deriveLibrarySources(
      [art("1", "s1", "a.com"), art("2", "s1", "a.com"), art("3", "s2", "b.com")],
      new Set(["s2"]),
    );
    expect(facets[0]!.id).toBe("s2"); // favorite pinned first despite lower count
    expect(facets[0]!.favorite).toBe(true);
  });

  it("ignores articles with no source", () => {
    expect(deriveLibrarySources([art("1", null)], new Set())).toEqual([]);
  });
});

describe("filterBySources", () => {
  const arts = [art("1", "s1"), art("2", "s2"), art("3", "s1")];
  it("returns all when nothing selected", () => {
    expect(filterBySources(arts, new Set()).length).toBe(3);
  });
  it("returns the union of selected sources", () => {
    expect(filterBySources(arts, new Set(["s1"])).map((a) => a.id)).toEqual(["1", "3"]);
  });
});
