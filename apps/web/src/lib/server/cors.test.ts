import { describe, it, expect } from "vitest";
import { extensionOrigins, corsHeadersFor, preflightHeaders } from "./cors.js";

describe("extensionOrigins", () => {
  it("splits, trims, and drops blanks", () => {
    expect(
      extensionOrigins("chrome-extension://a , chrome-extension://b"),
    ).toEqual(["chrome-extension://a", "chrome-extension://b"]);
    expect(extensionOrigins("")).toEqual([]);
    expect(extensionOrigins(undefined)).toEqual([]);
  });
});

const ALLOWED = ["chrome-extension://abc"];

describe("corsHeadersFor", () => {
  it("echoes an allow-listed origin with Vary", () => {
    expect(corsHeadersFor("chrome-extension://abc", ALLOWED)).toEqual({
      "access-control-allow-origin": "chrome-extension://abc",
      vary: "Origin",
    });
  });
  it("returns {} for a non-listed origin or null", () => {
    expect(corsHeadersFor("https://evil.test", ALLOWED)).toEqual({});
    expect(corsHeadersFor(null, ALLOWED)).toEqual({});
  });
});

describe("preflightHeaders", () => {
  it("returns full preflight headers for an allow-listed origin", () => {
    const h = preflightHeaders("chrome-extension://abc", ALLOWED)!;
    expect(h["access-control-allow-origin"]).toBe("chrome-extension://abc");
    expect(h["access-control-allow-methods"]).toContain("POST");
    expect(h["access-control-allow-headers"]).toContain("Authorization");
  });
  it("returns null for a non-listed origin", () => {
    expect(preflightHeaders("https://evil.test", ALLOWED)).toBeNull();
  });
});
