import { describe, it, expect, vi, afterEach } from "vitest";
import { load } from "./+page.server.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("login page load", () => {
  it("returns locked: false when the status endpoint reports unlocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ locked: false }) })
    );
    const data = await load({} as never);
    expect(data).toEqual({ locked: false });
  });

  it("returns locked: true when the status endpoint reports locked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ locked: true }) })
    );
    const data = await load({} as never);
    expect(data).toEqual({ locked: true });
  });
});
