import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { load } from "./+layout.server.js";

const fetchCollections = vi.hoisted(() => vi.fn());
vi.mock("@readmepls/core", async (orig) => ({
  ...(await orig<typeof import("@readmepls/core")>()),
  fetchCollections,
}));

// Default to hosted SaaS so a developer's SELF_HOSTED=true doesn't leak in;
// tests that need self-hosted stub it themselves.
beforeEach(() => {
  vi.stubEnv("SELF_HOSTED", "false");
});

afterEach(() => {
  vi.unstubAllEnvs();
  fetchCollections.mockReset();
  fetchCollections.mockResolvedValue([]);
});

function locals(userId: string | null, userRecord?: Record<string, unknown>) {
  return {
    userId,
    pb: { authStore: { model: userRecord ?? null } },
  } as never;
}

describe("root layout load", () => {
  it("returns tier: null and selfHosted: false when logged out", async () => {
    const data = await load({ locals: locals(null) } as never);
    expect(data).toEqual({ tier: null, selfHosted: false, collections: [] });
  });

  it("hosted SaaS: resolves the logged-in user's own tier", async () => {
    vi.stubEnv("SELF_HOSTED", "false");
    const data = await load({ locals: locals("u1", { tier: "pro" }) } as never);
    expect(data).toEqual({ tier: "pro", selfHosted: false, collections: [] });
  });

  it("self-hosted with a key configured: resolves pro regardless of user.tier", async () => {
    vi.stubEnv("SELF_HOSTED", "true");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const data = await load({
      locals: locals("u1", { tier: "standard" }),
    } as never);
    expect(data).toEqual({ tier: "pro", selfHosted: true, collections: [] });
  });

  it("self-hosted with no key configured: resolves standard regardless of user.tier", async () => {
    vi.stubEnv("SELF_HOSTED", "true");
    const data = await load({ locals: locals("u1", { tier: "pro" }) } as never);
    expect(data).toEqual({
      tier: "standard",
      selfHosted: true,
      collections: [],
    });
  });

  it("returns the user's collections", async () => {
    const cols = [{ id: "c1", name: "Physics", slug: "physics", count: 3 }];
    fetchCollections.mockResolvedValue(cols);
    const data = await load({ locals: locals("u1", { tier: "pro" }) } as never);
    expect(data.collections).toEqual(cols);
  });

  it("returns no collections when signed out", async () => {
    const data = await load({ locals: locals(null) } as never);
    expect(data.collections).toEqual([]);
    expect(fetchCollections).not.toHaveBeenCalled();
  });

  it("still resolves with no collections when fetchCollections rejects", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchCollections.mockRejectedValue(new Error("pb down"));
    const data = await load({ locals: locals("u1", { tier: "pro" }) } as never);
    expect(data).toEqual({ tier: "pro", selfHosted: false, collections: [] });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
