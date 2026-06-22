import sanitizeHtml from "sanitize-html";

// Allowlist for reader content: article markup only. No scripts, styles,
// iframes, forms, or event handlers. This runs in the worker so the global
// `content` cache is safe for every consumer that renders it.
export function sanitizeContentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "a", "img", "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "pre", "code", "em",
      "strong", "b", "i", "figure", "figcaption", "hr", "br", "span",
    ],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
  });
}
