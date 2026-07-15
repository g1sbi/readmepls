import { describe, it, expect } from "vitest";
import { tallyCollectionCounts } from "./fetch.js";

const cols = [
  { id: "c1", name: "recipes", slug: "recipes" },
  { id: "c2", name: "work", slug: "work" },
  { id: "c3", name: "empty", slug: "empty" },
];

describe("tallyCollectionCounts", () => {
  it("counts items per collection and zero-fills the rest", () => {
    const items = [{ collection: "c1" }, { collection: "c1" }, { collection: "c2" }];
    expect(tallyCollectionCounts(cols, items)).toEqual([
      { id: "c1", name: "recipes", slug: "recipes", count: 2 },
      { id: "c2", name: "work", slug: "work", count: 1 },
      { id: "c3", name: "empty", slug: "empty", count: 0 },
    ]);
  });

  it("ignores items whose collection is not in the list", () => {
    const items = [{ collection: "cX" }, { collection: "c1" }];
    expect(tallyCollectionCounts(cols, items).find((c) => c.id === "c1")?.count).toBe(1);
  });
});
