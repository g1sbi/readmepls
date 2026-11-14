import { describe, it, expect } from "vitest";
import { activeHeadingId } from "./scroll-spy.js";

const h = (id: string, top: number) => ({ id, top });

describe("activeHeadingId", () => {
  it("picks the last heading that has crossed the top third", () => {
    expect(
      activeHeadingId([h("a", -500), h("b", 100), h("c", 900)], 800, false),
    ).toBe("b");
  });

  it("picks none while the first heading is still below the line", () => {
    expect(activeHeadingId([h("a", 300), h("b", 600)], 800, false)).toBeNull();
  });

  // Review Focus 5: the last chapter becomes current at the bottom of the
  // page even though its heading never reaches the top third.
  it("picks the last heading on screen at the bottom of the page", () => {
    expect(
      activeHeadingId([h("a", -500), h("b", 100), h("c", 700)], 800, true),
    ).toBe("c");
  });

  it("has no heading to pick when there are none", () => {
    expect(activeHeadingId([], 800, false)).toBeNull();
    expect(activeHeadingId([], 800, true)).toBeNull();
  });
});
