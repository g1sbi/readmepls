import { z } from "zod";
export const ArticleStatus = z.enum(["unread", "reading", "archived"]);
export type ArticleStatus = z.infer<typeof ArticleStatus>;

export const Article = z.object({
  id: z.string(),
  user: z.string(),
  content: z.string(),
  url: z.string().url(),
  status: ArticleStatus,
  progress: z.number().min(0).max(1),
  is_private: z.boolean(),
});
export type Article = z.infer<typeof Article>;
