import { describe, it, expect } from "vitest";
import { markHighlights, highlightsSection } from "./highlights.js";
import type { Highlight } from "@readmepls/types";

function hl(p: Partial<Highlight>): Highlight {
  return {
    id: "h1", user: "u1", article: "a1", text: "", prefix: "", suffix: "",
    startOffset: 0, endOffset: 0, color: "terracotta", note: "", created: "2026",
    ...p,
  };
}

describe("markHighlights", () => {
  it("wraps a locatable highlight inline and leaves nothing unanchored", () => {
    const res = markHighlights("the quick brown fox jumps", [hl({ text: "brown fox" })]);
    expect(res.body).toBe("the quick ==brown fox== jumps");
    expect(res.unanchored).toHaveLength(0);
  });

  it("disambiguates duplicate text by prefix/suffix", () => {
    const res = markHighlights("cat dog cat bird", [hl({ text: "cat", prefix: "dog ", suffix: " bird" })]);
    expect(res.body).toBe("cat dog ==cat== bird");
  });

  it("returns unlocatable highlights for the fallback section", () => {
    const res = markHighlights("body text", [hl({ text: "not present" })]);
    expect(res.body).toBe("body text");
    expect(res.unanchored).toHaveLength(1);
  });
});

describe("highlightsSection", () => {
  it("is empty when there are no highlights", () => {
    expect(highlightsSection([])).toBe("");
  });
  it("renders blockquotes with notes", () => {
    const s = highlightsSection([hl({ text: "quote me", note: "my note" })]);
    expect(s).toContain("## Highlights");
    expect(s).toContain("> quote me");
    expect(s).toContain("my note");
  });
});
