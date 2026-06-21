import { describe, it, expect } from "vitest";
import { SourceType } from "./source.js";

describe("SourceType", () => {
  it("accepts known sources", () => {
    expect(SourceType.parse("article")).toBe("article");
  });
  it("rejects unknown sources", () => {
    expect(() => SourceType.parse("podcast")).toThrow();
  });
});
