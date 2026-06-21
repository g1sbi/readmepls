import type PocketBase from "pocketbase";
import { canonicalizeUrl } from "../url/canonicalize.js";
import { classifySource } from "../source/classify.js";
import { checkQuota } from "../quota/quota.js";

export interface CaptureOutcome {
  status: number;
  body: { articleId?: string; cached?: boolean; error?: string };
}

export async function handleCapture(
  pb: PocketBase,
  userId: string,
  rawUrl: string
): Promise<CaptureOutcome> {
  let canonical: string;
  try {
    canonical = canonicalizeUrl(rawUrl);
  } catch {
    return { status: 400, body: { error: "invalid url" } };
  }

  // cache lookup
  const existing = await pb
    .collection("content")
    .getFirstListItem(`canonical_url = "${canonical}"`)
    .catch(() => null);

  if (existing) {
    const article = await pb.collection("articles").create({
      user: userId,
      content: existing.id,
      url: rawUrl,
      status: "unread",
      progress: 0,
      is_private: false,
    });
    return { status: 200, body: { articleId: article.id, cached: true } };
  }

  // quota check (worker uses our key; BYO bypasses)
  const user = await pb.collection("users").getOne(userId);
  const quota = checkQuota(
    { tier: user.tier ?? "free", used: user.monthly_quota_used ?? 0 },
    Boolean(user.ai_key_enc)
  );
  if (!quota.ok) return { status: 402, body: { error: "quota exceeded" } };

  // enqueue job (deduped by canonical_url unique index)
  await pb
    .collection("jobs")
    .create({
      user: userId,
      canonical_url: canonical,
      type: "extract",
      status: "queued",
      attempts: 0,
    })
    .catch(() => null); // ignore unique-violation: job already queued

  const article = await pb.collection("articles").create({
    user: userId,
    url: rawUrl,
    status: "unread",
    progress: 0,
    is_private: false,
  });
  // classify is recorded on content later by the worker; we call it here only to
  // validate the URL is well-formed for a known source path.
  classifySource(canonical);
  return { status: 200, body: { articleId: article.id, cached: false } };
}
