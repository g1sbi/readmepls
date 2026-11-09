import { error } from "@sveltejs/kit";
import { dev } from "$app/environment";

// Dev-only reference sheet: never served from a production build.
export const prerender = false;
export const ssr = false;

export function load() {
  if (!dev) error(404, "Not found");
  return {};
}
