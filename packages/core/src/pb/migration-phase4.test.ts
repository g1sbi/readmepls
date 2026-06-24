import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, makeTestUser, type PbHandle } from "./test-harness.js";
import PocketBase from "pocketbase";

let h: PbHandle;
let userId: string;
beforeAll(async () => {
  h = await startEphemeralPb();
  userId = await makeTestUser(h.pb);
}, 30000);
afterAll(() => h?.stop());

async function makeArticleWithContent(pb: PbHandle["pb"], user: string, title: string, body: string) {
  const content = await pb.collection("content").create({
    canonical_url: `https://example.com/${title}`,
    content_hash: title, source_type: "article",
    title, content_text: body, extract_status: "ok",
  });
  const article = await pb.collection("articles").create({
    user, content: content.id, url: `https://example.com/${title}`,
    status: "unread", progress: 0, is_private: false,
  });
  return { contentId: content.id, articleId: article.id };
}

async function makeUser(pb: PbHandle["pb"], email: string): Promise<string> {
  const u = await pb.collection("users").create({
    email, password: "password12345", passwordConfirm: "password12345",
    tier: "free", monthly_quota_used: 0,
  });
  return u.id;
}

async function authedClient(url: string, email: string): Promise<PocketBase> {
  const c = new PocketBase(url);
  await c.collection("users").authWithPassword(email, "password12345");
  return c;
}

describe("phase-4 migration", () => {
  it("creates a highlight scoped to the user", async () => {
    const { articleId } = await makeArticleWithContent(h.pb, userId, "h1", "hello world body");
    const hl = await h.pb.collection("highlights").create({
      user: userId, article: articleId,
      text: "hello", prefix: "", suffix: " world",
      start_offset: 0, end_offset: 5, color: "amber", note: "",
    });
    expect(hl.color).toBe("amber");
  });

  it("creates a collection and an item", async () => {
    const { articleId } = await makeArticleWithContent(h.pb, userId, "c1", "collected body");
    const col = await h.pb.collection("collections").create({
      user: userId, name: "Read Later", slug: "read-later", parent: "", order: 0,
    });
    const item = await h.pb.collection("collection_items").create({
      collection: col.id, article: articleId, order: 0,
    });
    expect(item.collection).toBe(col.id);
  });

});

describe("phase-4 search route", () => {
  const emailA = `a${Date.now()}@test.local`;
  let ca: PocketBase;

  beforeAll(async () => {
    const aId = await makeUser(h.pb, emailA);
    const bId = await makeUser(h.pb, `b${Date.now()}@test.local`);
    await makeArticleWithContent(h.pb, aId, "ka", "a rare kingfisher by the river");
    await makeArticleWithContent(h.pb, bId, "kb", "another kingfisher sighting");
    ca = await authedClient(h.url, emailA);
  });

  it("returns only the caller's matching articles", async () => {
    const res = await ca.send("/api/search?q=kingfisher", { method: "GET" });
    expect(res.results.length).toBe(1);
    expect(res.results[0].snippet).toMatch(/kingfisher/i);
    expect(typeof res.results[0].rank).toBe("number");
  });

  it("returns empty results for a blank query", async () => {
    const res = await ca.send("/api/search?q=", { method: "GET" });
    expect(res.results).toEqual([]);
  });

  it("escapes HTML in snippets to prevent stored XSS", async () => {
    // Article content contains a literal <script> tag adjacent to a unique
    // search term. The route must escape it; only our <mark> highlight tag
    // should survive as real markup.
    const xssEmail = `xss${Date.now()}@test.local`;
    const xssOwnerId = await makeUser(h.pb, xssEmail);
    const cxssOwner = await authedClient(h.url, xssEmail);
    await makeArticleWithContent(
      h.pb, xssOwnerId, `xssart${Date.now()}`,
      "monarchbutterfly <script>alert(1)</script> nest here"
    );
    const res = await cxssOwner.send("/api/search?q=monarchbutterfly", { method: "GET" });
    expect(res.results.length).toBeGreaterThan(0);
    const snippet: string = res.results[0].snippet;
    // Raw script tag must not appear — would execute in {@html} rendering
    expect(snippet).not.toContain("<script>");
    // The escaped form must be present
    expect(snippet).toContain("&lt;script&gt;");
    // Our highlight mark tag must still be present
    expect(snippet).toContain("<mark>");
  });
});

describe("highlights tenant isolation", () => {
  it("a user cannot list another user's highlights", async () => {
    const ownerEmail = `hg${Date.now()}@test.local`;
    const ownerId = await makeUser(h.pb, ownerEmail);
    const { articleId } = await makeArticleWithContent(h.pb, ownerId, "hgiso", "highlighted body");
    await h.pb.collection("highlights").create({
      user: ownerId, article: articleId, text: "secret", prefix: "", suffix: "",
      start_offset: 0, end_offset: 6, color: "sage", note: "",
    });
    const intruder = await authedClient(h.url, await (async () => {
      const e = `hi${Date.now()}@test.local`; await makeUser(h.pb, e); return e;
    })());
    const list = await intruder.collection("highlights").getFullList();
    expect(list.length).toBe(0);
  });
});

