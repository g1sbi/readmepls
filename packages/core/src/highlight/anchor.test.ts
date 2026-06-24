// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { describe as describeRange, anchor, rangeOver } from "./anchor.js";

function selectText(root: HTMLElement, needle: string): Range {
  const text = root.textContent ?? "";
  const start = text.indexOf(needle);
  // walk text nodes to map the flat offset to a DOM Range
  const r = document.createRange();
  let acc = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent!.length;
    if (acc + len > start && r.startContainer === document) {
      r.setStart(node, start - acc);
    }
    if (acc + len >= start + needle.length) {
      r.setEnd(node, start + needle.length - acc);
      break;
    }
    acc += len;
  }
  return r;
}

describe("highlight anchoring", () => {
  it("describes and re-anchors an unchanged DOM", async () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>the quick brown fox jumps over the lazy dog</p>";
    const scope = rangeOver(root);
    const target = selectText(root, "brown fox");

    const sel = await describeRange(scope, target);
    expect(sel.text).toBe("brown fox");

    const back = await anchor(rangeOver(root), sel);
    expect(back).not.toBeNull();
    expect(back!.toString()).toBe("brown fox");
  });

  it("re-anchors after the surrounding markup changes", async () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>the quick brown fox jumps over the lazy dog</p>";
    const sel = await describeRange(rangeOver(root), selectText(root, "lazy dog"));

    // Re-render: wrap a word in <em>, add a leading node. Quote text unchanged.
    const root2 = document.createElement("article");
    root2.innerHTML = "<h2>Title</h2><p>the <em>quick</em> brown fox jumps over the lazy dog</p>";
    const back = await anchor(rangeOver(root2), sel);
    expect(back).not.toBeNull();
    expect(back!.toString()).toBe("lazy dog");
  });

  it("returns null when the quote no longer exists", async () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>the quick brown fox</p>";
    const sel = await describeRange(rangeOver(root), selectText(root, "quick"));

    const root2 = document.createElement("article");
    root2.innerHTML = "<p>entirely different content here</p>";
    expect(await anchor(rangeOver(root2), sel)).toBeNull();
  });
});
