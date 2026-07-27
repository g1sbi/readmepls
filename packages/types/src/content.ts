import { z } from "zod";
import { SourceType } from "./source.js";
import { ExtractStatus } from "./extract.js";
import { TocEntry } from "./toc.js";

export const Content = z.object({
  id: z.string(),
  canonical_url: z.string().url(),
  content_hash: z.string(),
  source_type: SourceType,
  title: z.string(),
  author: z.string().nullable(),
  site_name: z.string().nullable(),
  lang: z.string().nullable(),
  excerpt: z.string(),
  content_html: z.string(),
  content_text: z.string(),
  // .default([]) only coerces `undefined`; legacy PocketBase rows created
  // before the `toc` json column existed on this branch return `null`, which
  // would otherwise fail this field's parse and (via export.ts's
  // Content.partial() boundary) drop the entire content record. .catch([])
  // absorbs `null` (and any other malformed stored value) as an empty tree.
  toc: z.array(TocEntry).default([]).catch([]),
  word_count: z.number().int().nonnegative(),
  read_time: z.number().int().nonnegative(),
  hero_image: z.string().nullable(),
  published_at: z.string().nullable(),
  // Relation id to the sources collection; "" when not yet linked.
  source: z.string().optional().default(""),
  ai_tags_json: z.array(z.string()),
  fetched_at: z.string(),
  extract_status: ExtractStatus,
  failure_reason: z.string().nullable(),
});
export type Content = z.infer<typeof Content>;
