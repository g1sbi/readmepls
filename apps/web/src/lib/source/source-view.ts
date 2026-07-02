import type PocketBase from "pocketbase";
import { deriveSourceHost } from "@readmepls/core";
import { Source } from "@readmepls/types";

interface ContentLike {
  canonical_url?: string;
  expand?: { source?: unknown };
}

export interface SourceView {
  host: string;
  name: string | null;
  iconUrl: string | null;
}

/**
 * View-model for a content row's source. Prefers the expanded source record,
 * validated with the Source schema since it's data read back from PocketBase;
 * falls back to deriving the host from canonical_url (on missing source or a
 * failed parse) so a not-yet-linked or malformed article still shows a hostname.
 * Returns null only when no host can be derived.
 */
export function sourceView(pb: PocketBase, content: ContentLike | null | undefined): SourceView | null {
  const raw = content?.expand?.source;
  if (raw) {
    const parsed = Source.safeParse(raw);
    if (parsed.success) {
      const src = parsed.data;
      return {
        host: src.host,
        name: src.name ?? null,
        iconUrl: src.favicon ? pb.files.getUrl(src, src.favicon) : null,
      };
    }
  }
  const host = content?.canonical_url ? deriveSourceHost(content.canonical_url) : null;
  return host ? { host, name: null, iconUrl: null } : null;
}
