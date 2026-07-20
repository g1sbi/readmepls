import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { handleCapture } from "@readmepls/core";
import { requireVerified } from "$lib/server/require-verified.js";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.userId) throw error(401, "unauthenticated");
  requireVerified(locals, process.env.SELF_HOSTED === "true");
  const { url } = (await request.json()) as { url?: string };
  if (!url) throw error(400, "missing url");

  const outcome = await handleCapture(locals.pb, locals.userId, url);
  return json(outcome.body, { status: outcome.status });
};
