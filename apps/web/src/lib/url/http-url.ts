/**
 * Returns the URL unchanged only when it parses as an http(s) URL, else null.
 * Guards href / window.open sinks against javascript:/data: scheme XSS —
 * article.url is stored as the raw pasted URL and could be written directly
 * via the PocketBase API, bypassing the capture-time canonicalize check.
 */
export function httpUrlOrNull(url: string): string | null {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
