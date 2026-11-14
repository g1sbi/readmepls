import { describe, it, expect, afterEach, vi } from "vitest";
import { mapPositions, measureMarks } from "./highlight-map.js";

describe("mapPositions", () => {
  it("places each highlight proportionally, in document order", () => {
    expect(
      mapPositions(
        [
          { id: "a", top: 500 },
          { id: "b", top: 100 },
        ],
        1000,
      ),
    ).toEqual([
      { id: "b", at: 0.1 },
      { id: "a", at: 0.5 },
    ]);
  });

  it("has nowhere to place anything without a document height", () => {
    expect(mapPositions([{ id: "a", top: 500 }], 0)).toEqual([]);
    expect(mapPositions([{ id: "a", top: 500 }], -10)).toEqual([]);
  });

  it("clamps a highlight past the end of the document", () => {
    expect(mapPositions([{ id: "a", top: 1500 }], 1000)).toEqual([
      { id: "a", at: 1 },
    ]);
    expect(mapPositions([{ id: "a", top: -50 }], 1000)).toEqual([
      { id: "a", at: 0 },
    ]);
  });
});

describe("measureMarks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("takes the first mark of each highlight, in document coordinates", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<mark data-hl-id="a">one</mark><mark data-hl-id="b">two</mark>' +
      '<mark data-hl-id="a">one continued</mark>';
    const tops = new Map([
      ["one", 40],
      ["two", 90],
      ["one continued", 300],
    ]);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        return { top: tops.get(this.textContent ?? "") ?? 0 } as DOMRect;
      },
    );
    Object.defineProperty(window, "scrollY", {
      value: 1000,
      configurable: true,
    });

    expect(measureMarks(root)).toEqual([
      { id: "a", top: 1040 },
      { id: "b", top: 1090 },
    ]);
  });

  it("measures nothing in text without marks", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>plain</p>";
    expect(measureMarks(root)).toEqual([]);
  });
});
