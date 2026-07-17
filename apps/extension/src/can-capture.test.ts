import { describe, it, expect } from "vitest";
import { canCapture } from "./can-capture.js";

describe("canCapture", () => {
  it("allows http(s) pages", () => {
    expect(canCapture("https://example.com/article")).toBe(true);
    expect(canCapture("http://example.com")).toBe(true);
  });
  it("rejects browser-internal, file, empty, and malformed URLs", () => {
    for (const u of [
      "chrome://newtab",
      "chrome-extension://abc/popup.html",
      "about:blank",
      "file:///home/x/page.html",
      "",
      null,
      undefined,
      "not a url",
    ]) {
      expect(canCapture(u)).toBe(false);
    }
  });
});
