import { describe, it, expect, vi } from "vitest";
import { retryArticle } from "./retry.js";

describe("retryArticle", () => {
  it("posts the article id to the retry endpoint", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const ok = await retryArticle(fetchFn as unknown as typeof fetch, "a1");
    expect(ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/retry");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ articleId: "a1" });
  });

  it("reports a rejected retry", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 403 }));
    expect(await retryArticle(fetchFn as unknown as typeof fetch, "a1")).toBe(
      false,
    );
  });
});
