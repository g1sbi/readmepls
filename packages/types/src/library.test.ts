import { describe, it, expect } from "vitest";
import { LibraryParams, SORTS } from "./library.js";

describe("LibraryParams", () => {
  it("applies defaults for an empty object", () => {
    const p = LibraryParams.parse({});
    expect(p).toMatchObject({
      read: [], time: [], tag: [], collection: [], source: [],
      favsrc: false, saved: null, published: null, lang: [], author: [],
      has: [], attention: [], q: "", sort: "-created", page: 1,
    });
  });

  it("accepts a fully populated object", () => {
    const p = LibraryParams.parse({
      read: ["unread"], time: ["long"], tag: ["t1"], favsrc: true,
      saved: "week", has: ["highlights"], attention: ["failed"],
      q: "neural", sort: "relevance", page: 3,
    });
    expect(p.read).toEqual(["unread"]);
    expect(p.sort).toBe("relevance");
    expect(p.page).toBe(3);
  });

  it("rejects an unknown sort value", () => {
    expect(() => LibraryParams.parse({ sort: "bogus" })).toThrow();
  });

  it("exposes the full sort union", () => {
    expect(SORTS).toContain("-read_time");
    expect(SORTS).toContain("relevance");
  });
});
