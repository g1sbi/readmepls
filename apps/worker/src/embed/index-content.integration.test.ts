import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { FakeEmbedder } from "./fake-embedder.js";
import { indexContent } from "./index-content.js";

describe("indexContent", () => {
  let h: PbHandle;
  beforeAll(async () => { h = await startEphemeralPb(); });
  afterAll(async () => { await h.stop(); });

  async function makeContent(text: string): Promise<string> {
    const c = await h.pb.collection("content").create({
      canonical_url: `https://ex.com/${Math.random().toString(36).slice(2)}`,
      content_hash: "h", source_type: "article", title: "t", excerpt: "e",
      content_html: "<p>x</p>", content_text: text, word_count: 3, read_time: 1,
      ai_tags_json: [], fetched_at: new Date().toISOString(), extract_status: "ok",
    });
    return c.id;
  }

  it("writes one embedding row per chunk keyed to content", async () => {
    const id = await makeContent("hello world ".repeat(400)); // long → multiple chunks
    const n = await indexContent(h.pb, id, "hello world ".repeat(400), new FakeEmbedder());
    expect(n).toBeGreaterThan(1);
    const rows = await h.pb.collection("embeddings").getFullList({ filter: `content = "${id}"` });
    expect(rows.length).toBe(n);
    expect(rows[0]!.dim).toBe(384);
    expect(Array.isArray(rows[0]!.vector)).toBe(true);
  });

  it("is idempotent: re-indexing replaces rather than duplicates", async () => {
    const id = await makeContent("some article text here");
    await indexContent(h.pb, id, "some article text here", new FakeEmbedder());
    await indexContent(h.pb, id, "some article text here", new FakeEmbedder());
    const rows = await h.pb.collection("embeddings").getFullList({ filter: `content = "${id}"` });
    const chunkIndexes = rows.map((r) => r.chunk_index).sort();
    expect(new Set(chunkIndexes).size).toBe(chunkIndexes.length); // no duplicate chunk_index
  });
});
