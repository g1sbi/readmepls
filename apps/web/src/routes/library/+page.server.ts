import type { PageServerLoad } from "./$types";
import { parseLibraryParams, fetchLibraryPage, fetchFacetOptions } from "@readmepls/core";

export const load: PageServerLoad = async ({ url, locals }) => {
  const params = parseLibraryParams(url.searchParams);
  const [page, facets] = await Promise.all([
    fetchLibraryPage(locals.pb, params),
    fetchFacetOptions(locals.pb),
  ]);
  return { params, page, facets };
};
