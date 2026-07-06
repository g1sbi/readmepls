import { describe, it, expect, beforeAll, afterAll } from "vitest";
import PocketBase, { type RecordModel } from "pocketbase";
import { startEphemeralPb, type PbHandle } from "../pb/test-harness.js";
import { fetchLibraryPage, fetchFacetOptions } from "./fetch.js";
import { LibraryParams } from "@readmepls/types";

let h: PbHandle;
beforeAll(async () => { h = await startEphemeralPb(); }, 30000);
afterAll(() => h?.stop());

async function user(email: string): Promise<{ id: string; pb: PocketBase }> {
  const u = await h.pb.collection("users").create({
    email, password: "password12345", passwordConfirm: "password12345",
    tier: "standard", monthly_quota_used: 0,
  });
  const pb = new PocketBase(h.url);
  await pb.collection("users").authWithPassword(email, "password12345");
  return { id: u.id, pb };
}
async function content(fields: Record<string, unknown>): Promise<RecordModel> {
  return h.pb.collection("content").create({
    canonical_url: `https://x/${Math.random()}`, content_hash: "h", source_type: "web",
    extract_status: "ok", ...fields,
  });
}
async function article(pb: PocketBase, uid: string, contentId: string, extra: Record<string, unknown> = {}) {
  return pb.collection("articles").create({ user: uid, content: contentId, url: "https://x", status: "unread", progress: 0, ...extra });
}
const P = (o: Partial<Record<string, unknown>>) => LibraryParams.parse(o);

describe("fetchLibraryPage", () => {
  it("filters by reading-time bucket", async () => {
    const a = await user(`ft-a${Date.now()}@t.local`);
    const short = await content({ title: "Short", read_time: 3 });
    const long = await content({ title: "Long", read_time: 40 });
    await article(a.pb, a.id, short.id);
    await article(a.pb, a.id, long.id);

    const page = await fetchLibraryPage(a.pb, P({ time: ["long"] }));
    expect(page.items.map((i) => (i.expand as { content: { title: string } }).content.title)).toEqual(["Long"]);
  });

  it("does not leak another user's articles through a matching filter", async () => {
    const a = await user(`ft-b${Date.now()}@t.local`);
    const b = await user(`ft-c${Date.now()}@t.local`);
    const c = await content({ title: "Secret", read_time: 40 });
    await article(a.pb, a.id, c.id);

    const seen = await fetchLibraryPage(b.pb, P({ time: ["long"] }));
    expect(seen.totalItems).toBe(0);
  });

  it("intersects full-text search with facets", async () => {
    const a = await user(`ft-d${Date.now()}@t.local`);
    const hit = await content({ title: "Neural networks", content_text: "deep neural learning", read_time: 40 });
    const miss = await content({ title: "Gardening", content_text: "tomatoes", read_time: 40 });
    await article(a.pb, a.id, hit.id);
    await article(a.pb, a.id, miss.id);

    const page = await fetchLibraryPage(a.pb, P({ q: "neural", time: ["long"], sort: "relevance" }));
    expect(page.items).toHaveLength(1);
    expect((page.items[0]!.expand as { content: { title: string } }).content.title).toBe("Neural networks");
  });
});

describe("fetchFacetOptions", () => {
  it("returns the caller's tags and distinct sources only", async () => {
    const a = await user(`fo-a${Date.now()}@t.local`);
    const src = await h.pb.collection("sources").create({ host: "opt.com", favicon_status: "none" });
    const c = await content({ title: "T", read_time: 5, lang: "en", author: "Jane", source: src.id });
    await article(a.pb, a.id, c.id);
    await a.pb.collection("tags").create({ user: a.id, name: "Dev", slug: "dev" });

    const { tags, options } = await fetchFacetOptions(a.pb);
    expect(tags.map((t) => t.name)).toContain("Dev");
    expect(options.sources.map((s) => s.host)).toContain("opt.com");
    expect(options.languages).toContain("en");
    expect(options.authors).toContain("Jane");
  });
});
