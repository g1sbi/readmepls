/**
 * Canonical source key for a URL: lowercased hostname with a single leading
 * "www." removed. Other subdomains are preserved (blog., m., news. are their
 * own sources — no public-suffix grouping). Returns null when the URL can't be
 * parsed, letting the caller leave content.source unset.
 */
export function deriveSourceHost(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  return host.startsWith("www.") ? host.slice(4) : host;
}
