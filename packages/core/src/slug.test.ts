import { describe, it, expect } from "vitest";
import { slugify } from "./slug.js";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Read Later")).toBe("read-later");
  });
  it("collapses punctuation and repeats", () => {
    expect(slugify("  AI / ML!!  notes ")).toBe("ai-ml-notes");
  });
  it("keeps digits", () => {
    expect(slugify("Top 10")).toBe("top-10");
  });
  it("returns empty for punctuation-only input", () => {
    expect(slugify("!!!")).toBe("");
  });
});
