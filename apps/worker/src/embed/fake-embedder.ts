import { l2normalize } from "@readmepls/core";
import type { EmbeddingProvider, EmbedKind } from "./provider.js";

/**
 * Deterministic, offline embedder for tests: hashes each lowercased token into a
 * dimension bucket (bag-of-words), then L2-normalizes. Texts sharing vocabulary get
 * similar vectors, so retrieval-ranking tests are meaningful without a real model
 * or any network. `kind` is ignored (no prefixes needed for the hash).
 */
export class FakeEmbedder implements EmbeddingProvider {
  readonly model = "fake";
  constructor(readonly dim = 384) {}

  async embed(texts: string[], _kind: EmbedKind): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array<number>(this.dim).fill(0);
      const tokens = t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
      for (const tok of tokens) {
        let h = 2166136261;
        for (let i = 0; i < tok.length; i++) {
          h ^= tok.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        const idx = Math.abs(h) % this.dim;
        v[idx] = (v[idx] ?? 0) + 1;
      }
      return l2normalize(v);
    });
  }
}
