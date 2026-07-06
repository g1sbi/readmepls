import type PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import type { LibraryParams } from "@readmepls/types";
import { buildLibraryQuery, applySearchIds } from "./query.js";
import { deriveFacetOptions, type FacetOptions, type ArticleFacetRow } from "./facet-options.js";

export interface LibraryPage {
  items: RecordModel[];
  totalItems: number;
  page: number;
  perPage: number;
}

async function searchIds(pb: PocketBase, q: string): Promise<string[]> {
  const res = await pb.send("/api/search", { method: "GET", query: { q } });
  const results = (res as { results?: { articleId: string }[] }).results ?? [];
  return results.map((r) => r.articleId).slice(0, 200);
}

export async function fetchLibraryPage(
  pb: PocketBase, params: LibraryParams, now: Date = new Date(),
): Promise<LibraryPage> {
  // favsrc: fold favorited source ids into the source facet (union with any explicit selection).
  let effective = params;
  if (params.favsrc) {
    const favs = await pb.collection("source_favorites").getFullList();
    const favIds = favs.map((f) => f.source as string);
    effective = { ...params, source: [...new Set([...params.source, ...favIds])] };
  }

  const built = buildLibraryQuery(effective, now);
  let expr = built.filterExpr;
  const bind: Record<string, unknown> = { ...built.filterParams };
  let rankOrder: string[] | null = null;

  if (params.q.trim()) {
    const ids = await searchIds(pb, params.q);
    if (ids.length === 0) return { items: [], totalItems: 0, page: params.page, perPage: built.perPage };
    rankOrder = ids;
    const sids = applySearchIds(ids);
    expr = expr ? `(${expr}) && ${sids.expr}` : sids.expr;
    Object.assign(bind, sids.params);
  }

  const filter = expr ? pb.filter(expr, bind) : "";
  const opts = { expand: "content.source", filter };

  // Relevance sort: fetch the bounded candidate matches and order by FTS rank in memory.
  if (params.sort === "relevance" && rankOrder) {
    const all = await pb.collection("articles").getFullList(opts);
    const idx = new Map(rankOrder.map((id, i) => [id, i]));
    all.sort((a, b) => (idx.get(a.id) ?? Infinity) - (idx.get(b.id) ?? Infinity));
    const start = (params.page - 1) * built.perPage;
    return { items: all.slice(start, start + built.perPage), totalItems: all.length, page: params.page, perPage: built.perPage };
  }

  // built.sort is "" for relevance-with-empty-q (no rankOrder to sort by, e.g. q was blank);
  // falling back to "-created" is an intentional graceful degrade, not a bug.
  const list = await pb.collection("articles").getList(built.page, built.perPage, { ...opts, sort: built.sort || "-created" });
  return { items: list.items, totalItems: list.totalItems, page: list.page, perPage: built.perPage };
}

export async function fetchFacetOptions(pb: PocketBase): Promise<{
  tags: { id: string; name: string }[];
  collections: { id: string; name: string; slug: string }[];
  options: FacetOptions;
}> {
  const [tagRows, colRows, favRows, artRows] = await Promise.all([
    pb.collection("tags").getFullList({ sort: "name" }),
    pb.collection("collections").getFullList({ sort: "name" }),
    pb.collection("source_favorites").getFullList(),
    pb.collection("articles").getFullList({
      expand: "content.source",
      // Project only what deriveFacetOptions reads (lang/author/nested source) --
      // skip content_text and every other content field for every owned article.
      fields:
        "id,expand.content.lang,expand.content.author," +
        "expand.content.expand.source.id,expand.content.expand.source.host," +
        "expand.content.expand.source.name,expand.content.expand.source.favicon," +
        "expand.content.expand.source.favicon_status",
    }),
  ]);
  const favoriteIds = new Set(favRows.map((f) => f.source as string));
  return {
    tags: tagRows.map((t) => ({ id: t.id, name: t.name as string })),
    collections: colRows.map((c) => ({ id: c.id, name: c.name as string, slug: c.slug as string })),
    options: deriveFacetOptions(artRows as unknown as ArticleFacetRow[], favoriteIds),
  };
}
