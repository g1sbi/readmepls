import { describe, it, expect } from "vitest";
import { createSafeFetchRedirectTarget } from "./safe-fetch.js";

const PUBLIC = async () => ["93.184.216.34"];

function res(status: number, location?: string) {
  return {
    status,
    headers: {
      get: (n: string) =>
        n.toLowerCase() === "location" ? (location ?? null) : null,
    },
    text: async () => "",
  };
}

describe("createSafeFetchRedirectTarget", () => {
  it("returns the Location target without following it", async () => {
    let calls = 0;
    const fetchRedirectTarget = createSafeFetchRedirectTarget({
      lookup: PUBLIC,
      fetchFn: async () => {
        calls++;
        return res(302, "https://example.com/real-article");
      },
    });

    expect(await fetchRedirectTarget("https://api.daily.dev/r/AbC123")).toBe(
      "https://example.com/real-article",
    );
    expect(calls).toBe(1);
  });

  it("resolves a relative Location against the request URL", async () => {
    const f = createSafeFetchRedirectTarget({
      lookup: PUBLIC,
      fetchFn: async () => res(301, "/elsewhere"),
    });
    expect(await f("https://api.daily.dev/r/AbC123")).toBe(
      "https://api.daily.dev/elsewhere",
    );
  });

  it("returns null on a non-redirect status", async () => {
    const f = createSafeFetchRedirectTarget({
      lookup: PUBLIC,
      fetchFn: async () => res(200),
    });
    expect(await f("https://api.daily.dev/r/AbC123")).toBeNull();
  });

  it("returns null on a redirect with no Location", async () => {
    const f = createSafeFetchRedirectTarget({
      lookup: PUBLIC,
      fetchFn: async () => res(302),
    });
    expect(await f("https://api.daily.dev/r/AbC123")).toBeNull();
  });

  it("refuses a redirect target that resolves to a private address", async () => {
    const f = createSafeFetchRedirectTarget({
      lookup: async (host) =>
        host === "internal.test" ? ["169.254.169.254"] : ["93.184.216.34"],
      fetchFn: async () => res(302, "http://internal.test/metadata"),
    });
    expect(await f("https://api.daily.dev/r/AbC123")).toBeNull();
  });

  it("refuses when the request URL itself is private", async () => {
    const f = createSafeFetchRedirectTarget({
      lookup: async () => ["127.0.0.1"],
      fetchFn: async () => res(302, "https://example.com/x"),
    });
    await expect(f("http://localhost/r/1")).rejects.toThrow(/blocked address/);
  });
});
