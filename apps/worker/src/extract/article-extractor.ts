import type { ExtractResult, SourceType } from "@readmepls/types";
import type { Extractor, ExtractIO } from "./extractor.js";
import { parseArticleHtml } from "./parse-article.js";

// Generic article path for everything that isn't X/YouTube: blogs, Substack,
// Medium, news sites. Readability parses server-rendered HTML, so SSR pages work.
// Limitation: purely client-rendered SPA blogs (content injected by JS, no SSR)
// won't extract — safe-fetch pulls static HTML, there's no headless browser.
// Rare for blogs (Substack/Medium SSR their content), so headless rendering is
// deliberately out of scope. Paywalled/preview-only posts read as thin and fall
// through to the archive fallback (see phase-5 extractors design §4.4).
export class ArticleExtractor implements Extractor {
  readonly source: SourceType = "article";

  async extract(url: string, io: ExtractIO): Promise<ExtractResult> {
    const html = await io.fetchHtml(url);
    return parseArticleHtml(url, html);
  }
}
