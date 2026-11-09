import { describe, it, expect } from "vitest";
import { readerBackTarget } from "./back-target.js";

const u = (path: string) => new URL(path, "http://app.test");
// Raw location parts, for pathnames a URL would normalise away.
const p = (pathname: string, search = "") => ({ pathname, search });

describe("readerBackTarget", () => {
  it("keeps the origin's query string", () => {
    expect(readerBackTarget(u("/library?tag=x"))).toBe("/library?tag=x");
    expect(readerBackTarget(u("/collections/a?sort=old"))).toBe(
      "/collections/a?sort=old",
    );
  });

  it("drops the query along with a rejected origin", () => {
    expect(readerBackTarget(u("/read/a?x=1"))).toBe("/library");
    expect(readerBackTarget(u("/login?next=/x"))).toBe("/library");
  });

  it("returns an internal app path as-is", () => {
    expect(readerBackTarget(p("/collections/physics"))).toBe(
      "/collections/physics",
    );
    expect(readerBackTarget(p("/"))).toBe("/");
    expect(readerBackTarget(p("/library"))).toBe("/library");
  });

  it("falls back to the library with no origin (fresh deep link)", () => {
    expect(readerBackTarget(null)).toBe("/library");
  });

  it("never goes back into another article or an auth screen", () => {
    expect(readerBackTarget(p("/read/other"))).toBe("/library");
    expect(readerBackTarget(p("/read"))).toBe("/library");
    expect(readerBackTarget(p("/login"))).toBe("/library");
    expect(readerBackTarget(p("/verify"))).toBe("/library");
    expect(readerBackTarget(p("/verify/abc"))).toBe("/library");
  });

  it("rejects anything that isn't a same-origin path", () => {
    expect(readerBackTarget(p("https://evil.example/x"))).toBe("/library");
    expect(readerBackTarget(p("//evil.example/x"))).toBe("/library");
    expect(readerBackTarget(p("/\\evil.example"))).toBe("/library");
    expect(readerBackTarget(p("library"))).toBe("/library");
  });
});
