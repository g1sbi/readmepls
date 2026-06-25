import type { ExtractResult, SourceType } from "@readmepls/types";

// Placeholder until Task 4 defines the real yt-dlp shapes in @readmepls/core.
export interface YtDlpOutput {
  meta: unknown;
  captions: unknown;
}

/** Injected IO seams. Extractors own their fetching; tests pass fakes. */
export interface ExtractIO {
  /** SSRF-guarded HTML fetch (existing safe-fetch). */
  fetchHtml(url: string): Promise<string>;
  /** SSRF-guarded JSON fetch (syndication / Wayback availability). */
  fetchJson(url: string): Promise<unknown>;
  /** yt-dlp subprocess seam: metadata + captions for a video id. */
  runYtDlp(videoId: string): Promise<YtDlpOutput>;
}

export interface Extractor {
  /** Source this extractor handles. */
  source: SourceType;
  /** Fetch (via io) and parse a URL into a normalized result. */
  extract(url: string, io: ExtractIO): Promise<ExtractResult>;
}
