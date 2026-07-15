import { describe, it, expect } from "vitest";
import { chunkText } from "./chunk.js";

describe("chunkText", () => {
  it("returns no chunks for empty text", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns a single chunk for short text", () => {
    const c = chunkText("hello world");
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ index: 0, charStart: 0, charEnd: 11, text: "hello world" });
  });

  it("offsets round-trip exactly against the source", () => {
    const text = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    for (const c of chunkText(text, { maxChars: 40, overlapChars: 10 })) {
      expect(text.slice(c.charStart, c.charEnd)).toBe(c.text);
    }
  });

  it("splits long text into overlapping windows on whitespace", () => {
    const text = "a".repeat(30) + " " + "b".repeat(30) + " " + "c".repeat(30);
    const c = chunkText(text, { maxChars: 40, overlapChars: 5 });
    expect(c.length).toBeGreaterThan(1);
    expect(c[0]!.index).toBe(0);
    expect(c[1]!.index).toBe(1);
    // next window starts before the previous end (overlap)
    expect(c[1]!.charStart).toBeLessThan(c[0]!.charEnd);
    // no chunk exceeds the max window
    for (const ch of c) expect(ch.charEnd - ch.charStart).toBeLessThanOrEqual(40);
  });
});
