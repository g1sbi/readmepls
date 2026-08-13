import { afterEach, expect, test, vi } from "vitest";
import { trackTopbarHeight } from "./track-topbar-height";

function sized(height: number): HTMLElement {
  const node = document.createElement("header");
  node.getBoundingClientRect = () => ({ height }) as DOMRect;
  return node;
}

/** Stubs ResizeObserver and hands back a trigger for the captured callback. */
function stubResizeObserver() {
  const observe = vi.fn();
  const disconnect = vi.fn();
  let cb: ResizeObserverCallback | undefined;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        cb = callback;
      }
      observe = observe;
      unobserve = vi.fn();
      disconnect = disconnect;
    },
  );
  return {
    observe,
    disconnect,
    resize: () => cb?.([], {} as ResizeObserver),
  };
}

const varOf = () =>
  document.documentElement.style.getPropertyValue("--topbar-h");

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("--topbar-h");
});

test("publishes the bar's measured height on the document root", () => {
  stubResizeObserver();

  trackTopbarHeight(sized(69));

  expect(varOf()).toBe("69px");
});

test("republishes when the bar resizes", () => {
  const ro = stubResizeObserver();
  const node = sized(69);

  trackTopbarHeight(node);
  node.getBoundingClientRect = () => ({ height: 112 }) as DOMRect;
  ro.resize();

  expect(ro.observe).toHaveBeenCalledWith(node);
  expect(varOf()).toBe("112px");
});

test("destroy stops observing and clears the variable", () => {
  const ro = stubResizeObserver();

  const action = trackTopbarHeight(sized(69));
  action.destroy();

  expect(ro.disconnect).toHaveBeenCalledOnce();
  expect(varOf()).toBe("");
});

test("still publishes a height without ResizeObserver", () => {
  vi.stubGlobal("ResizeObserver", undefined);

  const action = trackTopbarHeight(sized(69));

  expect(varOf()).toBe("69px");
  action.destroy();
  expect(varOf()).toBe("");
});
