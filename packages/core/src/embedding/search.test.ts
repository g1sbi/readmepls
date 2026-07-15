import { describe, it, expect } from "vitest";
import { rankSemanticHits, type ArticleRef } from "./search.js";
import type { EmbeddingRow } from "@readmepls/types";

function row(content: string, chunk: number, vector: number[], text = "t"): EmbeddingRow {
  return { id: `${content}-${chunk}`, content, chunk_index: chunk, char_start: 0,
    char_end: text.length, text, vector, embed_model: "fake", dim: vector.length };
}

describe("rankSemanticHits", () => {
  const articles: ArticleRef[] = [
    { articleId: "aA", contentId: "cA" },
    { articleId: "aB", contentId: "cB" },
  ];

  it("ranks the caller's articles by best matching chunk", () => {
    const q = [1, 0];
    const rows = [row("cA", 0, [1, 0]), row("cB", 0, [0, 1])];
    const hits = rankSemanticHits(q, articles, rows, 10);
    expect(hits.map((h) => h.articleId)).toEqual(["aA", "aB"]);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
  });

  it("collapses multiple chunks of one article to its best chunk", () => {
    const q = [1, 0];
    const rows = [row("cA", 0, [0.2, 0.98]), row("cA", 1, [1, 0])];
    const hits = rankSemanticHits(q, articles, rows, 10);
    expect(hits.filter((h) => h.articleId === "aA")).toHaveLength(1);
    expect(hits[0]!.chunkIndex).toBe(1); // the better-matching chunk
  });

  it("drops rows for content the caller has not saved (scoping)", () => {
    const q = [1, 0];
    const rows = [row("cA", 0, [1, 0]), row("cX", 0, [1, 0])]; // cX not in articles
    const hits = rankSemanticHits(q, articles, rows, 10);
    expect(hits.map((h) => h.contentId)).toEqual(["cA"]);
  });

  it("truncates the snippet and respects k", () => {
    const q = [1, 0];
    const rows = [row("cA", 0, [1, 0], "x".repeat(500)), row("cB", 0, [0.9, 0.1], "y")];
    const hits = rankSemanticHits(q, articles, rows, 1, 100);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.snippet.length).toBe(100);
  });
});