describe("article_tags isolation", () => {
  it("a user cannot list another user's manual tags", async () => {
    const emailC = `c${Date.now()}@test.local`;
    const uc = await h.pb.collection("users").create({
      email: emailC, password: "password12345", passwordConfirm: "password12345",
      tier: "free", monthly_quota_used: 0,
    });
    const { articleId } = await makeArticleWithContent(h.pb, uc.id, "tagiso", "tagged body");
    const tag = await h.pb.collection("tags").create({ user: uc.id, name: "secret", slug: "secret" });
    await h.pb.collection("article_tags").create({ article: articleId, tag: tag.id, source: "manual", confidence: 1 });

    // a different authed user must see none of C's article_tags
    const emailD = `d${Date.now()}@test.local`;
    await h.pb.collection("users").create({
      email: emailD, password: "password12345", passwordConfirm: "password12345",
      tier: "free", monthly_quota_used: 0,
    });
    const cd = await authedClient(h.url, emailD);
    const list = await cd.collection("article_tags").getFullList();
    expect(list.length).toBe(0);
  });
});

describe("collection_items scoping", () => {
  it("a user cannot read another user's collection items", async () => {
    const emailE = `e${Date.now()}@test.local`;
    const ue = await h.pb.collection("users").create({
      email: emailE, password: "password12345", passwordConfirm: "password12345",
      tier: "free", monthly_quota_used: 0,
    });
    const { articleId } = await makeArticleWithContent(h.pb, ue.id, "coliso", "body");
    const col = await h.pb.collection("collections").create({
      user: ue.id, name: "Private", slug: `private-${Date.now()}`, parent: "", order: 0,
    });
    await h.pb.collection("collection_items").create({ collection: col.id, article: articleId, order: 0 });

    const emailF = `f${Date.now()}@test.local`;
    await h.pb.collection("users").create({
      email: emailF, password: "password12345", passwordConfirm: "password12345",
      tier: "free", monthly_quota_used: 0,
    });
    const cf = await authedClient(h.url, emailF);
    const items = await cf.collection("collection_items").getFullList();
    expect(items.length).toBe(0);
  });

  it("deleting an article cascades to its highlights and collection_items", async () => {
    const emailH = `h${Date.now()}@test.local`;
    const uh = await h.pb.collection("users").create({
      email: emailH, password: "password12345", passwordConfirm: "password12345",
      tier: "free", monthly_quota_used: 0,
    });
    const { articleId } = await makeArticleWithContent(h.pb, uh.id, `artcascade-${Date.now()}`, "to be deleted");
    const col = await h.pb.collection("collections").create({
      user: uh.id, name: "ArtCascade", slug: `artcascade-${Date.now()}`, parent: "", order: 0,
    });
    const hl = await h.pb.collection("highlights").create({
      user: uh.id, article: articleId, text: "cascade text", prefix: "", suffix: "",
      start_offset: 0, end_offset: 4, color: "amber", note: "",
    });
    const item = await h.pb.collection("collection_items").create({
      collection: col.id, article: articleId, order: 0,
    });

    // Delete the article — cascadeDelete: true on highlights.article and
    // collection_items.article should remove both dependent rows automatically.
    await h.pb.collection("articles").delete(articleId);

    // Verify the highlight is gone
    const remainingHighlights = await h.pb.collection("highlights").getFullList({
      filter: h.pb.filter("id = {:id}", { id: hl.id }),
    });
    expect(remainingHighlights.length).toBe(0);

    // Verify the collection_item is gone
    const remainingItems = await h.pb.collection("collection_items").getFullList({
      filter: h.pb.filter("id = {:id}", { id: item.id }),
    });
    expect(remainingItems.length).toBe(0);
  });

  it("deleting a collection cascades to its items", async () => {
    const emailG = `g${Date.now()}@test.local`;
    const ug = await h.pb.collection("users").create({
      email: emailG, password: "password12345", passwordConfirm: "password12345",
      tier: "free", monthly_quota_used: 0,
    });
    const { articleId } = await makeArticleWithContent(h.pb, ug.id, "cascadeiso", "cascade body");
    const col = await h.pb.collection("collections").create({
      user: ug.id, name: "ToDelete", slug: `todelete-${Date.now()}`, parent: "", order: 0,
    });
    const item = await h.pb.collection("collection_items").create({
      collection: col.id, article: articleId, order: 0,
    });

    // Delete the collection — cascadeDelete: true should remove the item too
    await h.pb.collection("collections").delete(col.id);

    // Verify the collection_item is gone (admin client so no auth scoping masks result)
    const remaining = await h.pb.collection("collection_items").getFullList({
      filter: h.pb.filter("id = {:id}", { id: item.id }),
    });
    expect(remaining.length).toBe(0);
  });
});
