import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { servicePb } from "$lib/server/pb.js";
import { requireVerified } from "$lib/server/require-verified.js";

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.userId) throw error(401, "unauthenticated");
  requireVerified(locals, process.env.SELF_HOSTED === "true");
  const { articleId } = (await request.json()) as { articleId?: string };
  if (!articleId) throw error(400, "missing articleId");

  // Authorize: the article must belong to the requesting user (API rule enforces).
  const article = await locals.pb.collection("articles").getOne(articleId).catch(() => null);
  if (!article) throw error(404, "not found");

  // Reset the (worker-owned) job with a superuser client. Parameterize the
  // filter so a quote in canonical_url can't break out of the query.
  const svc = await servicePb();
  const job = await svc
    .collection("jobs")
    .getFirstListItem(svc.filter("canonical_url = {:url}", { url: article.canonical_url }))
    .catch(() => null);
  if (job) {
    await svc.collection("jobs").update(job.id, {
      status: "queued",
      attempts: 0,
      last_error: "",
      locked_at: "",
      locked_by: "",
    });
  }
  return json({ ok: true });
};
