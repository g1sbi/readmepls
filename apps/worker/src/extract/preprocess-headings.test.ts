import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { preprocessHeadings } from "./preprocess-headings.js";

function doc(body: string): Document {
  return new JSDOM(`<body>${body}</body>`).window.document;
}

describe("preprocessHeadings", () => {
  it("unwraps a .mw-heading div to its bare heading", () => {
    const d = doc(
      '<div class="mw-heading mw-heading2"><h2 id="bg">Background</h2></div>',
    );
    preprocessHeadings(d);
    const h2 = d.querySelector("h2");
    expect(h2?.parentElement?.tagName).toBe("BODY"); // no longer inside the div
    expect(d.querySelector("div.mw-heading")).toBeNull();
    expect(h2?.textContent).toBe("Background");
  });

  it("removes the [edit] section chrome", () => {
    const d = doc(
      '<div class="mw-heading"><h2>Battle</h2><span class="mw-editsection"><a href="/edit">edit</a></span></div>',
    );
    preprocessHeadings(d);
    expect(d.querySelector(".mw-editsection")).toBeNull();
    expect(d.querySelector("h2")?.textContent).toBe("Battle");
  });

  it("leaves a document without wrappers untouched", () => {
    const d = doc('<h2 id="x">Plain</h2><p>body</p>');
    preprocessHeadings(d);
    expect(d.querySelector("h2")?.id).toBe("x");
    expect(d.querySelector("p")?.textContent).toBe("body");
  });
});
