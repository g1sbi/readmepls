import { describe, it, expect } from "vitest";
import { l2normalize, dot } from "./cosine.js";

describe("l2normalize", () => {
  it("scales a vector to unit length", () => {
    const n = l2normalize([3, 4]);
    expect(dot(n, n)).toBeCloseTo(1, 10);
    expect(n[0]).toBeCloseTo(0.6, 10);
    expect(n[1]).toBeCloseTo(0.8, 10);
  });
  it("returns zeros unchanged (no divide-by-zero)", () => {
    expect(l2normalize([0, 0])).toEqual([0, 0]);
  });
});

describe("dot", () => {
  it("computes the dot product", () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
  });
  it("identical unit vectors score 1, orthogonal score 0", () => {
    const a = l2normalize([1, 1]);
    const b = l2normalize([1, -1]);
    expect(dot(a, a)).toBeCloseTo(1, 10);
    expect(dot(a, b)).toBeCloseTo(0, 10);
  });
});
