import {
  httpUrlOrNull,
  type LinkResolver,
  type ResolveIO,
} from "./resolver.js";

const META_TAG = /<meta[^>]*>/gi;
const IS_OG_IMAGE = /property=["']og:image["']/i;
const CONTENT_ATTR = /content=["']([^"']+)["']/i;
const POST_ID = /og\.daily\.dev\/api\/posts\/([A-Za-z0-9_-]+)/;

/**
 * daily.dev post pages are client-rendered shells, so the article body is never
 * in the HTML — but the post id is, in og:image. That id feeds a short-link
 * endpoint that redirects to the real article.
 *
 * The id MUST come from og:image, not the URL slug: the slug suffix is
 * lowercased and 404s against /r/, while og:image preserves the true case.
 */
export class DailyDevResolver implements LinkResolver {
  readonly hosts = ["daily.dev", "app.daily.dev"] as const;

  async resolve(url: string, io: ResolveIO): Promise<string | null> {
    if (!new URL(url).pathname.startsWith("/posts/")) return null;

    const html = await io.fetchHtml(url);
    const id = extractPostId(html);
    if (!id) return null;

    return httpUrlOrNull(
      await io.fetchRedirectTarget(`https://api.daily.dev/r/${id}`),
    );
  }
}

function extractPostId(html: string): string | null {
  for (const tag of html.match(META_TAG) ?? []) {
    if (!IS_OG_IMAGE.test(tag)) continue;
    const content = CONTENT_ATTR.exec(tag);
    const contentValue = content?.[1];
    if (!contentValue) continue;
    const id = POST_ID.exec(contentValue);
    const idValue = id?.[1];
    if (idValue) return idValue;
  }
  return null;
}
