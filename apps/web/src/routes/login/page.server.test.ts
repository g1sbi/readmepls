import { describe, it, expect, vi, afterEach } from "vitest";
import { load } from "./+page.server.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("login page load", () => {
  it("returns locked: false when the status endpoint reports unlocked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ locked: false }) });
    vi.stubGlobal("fetch", fetchMock);

    const data = await load({} as never);

    expect(data).toEqual({ locked: false });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/single-account/status"),
      expect.objectContaining({ method: "GET" })
    );
  });

  it("returns locked: true when the status endpoint reports locked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ locked: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const data = await load({} as never);

    expect(data).toEqual({ locked: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/single-account/status"),
      expect.objectContaining({ method: "GET" })
    );
  });

  it("returns locked: false when the status fetch throws (fail open)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("PocketBase unreachable"));
    vi.stubGlobal("fetch", fetchMock);

    const data = await load({} as never);

    expect(data).toEqual({ locked: false });
  });
});
