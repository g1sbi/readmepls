import { describe, it, expect } from "vitest";
import { readerBackTarget } from "./back-target.js";

describe("readerBackTarget", () => {
  it("returns an internal app path as-is", () => {
    expect(readerBackTarget("/collections/physics")).toBe(
      "/collections/physics",
    );
    expect(readerBackTarget("/")).toBe("/");
    expect(readerBackTarget("/library")).toBe("/library");
  });

  it("falls back to the library with no origin (fresh deep link)", () => {
    expect(readerBackTarget(null)).toBe("/library");
    expect(readerBackTarget("")).toBe("/library");
  });

  it("never goes back into another article or an auth screen", () => {
    expect(readerBackTarget("/read/other")).toBe("/library");
    expect(readerBackTarget("/read")).toBe("/library");
    expect(readerBackTarget("/login")).toBe("/library");
    expect(readerBackTarget("/verify")).toBe("/library");
    expect(readerBackTarget("/verify/abc")).toBe("/library");
  });

  it("rejects anything that isn't a same-origin path", () => {
    expect(readerBackTarget("https://evil.example/x")).toBe("/library");
    expect(readerBackTarget("//evil.example/x")).toBe("/library");
    expect(readerBackTarget("/\\evil.example")).toBe("/library");
    expect(readerBackTarget("library")).toBe("/library");
  });
});
