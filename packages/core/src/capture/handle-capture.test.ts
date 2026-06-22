import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, makeTestUser, type PbHandle } from "../pb/test-harness.js";
import { handleCapture } from "./handle-capture.js";

let h: PbHandle;
let userId: string;
beforeAll(async () => {
  h = await startEphemeralPb();
  userId = await makeTestUser(h.pb);
}, 30000);
afterAll(() => h?.stop());

describe("handleCapture", () => {
  it("rejects invalid urls", async () => {
    const r = await handleCapture(h.pb, userId, "nonsense");
    expect(r.status).toBe(400);
  });

  it("enqueues a job and creates an article on cache miss", async () => {
    const r = await handleCapture(h.pb, userId, "https://example.com/fresh?utm_source=z");
    expect(r.status).toBe(200);
    expect(r.body.cached).toBe(false);
    const job = await h.pb
      .collection("jobs")
      .getFirstListItem(`canonical_url = "https://example.com/fresh"`);
    expect(job.status).toBe("queued");
    const article = await h.pb.collection("articles").getOne(r.body.articleId!);
    expect(article.canonical_url).toBe("https://example.com/fresh");
  });

  it("links existing content instantly on cache hit", async () => {
    const content = await h.pb.collection("content").create({
      canonical_url: "https://example.com/cached",
      content_hash: "abc",
      source_type: "article",
      title: "Cached",
      excerpt: "",
      content_html: "",
      content_text: "",
      word_count: 1,
      read_time: 1,
      ai_tags_json: ["x"],
      fetched_at: new Date().toISOString(),
      extract_status: "ok",
    });
    const r = await handleCapture(h.pb, userId, "https://example.com/cached");
    expect(r.status).toBe(200);
    expect(r.body.cached).toBe(true);
    const article = await h.pb.collection("articles").getOne(r.body.articleId!);
    expect(article.content).toBe(content.id);
  });
});
