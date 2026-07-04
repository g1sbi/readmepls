import { Source } from "@readmepls/types";

export interface SourceFacet {
  id: string; host: string; name: string | null; favicon: string;
  count: number; favorite: boolean;
}
export interface FacetOptions {
  sources: SourceFacet[];
  languages: string[];
  authors: string[];
}
export interface ArticleFacetRow {
  expand?: { content?: { lang?: string; author?: string; expand?: { source?: unknown } } };
}

function byFrequency(values: (string | undefined)[]): string[] {
  const counts = new Map<string, number>();
  for (const v of values) { if (v) counts.set(v, (counts.get(v) ?? 0) + 1); }
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([v]) => v);
}

export function deriveFacetOptions(rows: ArticleFacetRow[], favoriteIds: Set<string>): FacetOptions {
  const map = new Map<string, SourceFacet>();
  for (const r of rows) {
    const parsed = Source.safeParse(r.expand?.content?.expand?.source);
    if (!parsed.success) continue;
    const s = parsed.data;
    const existing = map.get(s.id);
    if (existing) existing.count++;
    else map.set(s.id, { id: s.id, host: s.host, name: s.name ?? null, favicon: s.favicon, count: 1, favorite: favoriteIds.has(s.id) });
  }
  const sources = [...map.values()].sort((a, b) =>
    (a.favorite !== b.favorite ? (a.favorite ? -1 : 1) : 0) || (b.count - a.count) || a.host.localeCompare(b.host));

  return {
    sources,
    languages: byFrequency(rows.map((r) => r.expand?.content?.lang)),
    authors: byFrequency(rows.map((r) => r.expand?.content?.author)),
  };
}
