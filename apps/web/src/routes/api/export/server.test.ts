import { describe, it, expect, vi } from "vitest";

vi.mock("$lib/server/export.js", () => ({
  resolveArticleIds: vi.fn(),
  loadArticleExports: vi.fn(),
}));

import { GET } from "./+server.js";
import { resolveArticleIds, loadArticleExports } from "$lib/server/export.js";
import type { ArticleExport } from "@readmepls/core";

function article(p: Partial<ArticleExport> = {}): ArticleExport {
  return {
    id: "id1", title: "One", url: "https://x.test/p", author: null, siteName: null,
    lang: null, publishedAt: null, fetchedAt: "2026", capturedAt: "2026",
    status: "unread", tags: [], aiTags: [], summary: "", contentHtml: "<p>hi</p>",
    highlights: [], ...p,
  };
}

function call(scope: string) {
  const url = new URL(`http://localhost/api/export?${scope}`);
  const locals = { userId: "u1", pb: { authStore: { token: "tok" } } } as never;
  return GET({ url, locals } as never);
}

describe("GET /api/export", () => {
  it("returns a single markdown file for scope=single", async () => {
    (resolveArticleIds as ReturnType<typeof vi.fn>).mockResolvedValue(["id1"]);
    (loadArticleExports as ReturnType<typeof vi.fn>).mockResolvedValue([article()]);
    const res = await call("scope=single&id=id1");
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toContain("one.md");
    expect(await res.text()).toContain("# One");
  });

  it("returns a zip for a multi-article scope", async () => {
    (resolveArticleIds as ReturnType<typeof vi.fn>).mockResolvedValue(["id1", "id2"]);
    (loadArticleExports as ReturnType<typeof vi.fn>).mockResolvedValue([article(), article({ id: "id2", title: "Two" })]);
    const res = await call("scope=library");
    expect(res.headers.get("content-type")).toContain("application/zip");
  });

  it("404s an empty scope", async () => {
    (resolveArticleIds as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await expect(call("scope=library")).rejects.toMatchObject({ status: 404 });
  });

  it("401s when unauthenticated", async () => {
    const url = new URL("http://localhost/api/export?scope=library");
    const locals = { userId: null, pb: { authStore: { token: "" } } } as never;
    await expect(GET({ url, locals } as never)).rejects.toMatchObject({ status: 401 });
  });
});
