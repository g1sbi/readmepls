import { canonicalizeUrl } from "@readmepls/core";
import {
  httpUrlOrNull,
  type LinkResolver,
  type ResolveIO,
} from "./resolver.js";

/** Lowercased, leading `www.` stripped — the key resolvers are registered under. */
export function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** Dispatches a wrapper URL to the resolver claiming its host. */
export class ResolverRegistry {
  private readonly map = new Map<string, LinkResolver>();

  constructor(resolvers: LinkResolver[]) {
    for (const r of resolvers) {
      for (const h of r.hosts) this.map.set(normalizeHost(h), r);
    }
  }

  /**
   * Target URL, or null when the host is unclaimed, the wrapper has no external
   * target, or resolution failed. Never throws: an aggregator being down must
   * degrade to extracting the wrapper URL, not fail the job.
   */
  async resolve(url: string, io: ResolveIO): Promise<string | null> {
    const wrapperHost = hostOf(url);
    if (!wrapperHost) return null;

    const resolver = this.map.get(wrapperHost);
    if (!resolver) return null;

    let target: string | null;
    try {
      target = httpUrlOrNull(await resolver.resolve(url, io));
    } catch {
      return null;
    }
    if (!target) return null;

    // Re-canonicalize before validating: a wrapper's redirect target can
    // carry tracking params (e.g. daily.dev's /r/ redirect appends
    // `?ref=...`, which is in canonicalize.ts's TRACKING set). Stored raw,
    // a later direct capture of the bare URL would canonicalize differently,
    // miss the cache, and duplicate the content row. canonicalizeUrl throws
    // on unsupported input; target already passed httpUrlOrNull so that
    // should not happen, but guard it anyway to preserve resolve()'s
    // never-throw contract.
    try {
      target = canonicalizeUrl(target);
    } catch {
      return null;
    }

    // Self-resolution guard. Comparing *resolvers* rather than hosts is what
    // makes app.daily.dev → daily.dev count as self and stop the loop.
    const targetHost = hostOf(target);
    if (!targetHost || this.map.get(targetHost) === resolver) return null;

    return target;
  }
}

function hostOf(url: string): string | null {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return null;
  }
}
