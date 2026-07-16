import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

// Profile page is temporarily hidden from nav; disable direct navigation too.
export const load: PageServerLoad = async () => {
  redirect(307, "/library");
};
