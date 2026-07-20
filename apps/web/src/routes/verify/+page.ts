import type { PageLoad } from "./$types";

export const load: PageLoad = ({ url }) => ({
  token: url.searchParams.get("token"),
});
