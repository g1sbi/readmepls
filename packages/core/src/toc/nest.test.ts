import { describe, it, expect } from "vitest";
import { nestHeadings, makeIdDeduper, type FlatHeading } from "./nest.js";

describe("nestHeadings", () => {
  it("nests deeper headings under shallower ones", () => {
    const flat: FlatHeading[] = [
      { id: "a", text: "A", level: 2 },
      { id: "a1", text: "A1", level: 3 },
      { id: "b", text: "B", level: 2 },
    ];
    const tree = nestHeadings(flat);
    expect(tree.map((n) => n.id)).toEqual(["a", "b"]);
    expect(tree[0]!.children.map((n) => n.id)).toEqual(["a1"]);
    expect(tree[1]!.children).toEqual([]);
  });

  it("treats the shallowest present level as the top level", () => {
    // No h1/h2 present — h3 headings should be roots, not orphaned.
    const flat: FlatHeading[] = [
      { id: "x", text: "X", level: 3 },
      { id: "y", text: "Y", level: 3 },
    ];
    expect(nestHeadings(flat).map((n) => n.id)).toEqual(["x", "y"]);
  });

  it("nests a skipped level (h2 then h4) without a phantom node", () => {
    const flat: FlatHeading[] = [
      { id: "a", text: "A", level: 2 },
      { id: "deep", text: "Deep", level: 4 },
    ];
    const tree = nestHeadings(flat);
    expect(tree[0]!.children.map((n) => n.id)).toEqual(["deep"]);
    expect(tree[0]!.children[0]!.level).toBe(4);
  });

  it("returns [] for no headings", () => {
    expect(nestHeadings([])).toEqual([]);
  });
});

describe("makeIdDeduper", () => {
  it("suffixes collisions and falls back for empty base", () => {
    const dedupe = makeIdDeduper();
    expect(dedupe("intro")).toBe("intro");
    expect(dedupe("intro")).toBe("intro-2");
    expect(dedupe("")).toBe("section");
    expect(dedupe("")).toBe("section-2");
  });
});
