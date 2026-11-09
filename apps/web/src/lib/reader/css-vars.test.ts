import { describe, it, expect } from "vitest";
import { readerCssVars } from "./css-vars.js";
import { withReaderDefaults } from "@readmepls/core";

describe("readerCssVars", () => {
  it("emits reading-* var names that the reader CSS consumes", () => {
    const css = readerCssVars(
      withReaderDefaults({ size: 20, lineHeight: 1.7, width: "wide" }),
    );
    expect(css).toContain("--reading-size: 20px");
    expect(css).toContain("--reading-leading: 1.7");
    expect(css).toContain("--reading-measure: 80ch");
  });
  it("maps both serif and sans to var(--font-reading) (both are Ronzino)", () => {
    expect(readerCssVars(withReaderDefaults({ font: "serif" }))).toContain(
      "--reading-font: var(--font-reading)",
    );
    expect(readerCssVars(withReaderDefaults({ font: "sans" }))).toContain(
      "--reading-font: var(--font-reading)",
    );
  });
});
