import { describe, it, expect } from "vitest";
import { reciprocalRankFusion } from "./rrf.js";

describe("reciprocalRankFusion", () => {
  it("ranks an id in both lists above ids in only one, and dedups it", () => {
    // kw=[A,B], sem=[B,C].  scores (k=60):
    //   B = 1/(60+1) + 1/(60+0) = highest
    //   A = 1/(60+0);  C = 1/(60+1)  ->  A > C
    const out = reciprocalRankFusion([["A", "B"], ["B", "C"]]);
    expect(out).toEqual(["B", "A", "C"]);
    expect(out.filter((x) => x === "B")).toHaveLength(1); // deduped
  });

  it("passes a single list through in order", () => {
    expect(reciprocalRankFusion([["X", "Y", "Z"]])).toEqual(["X", "Y", "Z"]);
  });

  it("returns empty for no lists or all-empty lists", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });

  it("breaks score ties by first appearance (stable)", () => {
    // kw=[A,B], sem=[B,A]: A and B have identical summed scores.
    // A appears first (kw[0]) so it wins the tie.
    expect(reciprocalRankFusion([["A", "B"], ["B", "A"]])).toEqual(["A", "B"]);
  });

  it("applies k: a small k favors the single top-ranked id; the default favors the shared id", () => {
    const lists = [["X", "m", "Y"], ["n", "o", "Y"]]; // Y is rank 2 in both; X is rank 0 in one
    expect(reciprocalRankFusion(lists, 1)[0]).toBe("X");   // k=1: 1/(1+0)=1 > 2/(1+2)=0.667
    expect(reciprocalRankFusion(lists, 60)[0]).toBe("Y");  // k=60: 2/62 > 1/60
  });
});
