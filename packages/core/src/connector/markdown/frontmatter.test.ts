import { describe, it, expect } from "vitest";
import { renderFrontmatter } from "./frontmatter.js";

const base = {
  title: "Hello", url: "https://x.test/p", author: "Jane", site_name: "Site",
  published: "2026-01-02", fetched: "2026-06-26", captured: "2026-06-26",
  status: "reading", tags: ["notes"], ai_tags: ["ai"], summary: "A summary",
};

describe("renderFrontmatter", () => {
  it("emits snake_case keys, split tags, and no progress key", () => {
    const fm = renderFrontmatter(base);
    expect(fm.startsWith("---\n")).toBe(true);
    expect(fm.trimEnd().endsWith("---")).toBe(true);
    expect(fm).toContain('site_name: "Site"');
    expect(fm).toContain('tags: ["notes"]');
    expect(fm).toContain('ai_tags: ["ai"]');
    expect(fm).not.toContain("progress");
  });

  it("escapes quotes/colons/newlines and omits null/empty fields", () => {
    const fm = renderFrontmatter({
      ...base, author: null, site_name: null, published: null,
      tags: [], ai_tags: [], summary: "", title: 'A "quoted: thing"\nline',
    });
    expect(fm).toContain('title: "A \\"quoted: thing\\"\\nline"');
    expect(fm).not.toContain("author:");
    expect(fm).not.toContain("published:");
    expect(fm).not.toContain("tags:");
    expect(fm).not.toContain("summary:");
  });

  it("is deterministic for the same input", () => {
    expect(renderFrontmatter(base)).toBe(renderFrontmatter(base));
  });
});
