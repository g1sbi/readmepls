import { describe, it, expect } from "vitest";
import { createSafeFetchBytes } from "./safe-fetch.js";

const publicIp = ["93.184.216.34"];

function resLike(status: number, body: Uint8Array, headers: Record<string, string> = {}) {
  return {
    status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

describe("createSafeFetchBytes", () => {
  it("returns bytes and content-type for a 200", async () => {
    const body = new Uint8Array([1, 2, 3]);
    const fetchBytes = createSafeFetchBytes({
      lookup: async () => publicIp,
      fetchFn: async () => resLike(200, body, { "content-type": "image/png" }),
    });
    const got = await fetchBytes("https://example.com/favicon.ico");
    expect(got?.contentType).toBe("image/png");
    expect(Array.from(got!.bytes)).toEqual([1, 2, 3]);
  });

  it("returns null on a 404", async () => {
    const fetchBytes = createSafeFetchBytes({
      lookup: async () => publicIp,
      fetchFn: async () => resLike(404, new Uint8Array()),
    });
    expect(await fetchBytes("https://example.com/favicon.ico")).toBeNull();
  });

  it("refuses a private address", async () => {
    const fetchBytes = createSafeFetchBytes({
      lookup: async () => ["127.0.0.1"],
      fetchFn: async () => resLike(200, new Uint8Array([1])),
    });
    await expect(fetchBytes("https://internal/favicon.ico")).rejects.toThrow(/blocked address/);
  });
});
