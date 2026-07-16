import { LiveSearchResult, type LiveSearchMode } from "@readmepls/types";

const EMPTY: LiveSearchResult = { articles: [], tags: [], collections: [] };

/** Fetch live palette results. Parses at the boundary; any failure degrades to
 *  empty sections so the palette never throws mid-typing. */
export async function fetchLive(
  q: string,
  mode: LiveSearchMode,
  signal?: AbortSignal,
): Promise<LiveSearchResult> {
  const url = `/api/search/live?q=${encodeURIComponent(q)}&mode=${mode}`;
  const res = await fetch(url, { signal });
  if (!res.ok) return { ...EMPTY };
  try {
    return LiveSearchResult.parse(await res.json());
  } catch {
    return { ...EMPTY };
  }
}
