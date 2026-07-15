import type PocketBase from "pocketbase";
import type { EmbeddingProvider } from "./provider.js";
import { indexContent } from "./index-content.js";

/**
 * One-shot: embed every content row that has no embeddings for the current model.
 * Env-gated in main.ts (mirrors BACKFILL_SOURCES). Best-effort per row so one bad
 * row doesn't halt the pass.
 */
export async function backfillEmbeddings(
  pb: PocketBase,
  embedder: EmbeddingProvider
): Promise<{ indexed: number }> {
  const contents = await pb.collection("content").getFullList({ requestKey: null });
  let indexed = 0;
  for (const c of contents) {
    const already = await pb.collection("embeddings").getList(1, 1, {
      filter: pb.filter("content = {:c} && embed_model = {:m}", { c: c.id, m: embedder.model }),
      requestKey: null,
    });
    if (already.totalItems > 0) continue;
    const text = (c.content_text as string) ?? "";
    if (!text.trim()) continue;
    try {
      await indexContent(pb, c.id, text, embedder);
      indexed++;
    } catch (err) {
      console.error(`[worker] backfill embedding failed for content ${c.id}:`, err);
    }
  }
  return { indexed };
}
