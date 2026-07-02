import { describe, it, expect, vi } from "vitest";
import type PocketBase from "pocketbase";
import { deleteArticle } from "./delete.js";

function fakePb(deleteImpl: (id: string) => Promise<void>) {
  const del = vi.fn(deleteImpl);
  const collection = vi.fn(() => ({ delete: del }));
  return { pb: { collection } as unknown as PocketBase, collection, del };
}

describe("deleteArticle", () => {
  it("deletes the article by id via the articles collection", async () => {
    const { pb, collection, del } = fakePb(async () => {});
    await deleteArticle(pb, "a1");
    expect(collection).toHaveBeenCalledWith("articles");
    expect(del).toHaveBeenCalledWith("a1");
  });

  it("propagates errors from PocketBase", async () => {
    const { pb } = fakePb(async () => { throw new Error("403"); });
    await expect(deleteArticle(pb, "a1")).rejects.toThrow("403");
  });
});
