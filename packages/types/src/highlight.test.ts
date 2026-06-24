import { describe, it, expect } from "vitest";
import { HighlightSelector, Highlight, HighlightColor } from "./highlight.js";

describe("highlight types", () => {
  it("parses a selector", () => {
    const sel = HighlightSelector.parse({
      text: "the quick brown fox",
      prefix: "saw ", suffix: " jump",
      startOffset: 10, endOffset: 29,
    });
    expect(sel.text).toBe("the quick brown fox");
  });

  it("rejects an unknown color", () => {
    expect(() => HighlightColor.parse("blue")).toThrow();
  });

  it("parses a full highlight record", () => {
    const h = Highlight.parse({
      id: "abc", user: "u1", article: "a1",
      text: "x", prefix: "", suffix: "",
      startOffset: 0, endOffset: 1,
      color: "amber", note: "", created: "2026-06-24T00:00:00Z",
    });
    expect(h.color).toBe("amber");
  });
});
