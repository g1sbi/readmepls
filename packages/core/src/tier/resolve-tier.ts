import type { Tier } from "@readmepls/types";

export interface TierConfig {
  selfHosted: boolean;
  aiProviderConfigured: boolean;
}

export function resolveTier(user: { tier: Tier }, config: TierConfig): Tier {
  if (config.selfHosted) {
    return config.aiProviderConfigured ? "pro" : "standard";
  }
  return user.tier;
}
