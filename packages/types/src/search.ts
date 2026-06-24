import { z } from "zod";

export const SearchResult = z.object({
  articleId: z.string(),
  title: z.string(),
  snippet: z.string(),
  rank: z.number(),
});
export type SearchResult = z.infer<typeof SearchResult>;
