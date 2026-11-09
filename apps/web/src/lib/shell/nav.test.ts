import { describe, it, expect } from "vitest";
import { NAV_ITEMS, activeKey, shellFor } from "./nav";

describe("NAV_ITEMS", () => {
  it("lists Home and Library", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Home", "Library"]);
    expect(NAV_ITEMS.map((i) => i.href)).toEqual(["/", "/library"]);
  });
});

describe("activeKey", () => {
  it.each([
    ["/", "home"],
    ["/library", "library"],
    ["/read/abc", "library"],
    ["/collections", "collections"],
    ["/collections/physics", "collections"],
    ["/settings", "settings"],
    ["/settings/billing", "settings"],
    ["/nope", null],
  ])("%s -> %s", (p, k) => expect(activeKey(p)).toBe(k));
});

describe("shellFor", () => {
  it.each([
    ["/login", "none"],
    ["/verify", "none"],
    ["/verify?token=x", "none"],
    ["/read/x", "reader"],
    ["/dev/components", "app"],
    ["/", "app"],
    ["/library", "app"],
  ])("%s -> %s", (p, k) => expect(shellFor(p)).toBe(k));
});
