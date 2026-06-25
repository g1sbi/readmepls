/** Tweet id from an x.com / twitter.com status URL, else null. */
export function parseTweetId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "x.com" && host !== "twitter.com") return null;
  const m = u.pathname.match(/\/status(?:es)?\/(\d+)/);
  return m ? (m[1] ?? null) : null;
}

/**
 * Token the public syndication endpoint expects. Derived deterministically from
 * the tweet id (community-known formula used by X's own embeds) — no secret.
 */
export function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI)
    .toString(36)
    .replace(/(0+|\.)/g, "");
}
