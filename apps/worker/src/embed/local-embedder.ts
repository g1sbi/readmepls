import { pipeline, env as hfEnv, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { l2normalize } from "@readmepls/core";
import { EMBED_MODEL, EMBED_DIM } from "@readmepls/types";
import type { EmbeddingProvider, EmbedKind } from "./provider.js";

/**
 * Local ONNX embedder (transformers.js). Runs on CPU, int8 (`q8`) — ~50-75MB RAM,
 * no key, no inference-time network. multilingual-e5 needs "query: "/"passage: "
 * prefixes; `normalize: true` already returns unit vectors, and we re-normalize
 * defensively so downstream dot-product ranking is exact.
 */
export class LocalEmbedder implements EmbeddingProvider {
  readonly model = EMBED_MODEL;
  readonly dim = EMBED_DIM;
  private pipe: Promise<FeatureExtractionPipeline> | null = null;

  constructor(cacheDir?: string) {
    if (cacheDir) hfEnv.cacheDir = cacheDir;
  }

  private get extractor(): Promise<FeatureExtractionPipeline> {
    if (!this.pipe) {
      this.pipe = pipeline<"feature-extraction">("feature-extraction", this.model, { dtype: "q8" });
    }
    return this.pipe;
  }

  /** Load the model now (call at worker boot to avoid a cold first query). */
  async warmup(): Promise<void> {
    await this.extractor;
  }

  async embed(texts: string[], kind: EmbedKind): Promise<number[][]> {
    if (texts.length === 0) return [];
    const prefixed = texts.map((t) => `${kind}: ${t}`);
    const extractor = await this.extractor;
    const output = await extractor(prefixed, { pooling: "mean", normalize: true });
    return (output.tolist() as number[][]).map((v) => l2normalize(v));
  }
}
