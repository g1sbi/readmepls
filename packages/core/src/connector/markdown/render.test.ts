import { describe, it, expect } from "vitest";
import { renderArticle } from "./render.js";
import type { ArticleExport } from "../plugin.js";

function article(p: Partial<ArticleExport> = {}): ArticleExport {
  return {
    id: "abc123def", title: "My Article", url: "https://x.test/p", author: "Jane",
    siteName: "Site", lang: "en", publishedAt: "2026-01-02", fetchedAt: "2026-06-26",
    capturedAt: "2026-06-26", status: "reading", tags: ["notes"], aiTags: ["ai"],
    summary: "Sum", contentHtml: "<p>The body has a quote here.</p>", highlights: [],
    ...p,
  };
}

describe("renderArticle", () => {
  it("produces frontmatter, an H1 title, and the converted body", () => {
    const f = renderArticle(article(), new Set());
    expect(f.filename).toBe("my-article.md");
    expect(f.contents).toContain('title: "My Article"');
    expect(f.contents).toContain("# My Article");
    expect(f.contents).toContain("The body has a quote here.");
  });

  it("marks a highlight inline", () => {
    const f = renderArticle(
      article({
        highlights: [{
          id: "h", user: "u", article: "a", text: "quote here", prefix: "", suffix: "",
          startOffset: 0, endOffset: 0, color: "amber", note: "", created: "2026",
        }],
      }),
      new Set()
    );
    expect(f.contents).toContain("==quote here==");
  });

  it("notes an unavailable body without throwing", () => {
    const f = renderArticle(article({ contentHtml: "" }), new Set());
    expect(f.contents).toContain("_body unavailable_");
  });
});
