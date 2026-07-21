/** Injected IO seams for link resolution. Tests pass fakes. */
export interface ResolveIO {
  /** SSRF-guarded HTML fetch. */
  fetchHtml(url: string): Promise<string>;
  /** SSRF-guarded JSON fetch. */
  fetchJson(url: string): Promise<unknown>;
  /** SSRF-guarded single-hop redirect read; null if not a redirect. */
  fetchRedirectTarget(url: string): Promise<string | null>;
}

/**
 * Maps an aggregator's wrapper URL to the article it points at.
 *
 * A resolver does exactly one thing: URL in, URL or null out. It never fetches
 * article content and never decides extraction policy — that narrowness is what
 * keeps it testable from fixtures.
 */
export interface LinkResolver {
  /** Hosts this resolver claims (normalized, no leading www). */
  readonly hosts: readonly string[];
  /** Wrapper URL → target article URL, or null if there's no external target. */
  resolve(url: string, io: ResolveIO): Promise<string | null>;
}

/** The value if it is an absolute http(s) URL, else null. */
export function httpUrlOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  return u.protocol === "http:" || u.protocol === "https:" ? value : null;
}
