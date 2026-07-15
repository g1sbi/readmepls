import type { Tier } from "@readmepls/types";

const STANDARD_LIMIT = 50;
const LIMITS: Record<Tier, number> = { standard: STANDARD_LIMIT, pro: 1000 };

export interface QuotaState {
  tier: Tier;
  used: number;
}

export function checkQuota(
  state: QuotaState,
  byoKey: boolean
): { ok: true } | { ok: false; limit: number } {
  if (byoKey) return { ok: true };
  const limit = LIMITS[state.tier] ?? STANDARD_LIMIT;
  return state.used < limit ? { ok: true } : { ok: false, limit };
}
