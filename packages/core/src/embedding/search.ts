import type { EmbeddingRow, SemanticHit } from "@readmepls/types";
import { dot } from "./cosine.js";

/** One of the caller's articles and the shared content row it points at. */
export interface ArticleRef {
  articleId: string;
  contentId: string;
}

/**
 * Rank a query vector against chunk embeddings, scoped to the caller's own
 * articles. `rows` may contain embeddings for content outside the caller's library
 * (embeddings are globally shared) — those are dropped here, which is the query-time
 * security boundary. Collapses to the single best-matching chunk per article, sorts
 * by score, returns the top `k`.
 */
export function rankSemanticHits(
  queryVec: number[],
  articles: ArticleRef[],
  rows: EmbeddingRow[],
  k: number,
  snippetLen = 240
): SemanticHit[] {
  const contentToArticle = new Map<string, string>();
  for (const a of articles) contentToArticle.set(a.contentId, a.articleId);

  const best = new Map<string, SemanticHit>();
  for (const r of rows) {
    const articleId = contentToArticle.get(r.content);
    if (!articleId) continue; // not in the caller's library — scoping boundary
    const score = dot(queryVec, r.vector);
    const prev = best.get(articleId);
    if (prev && prev.score >= score) continue;
    best.set(articleId, {
      articleId,
      contentId: r.content,
      chunkIndex: r.chunk_index,
      charStart: r.char_start,
      charEnd: r.char_end,
      score,
      snippet: r.text.slice(0, snippetLen),
    });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, k);
}
