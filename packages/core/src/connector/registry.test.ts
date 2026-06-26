import { describe, it, expect } from "vitest";
import { getConnector, listConnectors } from "./registry.js";
import { NotImplementedError, type ArticleExport } from "./plugin.js";

function article(p: Partial<ArticleExport> = {}): ArticleExport {
  return {
    id: "id1", title: "T", url: "https://x.test/p", author: null, siteName: null,
    lang: null, publishedAt: null, fetchedAt: "2026", capturedAt: "2026",
    status: "unread", tags: [], aiTags: [], summary: "", contentHtml: "<p>hi</p>",
    highlights: [], ...p,
  };
}

describe("connector registry", () => {
  it("lists markdown (active) and notion/obsidian (stubs)", () => {
    const types = listConnectors().map((c) => `${c.type}:${c.stub}`);
    expect(types).toContain("markdown:false");
    expect(types).toContain("notion:true");
    expect(types).toContain("obsidian:true");
  });

  it("markdown exports one file per article", async () => {
    const r = await getConnector("markdown")!.export([article(), article({ id: "id2", title: "Two" })]);
    expect(r.files).toHaveLength(2);
    expect(r.failures).toHaveLength(0);
  });

  it("markdown isolates a per-article render failure", async () => {
    // A title that slugifies fine but contentHtml that turndown handles; force a
    // failure by passing a non-string contentHtml shape via an unsafe cast.
    const bad = article({ contentHtml: 123 as unknown as string });
    const r = await getConnector("markdown")!.export([article(), bad]);
    expect(r.files).toHaveLength(1);
    expect(r.failures).toHaveLength(1);
  });

  it("stub connectors throw NotImplementedError", async () => {
    await expect(getConnector("notion")!.export([])).rejects.toBeInstanceOf(NotImplementedError);
    await expect(getConnector("obsidian")!.export([])).rejects.toBeInstanceOf(NotImplementedError);
  });
});
