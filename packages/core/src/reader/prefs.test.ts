import { describe, it, expect } from "vitest";
import { withReaderDefaults } from "./prefs.js";

describe("withReaderDefaults", () => {
  it("returns the theme default for empty input", () => {
    expect(withReaderDefaults()).toEqual({ theme: "system" });
  });

  it("keeps the theme and drops retired typography keys", () => {
    expect(
      withReaderDefaults({ theme: "dark", size: 20, font: "serif" }),
    ).toEqual({ theme: "dark" });
  });

  it("falls back to system for a legacy sepia theme", () => {
    expect(withReaderDefaults({ theme: "sepia" })).toEqual({ theme: "system" });
  });

  it("never throws on junk input", () => {
    expect(withReaderDefaults("junk")).toEqual({ theme: "system" });
    expect(withReaderDefaults(null)).toEqual({ theme: "system" });
  });
});
