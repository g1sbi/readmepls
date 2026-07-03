import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import type { SourceType, ExtractStatus } from "@readmepls/types";

export interface ContentFields {
  content_hash: string;
  source_type: SourceType;
  title: string;
  author: string | null;
  site_name: string | null;
  lang: string | null;
  excerpt: string;
  content_html: string;
  content_text: string;
  word_count: number;
  read_time: number;
  hero_image: string | null;
  published_at: string | null;
  ai_tags_json: string[];
  fetched_at: string;
  extract_status: ExtractStatus;
  failure_reason: string | null;
}

/**
 * Write the content row for a canonical_url, updating in place if one
 * already exists (e.g. a retried job re-running extraction after a prior
 * failure) rather than colliding with content's unique index on
 * canonical_url. Idempotent and race-safe: job claiming serializes per-job,
 * not per-URL, so two processJob runs for the same canonical_url can create()
 * concurrently — the loser is caught and re-read/updated instead of throwing.
 */
export async function upsertContent(
  pb: PocketBase,
  canonicalUrl: string,
  fields: ContentFields
) {
  const existing = await findByCanonicalUrl(pb, canonicalUrl);
  if (existing) {
    return pb.collection("content").update(existing.id, fields);
  }

  try {
    return await pb.collection("content").create({ canonical_url: canonicalUrl, ...fields });
  } catch (err) {
    // Lost a create race on the unique canonical_url index — re-read the winner.
    if (err instanceof ClientResponseError && err.status === 400) {
      const winner = await findByCanonicalUrl(pb, canonicalUrl);
      if (winner) return pb.collection("content").update(winner.id, fields);
    }
    throw err;
  }
}

async function findByCanonicalUrl(pb: PocketBase, canonicalUrl: string) {
  try {
    return await pb
      .collection("content")
      .getFirstListItem(pb.filter("canonical_url = {:url}", { url: canonicalUrl }));
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 404) return null;
    throw err;
  }
}
