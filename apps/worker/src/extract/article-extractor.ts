import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { ExtractResult } from "@readmepls/types";
import type { Extractor } from "./extractor.js";
import { sanitizeContentHtml } from "./sanitize.js";

const WORDS_PER_MIN = 220;

export class ArticleExtractor implements Extractor {
  extract(url: string, html: string): ExtractResult {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
    const author =
      doc.querySelector('meta[name="author"]')?.getAttribute("content") ?? null;
    const siteName =
      doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ??
      null;
    const lang = doc.documentElement.getAttribute("lang") || null;
    const hero =
      doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ??
      null;

    const parsed = new Readability(doc).parse();

    if (!parsed || !parsed.textContent.trim()) {
      return {
        status: "failed",
        sourceType: "article",
        title: doc.title || url,
        author,
        siteName,
        lang,
        contentHtml: "",
        contentText: "",
        excerpt: "",
        wordCount: 0,
        readTime: 0,
        heroImage: hero,
        failureReason: "no readable content",
      };
    }

    const text = parsed.textContent.trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    return {
      status: "ok",
      sourceType: "article",
      title: parsed.title || doc.title || url,
      author: parsed.byline || author,
      siteName: parsed.siteName || siteName,
      lang: parsed.lang || lang,
      contentHtml: sanitizeContentHtml(parsed.content ?? ""),
      contentText: text,
      excerpt: parsed.excerpt || text.slice(0, 280),
      wordCount,
      readTime: Math.max(1, Math.round(wordCount / WORDS_PER_MIN)),
      heroImage: hero,
      failureReason: null,
    };
  }
}
