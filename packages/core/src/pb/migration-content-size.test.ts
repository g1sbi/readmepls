import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "./test-harness.js";

let h: PbHandle;
beforeAll(async () => {
  h = await startEphemeralPb();
}, 30000);
afterAll(() => h?.stop());

describe("content stores full-length article bodies", () => {
  // PocketBase 0.39 enforces a default 5000-char cap on text fields whose `max`
  // is left at 0. Real articles routinely exceed that, so content_html and
  // content_text must carry an explicit, generous max.
  it("accepts content_text/content_html longer than 5000 characters", async () => {
    const big = "a".repeat(20000);
    const rec = await h.pb.collection("content").create({
      canonical_url: "https://example.com/long-article",
      content_hash: "longhash",
      source_type: "article",
      extract_status: "ok",
      content_text: big,
      content_html: `<p>${big}</p>`,
    });
    expect(rec.content_text.length).toBe(20000);
    expect(rec.content_html.length).toBeGreaterThan(20000);
  });
});
