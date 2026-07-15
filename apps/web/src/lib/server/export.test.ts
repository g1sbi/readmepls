import { describe, it, expect } from "vitest";
import { resolveArticleIds, loadArticleExports } from "./export.js";

// Minimal fake PB: each collection returns canned data; pb.filter is identity.
// getFullList captures the filter option (keyed by collection name) so tests can
// assert the predicate was passed without emulating PB filter evaluation.
function fakePb(data: Record<string, unknown[]>, byId: Record<string, unknown> = {}) {
  const capturedFilters: Record<string, string | undefined> = {};
  const pb = {
    filter: (s: string) => s,
    authStore: { token: "tok" },
    collection: (name: string) => ({
      getFullList: async (opts?: { filter?: string }) => {
        capturedFilters[name] = opts?.filter;
        return data[name] ?? [];
      },
      getOne: async (id: string) => {
        const rec = byId[id];
        if (!rec) throw new Error("404");
        return rec;
      },
    }),
  } as never;
  return { pb, capturedFilters };
}

describe("resolveArticleIds", () => {
  it("collection scope maps collection_items to article ids", async () => {
    const { pb, capturedFilters } = fakePb({ collection_items: [{ article: "a1" }, { article: "a2" }] });
    const ids = await resolveArticleIds(pb, { kind: "collection", id: "c1" }, "http://pb", "tok");
    expect(ids).toEqual(["a1", "a2"]);
    // Verify the filter predicate was passed (pb.filter is identity, so the raw template is captured)
    expect(capturedFilters["collection_items"]).toContain("collection =");
  });

  it("library scope lists all article ids", async () => {
    const { pb } = fakePb({ articles: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] });
    const ids = await resolveArticleIds(pb, { kind: "library" }, "http://pb", "tok");
    expect(ids).toEqual(["a1", "a2", "a3"]);
  });

  it("filter scope intersects tag links with the search endpoint", async () => {
    const { pb } = fakePb({ article_tags: [{ article: "a1" }, { article: "a2" }] });
    const fetchFn = async () =>
      ({ json: async () => ({ results: [{ articleId: "a2" }, { articleId: "a9" }] }) }) as never;
    const ids = await resolveArticleIds(pb, { kind: "filter", tag: "t1", q: "hello" }, "http://pb", "tok", fetchFn);
    expect(ids).toEqual(["a2"]);
  });
});

describe("loadArticleExports", () => {
  it("skips ids the user does not own", async () => {
    const { pb } = fakePb(
      { highlights: [], article_tags: [] },
      { a1: { id: "a1", url: "https://x.test/p", status: "unread", created: "2026", expand: { content: { title: "T", ai_tags_json: [], content_html: "<p>x</p>", excerpt: "", fetched_at: "2026" } } } }
    );
    const out = await loadArticleExports(pb, ["a1", "missing"], "pro");
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("a1");
    expect(out[0]!.title).toBe("T");
  });

  it("maps snake_case PB fields to camelCase DTO fields", async () => {
    const { pb } = fakePb(
      {
        highlights: [],
        article_tags: [{ article: "a1", expand: { tag: { name: "research" } } }],
      },
      {
        a1: {
          id: "a1",
          url: "https://x.test/p",
          status: "unread",
          created: "2026",
          expand: {
            content: {
              title: "T",
              ai_tags_json: ["ai", "ml"],
              content_html: "<p>x</p>",
              excerpt: "the summary",
              fetched_at: "2026",
              published_at: "2026-01-02",
            },
          },
        },
      }
    );
    const out = await loadArticleExports(pb, ["a1"], "pro");
    expect(out).toHaveLength(1);
    expect(out[0]!.publishedAt).toBe("2026-01-02");
    expect(out[0]!.aiTags).toEqual(["ai", "ml"]);
    expect(out[0]!.summary).toBe("the summary");
    expect(out[0]!.tags).toEqual(["research"]);
  });

  it("hides aiTags and summary for a standard-tier caller", async () => {
    const { pb } = fakePb(
      { highlights: [], article_tags: [] },
      {
        a1: {
          id: "a1", url: "https://x.test/p", status: "unread", created: "2026",
          expand: {
            content: {
              title: "T", ai_tags_json: ["ai", "ml"], content_html: "<p>x</p>",
              excerpt: "an ai summary", fetched_at: "2026",
            },
          },
        },
      }
    );
    const out = await loadArticleExports(pb, ["a1"], "standard");
    expect(out[0]!.aiTags).toEqual([]);
    expect(out[0]!.summary).toBe("");
    // Full body is unaffected — export still includes the complete article.
    expect(out[0]!.contentHtml).toBe("<p>x</p>");
  });

  it("keeps aiTags and summary for a pro-tier caller", async () => {
    const { pb } = fakePb(
      { highlights: [], article_tags: [] },
      {
        a1: {
          id: "a1", url: "https://x.test/p", status: "unread", created: "2026",
          expand: {
            content: {
              title: "T", ai_tags_json: ["ai", "ml"], content_html: "<p>x</p>",
              excerpt: "an ai summary", fetched_at: "2026",
            },
          },
        },
      }
    );
    const out = await loadArticleExports(pb, ["a1"], "pro");
    expect(out[0]!.aiTags).toEqual(["ai", "ml"]);
    expect(out[0]!.summary).toBe("an ai summary");
  });
});
