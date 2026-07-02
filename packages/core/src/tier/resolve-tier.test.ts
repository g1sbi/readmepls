import { describe, it, expect } from "vitest";
import { resolveTier } from "./resolve-tier.js";

describe("resolveTier", () => {
  it("self-hosted with an AI provider configured: everyone is pro, regardless of user.tier", () => {
    expect(
      resolveTier({ tier: "standard" }, { selfHosted: true, aiProviderConfigured: true })
    ).toBe("pro");
  });

  it("self-hosted with no AI provider configured: everyone is standard, regardless of user.tier", () => {
    expect(
      resolveTier({ tier: "pro" }, { selfHosted: true, aiProviderConfigured: false })
    ).toBe("standard");
  });

  it("hosted SaaS: reads the user's own tier when standard", () => {
    expect(
      resolveTier({ tier: "standard" }, { selfHosted: false, aiProviderConfigured: true })
    ).toBe("standard");
  });

  it("hosted SaaS: reads the user's own tier when pro", () => {
    expect(
      resolveTier({ tier: "pro" }, { selfHosted: false, aiProviderConfigured: true })
    ).toBe("pro");
  });
});
