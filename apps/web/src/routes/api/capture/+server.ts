import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { serverPb } from "$lib/server/pb.js";
import { handleCapture } from "@readmepls/core";

export const POST: RequestHandler = async ({ request, locals }) => {
  const userId = (locals as { userId?: string }).userId;
  if (!userId) throw error(401, "unauthenticated");
  const { url } = (await request.json()) as { url?: string };
  if (!url) throw error(400, "missing url");

  const pb = serverPb();
  // In real requests the user's auth token is forwarded; integration tests call
  // handleCapture directly with a superuser client.
  const outcome = await handleCapture(pb, userId, url);
  return json(outcome.body, { status: outcome.status });
};
