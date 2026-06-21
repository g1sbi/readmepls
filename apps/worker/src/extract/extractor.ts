import type { ExtractResult } from "@readmepls/types";

export interface Extractor {
  /** Parse already-fetched HTML for a given URL into a normalized result. */
  extract(url: string, html: string): ExtractResult;
}
