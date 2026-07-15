import { describe, it, expect } from "vitest";
import { sourceView } from "./source-view.js";

// Minimal pb stub: only files.getUrl is used.
const pb = { files: { getUrl: (rec: { id: string }, file: string) => `https://pb/${rec.id}/${file}` } } as any;

describe("sourceView", () => {
  it("builds host, name and favicon url from an expanded source", () => {
    const content = {
      canonical_url: "https://www.nytimes.com/x",
      expand: { source: { id: "s1", host: "nytimes.com", name: "NYT", favicon: "f.png", favicon_status: "ok" } },
    };
    const v = sourceView(pb, content);
    expect(v).toEqual({ host: "nytimes.com", name: "NYT", iconUrl: "https://pb/s1/f.png" });
  });

  it("returns null iconUrl when the source has no favicon", () => {
    const content = {
      canonical_url: "https://acme.com/x",
      expand: { source: { id: "s2", host: "acme.com", name: null, favicon: "", favicon_status: "none" } },
    };
    expect(sourceView(pb, content)?.iconUrl).toBeNull();
  });

  it("falls back to deriving the host when no source is expanded", () => {
    const v = sourceView(pb, { canonical_url: "https://www.blog.io/p" });
    expect(v).toEqual({ host: "blog.io", name: null, iconUrl: null });
  });

  it("returns null when there is no host at all", () => {
    expect(sourceView(pb, { canonical_url: "not a url" })).toBeNull();
  });
});
