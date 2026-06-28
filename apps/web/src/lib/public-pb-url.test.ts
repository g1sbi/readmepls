import { describe, it, expect, vi, beforeEach } from "vitest";

// Mutable mock of the SvelteKit runtime-public-env virtual module.
const mockEnv: Record<string, string> = {};
vi.mock("$env/dynamic/public", () => ({ env: mockEnv }));

describe("publicPbUrl", () => {
  beforeEach(() => {
    for (const k of Object.keys(mockEnv)) delete mockEnv[k];
    vi.resetModules();
  });

  it("returns PUBLIC_PB_URL when set", async () => {
    mockEnv.PUBLIC_PB_URL = "https://pb.example.com";
    const { publicPbUrl } = await import("./public-pb-url.js");
    expect(publicPbUrl()).toBe("https://pb.example.com");
  });

  it("falls back to localhost when unset", async () => {
    const { publicPbUrl } = await import("./public-pb-url.js");
    expect(publicPbUrl()).toBe("http://127.0.0.1:8090");
  });

  it("falls back when set to empty string", async () => {
    mockEnv.PUBLIC_PB_URL = "";
    const { publicPbUrl } = await import("./public-pb-url.js");
    expect(publicPbUrl()).toBe("http://127.0.0.1:8090");
  });
});
