import { describe, it, expect } from "vitest";
import { resolveTheme } from "./theme.js";

describe("resolveTheme", () => {
  it("prefers a valid localStorage value", () => {
    expect(resolveTheme("dark", "light")).toBe("dark");
  });
  it("falls back to the account pref when nothing is stored", () => {
    expect(resolveTheme(null, "sepia")).toBe("sepia");
  });
  it("defaults to light when both are missing or invalid", () => {
    expect(resolveTheme(null, null)).toBe("light");
    expect(resolveTheme("neon", "blurple")).toBe("light");
  });
});
