import { z } from "zod";

export const READ_STATES = ["unread", "reading", "finished", "archived"] as const;
export const TIME_BUCKETS = ["quick", "medium", "long"] as const;
export const DATE_PRESETS = ["today", "week", "month", "year", "older"] as const;
export const HAS_FLAGS = ["highlights", "notes"] as const;
export const ATTENTION = ["partial", "failed"] as const;
export const SORTS = [
  "-created", "created", "-published", "-read_time", "read_time",
  "-updated", "title", "relevance",
] as const;

export type ReadState = (typeof READ_STATES)[number];
export type TimeBucket = (typeof TIME_BUCKETS)[number];
export type DatePreset = (typeof DATE_PRESETS)[number];
export type HasFlag = (typeof HAS_FLAGS)[number];
export type Attention = (typeof ATTENTION)[number];
export type Sort = (typeof SORTS)[number];

export const LibraryParams = z.object({
  read: z.array(z.enum(READ_STATES)).default([]),
  time: z.array(z.enum(TIME_BUCKETS)).default([]),
  tag: z.array(z.string()).default([]),
  collection: z.array(z.string()).default([]),
  source: z.array(z.string()).default([]),
  favsrc: z.boolean().default(false),
  saved: z.enum(DATE_PRESETS).nullable().default(null),
  published: z.enum(DATE_PRESETS).nullable().default(null),
  lang: z.array(z.string()).default([]),
  author: z.array(z.string()).default([]),
  has: z.array(z.enum(HAS_FLAGS)).default([]),
  attention: z.array(z.enum(ATTENTION)).default([]),
  q: z.string().default(""),
  sort: z.enum(SORTS).default("-created"),
  page: z.number().int().min(1).default(1),
});
export type LibraryParams = z.infer<typeof LibraryParams>;
