import { describe, it, expect } from "vitest";
import { deriveFacetOptions } from "./facet-options.js";

const row = (sourceId: string | null, host = "h.com", lang?: string, author?: string) => ({
  expand: { content: {
    lang, author,
    expand: sourceId ? { source: { id: sourceId, host, name: null, favicon: "", favicon_status: "none" } } : {},
  } },
});

describe("deriveFacetOptions", () => {
  it("counts distinct sources, favorites first then count desc", () => {
    const o = deriveFacetOptions(
      [row("s1", "a.com"), row("s1", "a.com"), row("s2", "b.com")],
      new Set(["s2"]),
    );
    expect(o.sources[0]!.id).toBe("s2");        // favorite pinned first
    expect(o.sources.find((s) => s.id === "s1")!.count).toBe(2);
  });

  it("collects distinct non-empty languages by frequency", () => {
    const o = deriveFacetOptions(
      [row("s1", "a.com", "en"), row("s1", "a.com", "en"), row("s1", "a.com", "es"), row("s1", "a.com", "")],
      new Set(),
    );
    expect(o.languages).toEqual(["en", "es"]);
  });

  it("collects distinct authors and ignores missing", () => {
    const o = deriveFacetOptions(
      [row("s1", "a.com", "en", "Jane"), row("s1", "a.com", "en")],
      new Set(),
    );
    expect(o.authors).toEqual(["Jane"]);
  });
});
