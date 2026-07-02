import { describe, it, expect } from "vitest";
import { Source, SourceFavorite, FaviconStatus } from "./source-site.js";

describe("Source schema", () => {
  it("parses a fully populated source", () => {
    const s = Source.parse({
      id: "abc",
      host: "nytimes.com",
      name: "The New York Times",
      favicon: "favicon_a1b2.png",
      favicon_status: "ok",
    });
    expect(s.host).toBe("nytimes.com");
    expect(s.favicon_status).toBe("ok");
  });

  it("allows a null name and empty favicon", () => {
    const s = Source.parse({
      id: "abc",
      host: "blog.acme.com",
      name: null,
      favicon: "",
      favicon_status: "pending",
    });
    expect(s.name).toBeNull();
    expect(s.favicon).toBe("");
  });

  it("rejects an unknown favicon_status", () => {
    expect(() => FaviconStatus.parse("downloading")).toThrow();
  });
});

describe("SourceFavorite schema", () => {
  it("parses a favorite row", () => {
    const f = SourceFavorite.parse({ id: "f1", user: "u1", source: "s1" });
    expect(f.source).toBe("s1");
  });
});
