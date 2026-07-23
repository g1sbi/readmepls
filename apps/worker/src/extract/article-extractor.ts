import type { ExtractResult, SourceType } from "@readmepls/types";
import type { Extractor, ExtractIO } from "./extractor.js";
import { parseArticleHtml } from "./parse-article.js";
import { isThinExtraction, recoverFromArchive } from "./archive-fallback.js";

// Generic article path for everything that isn't X/YouTube: blogs, Substack,
// Medium, news sites. Readability parses server-rendered HTML, so SSR pages work.
// Limitation: purely client-rendered SPA blogs (content injected by JS, no SSR)
// won't extract — safe-fetch pulls static HTML, there's no headless browser.
// Rare for blogs (Substack/Medium SSR their content), so headless rendering is
// deliberately out of scope. Aggregator wrappers that are client-rendered
// (daily.dev) are handled upstream instead — see resolve/, which maps them to
// the article's real URL before extraction reaches here. daily.dev's own native
// posts have no external target and still read as thin.
export class ArticleExtractor implements Extractor {
  readonly source: SourceType = "article";

  async extract(url: string, io: ExtractIO): Promise<ExtractResult> {
    const html = await io.fetchHtml(url);
    const primary = parseArticleHtml(url, html);
    if (!isThinExtraction(primary)) return primary;
    const recovered = await recoverFromArchive(url, io);
    return recovered ?? primary;
  }
}
