import { describe, it, expect, vi, afterEach } from "vitest";
import { load } from "./+layout.server.js";

afterEach(() => vi.unstubAllEnvs());

function locals(userId: string | null, userRecord?: Record<string, unknown>) {
  return {
    userId,
    pb: { authStore: { model: userRecord ?? null } },
  } as never;
}

describe("root layout load", () => {
  it("returns tier: null and selfHosted: false when logged out", async () => {
    const data = await load({ locals: locals(null) } as never);
    expect(data).toEqual({ tier: null, selfHosted: false });
  });

  it("hosted SaaS: resolves the logged-in user's own tier", async () => {
    vi.stubEnv("SELF_HOSTED", "false");
    const data = await load({ locals: locals("u1", { tier: "pro" }) } as never);
    expect(data).toEqual({ tier: "pro", selfHosted: false });
  });

  it("self-hosted with a key configured: resolves pro regardless of user.tier", async () => {
    vi.stubEnv("SELF_HOSTED", "true");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const data = await load({ locals: locals("u1", { tier: "standard" }) } as never);
    expect(data).toEqual({ tier: "pro", selfHosted: true });
  });

  it("self-hosted with no key configured: resolves standard regardless of user.tier", async () => {
    vi.stubEnv("SELF_HOSTED", "true");
    const data = await load({ locals: locals("u1", { tier: "pro" }) } as never);
    expect(data).toEqual({ tier: "standard", selfHosted: true });
  });
});
