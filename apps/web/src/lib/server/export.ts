import { z } from "zod";
import type PocketBase from "pocketbase";
import type { ArticleExport } from "@readmepls/core";
import { Highlight, Content, ArticleStatus } from "@readmepls/types";

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

/** Local schema for the PB article fields we actually read. Only these are
 *  validated; the `expand` bag is handled separately via Content.partial(). */
const ArticleRecord = z.object({
  id: z.string(),
  url: z.string(),
  status: ArticleStatus.catch("unread"),
  created: z.string(),
});

/** Partial content schema — tolerates absent/pending content without throwing. */
const ContentPartial = Content.partial().nullable().optional();

/** Load each article (with expanded content), its highlights, and its manual
 *  tags, mapping to the pure ArticleExport DTO. Ids the caller cannot read
 *  (getOne 404 under API rules) are silently skipped — tenant isolation.
 *  Highlights and tags are fetched in two batched queries (not N×2). */
export async function loadArticleExports(pb: PocketBase, ids: string[]): Promise<ArticleExport[]> {
  // Step 1: per-article getOne (preserves silent-skip on 404/permission deny).
  // Zod-validate the article record and content at the PB boundary.
  type Readable = {
    parsed: z.infer<typeof ArticleRecord>;
    content: z.infer<typeof ContentPartial>;
  };
  const readable: Readable[] = [];

  for (const id of ids) {
    const raw = await pb.collection("articles").getOne(id, { expand: "content" }).catch(() => null);
    if (!raw) continue;

    const articleResult = ArticleRecord.safeParse(raw);
    if (!articleResult.success) continue;

    const rawContent = (raw.expand as { content?: unknown } | undefined)?.content;
    const contentResult = ContentPartial.safeParse(rawContent);
    const content = contentResult.success ? contentResult.data : undefined;

    readable.push({ parsed: articleResult.data, content });
  }

  if (readable.length === 0) return [];

  const readableIds = readable.map((r) => r.parsed.id);

  // Step 2: batch-fetch highlights for all readable articles (1 query total).
  const hlFilter = pb.filter(
    readableIds.map((_, i) => `article = {:a${i}}`).join(" || "),
    Object.fromEntries(readableIds.map((artId, i) => [`a${i}`, artId])),
  );
  const allHls = await pb
    .collection("highlights")
    .getFullList({ filter: hlFilter, sort: "created" });

  // Step 3: batch-fetch manual tags for all readable articles (1 query total).
  const tagFilter = pb.filter(
    `(${readableIds.map((_, i) => `article = {:a${i}}`).join(" || ")}) && source = {:src}`,
    { ...Object.fromEntries(readableIds.map((artId, i) => [`a${i}`, artId])), src: "manual" },
  );
  const allTagLinks = await pb
    .collection("article_tags")
    .getFullList({ filter: tagFilter, expand: "tag" });

  // Group by article id in memory.
  const hlsByArticle = new Map<string, typeof allHls>();
  for (const hl of allHls) {
    const artId = hl.article as string;
    if (!hlsByArticle.has(artId)) hlsByArticle.set(artId, []);
    hlsByArticle.get(artId)!.push(hl);
  }

  const tagsByArticle = new Map<string, typeof allTagLinks>();
  for (const link of allTagLinks) {
    const artId = link.article as string;
    if (!tagsByArticle.has(artId)) tagsByArticle.set(artId, []);
    tagsByArticle.get(artId)!.push(link);
  }

  // Build output preserving input order.
  const out: ArticleExport[] = [];
  for (const { parsed: a, content: c } of readable) {
    const hls = hlsByArticle.get(a.id) ?? [];
    const highlights = hls.map((r) =>
      Highlight.parse({
        id: r.id, user: r.user, article: r.article, text: r.text,
        prefix: r.prefix ?? "", suffix: r.suffix ?? "",
        startOffset: r.start_offset ?? 0, endOffset: r.end_offset ?? 0,
        color: r.color, note: r.note ?? "", created: r.created,
      }),
    );

    const tagLinks = tagsByArticle.get(a.id) ?? [];
    const tags = tagLinks
      .map((l) => (l.expand as { tag?: { name?: string } } | undefined)?.tag?.name)
      .filter((n): n is string => !!n);

    out.push({
      id: a.id,
      title: (c?.title as string) ?? a.url,
      url: a.url,
      author: (c?.author as string | null) ?? null,
      siteName: (c?.site_name as string | null) ?? null,
      lang: (c?.lang as string | null) ?? null,
      publishedAt: (c?.published_at as string | null) ?? null,
      fetchedAt: (c?.fetched_at as string) ?? "",
      capturedAt: a.created,
      status: a.status,
      tags,
      aiTags: Array.isArray(c?.ai_tags_json) ? (c!.ai_tags_json as string[]) : [],
      summary: (c?.excerpt as string) ?? "",
      contentHtml: (c?.content_html as string) ?? "",
      highlights,
    });
  }
  return out;
}
