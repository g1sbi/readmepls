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
  deps: SafeFetchDeps,
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
  opts: { maxRedirects?: number } = {},
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

interface ByteResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface SafeFetchBytesDeps {
  lookup: (host: string) => Promise<string[]>;
  fetchFn: (url: string) => Promise<ByteResponseLike>;
  maxRedirects?: number;
}

/**
 * SSRF-safe binary fetch, mirroring createSafeFetchHtml. Re-validates the host
 * before every hop; follows redirects manually. Returns null on any non-2xx so
 * favicon probing can fall through to the next candidate without throwing.
 */
export function createSafeFetchBytes(
  deps: SafeFetchBytesDeps,
): (url: string) => Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const maxRedirects = deps.maxRedirects ?? 5;
  return async function fetchBytes(url) {
    let current = url;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      await assertSafe(current, deps.lookup);
      const r = await deps.fetchFn(current);
      if (r.status >= 300 && r.status < 400) {
        const location = r.headers.get("location");
        if (!location) return null;
        current = new URL(location, current).toString();
        continue;
      }
      if (r.status < 200 || r.status >= 300) return null;
      const buf = await r.arrayBuffer();
      return {
        bytes: new Uint8Array(buf),
        contentType: r.headers.get("content-type") ?? "",
      };
    }
    return null;
  };
}

export interface SafeFetchRedirectDeps {
  lookup: (host: string) => Promise<string[]>;
  /** One HTTP request WITHOUT following redirects (redirect: 'manual'). */
  fetchFn: (url: string) => Promise<ResponseLike>;
}

/**
 * Reads a single redirect's Location without following it — the seam link
 * resolvers need to turn an aggregator's short link into its target.
 *
 * The request URL is validated exactly like the other fetchers (throws if
 * private). The *target* is attacker-influenced, so a private target returns
 * null rather than throwing: an aggregator pointing at an internal address is
 * a resolution miss, not a caller bug.
 */
export function createSafeFetchRedirectTarget(
  deps: SafeFetchRedirectDeps,
): (url: string) => Promise<string | null> {
  return async function fetchRedirectTarget(
    url: string,
  ): Promise<string | null> {
    await assertSafe(url, deps.lookup);
    const r = await deps.fetchFn(url);
    if (r.status < 300 || r.status >= 400) return null;
    const location = r.headers.get("location");
    if (!location) return null;

    let target: string;
    try {
      target = new URL(location, url).toString();
    } catch {
      return null;
    }
    try {
      await assertSafe(target, deps.lookup);
    } catch {
      return null;
    }
    return target;
  };
}

/** Production wiring: node DNS + global fetch with manual redirects. */
export function defaultSafeFetchRedirectTarget(): (
  url: string,
) => Promise<string | null> {
  return createSafeFetchRedirectTarget({
    lookup: async (host) => {
      const records = await dnsLookup(host, { all: true });
      return records.map((r) => r.address);
    },
    fetchFn: (url) => fetch(url, { redirect: "manual" }),
  });
}

async function assertSafe(
  url: string,
  lookup: SafeFetchDeps["lookup"],
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
