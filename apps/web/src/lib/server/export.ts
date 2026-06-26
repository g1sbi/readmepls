import type PocketBase from "pocketbase";
import type { ArticleExport } from "@readmepls/core";
import { Highlight } from "@readmepls/types";

export type Scope =
  | { kind: "single"; id: string }
  | { kind: "collection"; id: string }
  | { kind: "library" }
  | { kind: "filter"; tag: string | null; q: string | null };

type FetchFn = typeof fetch;

/** Resolve a scope to a list of article ids using only the caller's authed pb
 *  client (whose API rules scope every query to the user). For the `q` filter we
 *  reuse the existing `/api/search` PocketBase route, which is also user-scoped. */
export async function resolveArticleIds(
  pb: PocketBase,
  scope: Scope,
  pbUrl: string,
  token: string,
  fetchFn: FetchFn = fetch,
): Promise<string[]> {
  switch (scope.kind) {
    case "single":
      return [scope.id];
    case "collection": {
      const items = await pb
        .collection("collection_items")
        .getFullList({ filter: pb.filter("collection = {:id}", { id: scope.id }) });
      return items.map((i) => i.article as string);
    }
    case "library": {
      const arts = await pb.collection("articles").getFullList({ fields: "id" });
      return arts.map((a) => a.id);
    }
    case "filter": {
      let ids: string[] | null = null;
      if (scope.tag) {
        const links = await pb
          .collection("article_tags")
          .getFullList({ filter: pb.filter("tag = {:t}", { t: scope.tag }) });
        ids = links.map((l) => l.article as string);
      }
      if (scope.q) {
        const res = await fetchFn(`${pbUrl}/api/search?q=${encodeURIComponent(scope.q)}`, {
          headers: { Authorization: token },
        });
        const body = (await res.json()) as { results: { articleId: string }[] };
        const qIds = body.results.map((r) => r.articleId);
        ids = ids === null ? qIds : ids.filter((id) => qIds.includes(id));
      }
      return ids ?? [];
    }
  }
}

/** Load each article (with expanded content), its highlights, and its manual
 *  tags, mapping to the pure ArticleExport DTO. Ids the caller cannot read
 *  (getOne 404 under API rules) are silently skipped — tenant isolation. */
export async function loadArticleExports(pb: PocketBase, ids: string[]): Promise<ArticleExport[]> {
  const out: ArticleExport[] = [];
  for (const id of ids) {
    const a = await pb.collection("articles").getOne(id, { expand: "content" }).catch(() => null);
    if (!a) continue;
    const c = (a.expand as { content?: Record<string, unknown> } | undefined)?.content;

    const hls = await pb
      .collection("highlights")
      .getFullList({ filter: pb.filter("article = {:id}", { id }), sort: "created" });
    const highlights = hls.map((r) =>
      Highlight.parse({
        id: r.id, user: r.user, article: r.article, text: r.text,
        prefix: r.prefix ?? "", suffix: r.suffix ?? "",
        startOffset: r.start_offset ?? 0, endOffset: r.end_offset ?? 0,
        color: r.color, note: r.note ?? "", created: r.created,
      }),
    );

    const tagLinks = await pb.collection("article_tags").getFullList({
      filter: pb.filter("article = {:id} && source = {:s}", { id, s: "manual" }),
      expand: "tag",
    });
    const tags = tagLinks
      .map((l) => (l.expand as { tag?: { name?: string } } | undefined)?.tag?.name)
      .filter((n): n is string => !!n);

    out.push({
      id: a.id,
      title: (c?.title as string) ?? (a.url as string),
      url: a.url as string,
      author: (c?.author as string | null) ?? null,
      siteName: (c?.site_name as string | null) ?? null,
      lang: (c?.lang as string | null) ?? null,
      publishedAt: (c?.published_at as string | null) ?? null,
      fetchedAt: (c?.fetched_at as string) ?? "",
      capturedAt: a.created as string,
      status: ((a.status as ArticleExport["status"]) ?? "unread"),
      tags,
      aiTags: Array.isArray(c?.ai_tags_json) ? (c!.ai_tags_json as string[]) : [],
      summary: (c?.excerpt as string) ?? "",
      contentHtml: (c?.content_html as string) ?? "",
      highlights,
    });
  }
  return out;
}
