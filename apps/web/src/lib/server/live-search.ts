import type PocketBase from "pocketbase";
import { keywordSearchIds, shapeLiveSearch } from "@readmepls/core";
import type {
  LiveArticle,
  LiveSearchMode,
  LiveSearchResult,
} from "@readmepls/types";
import { hybridSearchIds } from "./semantic-search.js";

const CANDIDATES = 8;
const SNIPPET_LEN = 160;

/** OR-filter over article ids, using placeholders (never interpolate ids). */
function idFilter(pb: PocketBase, ids: string[]): string {
  const params: Record<string, string> = {};
  const parts = ids.map((id, i) => {
    params[`a${i}`] = id;
    return `id = {:a${i}}`;
  });
  return pb.filter(parts.join(" || "), params);
}

/**
 * Resolve a query into the palette's sectioned result. Article ranking uses the
 * requested mode (keyword = fast PB FTS; hybrid = keyword+semantic RRF). Tags and
 * collections are matched by a name substring. Every read goes through the caller's
 * session `pb`, so PB API rules scope results to the owner — the tenant boundary.
 */
export async function liveSearch(
  pb: PocketBase,
  q: string,
  mode: LiveSearchMode,
  userId: string,
): Promise<LiveSearchResult> {
  const query = q.trim();
  if (!query) return { articles: [], tags: [], collections: [] };

  const ids =
    mode === "hybrid"
      ? await hybridSearchIds(pb, query, userId)
      : await keywordSearchIds(pb, query);
  const topIds = ids.slice(0, CANDIDATES);

  const [articleRows, tagRes, colRes] = await Promise.all([
    topIds.length
      ? pb.collection("articles").getFullList({
          filter: idFilter(pb, topIds),
          expand: "content.source",
          fields:
            "id,expand.content.title,expand.content.excerpt," +
            "expand.content.expand.source.name,expand.content.expand.source.host",
          requestKey: null,
        })
      : Promise.resolve([]),
    pb.collection("tags").getList(1, 5, {
      filter: pb.filter("name ~ {:q}", { q: query }),
      sort: "name",
      requestKey: null,
    }),
    pb.collection("collections").getList(1, 5, {
      filter: pb.filter("name ~ {:q}", { q: query }),
      sort: "name",
      requestKey: null,
    }),
  ]);

  const articleById = new Map<string, LiveArticle>();
  for (const r of articleRows) {
    const content = (
      r.expand as { content?: Record<string, unknown> } | undefined
    )?.content;
    const source = (
      content?.expand as { source?: Record<string, unknown> } | undefined
    )?.source;
    articleById.set(r.id, {
      id: r.id,
      title: (content?.title as string) ?? "(untitled)",
      snippet: ((content?.excerpt as string) ?? "").slice(0, SNIPPET_LEN),
      sourceName: (source?.name as string) || (source?.host as string) || "",
    });
  }

  const tags = tagRes.items.map((t) => ({ id: t.id, name: t.name as string }));
  const collections = colRes.items.map((c) => ({
    id: c.id,
    name: c.name as string,
    slug: c.slug as string,
  }));

  return shapeLiveSearch(topIds, articleById, tags, collections);
}
