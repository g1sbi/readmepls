import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, makeTestUser, type PbHandle } from "./test-harness.js";

let h: PbHandle;
beforeAll(async () => {
  h = await startEphemeralPb();
}, 30000);
afterAll(() => h?.stop());

describe("deleting an article cascades to its per-user dependents", () => {
  it("removes article_tags and highlights but leaves shared content", async () => {
    const uid = await makeTestUser(h.pb);

    const content = await h.pb.collection("content").create({
      canonical_url: `https://example.com/${Date.now()}`,
      content_hash: `hash${Date.now()}`,
      source_type: "article",
      extract_status: "ok",
    });

    const article = await h.pb.collection("articles").create({
      user: uid, content: content.id, url: "https://example.com/x",
      status: "unread", progress: 0, is_private: false,
    });

    const tag = await h.pb.collection("tags").create({
      user: uid, name: "ai", slug: "ai",
    });
    const link = await h.pb.collection("article_tags").create({
      article: article.id, tag: tag.id, source: "ai", confidence: 0.9,
    });
    const highlight = await h.pb.collection("highlights").create({
      user: uid, article: article.id, text: "hi", color: "yellow",
    });

    await h.pb.collection("articles").delete(article.id);

    await expect(h.pb.collection("article_tags").getOne(link.id)).rejects.toThrow();
    await expect(h.pb.collection("highlights").getOne(highlight.id)).rejects.toThrow();
    // shared content survives
    const stillThere = await h.pb.collection("content").getOne(content.id);
    expect(stillThere.id).toBe(content.id);
  });
});
