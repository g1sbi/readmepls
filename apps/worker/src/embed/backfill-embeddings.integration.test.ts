import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { FakeEmbedder } from "./fake-embedder.js";
import { backfillEmbeddings } from "./backfill-embeddings.js";

describe("backfillEmbeddings", () => {
  let h: PbHandle;
  beforeAll(async () => { h = await startEphemeralPb(); });
  afterAll(async () => { await h.stop(); });

  it("indexes content rows lacking embeddings and skips already-indexed ones", async () => {
    for (let i = 0; i < 2; i++) {
      await h.pb.collection("content").create({
        canonical_url: `https://ex.com/a${i}`, content_hash: "h", source_type: "article",
        title: "t", excerpt: "e", content_html: "<p>x</p>", content_text: `article ${i} body text`,
        word_count: 3, read_time: 1, ai_tags_json: [], fetched_at: new Date().toISOString(),
        extract_status: "ok",
      });
    }
    const first = await backfillEmbeddings(h.pb, new FakeEmbedder());
    expect(first.indexed).toBe(2);
    const second = await backfillEmbeddings(h.pb, new FakeEmbedder());
    expect(second.indexed).toBe(0); // already have embeddings for this model
  });
});
