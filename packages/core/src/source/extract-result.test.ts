import { describe, it, expect } from "vitest";
import { failedResult } from "./extract-result.js";
import { ExtractResult } from "@readmepls/types";

describe("failedResult", () => {
  it("is a schema-valid result with publishedAt defaulted to null", () => {
    const r = failedResult("article", "boom");
    expect(() => ExtractResult.parse(r)).not.toThrow();
    expect(r.publishedAt).toBeNull();
  });
});
