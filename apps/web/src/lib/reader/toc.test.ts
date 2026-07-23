import { describe, it, expect } from "vitest";
import { buildTocFromDom } from "./toc.js";

function root(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("buildTocFromDom", () => {
  it("builds a nested tree from rendered headings", () => {
    const el = root("<h2>Alpha</h2><h3>Beta</h3><h2>Gamma</h2>");
    const tree = buildTocFromDom(el);
    expect(tree.map((n) => n.id)).toEqual(["alpha", "gamma"]);
    expect(tree[0]!.children.map((n) => n.text)).toEqual(["Beta"]);
  });

  it("writes ids back onto headings that lack them", () => {
    const el = root("<h2>Alpha</h2>");
    buildTocFromDom(el);
    expect(el.querySelector("h2")!.id).toBe("alpha");
  });

  it("keeps an existing id", () => {
    const el = root('<h2 id="keep">Alpha</h2>');
    const tree = buildTocFromDom(el);
    expect(tree[0]!.id).toBe("keep");
    expect(el.querySelector("h2")!.id).toBe("keep");
  });

  it("returns [] when there are no headings", () => {
    expect(buildTocFromDom(root("<p>nope</p>"))).toEqual([]);
  });
});
