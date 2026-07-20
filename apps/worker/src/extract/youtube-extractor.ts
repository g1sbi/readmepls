import type { ExtractResult, SourceType } from "@readmepls/types";
import { parseVideoId, parseYtTranscript, failedResult } from "@readmepls/core";
import type { Extractor, ExtractIO } from "./extractor.js";
import { sanitizeContentHtml } from "./sanitize.js";

export class YoutubeExtractor implements Extractor {
  readonly source: SourceType = "youtube";

  async extract(url: string, io: ExtractIO): Promise<ExtractResult> {
    const id = parseVideoId(url);
    if (!id) return failedResult("youtube", "not a youtube video url");
    try {
      const out = await io.runYtDlp(id);
      const result = parseYtTranscript(out.meta, out.captions);
      if (result.status === "failed") return result;
      return { ...result, contentHtml: sanitizeContentHtml(result.contentHtml) };
    } catch (err) {
      // Preserve the underlying reason (bot-block, network, parse) so prod
      // failures are diagnosable instead of an opaque "yt-dlp failed".
      const detail = err instanceof Error ? err.message : String(err);
      return failedResult("youtube", `yt-dlp failed: ${detail}`);
    }
  }
}
