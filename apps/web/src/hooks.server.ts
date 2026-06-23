import PocketBase from "pocketbase";
import { redirect, type Handle } from "@sveltejs/kit";
import { routeGuard } from "$lib/server/auth.js";

const PB_URL = process.env.PB_URL ?? "http://127.0.0.1:8090";

export const handle: Handle = async ({ event, resolve }) => {
  const pb = new PocketBase(PB_URL);
  pb.authStore.loadFromCookie(event.request.headers.get("cookie") ?? "");
  try {
    if (pb.authStore.isValid) await pb.collection("users").authRefresh();
  } catch {
    pb.authStore.clear();
  }

  event.locals.pb = pb;
  event.locals.userId = pb.authStore.model?.id ?? null;

  const target = routeGuard(event.url.pathname, event.locals.userId);
  if (target) throw redirect(303, target);

  const response = await resolve(event);
  // httpOnly:false so the browser SDK shares the same auth cookie.
  response.headers.append(
    "set-cookie",
    pb.authStore.exportToCookie({ httpOnly: false })
  );
  return response;
};
