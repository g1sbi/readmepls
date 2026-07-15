import { describe, it, expect } from "vitest";
import { applyPatch } from "$lib/library/url-state.js";
import { LibraryParams } from "@readmepls/types";

describe("applyPatch", () => {
  it("merges a facet patch and resets page to 1", () => {
    const cur = LibraryParams.parse({ read: ["unread"], page: 4 });
    const next = applyPatch(cur, { time: ["long"] });
    expect(next.time).toEqual(["long"]);
    expect(next.read).toEqual(["unread"]);
    expect(next.page).toBe(1);
  });

  it("does not reset page when only the page changes", () => {
    const cur = LibraryParams.parse({ read: ["unread"] });
    expect(applyPatch(cur, { page: 3 }).page).toBe(3);
  });
});
