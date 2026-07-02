import { Source } from "@readmepls/types";

interface ArticleLike {
  id: string;
  expand?: { content?: { expand?: { source?: unknown } } };
}

export interface SourceFacet {
  id: string;
  host: string;
  name: string | null;
  favicon: string;
  count: number;
  favorite: boolean;
}

/** Distinct sources present in the user's own articles, favorites pinned first. */
export function deriveLibrarySources(articles: ArticleLike[], favoriteIds: Set<string>): SourceFacet[] {
  const map = new Map<string, SourceFacet>();
  for (const a of articles) {
    const raw = a.expand?.content?.expand?.source;
    if (!raw) continue;
    const parsed = Source.safeParse(raw);
    if (!parsed.success) continue;
    const src = parsed.data;
    const existing = map.get(src.id);
    if (existing) {
      existing.count++;
    } else {
      map.set(src.id, {
        id: src.id, host: src.host, name: src.name ?? null, favicon: src.favicon,
        count: 1, favorite: favoriteIds.has(src.id),
      });
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return a.host.localeCompare(b.host);
  });
}

/** Union filter: empty selection → all; else articles whose source is selected. */
export function filterBySources<T extends ArticleLike>(articles: T[], selectedIds: Set<string>): T[] {
  if (selectedIds.size === 0) return articles;
  return articles.filter((a) => {
    const parsed = Source.safeParse(a.expand?.content?.expand?.source);
    return parsed.success ? selectedIds.has(parsed.data.id) : false;
  });
}
