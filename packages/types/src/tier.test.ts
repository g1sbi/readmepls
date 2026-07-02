import { describe, it, expect } from "vitest";
import { Tier } from "./tier.js";

describe("Tier", () => {
  it("accepts standard and pro", () => {
    expect(Tier.parse("standard")).toBe("standard");
    expect(Tier.parse("pro")).toBe("pro");
  });
  it("rejects the old free value and anything else", () => {
    expect(() => Tier.parse("free")).toThrow();
    expect(() => Tier.parse("enterprise")).toThrow();
  });
});
