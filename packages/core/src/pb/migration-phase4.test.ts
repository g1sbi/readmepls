import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, makeTestUser, type PbHandle } from "./test-harness.js";

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
