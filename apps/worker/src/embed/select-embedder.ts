import type { EmbeddingProvider } from "./provider.js";
import { FakeEmbedder } from "./fake-embedder.js";

/**
 * Pick the embedder from env. `EMBED_PROVIDER=fake` wires the deterministic
 * FakeEmbedder (used by tests and the offline smoke path). Otherwise builds the
 * real LocalEmbedder via the injected factory — a thunk so the model (and its
 * one-time download) is only constructed when actually used.
 */
export function selectEmbedder(
  env: { EMBED_PROVIDER?: string },
  makeLocal: () => EmbeddingProvider
): EmbeddingProvider {
  if (env.EMBED_PROVIDER === "fake") return new FakeEmbedder();
  return makeLocal();
}
