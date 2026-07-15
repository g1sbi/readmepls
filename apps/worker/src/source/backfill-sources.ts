import type PocketBase from "pocketbase";
import { deriveSourceHost } from "@readmepls/core";
import { ensureSource, type SourceIO } from "./ensure-source.js";

export type { SourceIO };

/**
 * One-off pass: link every content row that has no source. Re-runnable — only
 * rows with an empty source relation are touched, and ensureSource dedupes by
 * host. Safe to run at worker startup behind an env flag.
 */
export async function backfillSources(pb: PocketBase, io: SourceIO): Promise<{ linked: number }> {
  const rows = await pb.collection("content").getFullList({
    filter: pb.filter("source = ''"),
  });
  let linked = 0;
  for (const row of rows) {
    const host = deriveSourceHost(row.canonical_url as string);
    if (!host) continue;
    try {
      const sourceId = await ensureSource(pb, host, (row.site_name as string) || null, io);
      await pb.collection("content").update(row.id, { source: sourceId });
      linked++;
    } catch (err) {
      console.error(`[backfill] failed for ${row.canonical_url}:`, err);
    }
  }
  return { linked };
}
