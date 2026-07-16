import { describe, it, expect, beforeEach } from "vitest";
import { searchPalette } from "./search-palette.svelte.js";

describe("searchPalette store", () => {
  beforeEach(() => searchPalette.close());

  it("starts closed", () => {
    expect(searchPalette.isOpen).toBe(false);
  });

  it("opens with an optional initial query", () => {
    searchPalette.open("rust");
    expect(searchPalette.isOpen).toBe(true);
    expect(searchPalette.initialQuery).toBe("rust");
  });

  it("opens empty by default", () => {
    searchPalette.open();
    expect(searchPalette.isOpen).toBe(true);
    expect(searchPalette.initialQuery).toBe("");
  });

  it("closes", () => {
    searchPalette.open("x");
    searchPalette.close();
    expect(searchPalette.isOpen).toBe(false);
  });
});
