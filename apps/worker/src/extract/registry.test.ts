import { describe, it, expect } from "vitest";
import { ExtractorRegistry } from "./registry.js";
import type { Extractor, ExtractIO } from "./extractor.js";
import type { ExtractResult, SourceType } from "@readmepls/types";

function stub(source: SourceType): Extractor {
  return {
    source,
    extract: async () => ({ sourceType: source }) as unknown as ExtractResult,
  };
}

describe("ExtractorRegistry", () => {
  it("returns the extractor registered for a source", () => {
    const x = stub("x");
    const reg = new ExtractorRegistry([stub("article"), x]);
    expect(reg.for("x")).toBe(x);
  });

  it("falls back to the article extractor for 'other'", () => {
    const article = stub("article");
    const reg = new ExtractorRegistry([article]);
    expect(reg.for("other")).toBe(article);
  });

  it("throws if no article extractor is registered and source is unknown", () => {
    const reg = new ExtractorRegistry([stub("x")]);
    expect(() => reg.for("other")).toThrow(/article extractor/);
  });
});

// Touch ExtractIO so the import is exercised by the type-checker.
const _io: ExtractIO | null = null;
