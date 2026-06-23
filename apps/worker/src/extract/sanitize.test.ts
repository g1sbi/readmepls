import { describe, it, expect } from "vitest";
import { sanitizeContentHtml } from "./sanitize.js";

describe("sanitizeContentHtml", () => {
  it("removes script tags and their content", () => {
    const out = sanitizeContentHtml("<p>hi</p><script>alert(1)</script>");
    expect(out).toContain("<p>hi</p>");
    expect(out).not.toContain("script");
  });

  it("strips event-handler attributes", () => {
    const out = sanitizeContentHtml('<p onclick="evil()">x</p>');
    expect(out).not.toContain("onclick");
  });

  it("drops javascript: hrefs but keeps http links", () => {
    expect(sanitizeContentHtml('<a href="javascript:alert(1)">a</a>')).not.toContain("javascript:");
    expect(sanitizeContentHtml('<a href="https://ok.com">a</a>')).toContain("https://ok.com");
  });

  it("removes iframes", () => {
    expect(sanitizeContentHtml('<iframe src="https://evil.com"></iframe>')).not.toContain("iframe");
  });

  it("keeps safe article tags", () => {
    const html = '<h2>T</h2><p>p</p><img src="https://x/i.png" alt="i"><blockquote>q</blockquote><pre><code>c</code></pre>';
    const out = sanitizeContentHtml(html);
    for (const tag of ["<h2>", "<p>", "<img", "<blockquote>", "<pre>", "<code>"]) {
      expect(out).toContain(tag);
    }
  });
});
