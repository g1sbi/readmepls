import { describe, it, expect } from "vitest";
import PocketBase from "pocketbase";
import { sourceFaviconUrl } from "./source-view.js";

// Regression guard: pb.files.getUrl silently returns "" unless the record
// carries id + (collectionId or collectionName). Using a REAL PocketBase
// instance here (no network needed; getUrl is pure string-building) so a
// future refactor that drops collectionName can't hide behind a stub.
describe("sourceFaviconUrl", () => {
  const pb = new PocketBase("http://localhost");

  it("builds a non-empty url containing the collection, id and filename", () => {
    const url = sourceFaviconUrl(pb, "REC123", "fav.png");
    expect(url).toBeTruthy();
    expect(url).toContain("sources");
    expect(url).toContain("REC123");
    expect(url).toContain("fav.png");
  });

  it("returns null when there is no favicon", () => {
    expect(sourceFaviconUrl(pb, "REC123", "")).toBeNull();
  });
});
