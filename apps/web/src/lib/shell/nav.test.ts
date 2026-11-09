import { describe, it, expect } from "vitest";
import {
  NAV_ITEMS,
  WIDE_QUERY,
  activeKey,
  shellFor,
  activeCollectionSlug,
  under,
} from "./nav";

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
    ["/read/abc", null],
    ["/read", null],
    ["/collections", "collections"],
    ["/collections/physics", "collections"],
    ["/settings", "settings"],
    ["/settings/billing", "settings"],
    ["/nope", null],
    ["/library/", "library"],
    ["/library?x=1", "library"],
    ["/libraryx", null],
    ["/readme", null],
    ["/settingsx", null],
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
    ["/readme", "app"],
    ["/verifying", "app"],
  ])("%s -> %s", (p, k) => expect(shellFor(p)).toBe(k));
});

describe("activeCollectionSlug", () => {
  it("extracts and decodes the slug", () => {
    expect(activeCollectionSlug("/collections/physics")).toBe("physics");
    expect(activeCollectionSlug("/collections/a%20b?x=1#h")).toBe("a b");
  });
  it("keeps a malformed escape as-is", () => {
    expect(activeCollectionSlug("/collections/%E0%A4%A")).toBe("%E0%A4%A");
  });
  it("is null off a collection page", () => {
    expect(activeCollectionSlug("/collections")).toBeNull();
    expect(activeCollectionSlug("/collections/")).toBeNull();
    expect(activeCollectionSlug("/library")).toBeNull();
    expect(activeCollectionSlug("/collectionsx/a")).toBeNull();
  });
});

describe("under", () => {
  it("matches the base and its children only", () => {
    expect(under("/read", "/read")).toBe(true);
    expect(under("/read/a", "/read")).toBe(true);
    expect(under("/readme", "/read")).toBe(false);
  });
});

describe("WIDE_QUERY", () => {
  it("is the md breakpoint", () => {
    expect(WIDE_QUERY).toBe("(min-width: 48rem)");
  });
});
