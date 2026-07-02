import type PocketBase from "pocketbase";
import { deriveSourceHost } from "@readmepls/core";

interface ContentLike {
  canonical_url?: string;
  expand?: { source?: { id: string; host: string; name: string | null; favicon: string } };
}

export interface SourceView {
  host: string;
  name: string | null;
  iconUrl: string | null;
}

/**
 * View-model for a content row's source. Prefers the expanded source record;
 * falls back to deriving the host from canonical_url so a not-yet-linked article
 * still shows a hostname. Returns null only when no host can be derived.
 */
export function sourceView(pb: PocketBase, content: ContentLike | null | undefined): SourceView | null {
  const src = content?.expand?.source;
  if (src) {
    return {
      host: src.host,
      name: src.name ?? null,
      iconUrl: src.favicon ? pb.files.getUrl(src, src.favicon) : null,
    };
  }
  const host = content?.canonical_url ? deriveSourceHost(content.canonical_url) : null;
  return host ? { host, name: null, iconUrl: null } : null;
}
