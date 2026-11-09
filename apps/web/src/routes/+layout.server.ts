import type { LayoutServerLoad } from "./$types";
import {
  fetchCollections,
  resolveTier,
  type TierConfig,
} from "@readmepls/core";
import type { Tier } from "@readmepls/types";

export const load: LayoutServerLoad = async ({ locals }) => {
  const selfHosted = process.env.SELF_HOSTED === "true";
  const config: TierConfig = {
    selfHosted,
    aiProviderConfigured:
      Boolean(process.env.ANTHROPIC_API_KEY) ||
      process.env.AI_PROVIDER === "mock",
  };

  const userRecord = locals.pb.authStore.model as { tier?: Tier } | null;
  if (!userRecord) return { tier: null, selfHosted, collections: [] };

  const tier = resolveTier({ tier: userRecord.tier ?? "standard" }, config);
  const collections = await fetchCollections(locals.pb);
  return { tier, selfHosted, collections };
};
