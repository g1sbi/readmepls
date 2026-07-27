import { describe, it, expect } from "vitest";
import { Content } from "./content.js";

const base = {
  id: "c1",
  canonical_url: "https://example.test/p",
  content_hash: "hash",
  source_type: "article",
  title: "Title",
  author: null,
  site_name: null,
  lang: null,
  excerpt: "excerpt",
  content_html: "<p>hi</p>",
  content_text: "hi",
  word_count: 1,
  read_time: 1,
  hero_image: null,
  published_at: null,
  ai_tags_json: [],
  fetched_at: "2026-01-01",
  extract_status: "ok",
  failure_reason: null,
};

describe("Content", () => {
  it("defaults toc to [] when omitted", () => {
    const parsed = Content.parse(base);
    expect(parsed.toc).toEqual([]);
  });

  it("tolerates a legacy null toc (pre-migration PocketBase rows) and yields []", () => {
    const parsed = Content.parse({ ...base, toc: null });
    expect(parsed.toc).toEqual([]);
  });

  it("still parses a valid nested toc tree unchanged", () => {
    const tree = [
      {
        id: "intro",
        text: "Intro",
        level: 2,
        children: [
          { id: "background", text: "Background", level: 3, children: [] },
        ],
      },
    ];
    const parsed = Content.parse({ ...base, toc: tree });
    expect(parsed.toc).toEqual(tree);
  });
});
