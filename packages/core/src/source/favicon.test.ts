import { describe, it, expect } from "vitest";
import { pickFaviconCandidates } from "./favicon.js";

const base = "https://example.com/some/page";

describe("pickFaviconCandidates", () => {
  it("prefers the largest declared icon, resolves relative urls", () => {
    const html = `<html><head>
      <link rel="icon" sizes="16x16" href="/small.png">
      <link rel="icon" sizes="64x64" href="/big.png">
    </head></html>`;
    const got = pickFaviconCandidates(html, base);
    expect(got[0]).toBe("https://example.com/big.png");
    expect(got).toContain("https://example.com/small.png");
  });

  it("falls back to apple-touch-icon then /favicon.ico", () => {
    const html = `<html><head>
      <link rel="apple-touch-icon" href="https://cdn.example.com/apple.png">
    </head></html>`;
    const got = pickFaviconCandidates(html, base);
    expect(got[0]).toBe("https://cdn.example.com/apple.png");
    expect(got.at(-1)).toBe("https://example.com/favicon.ico");
  });

  it("always includes the /favicon.ico fallback at the origin", () => {
    const got = pickFaviconCandidates("<html><head></head></html>", base);
    expect(got).toEqual(["https://example.com/favicon.ico"]);
  });

  it("dedupes repeated hrefs", () => {
    const html = `<html><head>
      <link rel="icon" href="/favicon.ico">
    </head></html>`;
    const got = pickFaviconCandidates(html, base);
    expect(got).toEqual(["https://example.com/favicon.ico"]);
  });

  it("resolves path-relative hrefs against the full baseUrl path, not the origin", () => {
    const html = `<html><head>
      <link rel="icon" href="icons/fav.png">
    </head></html>`;
    const got = pickFaviconCandidates(html, "https://example.com/blog/post");
    expect(got).toContain("https://example.com/blog/icons/fav.png");
  });
});
