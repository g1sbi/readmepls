import { describe, it, expect } from "vitest";
import { TocEntry } from "./toc.js";

describe("TocEntry", () => {
  it("parses a nested tree", () => {
    const tree = [
      {
        id: "intro",
        text: "Intro",
        level: 2,
        children: [
          { id: "background", text: "Background", level: 3, children: [] },
        ],
      },
    ];
    expect(TocEntry.array().parse(tree)).toEqual(tree);
  });

  it("rejects an out-of-range heading level", () => {
    const bad = [{ id: "x", text: "X", level: 7, children: [] }];
    expect(TocEntry.array().safeParse(bad).success).toBe(false);
  });
});
