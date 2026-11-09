import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withReaderDefaults } from "@readmepls/core";
import { readerCssVars } from "$lib/reader/css-vars";

const css = readFileSync(join(__dirname, "tokens.css"), "utf8");

/* Mirrors read/[id]: prefs sit on .reader-shell, the article below carries
 * data-theme. A light scope must not re-declare the reader knobs, or the
 * user's size / leading / width prefs stop reaching the article in light. */
describe("nested light scope", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("does not reset the reader prefs set on an ancestor", () => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    const prefs = withReaderDefaults({
      size: 23,
      lineHeight: 2,
      width: "wide",
    });
    document.body.innerHTML = `<div class="reader-shell" style="${readerCssVars(prefs)}"><article data-theme="light"></article></div>`;
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
