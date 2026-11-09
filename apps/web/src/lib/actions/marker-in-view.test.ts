import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markerInView } from "./marker-in-view";

type Entry = { isIntersecting: boolean };
let instances: FakeIO[] = [];

class FakeIO {
  observe = vi.fn();
  disconnect = vi.fn();
  options: IntersectionObserverInit | undefined;
  constructor(
    public cb: (entries: Entry[]) => void,
    options?: IntersectionObserverInit,
  ) {
    this.options = options;
    instances.push(this);
  }
  fire(isIntersecting: boolean) {
    this.cb([{ isIntersecting }]);
  }
}

function stubMedia(opts: { hover: boolean; reduced?: boolean }) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((q: string) => ({
      matches: q.includes("prefers-reduced-motion")
        ? !!opts.reduced
        : opts.hover,
    })),
  );
}

beforeEach(() => {
  instances = [];
  vi.stubGlobal("IntersectionObserver", FakeIO);
});
afterEach(() => vi.unstubAllGlobals());

describe("markerInView", () => {
  it("draws immediately under reduced motion", () => {
    stubMedia({ hover: false, reduced: true });
    const node = document.createElement("span");
    markerInView(node);
    expect(node.classList.contains("is-drawn")).toBe(true);
    expect(instances).toHaveLength(0);
  });

  it("draws immediately without IntersectionObserver", () => {
    stubMedia({ hover: false });
    vi.stubGlobal("IntersectionObserver", undefined);
    const node = document.createElement("span");
    markerInView(node);
    expect(node.classList.contains("is-drawn")).toBe(true);
  });

  it("on touch, draws once on first intersection then disconnects", () => {
    stubMedia({ hover: false });
    const node = document.createElement("span");
    markerInView(node);
    const io = instances[0];
    expect(io.observe).toHaveBeenCalledWith(node);
    expect(io.options?.threshold).toBe(0.6);
    io.fire(false);
    expect(node.classList.contains("is-drawn")).toBe(false);
    io.fire(true);
    expect(node.classList.contains("is-drawn")).toBe(true);
    expect(io.disconnect).toHaveBeenCalledTimes(1);
    io.fire(true);
    expect(io.disconnect).toHaveBeenCalledTimes(1);
  });

  it("on hover-capable pointers, leaves drawing to CSS", () => {
    stubMedia({ hover: true });
    const node = document.createElement("span");
    markerInView(node);
    expect(instances).toHaveLength(0);
    expect(node.classList.contains("is-drawn")).toBe(false);
  });
});
