import { describe, it, expect } from "vitest";
import { readerCssVars } from "./css-vars.js";

describe("readerCssVars", () => {
  it("maps prefs to reader custom properties", () => {
    const css = readerCssVars({ font: "serif", size: 20, lineHeight: 1.7, width: "wide", theme: "dark" });
    expect(css).toContain("--reader-font: var(--font-reader-serif)");
    expect(css).toContain("--reader-size: 20px");
    expect(css).toContain("--reader-line-height: 1.7");
    expect(css).toContain("--reader-width: 80ch");
  });
  it("uses sans + narrow mappings", () => {
    const css = readerCssVars({ font: "sans", size: 16, lineHeight: 1.5, width: "narrow", theme: "light" });
    expect(css).toContain("--reader-font: var(--font-reader-sans)");
    expect(css).toContain("--reader-width: 55ch");
  });
});
