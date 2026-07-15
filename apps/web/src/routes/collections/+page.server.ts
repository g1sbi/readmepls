import type { PageServerLoad } from "./$types";
import { fetchCollections } from "@readmepls/core";

export const load: PageServerLoad = async ({ locals }) => {
  const collections = await fetchCollections(locals.pb);
  return { collections };
};
