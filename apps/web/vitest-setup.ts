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

// jsdom doesn't implement scrollIntoView (github.com/jsdom/jsdom/issues/1695).
// bits-ui's Command scrolls the active item into view on selection change,
// so any test that selects/navigates a Command list needs this to exist —
// otherwise it throws inside an internal effect as an unhandled rejection.
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = () => {};
}

// Node 22+ ships its own global `localStorage`/`sessionStorage` accessors
// (broken — they throw/return undefined without --localstorage-file). Vitest's
// jsdom environment only proxies a window property onto the Node global when
// the key is either absent from the global or in its own hardcoded allowlist;
// neither storage key is, so Node's broken native accessor silently shadows
// jsdom's real, working `window.localStorage`. `globalThis.window` is itself
// the populated Node global (self-referencing), so the real Window instance
// has to be reached via `globalThis.jsdom` (vitest's jsdom environment stashes
// it there) rather than `window` directly. Any code exercising
// localStorage-backed features (recent searches, prefs, …) under test needs
// this restored to jsdom's implementation.
const realWindow = (globalThis as { jsdom?: { window?: Window } }).jsdom
  ?.window;
if (realWindow) {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, key, {
      value: realWindow[key],
      configurable: true,
      writable: true,
    });
  }
}
