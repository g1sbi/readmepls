import { z } from "zod";
import type { ExtractResult } from "@readmepls/types";
import { escapeHtml, failedResult } from "../extract-result.js";

const WORDS_PER_MIN = 220;

const User = z.object({ name: z.string(), screen_name: z.string() });
const Photo = z.object({ url: z.string() });
const Quoted = z.object({ text: z.string(), user: User });
const Tweet = z.object({
  text: z.string(),
  user: User,
  photos: z.array(Photo).optional(),
  quoted_tweet: Quoted.optional(),
});

/**
 * Render a public syndication tweet (plus its quoted tweet, when present) into a
 * readable result. Note: the tweet-result endpoint returns a single focal tweet,
 * so downward self-thread expansion is limited to what the payload carries; this
 * is acceptable best-effort (see phase-5 design §9, X fragility risk).
 */
export function parseSyndicationThread(raw: unknown): ExtractResult {
  const parsed = Tweet.safeParse(raw);
  if (!parsed.success) return failedResult("x", "tweet unavailable");
  const t = parsed.data;

  const handle = `@${t.user.screen_name}`;
  const blocks: string[] = [`<p>${escapeHtml(t.text)}</p>`];
  const textParts: string[] = [t.text];

  for (const photo of t.photos ?? []) {
    blocks.push(`<img src="${escapeHtml(photo.url)}" alt="" />`);
  }
  if (t.quoted_tweet) {
    const q = t.quoted_tweet;
    blocks.push(
      `<blockquote><p>${escapeHtml(q.text)}</p><cite>@${escapeHtml(
        q.user.screen_name
      )}</cite></blockquote>`
    );
    textParts.push(`${q.user.name} (@${q.user.screen_name}): ${q.text}`);
  }

  const contentText = textParts.join("\n\n");
  const wordCount = contentText.split(/\s+/).filter(Boolean).length;
  const firstLine = t.text.slice(0, 60).trim();

  return {
    status: "ok",
    sourceType: "x",
    title: `${t.user.name} on X: "${firstLine}${t.text.length > 60 ? "…" : ""}"`,
    author: `${t.user.name} (${handle})`,
    siteName: "X",
    lang: null,
    contentHtml: blocks.join("\n"),
    contentText,
    excerpt: contentText.slice(0, 280),
    wordCount,
    readTime: Math.max(1, Math.round(wordCount / WORDS_PER_MIN)),
    heroImage: t.photos?.[0]?.url ?? null,
    failureReason: null,
  };
}
