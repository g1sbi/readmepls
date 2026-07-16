import { z } from "zod";

export const LiveSearchMode = z.enum(["keyword", "hybrid"]);
export type LiveSearchMode = z.infer<typeof LiveSearchMode>;

export const LiveArticle = z.object({
  id: z.string(),
  title: z.string(),
  snippet: z.string(),
  sourceName: z.string(),
});
export type LiveArticle = z.infer<typeof LiveArticle>;

export const LiveTag = z.object({ id: z.string(), name: z.string() });
export type LiveTag = z.infer<typeof LiveTag>;

export const LiveCollection = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});
export type LiveCollection = z.infer<typeof LiveCollection>;

export const LiveSearchResult = z.object({
  articles: z.array(LiveArticle).default([]),
  tags: z.array(LiveTag).default([]),
  collections: z.array(LiveCollection).default([]),
});
export type LiveSearchResult = z.infer<typeof LiveSearchResult>;
