import { describe, it, expect } from "vitest";
import { canonicalizeUrl } from "./canonicalize.js";

describe("canonicalizeUrl", () => {
  it("lowercases host and strips tracking params + fragment", () => {
    const out = canonicalizeUrl(
      "HTTPS://Example.com/Post?utm_source=x&id=7#section"
    );
    expect(out).toBe("https://example.com/Post?id=7");
  });

  it("strips trailing slash on path", () => {
    expect(canonicalizeUrl("https://example.com/post/")).toBe(
      "https://example.com/post"
    );
  });

  it("sorts remaining query params", () => {
    expect(canonicalizeUrl("https://example.com/p?b=2&a=1")).toBe(
      "https://example.com/p?a=1&b=2"
    );
  });

  it("throws on invalid input", () => {
    expect(() => canonicalizeUrl("not a url")).toThrow();
  });

  it("rejects non-http(s) schemes", () => {
    expect(() => canonicalizeUrl("file:///etc/passwd")).toThrow();
    expect(() => canonicalizeUrl("gopher://example.com/")).toThrow();
    expect(() => canonicalizeUrl("ftp://example.com/x")).toThrow();
    expect(() => canonicalizeUrl("javascript:alert(1)")).toThrow();
    expect(() => canonicalizeUrl("data:text/html,x")).toThrow();
  });

  it("accepts http and https", () => {
    expect(canonicalizeUrl("http://example.com/x")).toBe(
      "http://example.com/x"
    );
    expect(canonicalizeUrl("https://example.com/x")).toBe(
      "https://example.com/x"
    );
  });

  it("strips default ports", () => {
    expect(canonicalizeUrl("https://example.com:443/post")).toBe(
      "https://example.com/post"
    );
    expect(canonicalizeUrl("http://example.com:80/post")).toBe(
      "http://example.com/post"
    );
  });
});
