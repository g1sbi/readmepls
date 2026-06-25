import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ArticleExtractor } from "./article-extractor.js";
import { parseArticleHtml } from "./parse-article.js";
import type { ExtractIO } from "./extractor.js";
import { ExtractResult } from "@readmepls/types";

const html = readFileSync(
  fileURLToPath(new URL("./fixtures/simple-article.html", import.meta.url)),
  "utf8"
);

function ioWith(body: string): ExtractIO {
  return {
    fetchHtml: async () => body,
    fetchJson: async () => { throw new Error("unused"); },
    runYtDlp: async () => { throw new Error("unused"); },
  };
}

describe("parseArticleHtml", () => {
  it("returns a schema-valid ok result", () => {
    const res = parseArticleHtml("https://example.com/post", html);
    expect(() => ExtractResult.parse(res)).not.toThrow();
    expect(res.status).toBe("ok");
    expect(res.sourceType).toBe("article");
    expect(res.contentHtml).not.toContain("<script");
  });

  it("extracts title, author, and readable text", () => {
    const res = parseArticleHtml("https://example.com/post", html);
    expect(res.title).toBe("Hello World Article");
    expect(res.author).toBe("Jane Doe");
    expect(res.contentText).toContain("first paragraph");
    expect(res.wordCount).toBeGreaterThan(10);
    expect(res.readTime).toBeGreaterThanOrEqual(1);
  });

  it("returns failed status when no article content is found", () => {
    const res = parseArticleHtml("https://example.com/x", "<html></html>");
    expect(res.status).toBe("failed");
    expect(res.failureReason).not.toBeNull();
  });
});

describe("ArticleExtractor", () => {
  it("fetches via io and parses", async () => {
    const res = await new ArticleExtractor().extract("https://example.com/post", ioWith(html));
    expect(res.status).toBe("ok");
    expect(res.title).toBe("Hello World Article");
  });
});
