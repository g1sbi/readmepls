import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { backfillSources, type SourceIO } from "./backfill-sources.js";

let h: PbHandle;
beforeAll(async () => { h = await startEphemeralPb(); }, 30000);
afterAll(() => h?.stop());

const io: SourceIO = { fetchHtml: async () => "<html></html>", fetchBytes: async () => null };

async function mkContent(pb: PbHandle["pb"], url: string) {
  return pb.collection("content").create({
    canonical_url: url, content_hash: url, source_type: "article",
    title: "t", excerpt: "e", content_html: "<p>x</p>", content_text: "x",
    word_count: 1, read_time: 1, ai_tags_json: [], fetched_at: "now", extract_status: "ok",
  });
}

describe("backfillSources", () => {
  it("links unlinked content rows to derived sources and is idempotent", async () => {
    const c1 = await mkContent(h.pb, "https://www.example.com/a");
    const c2 = await mkContent(h.pb, "https://blog.example.com/b");

    const first = await backfillSources(h.pb, io);
    expect(first.linked).toBe(2);

    const got1 = await h.pb.collection("content").getOne(c1.id, { expand: "source" });
    expect(got1.expand?.source?.host).toBe("example.com");
    const got2 = await h.pb.collection("content").getOne(c2.id, { expand: "source" });
    expect(got2.expand?.source?.host).toBe("blog.example.com");

    // Second run links nothing new.
    const second = await backfillSources(h.pb, io);
    expect(second.linked).toBe(0);
  });
});
