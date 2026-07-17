import { describe, it, expect, vi } from "vitest";
import { capture, trimTrailingSlash } from "./capture-client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("trimTrailingSlash", () => {
  it("removes trailing slashes", () => {
    expect(trimTrailingSlash("https://x.test/")).toBe("https://x.test");
    expect(trimTrailingSlash("https://x.test")).toBe("https://x.test");
  });
});

describe("capture", () => {
  it("POSTs to /api/capture with a bearer token and json body", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(200, { articleId: "a1", cached: false }),
    );
    await capture(
      fetchFn as unknown as typeof fetch,
      "https://x.test/",
      "jwt",
      "https://p.test/post",
    );
    expect(fetchFn).toHaveBeenCalledWith("https://x.test/api/capture", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer jwt",
      },
      body: JSON.stringify({ url: "https://p.test/post" }),
    });
  });

  it("maps a fresh capture to saved", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(200, { articleId: "a1", cached: false }),
    );
    expect(
      await capture(
        fetchFn as unknown as typeof fetch,
        "https://x.test",
        "jwt",
        "u",
      ),
    ).toEqual({ kind: "saved", articleId: "a1" });
  });

  it("maps a cached capture to already", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse(200, { articleId: "a1", cached: true }),
    );
    expect(
      await capture(
        fetchFn as unknown as typeof fetch,
        "https://x.test",
        "jwt",
        "u",
      ),
    ).toEqual({ kind: "already", articleId: "a1" });
  });

  it("maps 401 to unauthorized and 402 to quota", async () => {
    const un = vi.fn(async () =>
      jsonResponse(401, { error: "unauthenticated" }),
    );
    expect(
      await capture(
        un as unknown as typeof fetch,
        "https://x.test",
        "jwt",
        "u",
      ),
    ).toEqual({ kind: "unauthorized" });
    const q = vi.fn(async () => jsonResponse(402, { error: "quota" }));
    expect(
      await capture(q as unknown as typeof fetch, "https://x.test", "jwt", "u"),
    ).toEqual({ kind: "quota" });
  });

  it("maps a network failure to error", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(
      await capture(
        fetchFn as unknown as typeof fetch,
        "https://x.test",
        "jwt",
        "u",
      ),
    ).toEqual({ kind: "error", message: "network" });
  });

  it("maps a malformed 200 body to error", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(200, { nope: true }));
    expect(
      await capture(
        fetchFn as unknown as typeof fetch,
        "https://x.test",
        "jwt",
        "u",
      ),
    ).toEqual({ kind: "error", message: "bad response" });
  });
});
