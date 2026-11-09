import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

// Account lives in the settings hub; keep old /profile links working.
export const load: PageServerLoad = async () => {
  redirect(307, "/settings");
};
