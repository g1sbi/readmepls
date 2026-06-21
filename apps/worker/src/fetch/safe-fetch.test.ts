import { describe, it, expect } from "vitest";
import { createSafeFetchHtml } from "./safe-fetch.js";

/** Minimal Response-like for the injected fetch. */
function res(
  body: string,
  opts: { status?: number; location?: string } = {}
) {
  const { status = 200, location } = opts;
  return {
    status,
    headers: { get: (n: string) => (n.toLowerCase() === "location" ? location ?? null : null) },
    text: async () => body,
  };
}

const PUBLIC = ["93.184.216.34"];

describe("createSafeFetchHtml", () => {
  it("fetches html when host resolves to a public address", async () => {
    const fetchHtml = createSafeFetchHtml({
      lookup: async () => PUBLIC,
      fetchFn: async () => res("<html>ok</html>"),
    });
    expect(await fetchHtml("https://example.com/post")).toBe("<html>ok</html>");
  });

  it("rejects when host resolves to a private address", async () => {
    const fetchHtml = createSafeFetchHtml({
      lookup: async () => ["169.254.169.254"],
      fetchFn: async () => res("secret"),
    });
    await expect(fetchHtml("https://metadata.evil.com/")).rejects.toThrow(
      /blocked address/i
    );
  });

  it("rejects when ANY resolved address is private", async () => {
    const fetchHtml = createSafeFetchHtml({
      lookup: async () => ["93.184.216.34", "10.0.0.1"],
      fetchFn: async () => res("ok"),
    });
    await expect(fetchHtml("https://example.com/")).rejects.toThrow(
      /blocked address/i
    );
  });

  it("re-validates the host on a redirect hop and follows to public", async () => {
    let hop = 0;
    const fetchHtml = createSafeFetchHtml({
      lookup: async () => PUBLIC,
      fetchFn: async () => {
        hop++;
        return hop === 1
          ? res("", { status: 302, location: "https://other.example.com/final" })
          : res("<html>final</html>");
      },
    });
    expect(await fetchHtml("https://example.com/")).toBe("<html>final</html>");
  });

  it("rejects a redirect that points at a private address", async () => {
    const fetchHtml = createSafeFetchHtml({
      lookup: async (host: string) =>
        host === "example.com" ? PUBLIC : ["127.0.0.1"],
      fetchFn: async () =>
        res("", { status: 302, location: "http://localhost/admin" }),
    });
    await expect(fetchHtml("https://example.com/")).rejects.toThrow(
      /blocked address/i
    );
  });

  it("rejects a redirect to a non-http scheme", async () => {
    const fetchHtml = createSafeFetchHtml({
      lookup: async () => PUBLIC,
      fetchFn: async () =>
        res("", { status: 302, location: "file:///etc/passwd" }),
    });
    await expect(fetchHtml("https://example.com/")).rejects.toThrow(/scheme/i);
  });

  it("rejects when too many redirects", async () => {
    const fetchHtml = createSafeFetchHtml({
      lookup: async () => PUBLIC,
      fetchFn: async () =>
        res("", { status: 302, location: "https://example.com/loop" }),
      maxRedirects: 3,
    });
    await expect(fetchHtml("https://example.com/")).rejects.toThrow(
      /too many redirects/i
    );
  });
});
