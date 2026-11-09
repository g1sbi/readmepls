import { afterEach, describe, expect, it } from "vitest";
import { markRange, unmarkAll } from "./render";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("markRange", () => {
  it("tags the mark with its color and leaves styling to reading.css", () => {
    document.body.innerHTML = "<p>hello brave world</p>";
    const text = document.querySelector("p")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 6);
    range.setEnd(text, 11);

    markRange(range, "amber", "h1");

    const mark = document.querySelector<HTMLElement>("mark[data-hl-id='h1']")!;
    expect(mark.textContent).toBe("brave");
    expect(mark.dataset.hlColor).toBe("amber");
    expect(mark.style.background).toBe("");
    expect(mark.style.borderRadius).toBe("");
    expect(mark.getAttribute("style")).toBeNull();
  });

  it("unmarkAll restores the text", () => {
    document.body.innerHTML = "<p>hello brave world</p>";
    const p = document.querySelector("p")!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 0);
    range.setEnd(p.firstChild!, 5);
    markRange(range, "sage", "h2");
    unmarkAll(document.body);
    expect(p.innerHTML).toBe("hello brave world");
  });
});
