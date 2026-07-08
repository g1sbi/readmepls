import { env } from "$env/dynamic/private";
import { z } from "zod";
import type PocketBase from "pocketbase";
import { keywordSearchIds, reciprocalRankFusion } from "@readmepls/core";

/**
 * Ask the worker's internal /search endpoint for this user's semantically-ranked
 * article ids. Server-only (uses the shared secret). Throws on any failure so the
 * caller can fall back to keyword search.
 */
export async function semanticSearchIds(query: string, userId: string): Promise<string[]> {
  const base = env.WORKER_URL;
  if (!base) throw new Error("WORKER_URL not configured");
  const url = new URL("/search", base);
  url.searchParams.set("q", query);
  url.searchParams.set("user", userId);
  url.searchParams.set("k", "200");
  const res = await fetch(url.toString(), {
    headers: { "x-worker-secret": env.WORKER_SEARCH_SECRET ?? "" },
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`worker /search returned ${res.status}`);
  const body = z
    .object({ results: z.array(z.object({ articleId: z.string() })).default([]) })
    .parse(await res.json());
  return body.results.map((r) => r.articleId);
}

/**
 * Resolve a query to ranked article ids by fusing keyword (PB FTS) and semantic
 * (worker /search) retrieval with Reciprocal Rank Fusion. Both run in parallel.
 * A semantic-search failure degrades to keyword-only so an outage never breaks the
 * library.
 */
export async function hybridSearchIds(pb: PocketBase, q: string, userId: string): Promise<string[]> {
  const [keywordIds, semanticIds] = await Promise.all([
    keywordSearchIds(pb, q),
    semanticSearchIds(q, userId).catch((err) => {
      console.error("[web] semantic search failed, using keyword only:", err);
      return [] as string[];
    }),
  ]);
  return reciprocalRankFusion([keywordIds, semanticIds]).slice(0, 200);
}
