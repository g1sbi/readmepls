import { describe, it, expect } from "vitest";
import { deriveSourceHost } from "./site-host.js";

describe("deriveSourceHost", () => {
  it("returns the lowercased hostname", () => {
    expect(deriveSourceHost("https://Example.COM/path?q=1")).toBe("example.com");
  });

  it("strips a single leading www.", () => {
    expect(deriveSourceHost("https://www.nytimes.com/x")).toBe("nytimes.com");
  });

  it("keeps other subdomains distinct", () => {
    expect(deriveSourceHost("https://blog.acme.com/p")).toBe("blog.acme.com");
    expect(deriveSourceHost("https://m.nytimes.com/p")).toBe("m.nytimes.com");
  });

  it("does not strip a www that is not the leading label", () => {
    expect(deriveSourceHost("https://wwwfoo.com/")).toBe("wwwfoo.com");
  });

  it("drops the port", () => {
    expect(deriveSourceHost("https://example.com:8443/")).toBe("example.com");
  });

  it("returns null for an unparseable url", () => {
    expect(deriveSourceHost("not a url")).toBeNull();
  });
});
