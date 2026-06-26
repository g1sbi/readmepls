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

const THIN = "<html><head><title>Gated</title></head><body><p>Subscribe to continue reading this story.</p></body></html>";
const ARCHIVED = `<html><head><title>Recovered</title></head><body><article><p>${"Recovered body text. ".repeat(80)}</p></article></body></html>`;

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

describe("ArticleExtractor archive fallback", () => {
  it("recovers a paywalled article from the web archive", async () => {
    const io: ExtractIO = {
      fetchHtml: async (u) => (u.includes("web.archive.org") ? ARCHIVED : THIN),
      fetchJson: async () => ({
        archived_snapshots: { closest: { available: true, url: "https://web.archive.org/web/1/x" } },
      }),
      runYtDlp: async () => { throw new Error("unused"); },
    };
    const res = await new ArticleExtractor().extract("https://paywalled.example/post", io);
    expect(res.status).toBe("partial");
    expect(res.failureReason).toBe("recovered from web archive");
    expect(res.contentText).toContain("Recovered body text");
  });

  it("keeps the thin primary result when no snapshot exists", async () => {
    const io: ExtractIO = {
      fetchHtml: async () => THIN,
      fetchJson: async () => ({ archived_snapshots: {} }),
      runYtDlp: async () => { throw new Error("unused"); },
    };
    const res = await new ArticleExtractor().extract("https://paywalled.example/post", io);
    expect(["failed", "ok", "partial"]).toContain(res.status);
    expect(res.failureReason).not.toBe("recovered from web archive");
  });
});
