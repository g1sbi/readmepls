import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { LiveSearchMode } from "@readmepls/types";
import { liveSearch } from "$lib/server/live-search.js";

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.userId) throw error(401, "unauthenticated");
  const q = url.searchParams.get("q") ?? "";
  if (!q.trim()) return json({ articles: [], tags: [], collections: [] });
  const parsed = LiveSearchMode.safeParse(url.searchParams.get("mode"));
  const mode = parsed.success ? parsed.data : "keyword";
  return json(await liveSearch(locals.pb, q, mode, locals.userId));
};
