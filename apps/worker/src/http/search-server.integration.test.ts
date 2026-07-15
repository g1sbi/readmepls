import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import {
  startEphemeralPb,
  type PbHandle,
} from "@readmepls/core/src/pb/test-harness.js";
import { FakeEmbedder } from "../embed/fake-embedder.js";
import { indexContent } from "../embed/index-content.js";
import { createSearchServer } from "./search-server.js";

describe("worker /search", () => {
  let h: PbHandle;
  let base: string;
  let server: ReturnType<typeof createSearchServer>;
  const SECRET = "test-secret";

  async function content(text: string): Promise<string> {
    const c = await h.pb.collection("content").create({
      canonical_url: `https://ex.com/${Math.random().toString(36).slice(2)}`,
      content_hash: "h",
      source_type: "article",
      title: "t",
      excerpt: "e",
      content_html: "<p>x</p>",
      content_text: text,
      word_count: 3,
      read_time: 1,
      ai_tags_json: [],
      fetched_at: new Date().toISOString(),
      extract_status: "ok",
    });
    return c.id;
  }
  async function user(email: string): Promise<string> {
    const u = await h.pb.collection("users").create({
      email,
      password: "password12345",
      passwordConfirm: "password12345",
    });
    return u.id;
  }
  async function article(userId: string, contentId: string): Promise<string> {
    const a = await h.pb.collection("articles").create({
      user: userId,
      content: contentId,
      url: `https://ex.com/${contentId}`,
      status: "unread",
      progress: 0,
      is_private: false,
    });
    return a.id;
  }

  beforeAll(async () => {
    h = await startEphemeralPb();
    const embedder = new FakeEmbedder();
    const cSleep = await content("cortisol and sleep quality at night");
    const cTax = await content("quarterly tax accounting spreadsheet totals");
    await indexContent(
      h.pb,
      cSleep,
      "cortisol and sleep quality at night",
      embedder,
    );
    await indexContent(
      h.pb,
      cTax,
      "quarterly tax accounting spreadsheet totals",
      embedder,
    );
    const u1 = await user("u1@ex.com");
    const u2 = await user("u2@ex.com");
    (globalThis as Record<string, unknown>).__aSleep = await article(
      u1,
      cSleep,
    ); // u1 owns sleep
    await article(u2, cTax); // u2 owns tax
    server = createSearchServer({ pb: h.pb, embedder, secret: SECRET });
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await h.stop();
  });

  it("rejects a missing secret", async () => {
    const res = await fetch(`${base}/search?q=x&user=u1`);
    expect(res.status).toBe(401);
  });

  it("rejects a wrong secret", async () => {
    // Different length wrong secret
    const resDiffLength = await fetch(`${base}/search?q=x&user=u1`, {
      headers: { "x-worker-secret": "wrong-secret-value" },
    });
    expect(resDiffLength.status).toBe(401);

    // Same-length wrong secret (exercises timingSafeEqual mismatch branch)
    const resSameLength = await fetch(`${base}/search?q=x&user=u1`, {
      headers: { "x-worker-secret": "x".repeat(SECRET.length) },
    });
    expect(resSameLength.status).toBe(401);
  });

  it("returns only the caller's own articles, ranked", async () => {
    const u1 = (
      await h.pb.collection("users").getFirstListItem('email = "u1@ex.com"')
    ).id;
    const res = await fetch(
      `${base}/search?q=${encodeURIComponent("sleep and cortisol")}&user=${u1}`,
      { headers: { "x-worker-secret": SECRET } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: { articleId: string; contentId: string }[];
    };
    // u1 only owns the sleep article; the tax content (u2's) must never appear
    expect(body.results.length).toBe(1);
    expect(body.results[0]!.articleId).toBe(
      (globalThis as Record<string, unknown>).__aSleep,
    );
  });
});
