import { z } from "zod";
import { SourceType } from "./source.js";

export const ExtractStatus = z.enum(["pending", "ok", "partial", "failed"]);
export type ExtractStatus = z.infer<typeof ExtractStatus>;

export const ExtractResult = z.object({
  status: ExtractStatus,
  sourceType: SourceType,
  title: z.string(),
  author: z.string().nullable(),
  siteName: z.string().nullable(),
  lang: z.string().nullable(),
  contentHtml: z.string(),
  contentText: z.string(),
  excerpt: z.string(),
  wordCount: z.number().int().nonnegative(),
  readTime: z.number().int().nonnegative(),
  heroImage: z.string().nullable(),
  publishedAt: z.string().nullable(),
  failureReason: z.string().nullable(),
});
export type ExtractResult = z.infer<typeof ExtractResult>;
