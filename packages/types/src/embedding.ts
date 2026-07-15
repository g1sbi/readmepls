import { z } from "zod";

/** Default local embedding model + its output dimensionality. */
export const EMBED_MODEL = "Xenova/multilingual-e5-small";
export const EMBED_DIM = 384;

/** One stored chunk vector, keyed to a global `content` row (not per-user). */
export const EmbeddingRow = z.object({
  id: z.string(),
  content: z.string(),
  chunk_index: z.number().int().nonnegative(),
  char_start: z.number().int().nonnegative(),
  char_end: z.number().int().nonnegative(),
  text: z.string(),
  vector: z.array(z.number()),
  embed_model: z.string(),
  dim: z.number().int().positive(),
});
export type EmbeddingRow = z.infer<typeof EmbeddingRow>;

/** A ranked semantic-search hit, scoped to one user's article. */
export const SemanticHit = z.object({
  articleId: z.string(),
  contentId: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
  score: z.number(),
  snippet: z.string(),
});
export type SemanticHit = z.infer<typeof SemanticHit>;
