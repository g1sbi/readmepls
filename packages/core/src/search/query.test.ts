import { describe, it, expect } from "vitest";
import { toFtsQuery } from "./query.js";

describe("toFtsQuery", () => {
  it("quotes and prefix-matches each term", () => {
    expect(toFtsQuery("hello world")).toBe('"hello"* "world"*');
  });
  it("lowercases and strips punctuation", () => {
    expect(toFtsQuery("AI/ML, notes!")).toBe('"ai"* "ml"* "notes"*');
  });
  it("neutralizes FTS operators by quoting", () => {
    expect(toFtsQuery("cats AND dogs")).toBe('"cats"* "and"* "dogs"*');
  });
  it("returns empty for blank or punctuation-only input", () => {
    expect(toFtsQuery("   ")).toBe("");
    expect(toFtsQuery("!!!")).toBe("");
  });
});
