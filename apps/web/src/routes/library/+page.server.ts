import type { PageServerLoad } from "./$types";
import {
  parseLibraryParams,
  fetchLibraryPage,
  fetchFacetOptions,
} from "@readmepls/core";
import { hybridSearchIds } from "$lib/server/semantic-search";
import type PocketBase from "pocketbase";

export const load: PageServerLoad = async ({ url, locals }) => {
  const params = parseLibraryParams(url.searchParams);
  const userId = locals.pb.authStore.model?.id ?? "";

  // Search is always hybrid (keyword + semantic, RRF-fused) when a query is present;
  // hybridSearchIds internally degrades to keyword-only if the worker is unreachable.
  const resolver =
    params.q.trim() !== ""
      ? (pb: PocketBase, q: string) => hybridSearchIds(pb, q, userId)
      : undefined;

  const [page, facets] = await Promise.all([
    fetchLibraryPage(locals.pb, params, new Date(), resolver),
    fetchFacetOptions(locals.pb),
  ]);
  return { params, page, facets };
};
