import PocketBase from "pocketbase";
import { redirect, type Handle } from "@sveltejs/kit";
import { routeGuard } from "$lib/server/auth.js";
import { resolvePbAuth } from "$lib/server/api-auth.js";
import {
  extensionOrigins,
  corsHeadersFor,
  preflightHeaders,
} from "$lib/server/cors.js";

const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";

export const handle: Handle = async ({ event, resolve }) => {
  const pb = new PocketBase(PB_URL);
  const { userId, viaBearer } = await resolvePbAuth(
    pb,
    event.request.headers.get("cookie") ?? "",
    event.request.headers.get("authorization"),
  );
  event.locals.pb = pb;
  event.locals.userId = userId;

  const origin = event.request.headers.get("origin");
  const allowed = extensionOrigins(process.env.EXTENSION_ORIGINS);
  const isApi = event.url.pathname.startsWith("/api/");

  // CORS preflight for extension clients — short-circuit before routing/auth guards.
  if (isApi && event.request.method === "OPTIONS") {
    const ph = preflightHeaders(origin, allowed);
    return new Response(null, { status: ph ? 204 : 403, headers: ph ?? {} });
  }

  const target = routeGuard(event.url.pathname, event.locals.userId);
  if (target) throw redirect(303, target);

  const response = await resolve(event);

  // Bearer clients are cross-origin and cookie-less — don't hand them a Set-Cookie.
  // Cookie clients keep the shared httpOnly:false auth cookie the browser SDK reads.
  if (!viaBearer) {
    response.headers.append(
      "set-cookie",
      pb.authStore.exportToCookie({ httpOnly: false }),
    );
  }

  // Applies to success and error responses alike (401/402 included) so the
  // extension can always read the body cross-origin.
  if (isApi) {
    for (const [k, v] of Object.entries(corsHeadersFor(origin, allowed))) {
      response.headers.set(k, v);
    }
  }

  return response;
};
