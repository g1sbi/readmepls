import { describe, it, expect, afterEach, vi } from "vitest";
import { prefersReducedMotion } from "./motion";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prefersReducedMotion", () => {
  it("is true when the media query matches", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: true,
      media: q,
    }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it("is false when the media query does not match", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
    }));
    expect(prefersReducedMotion()).toBe(false);
  });

  it("is false when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
