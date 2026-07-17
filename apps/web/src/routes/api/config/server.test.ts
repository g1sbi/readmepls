import { describe, it, expect } from "vitest";
import { GET } from "./+server.js";

describe("GET /api/config", () => {
  it("returns the browser-facing PocketBase origin", async () => {
    // The web test env mocks $env/dynamic/public as {}, so publicPbUrl() returns
    // its local fallback.
    const res = await GET({} as never);
    expect(await res.json()).toEqual({ pbUrl: "http://127.0.0.1:8090" });
  });
});
