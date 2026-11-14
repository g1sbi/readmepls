import { describe, it, expect } from "vitest";
import { readTimeLabel, savedLabel } from "./read-meta.js";

describe("readTimeLabel", () => {
  it("labels whole minutes", () => {
    expect(readTimeLabel(12)).toBe("12 min read");
  });

  it("rounds a sub-minute read up to one minute", () => {
    expect(readTimeLabel(0.4)).toBe("1 min read");
  });

  it("has no label for zero or missing minutes", () => {
    expect(readTimeLabel(0)).toBeNull();
    expect(readTimeLabel(null)).toBeNull();
    expect(readTimeLabel(undefined)).toBeNull();
  });
});

describe("savedLabel", () => {
  it("omits the year within the current year", () => {
    expect(savedLabel("2026-11-02 10:00:00.000Z", new Date(2026, 11, 1))).toBe(
      "Saved Nov 2",
    );
  });

  it("has nothing to say about an unparseable date", () => {
    expect(savedLabel("")).toBe("");
  });

  it("keeps the year for an earlier one", () => {
    expect(savedLabel("2025-11-02 10:00:00.000Z", new Date(2026, 11, 1))).toBe(
      "Saved Nov 2, 2025",
    );
  });
});
