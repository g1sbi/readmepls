import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "./html-to-md.js";

describe("htmlToMarkdown", () => {
  it("converts headings, links, and code to markdown", () => {
    const md = htmlToMarkdown(
      '<h2>Title</h2><p>See <a href="https://x.test">link</a>.</p><pre><code>x = 1</code></pre>'
    );
    expect(md).toContain("## Title");
    expect(md).toContain("[link](https://x.test)");
    expect(md).toContain("```");
    expect(md).toContain("x = 1");
  });

  it("converts GFM tables", () => {
    const md = htmlToMarkdown(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"
    );
    expect(md).toContain("| A | B |");
    expect(md).toContain("| --- | --- |");
  });
});
