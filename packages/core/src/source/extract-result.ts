import type { ExtractResult, SourceType } from "@readmepls/types";

/** Minimal-escape plain text for safe interpolation into generated HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A schema-valid failed result for a graceful, non-blocking extraction failure. */
export function failedResult(source: SourceType, reason: string): ExtractResult {
  return {
    status: "failed",
    sourceType: source,
    title: "",
    author: null,
    siteName: null,
    lang: null,
    contentHtml: "",
    contentText: "",
    excerpt: "",
    wordCount: 0,
    readTime: 0,
    heroImage: null,
    publishedAt: null,
    failureReason: reason,
  };
}
