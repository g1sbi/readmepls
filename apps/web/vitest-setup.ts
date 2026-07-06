import "@testing-library/jest-dom/vitest";

// jsdom has no PointerEvent (github.com/jsdom/jsdom/issues/2527). bits-ui's
// portaled overlays (Dialog, Popover, Select, …) detect outside-click via
// pointerdown/PointerEvent, so any test that closes one by clicking outside
// needs this to exist.
if (typeof globalThis.MouseEvent !== "undefined" && typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
    }
  }
  globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}
