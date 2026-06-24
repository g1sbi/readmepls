import { z } from "zod";

export const Collection = z.object({
  id: z.string(),
  user: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  parent: z.string().default(""),
  order: z.number().int().default(0),
});
export type Collection = z.infer<typeof Collection>;

export const CollectionItem = z.object({
  id: z.string(),
  collection: z.string(),
  article: z.string(),
  order: z.number().int().default(0),
});
export type CollectionItem = z.infer<typeof CollectionItem>;
