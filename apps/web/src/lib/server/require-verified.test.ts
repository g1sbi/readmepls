import { describe, it, expect } from "vitest";
import { requireVerified } from "./require-verified.js";

function status(fn: () => void): number | "no-throw" {
  try {
    fn();
    return "no-throw";
  } catch (e) {
    return (e as { status: number }).status;
  }
}

describe("requireVerified", () => {
  it("throws 403 for an unverified SaaS user", () => {
    expect(status(() => requireVerified({ verified: false }, false))).toBe(403);
  });
  it("passes for a verified SaaS user", () => {
    expect(status(() => requireVerified({ verified: true }, false))).toBe("no-throw");
  });
  it("passes for self-host regardless of verified", () => {
    expect(status(() => requireVerified({ verified: false }, true))).toBe("no-throw");
  });
});
