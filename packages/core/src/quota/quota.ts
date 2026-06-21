const FREE_LIMIT = 50;
const LIMITS: Record<string, number> = { free: FREE_LIMIT, pro: 1000 };

export interface QuotaState {
  tier: string;
  used: number;
}

export function checkQuota(
  state: QuotaState,
  byoKey: boolean
): { ok: true } | { ok: false; limit: number } {
  if (byoKey) return { ok: true };
  const limit = LIMITS[state.tier] ?? FREE_LIMIT;
  return state.used < limit ? { ok: true } : { ok: false, limit };
}
