import { z } from "zod";
import type { ExtractResult } from "@readmepls/types";
import type { ExtractIO } from "./extractor.js";
import { parseArticleHtml } from "./parse-article.js";

const MIN_WORDS = 120;
const PAYWALL_SOFT_LIMIT = 500;
const PAYWALL_HINTS = [
  /subscribe to (continue|read)/i,
  /this (article|content|story) is for subscribers/i,
  /create a free account/i,
  /already a (subscriber|member)/i,
];

/** A result too thin or gated to be useful — a fallback candidate. */
export function isThinExtraction(result: ExtractResult): boolean {
  if (result.status === "failed") return true;
  if (result.wordCount < MIN_WORDS) return true;
  if (
    result.wordCount < PAYWALL_SOFT_LIMIT &&
    PAYWALL_HINTS.some((re) => re.test(result.contentText))
  ) {
    return true;
  }
  return false;
}

const WaybackResponse = z.object({
  archived_snapshots: z
    .object({
      closest: z
        .object({ available: z.boolean(), url: z.string() })
        .optional(),
    })
    .default({}),
});

/**
 * Best-effort recovery of a thin/paywalled article from the public web archive.
 * The snapshot is a public archive copy (not the user's session), so the result
 * is safe to cache globally. Returns null on any miss — caller keeps the original
 * graceful-failure result.
 */
export async function recoverFromArchive(
  url: string,
  io: ExtractIO
): Promise<ExtractResult | null> {
  const availUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
  let snapshot: { available: boolean; url: string } | undefined;
  try {
    const parsed = WaybackResponse.safeParse(await io.fetchJson(availUrl));
    if (!parsed.success) return null;
    snapshot = parsed.data.archived_snapshots.closest;
  } catch {
    return null;
  }
  if (!snapshot?.available || !snapshot.url) return null;

  try {
    const html = await io.fetchHtml(snapshot.url);
    const reparsed = parseArticleHtml(url, html);
    if (isThinExtraction(reparsed)) return null;
    return { ...reparsed, status: "partial", failureReason: "recovered from web archive" };
  } catch {
    return null;
  }
}
