import "@testing-library/jest-dom/vitest";

// Node 25 ships a global `localStorage` that, without a valid --localstorage-file,
// is an empty object with no setItem — and it shadows jsdom's Storage. PocketBase's
// LocalAuthStore writes to it during browserPb() init, so give tests a real
// Map-backed Storage. Uses defineProperty because the Node global is read-only.
if (
  typeof window !== "undefined" &&
  typeof window.localStorage?.setItem !== "function"
) {
  const backing = new Map<string, string>();
  const store: Storage = {
    get length() {
      return backing.size;
    },
    clear: () => backing.clear(),
    getItem: (k) => (backing.has(k) ? backing.get(k)! : null),
    key: (i) => [...backing.keys()][i] ?? null,
    removeItem: (k) => backing.delete(k),
    setItem: (k, v) => backing.set(k, String(v)),
  };
  Object.defineProperty(window, "localStorage", {
    value: store,
    configurable: true,
  });
}

// jsdom has no PointerEvent (github.com/jsdom/jsdom/issues/2527). bits-ui's
// portaled overlays (Dialog, Popover, Select, …) detect outside-click via
// pointerdown/PointerEvent, so any test that closes one by clicking outside
// needs this to exist.
if (
  typeof globalThis.MouseEvent !== "undefined" &&
  typeof globalThis.PointerEvent === "undefined"
) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
    }
  }
  globalThis.PointerEvent =
    PointerEventPolyfill as unknown as typeof PointerEvent;
}
