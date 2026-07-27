import { describe, it, expect } from "vitest";
import { parseArticleHtml } from "./parse-article.js";

const html =
  "<html><head><title>Test Article</title></head>" +
  "<body><article><p>" +
  "Body text here. ".repeat(60) +
  "</p></article></body></html>";

describe("parseArticleHtml", () => {
  it("parses a simple article into an ExtractResult", () => {
    const res = parseArticleHtml("https://example.com/post", html);
    expect(res.status).toBe("ok");
    expect(res.sourceType).toBe("article");
    expect(res.wordCount).toBeGreaterThan(0);
  });

  it("extracts a publish date from article:published_time", () => {
    const withDate =
      "<html><head><title>T</title>" +
      '<meta property="article:published_time" content="2026-01-02T00:00:00Z"></head>' +
      "<body><article><p>" +
      "Body text here. ".repeat(60) +
      "</p></article></body></html>";
    const res = parseArticleHtml("https://example.com/post", withDate);
    expect(res.publishedAt).toBe("2026-01-02T00:00:00Z");
  });

  it("returns null publishedAt when no date metadata is present", () => {
    const res = parseArticleHtml("https://example.com/post", html);
    expect(res.publishedAt).toBeNull();
  });

  it("emits a toc and injects heading ids", () => {
    const html = `<!doctype html><html><body><article>
    <h2>First</h2><p>${"word ".repeat(60)}</p><h3>Sub</h3><p>${"word ".repeat(60)}</p>
  </article></body></html>`;
    const result = parseArticleHtml("https://example.com/post", html);
    expect(result.status).toBe("ok");
    expect(result.toc.length).toBeGreaterThan(0);
    expect(result.contentHtml).toMatch(/<h[23] id="/);
  });
});
