import type { SourceType } from "@readmepls/types";
import type { Extractor } from "./extractor.js";

/** Dispatches a URL's source type to its extractor. 'other' → article. */
export class ExtractorRegistry {
  private readonly map = new Map<SourceType, Extractor>();

  constructor(extractors: Extractor[]) {
    for (const e of extractors) this.map.set(e.source, e);
  }

  for(source: SourceType): Extractor {
    const direct = this.map.get(source);
    if (direct) return direct;
    const article = this.map.get("article");
    if (!article) {
      throw new Error(`no article extractor registered to handle source '${source}'`);
    }
    return article;
  }
}
