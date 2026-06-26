import { describe, it, expect } from "vitest";
import { resolveArticleIds, loadArticleExports } from "./export.js";

// Minimal fake PB: each collection returns canned data; pb.filter is identity.
function fakePb(data: Record<string, unknown[]>, byId: Record<string, unknown> = {}) {
  return {
    filter: (s: string) => s,
    authStore: { token: "tok" },
    collection: (name: string) => ({
      getFullList: async () => data[name] ?? [],
      getOne: async (id: string) => {
        const rec = byId[id];
        if (!rec) throw new Error("404");
        return rec;
      },
    }),
  } as never;
}

describe("resolveArticleIds", () => {
  it("collection scope maps collection_items to article ids", async () => {
    const pb = fakePb({ collection_items: [{ article: "a1" }, { article: "a2" }] });
    const ids = await resolveArticleIds(pb, { kind: "collection", id: "c1" }, "http://pb", "tok");
    expect(ids).toEqual(["a1", "a2"]);
  });

  it("library scope lists all article ids", async () => {
    const pb = fakePb({ articles: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] });
    const ids = await resolveArticleIds(pb, { kind: "library" }, "http://pb", "tok");
    expect(ids).toEqual(["a1", "a2", "a3"]);
  });

  it("filter scope intersects tag links with the search endpoint", async () => {
    const pb = fakePb({ article_tags: [{ article: "a1" }, { article: "a2" }] });
    const fetchFn = async () =>
      ({ json: async () => ({ results: [{ articleId: "a2" }, { articleId: "a9" }] }) }) as never;
    const ids = await resolveArticleIds(pb, { kind: "filter", tag: "t1", q: "hello" }, "http://pb", "tok", fetchFn);
    expect(ids).toEqual(["a2"]);
  });
});

describe("loadArticleExports", () => {
  it("skips ids the user does not own", async () => {
    const pb = fakePb(
      { highlights: [], article_tags: [] },
      { a1: { id: "a1", url: "https://x.test/p", status: "unread", created: "2026", expand: { content: { title: "T", ai_tags_json: [], content_html: "<p>x</p>", excerpt: "", fetched_at: "2026" } } } }
    );
    const out = await loadArticleExports(pb, ["a1", "missing"]);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("a1");
    expect(out[0]!.title).toBe("T");
  });
});
