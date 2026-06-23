import { describe, it, expect } from "vitest";
import { withReaderDefaults } from "./prefs.js";

describe("withReaderDefaults", () => {
  it("returns full defaults for empty input", () => {
    expect(withReaderDefaults()).toEqual({
      font: "sans", size: 18, lineHeight: 1.6, width: "normal", theme: "light",
    });
  });

  it("overrides only provided fields", () => {
    expect(withReaderDefaults({ theme: "dark", size: 20 })).toMatchObject({
      theme: "dark", size: 20, font: "sans",
    });
  });

  it("clamps out-of-range numeric values", () => {
    const p = withReaderDefaults({ size: 99, lineHeight: 0.5 });
    expect(p.size).toBe(24);
    expect(p.lineHeight).toBe(1.3);
  });

  it("ignores unknown/invalid enum values and falls back to default", () => {
    const p = withReaderDefaults({ font: "comic" as never });
    expect(p.font).toBe("sans");
  });
});
