import { describe, it, expect } from "vitest";
import { isThinExtraction, recoverFromArchive } from "./archive-fallback.js";
import { parseArticleHtml } from "./parse-article.js";
import type { ExtractIO } from "./extractor.js";
import type { ExtractResult } from "@readmepls/types";

function result(over: Partial<ExtractResult>): ExtractResult {
  return {
    status: "ok", sourceType: "article", title: "t", author: null, siteName: null,
    lang: null, contentHtml: "", contentText: "", excerpt: "", wordCount: 1000,
    readTime: 5, heroImage: null, publishedAt: null, failureReason: null, ...over,
  };
}

const RICH = `<html><head><title>Recovered</title></head><body><article>
<p>${"This is the full archived body. ".repeat(60)}</p></article></body></html>`;

function io(over: Partial<ExtractIO>): ExtractIO {
  return {
    fetchHtml: async () => { throw new Error("unused"); },
    fetchJson: async () => { throw new Error("unused"); },
    runYtDlp: async () => { throw new Error("unused"); },
    ...over,
  };
}

describe("isThinExtraction", () => {
  it("is true for failed results", () => {
    expect(isThinExtraction(result({ status: "failed" }))).toBe(true);
  });
  it("is true below the word-count floor", () => {
    expect(isThinExtraction(result({ wordCount: 40 }))).toBe(true);
  });
  it("is true for short content with a paywall phrase", () => {
    expect(
      isThinExtraction(result({ wordCount: 200, contentText: "Subscribe to continue reading this story." }))
    ).toBe(true);
  });
  it("is false for a normal full article", () => {
    expect(isThinExtraction(result({ wordCount: 1200 }))).toBe(false);
  });
});

describe("recoverFromArchive", () => {
  it("re-parses the closest snapshot and marks it recovered", async () => {
    const res = await recoverFromArchive("https://paywalled.example/post", io({
      fetchJson: async () => ({
        archived_snapshots: { closest: { available: true, url: "https://web.archive.org/web/123/https://paywalled.example/post" } },
      }),
      fetchHtml: async () => RICH,
    }));
    expect(res).not.toBeNull();
    expect(res!.status).toBe("partial");
    expect(res!.failureReason).toBe("recovered from web archive");
    expect(res!.contentText).toContain("full archived body");
  });

  it("returns null when no snapshot is available", async () => {
    const res = await recoverFromArchive("https://x.example/p", io({
      fetchJson: async () => ({ archived_snapshots: {} }),
    }));
    expect(res).toBeNull();
  });

  it("returns null when the snapshot itself is thin", async () => {
    const res = await recoverFromArchive("https://x.example/p", io({
      fetchJson: async () => ({ archived_snapshots: { closest: { available: true, url: "https://web.archive.org/web/1/x" } } }),
      fetchHtml: async () => "<html></html>",
    }));
    expect(res).toBeNull();
  });
});

// keep parseArticleHtml import exercised (snapshot re-parse path)
void parseArticleHtml;
