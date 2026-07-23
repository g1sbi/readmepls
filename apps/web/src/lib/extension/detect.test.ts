import { describe, it, expect, afterEach } from "vitest";
import { hasMarker } from "./detect.js";

afterEach(() => {
  delete document.documentElement.dataset.readmeplsExtension;
});

describe("hasMarker", () => {
  it("is false when the marker attribute is absent", () => {
    expect(hasMarker(document)).toBe(false);
  });

  it("is true when the extension stamped a version", () => {
    document.documentElement.dataset.readmeplsExtension = "0.2.1";
    expect(hasMarker(document)).toBe(true);
  });

  it("is true even for an empty-string marker", () => {
    document.documentElement.dataset.readmeplsExtension = "";
    expect(hasMarker(document)).toBe(true);
  });
});
