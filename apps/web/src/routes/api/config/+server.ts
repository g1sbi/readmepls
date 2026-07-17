import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { publicPbUrl } from "$lib/public-pb-url.js";

// Public config the browser app already ships; lets the extension derive the
// PocketBase origin from just the instance URL. CORS is applied in hooks.server.ts.
export const GET: RequestHandler = () => json({ pbUrl: publicPbUrl() });
