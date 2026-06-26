import type { ExtractResult, SourceType } from "@readmepls/types";
import {
  parseTweetId,
  syndicationToken,
  parseSyndicationThread,
  failedResult,
} from "@readmepls/core";
import type { Extractor, ExtractIO } from "./extractor.js";
import { sanitizeContentHtml } from "./sanitize.js";

export class XExtractor implements Extractor {
  readonly source: SourceType = "x";

  async extract(url: string, io: ExtractIO): Promise<ExtractResult> {
    const id = parseTweetId(url);
    if (!id) return failedResult("x", "not a tweet url");
    const endpoint =
      `https://cdn.syndication.twimg.com/tweet-result` +
      `?id=${id}&token=${syndicationToken(id)}&lang=en`;
    try {
      const raw = await io.fetchJson(endpoint);
      const result = parseSyndicationThread(raw);
      if (result.status === "failed") return result;
      return { ...result, contentHtml: sanitizeContentHtml(result.contentHtml) };
    } catch {
      return failedResult("x", "tweet unavailable");
    }
  }
}
