import { describe, it, expect } from "vitest";
import { buildTocFromDom, flattenToc } from "./toc.js";

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

  it("does not generate a slug that collides with an existing heading id", () => {
    const el = root('<h2 id="usage">Intro</h2><h2>Usage</h2>');
    const tree = buildTocFromDom(el);
    const [first, second] = [...el.querySelectorAll("h2")];
    expect(first!.id).toBe("usage");
    expect(second!.id).toBe("usage-2");
    expect(tree.map((n) => n.id)).toEqual(["usage", "usage-2"]);
  });

  it("returns [] when there are no headings", () => {
    expect(buildTocFromDom(root("<p>nope</p>"))).toEqual([]);
  });
});

describe("flattenToc", () => {
  it("walks the tree depth-first, keeping each entry's depth", () => {
    expect(
      flattenToc([
        {
          id: "flow",
          text: "Flow",
          level: 2,
          children: [
            { id: "laminar", text: "Laminar", level: 3, children: [] },
          ],
        },
        { id: "notes", text: "Notes", level: 2, children: [] },
      ]),
    ).toEqual([
      { id: "flow", text: "Flow", level: 2, depth: 0 },
      { id: "laminar", text: "Laminar", level: 3, depth: 1 },
      { id: "notes", text: "Notes", level: 2, depth: 0 },
    ]);
  });

  it("has nothing to flatten in an empty toc", () => {
    expect(flattenToc([])).toEqual([]);
  });
});
