import { describe, it, expect } from "vitest";
import { splitHomeFeed } from "./home-feed.js";

const art = (id: string, status?: string) => ({
  id,
  expand: status ? { content: { extract_status: status } } : undefined,
});

describe("splitHomeFeed", () => {
  it("puts every non-ready item in active, regardless of count", () => {
    const items = [art("a", "pending"), art("b"), art("c", "failed"), art("d", "partial"), art("e", "ok")];
    const { active } = splitHomeFeed(items);
    expect(active.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("limits recent to ready items up to the limit", () => {
    const items = [art("r1", "ok"), art("r2", "ok"), art("r3", "ok")];
    const { recent } = splitHomeFeed(items, 2);
    expect(recent.map((x) => x.id)).toEqual(["r1", "r2"]);
  });
  it("defaults the recent limit to 6", () => {
    const items = Array.from({ length: 8 }, (_, i) => art(`r${i}`, "ok"));
    expect(splitHomeFeed(items).recent).toHaveLength(6);
  });
});
