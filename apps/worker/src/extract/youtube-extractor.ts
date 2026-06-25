import type { ExtractResult, SourceType } from "@readmepls/types";
import { parseVideoId, parseYtTranscript, failedResult } from "@readmepls/core";
import type { Extractor, ExtractIO } from "./extractor.js";

export class YoutubeExtractor implements Extractor {
  readonly source: SourceType = "youtube";

  async extract(url: string, io: ExtractIO): Promise<ExtractResult> {
    const id = parseVideoId(url);
    if (!id) return failedResult("youtube", "not a youtube video url");
    try {
      const out = await io.runYtDlp(id);
      return parseYtTranscript(out.meta, out.captions);
    } catch {
      return failedResult("youtube", "yt-dlp failed");
    }
  }
}
