import { z } from "zod";

export const FaviconStatus = z.enum(["pending", "ok", "none"]);
export type FaviconStatus = z.infer<typeof FaviconStatus>;

/** A source website. Global, worker-written. One row per hostname (www. stripped). */
export const Source = z.object({
  id: z.string(),
  host: z.string(),
  name: z.string().nullable(),
  // PocketBase file field: stored filename, or "" when no favicon yet.
  favicon: z.string(),
  favicon_status: FaviconStatus,
});
export type Source = z.infer<typeof Source>;

/** Per-user favorite flag on a global source. */
export const SourceFavorite = z.object({
  id: z.string(),
  user: z.string(),
  source: z.string(),
});
export type SourceFavorite = z.infer<typeof SourceFavorite>;
