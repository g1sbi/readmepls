export type EmbedKind = "query" | "passage";

/** Turns text into vectors. `kind` lets an implementation apply model-specific
 *  query/passage prefixes (e5 requires them). Implementations return L2-normalized
 *  vectors so callers can rank by dot product. */
export interface EmbeddingProvider {
  readonly model: string;
  readonly dim: number;
  embed(texts: string[], kind: EmbedKind): Promise<number[][]>;
}
