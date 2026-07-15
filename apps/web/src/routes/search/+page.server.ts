import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ url }) => {
  const q = url.searchParams.get("q");
  throw redirect(308, q ? `/library?q=${encodeURIComponent(q)}` : "/library");
};
