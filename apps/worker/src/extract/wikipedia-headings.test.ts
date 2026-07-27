import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArticleHtml } from "./parse-article.js";

// Regression: modern MediaWiki wraps each heading as
// <div class="mw-heading"><h2 id="…">Title</h2><span class="mw-editsection">[edit]</span></div>.
// Readability discards that wrapper (heading and all) unless we lift the heading
// out first — leaving the article with no TOC. See parse-article's preprocess.
const html = readFileSync(
  fileURLToPath(new URL("./fixtures/wikipedia-headings.html", import.meta.url)),
  "utf8",
);

describe("parseArticleHtml — MediaWiki heading wrappers", () => {
  it("emits a toc from headings wrapped in .mw-heading divs", () => {
    const result = parseArticleHtml("https://en.wikipedia.org/wiki/Battle_of_Example", html);
    expect(result.status).toBe("ok");
    // Background / Battle / Aftermath at h2, Opening moves nested under Battle.
    expect(result.toc.map((n) => n.text)).toEqual(["Background", "Battle", "Aftermath"]);
    const battle = result.toc.find((n) => n.text === "Battle");
    expect(battle?.children.map((n) => n.text)).toEqual(["Opening moves"]);
    // Ids are injected into the stored HTML so click-to-jump has a target.
    expect(result.contentHtml).toMatch(/<h2 id="[^"]+">Background<\/h2>/);
  });

  it("does not leak the [edit] section links into heading text", () => {
    const result = parseArticleHtml("https://en.wikipedia.org/wiki/Battle_of_Example", html);
    expect(result.toc.every((n) => !n.text.includes("edit"))).toBe(true);
  });
});
