import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(__dirname, "tokens.css"), "utf8");

/* Mirrors read/[id]: an ancestor may set the reader knobs, the article below
 * carries data-theme. A light scope must not re-declare them, or an ancestor's
 * values stop reaching the article in light. */
describe("nested light scope", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("does not reset the reader knobs set on an ancestor", () => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    document.body.innerHTML = `<div class="reader-shell" style="--reading-size: 1.4rem; --reading-leading: 2; --reading-measure: 80ch"><article data-theme="light"></article></div>`;
    const article = document.querySelector("article")!;
    const shell = document.querySelector<HTMLElement>(".reader-shell")!;
    const read = (el: Element, p: string) =>
      getComputedStyle(el).getPropertyValue(p).trim();

    // jsdom does not inherit custom properties, so "" means "no rule on the
    // article declared it" — in a browser it then inherits the shell's value.
    for (const p of [
      "--reading-font",
      "--reading-size",
      "--reading-leading",
      "--reading-measure",
    ]) {
      expect(["", read(shell, p)], p).toContain(read(article, p));
    }
    // sanity: the light scope still applies its semantic colours
    expect(read(article, "--color-bg")).not.toBe("");
  });
});
