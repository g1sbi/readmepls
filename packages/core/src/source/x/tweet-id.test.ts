import { describe, it, expect } from "vitest";
import { parseTweetId, syndicationToken } from "./tweet-id.js";

describe("parseTweetId", () => {
  it("extracts the id from an x.com status url", () => {
    expect(parseTweetId("https://x.com/jack/status/20")).toBe("20");
  });
  it("extracts from twitter.com and ignores query/fragment", () => {
    expect(parseTweetId("https://twitter.com/u/status/1788?s=20")).toBe("1788");
  });
  it("returns null for non-status x urls", () => {
    expect(parseTweetId("https://x.com/jack")).toBeNull();
  });
  it("returns null for non-x hosts", () => {
    expect(parseTweetId("https://example.com/status/20")).toBeNull();
  });
});

describe("syndicationToken", () => {
  it("is deterministic and url-safe for a given id", () => {
    const t = syndicationToken("20");
    expect(t).toMatch(/^[a-z0-9]+$/);
    expect(syndicationToken("20")).toBe(t);
  });
});
