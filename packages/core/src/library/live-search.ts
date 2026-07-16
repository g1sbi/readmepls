import type {
  LiveArticle,
  LiveTag,
  LiveCollection,
  LiveSearchResult,
} from "@readmepls/types";

export interface LiveSearchCaps {
  articles: number;
  tags: number;
  collections: number;
}

export const DEFAULT_LIVE_CAPS: LiveSearchCaps = {
  articles: 6,
  tags: 5,
  collections: 5,
};

/**
 * Order articles by the ranked id list, drop ids we have no record for, and cap
 * each section. Pure: the caller supplies already-fetched records; no IO here so
 * it is trivially unit-tested and reusable server-side.
 */
export function shapeLiveSearch(
  rankedIds: string[],
  articleById: Map<string, LiveArticle>,
  tags: LiveTag[],
  collections: LiveCollection[],
  caps: LiveSearchCaps = DEFAULT_LIVE_CAPS,
): LiveSearchResult {
  const articles: LiveArticle[] = [];
  for (const id of rankedIds) {
    const a = articleById.get(id);
    if (!a) continue;
    articles.push(a);
    if (articles.length >= caps.articles) break;
  }
  return {
    articles,
    tags: tags.slice(0, caps.tags),
    collections: collections.slice(0, caps.collections),
  };
}
