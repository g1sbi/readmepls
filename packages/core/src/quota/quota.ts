const LIMITS: Record<string, number> = { free: 50, pro: 1000 };

export interface QuotaState {
  tier: string;
  used: number;
}

export function checkQuota(
  state: QuotaState,
  byoKey: boolean
): { ok: true } | { ok: false; limit: number } {
  if (byoKey) return { ok: true };
  const limit = LIMITS[state.tier] ?? LIMITS.free;
  return state.used < limit ? { ok: true } : { ok: false, limit };
}
