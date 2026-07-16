import { describe, it, expect } from "vitest";
import { isSearchOpenShortcut } from "./shortcut.js";

function ev(
  init: Partial<KeyboardEvent> & { key: string; target?: EventTarget | null },
): KeyboardEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: null,
    ...init,
  } as KeyboardEvent;
}

describe("isSearchOpenShortcut", () => {
  it("matches Cmd+K and Ctrl+K", () => {
    expect(isSearchOpenShortcut(ev({ key: "k", metaKey: true }))).toBe(true);
    expect(isSearchOpenShortcut(ev({ key: "K", ctrlKey: true }))).toBe(true);
  });

  it("matches / with no editable target", () => {
    expect(isSearchOpenShortcut(ev({ key: "/", target: null }))).toBe(true);
  });

  it("ignores / while typing in an input", () => {
    const input = document.createElement("input");
    expect(isSearchOpenShortcut(ev({ key: "/", target: input }))).toBe(false);
  });

  it("ignores / in a textarea and contenteditable", () => {
    const ta = document.createElement("textarea");
    const div = document.createElement("div");
    div.contentEditable = "true";
    expect(isSearchOpenShortcut(ev({ key: "/", target: ta }))).toBe(false);
    expect(isSearchOpenShortcut(ev({ key: "/", target: div }))).toBe(false);
  });

  it("ignores plain keys", () => {
    expect(isSearchOpenShortcut(ev({ key: "a" }))).toBe(false);
    expect(isSearchOpenShortcut(ev({ key: "k" }))).toBe(false);
  });
});
