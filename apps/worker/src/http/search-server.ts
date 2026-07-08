import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import type PocketBase from "pocketbase";
import { EmbeddingRow, type SemanticHit } from "@readmepls/types";
import { rankSemanticHits, type ArticleRef } from "@readmepls/core";
import type { EmbeddingProvider } from "../embed/provider.js";

/**
 * Constant-time secret check. A plain `!==` on the header leaks, via response
 * timing, how many leading bytes matched — enough to brute-force the secret one
 * byte at a time. `timingSafeEqual` compares in fixed time; it throws on
 * unequal-length buffers, so we length-check first (the length is not the secret).
 */
function secretMatches(provided: string | string[] | undefined, expected: string): boolean {
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface SearchServerDeps {
  pb: PocketBase;
  embedder: EmbeddingProvider;
  secret: string;
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

/** OR-filter over a set of content ids, using placeholders (never string-interpolate
 *  ids into a PB filter). */
function contentInFilter(pb: PocketBase, ids: string[]): string {
  const params: Record<string, string> = {};
  const parts = ids.map((id, i) => {
    params[`c${i}`] = id;
    return `content = {:c${i}}`;
  });
  return pb.filter(parts.join(" || "), params);
}

export async function searchForUser(
  pb: PocketBase,
  embedder: EmbeddingProvider,
  userId: string,
  query: string,
  k: number,
): Promise<SemanticHit[]> {
  // 1. the caller's own articles → article/content refs (the scoping set)
  const articles = await pb.collection("articles").getFullList({
    filter: pb.filter("user = {:u} && content != ''", { u: userId }),
    fields: "id,content",
    requestKey: null,
  });
  const refs: ArticleRef[] = articles.map((a) => ({
    articleId: a.id,
    contentId: a.content as string,
  }));
  if (refs.length === 0) return [];

  // 2. embeddings for those content rows only
  const contentIds = [...new Set(refs.map((r) => r.contentId))];
  const rowsRaw = await pb.collection("embeddings").getFullList({
    filter: contentInFilter(pb, contentIds),
    requestKey: null,
  });
  const rows = rowsRaw.map((r) => EmbeddingRow.parse(r));

  // 3. embed query + rank (pure)
  const [queryVec] = await embedder.embed([query], "query");
  if (!queryVec) return [];
  return rankSemanticHits(queryVec, refs, rows, k);
}

/**
 * Internal HTTP server for semantic search. Not exposed to the browser — the web
 * BFF calls it server-side with the shared secret. Bind to the internal network in
 * deployment.
 */
export function createSearchServer(deps: SearchServerDeps): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method !== "GET" || url.pathname !== "/search") {
        sendJson(res, 404, { error: "not_found" });
        return;
      }
      if (!secretMatches(req.headers["x-worker-secret"], deps.secret)) {
        sendJson(res, 401, { error: "unauthorized" });
        return;
      }
      const q = url.searchParams.get("q") ?? "";
      const user = url.searchParams.get("user") ?? "";
      const k = Math.min(
        Math.max(Number(url.searchParams.get("k") ?? "50") || 50, 1),
        200,
      );
      if (!q.trim() || !user) {
        sendJson(res, 200, { results: [] });
        return;
      }
      const results = await searchForUser(deps.pb, deps.embedder, user, q, k);
      sendJson(res, 200, { results });
    } catch (err) {
      console.error("[worker] /search error:", err);
      sendJson(res, 500, { error: "search_failed" });
    }
  });
}
