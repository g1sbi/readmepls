import { lookup as dnsLookup } from "node:dns/promises";
import { isPrivateAddress } from "./private-address.js";

interface ResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export interface SafeFetchDeps {
  /** Resolve a hostname to all of its IP literals (e.g. dns.lookup all:true). */
  lookup: (host: string) => Promise<string[]>;
  /** Perform one HTTP request WITHOUT following redirects (redirect: 'manual'). */
  fetchFn: (url: string) => Promise<ResponseLike>;
  /** Max redirect hops before giving up. Default 5. */
  maxRedirects?: number;
}

/**
 * Builds an SSRF-safe `fetchHtml`. Before every hop — the initial request and
 * each redirect — it re-validates the scheme and resolves the host, refusing if
 * any resolved address is private/loopback/link-local. Redirects are followed
 * manually so a 302 to an internal address cannot bypass the check.
 */
export function createSafeFetchHtml(
  deps: SafeFetchDeps
): (url: string) => Promise<string> {
  const maxRedirects = deps.maxRedirects ?? 5;

  return async function fetchHtml(url: string): Promise<string> {
    let current = url;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await assertSafe(current, deps.lookup);
      const r = await deps.fetchFn(current);
      if (r.status >= 300 && r.status < 400) {
        const location = r.headers.get("location");
        if (!location) throw new Error(`redirect with no location: ${current}`);
        current = new URL(location, current).toString();
        continue;
      }
      return r.text();
    }
    throw new Error(`too many redirects (>${maxRedirects})`);
  };
}

/**
 * Production wiring: node DNS + global fetch with manual redirects. The logic is
 * exercised offline via createSafeFetchHtml's injected deps; this is the thin IO
 * adapter that supplies the real network seams.
 */
export function defaultSafeFetchHtml(
  opts: { maxRedirects?: number } = {}
): (url: string) => Promise<string> {
  return createSafeFetchHtml({
    lookup: async (host) => {
      const records = await dnsLookup(host, { all: true });
      return records.map((r) => r.address);
    },
    fetchFn: (url) => fetch(url, { redirect: "manual" }),
    maxRedirects: opts.maxRedirects,
  });
}

async function assertSafe(
  url: string,
  lookup: SafeFetchDeps["lookup"]
): Promise<void> {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`unsupported scheme: ${u.protocol}`);
  }
  const addrs = await lookup(u.hostname);
  if (addrs.length === 0) throw new Error(`could not resolve ${u.hostname}`);
  for (const addr of addrs) {
    if (isPrivateAddress(addr)) {
      throw new Error(`blocked address ${addr} for host ${u.hostname}`);
    }
  }
}
