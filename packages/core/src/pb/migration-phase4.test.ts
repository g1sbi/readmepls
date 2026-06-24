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
