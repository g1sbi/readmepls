import type PocketBase from "pocketbase";
import { chunkText } from "@readmepls/core";
import type { EmbeddingProvider } from "./provider.js";

/**
 * (Re)build the embedding rows for one content row. Deletes any existing rows for
 * this content + model first, so a retry/re-extract replaces instead of duplicating
 * (the unique (content, chunk_index, embed_model) index would otherwise reject).
 * Returns the number of rows written. Keyed to content — shared across all users
 * who saved this URL.
 */
export async function indexContent(
  pb: PocketBase,
  contentId: string,
  text: string,
  embedder: EmbeddingProvider
): Promise<number> {
  const chunks = chunkText(text);
  if (chunks.length === 0) return 0;

  const existing = await pb.collection("embeddings").getFullList({
    filter: pb.filter("content = {:c} && embed_model = {:m}", { c: contentId, m: embedder.model }),
    requestKey: null,
  });
  for (const row of existing) {
    await pb.collection("embeddings").delete(row.id);
  }

  const vectors = await embedder.embed(chunks.map((c) => c.text), "passage");
  let written = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    await pb.collection("embeddings").create({
      content: contentId,
      chunk_index: c.index,
      char_start: c.charStart,
      char_end: c.charEnd,
      text: c.text,
      vector: vectors[i]!,
      embed_model: embedder.model,
      dim: embedder.dim,
    });
    written++;
  }
  return written;
}
