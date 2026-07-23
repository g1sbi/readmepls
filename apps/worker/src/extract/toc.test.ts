import { describe, it, expect } from "vitest";
import { buildToc } from "./toc.js";

describe("buildToc", () => {
  it("builds a nested tree and injects heading ids", () => {
    const { html, toc } = buildToc(
      "<h2>Getting Started</h2><p>x</p><h3>Install</h3><h2>Usage</h2>",
    );
    expect(html).toContain('<h2 id="getting-started">Getting Started</h2>');
    expect(html).toContain('<h3 id="install">Install</h3>');
    expect(toc.map((n) => n.id)).toEqual(["getting-started", "usage"]);
    expect(toc[0]!.children.map((n) => n.id)).toEqual(["install"]);
  });

  it("dedupes colliding heading slugs", () => {
    const { toc } = buildToc("<h2>Notes</h2><h2>Notes</h2>");
    expect(toc.map((n) => n.id)).toEqual(["notes", "notes-2"]);
  });

  it("preserves an existing heading id", () => {
    const { html, toc } = buildToc('<h2 id="custom">Title</h2>');
    expect(html).toContain('id="custom"');
    expect(toc[0]!.id).toBe("custom");
  });

  it("returns html unchanged and empty toc when there are no headings", () => {
    const input = "<p>just a paragraph</p>";
    expect(buildToc(input)).toEqual({ html: input, toc: [] });
  });
});
