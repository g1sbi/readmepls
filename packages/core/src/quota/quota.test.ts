import { describe, it, expect } from "vitest";
import { checkQuota } from "./quota.js";

describe("checkQuota", () => {
  it("allows when under tier limit", () => {
    expect(checkQuota({ tier: "free", used: 5 }, false)).toEqual({ ok: true });
  });
  it("blocks when at/over free limit", () => {
    const r = checkQuota({ tier: "free", used: 50 }, false);
    expect(r.ok).toBe(false);
  });
  it("always allows when user brings own key", () => {
    expect(checkQuota({ tier: "free", used: 9999 }, true)).toEqual({ ok: true });
  });
});
