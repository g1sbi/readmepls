import { describe, it, expect } from "vitest";
import { nextNavVisible, NAV_SCROLL_THRESHOLD, NAV_TOP_ZONE } from "./bottom-nav-scroll.js";

describe("nextNavVisible", () => {
  it("is always visible near the top of the page", () => {
    expect(nextNavVisible(500, NAV_TOP_ZONE, false)).toBe(true);
    expect(nextNavVisible(500, 0, false)).toBe(true);
  });

  it("hides when scrolling down past the threshold", () => {
    expect(nextNavVisible(200, 200 + NAV_SCROLL_THRESHOLD + 1, true)).toBe(false);
  });

  it("reveals when scrolling up past the threshold", () => {
    expect(nextNavVisible(400, 400 - NAV_SCROLL_THRESHOLD - 1, false)).toBe(true);
  });

  it("ignores sub-threshold jitter, keeping the previous state", () => {
    expect(nextNavVisible(300, 302, true)).toBe(true);
    expect(nextNavVisible(300, 302, false)).toBe(false);
  });
});
