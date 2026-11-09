import { describe, it, expect, vi } from "vitest";
import { ClientResponseError } from "pocketbase";
import { createCollection } from "./actions.js";

function fakePb(create: ReturnType<typeof vi.fn>, uid: string | null = "u1") {
  return {
    authStore: { model: uid ? { id: uid } : null },
    collection: () => ({ create }),
  } as never;
}

describe("createCollection", () => {
  it("posts the slugified name", async () => {
    const create = vi.fn().mockResolvedValue({});
    const res = await createCollection(fakePb(create), "Long reads");
    expect(res).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith({
      user: "u1",
      name: "Long reads",
      slug: "long-reads",
      parent: "",
      order: 0,
    });
  });

  it("maps a 400 to duplicate", async () => {
    const create = vi
      .fn()
      .mockRejectedValue(new ClientResponseError({ status: 400 }));
    expect(await createCollection(fakePb(create), "Dup")).toEqual({
      ok: false,
      error: "duplicate",
    });
  });

  it("rethrows other failures", async () => {
    const create = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(createCollection(fakePb(create), "x")).rejects.toThrow("boom");
  });

  it("rejects a blank name without a request", async () => {
    const create = vi.fn();
    expect(await createCollection(fakePb(create), "   ")).toEqual({
      ok: false,
      error: "empty",
    });
    expect(create).not.toHaveBeenCalled();
  });
});
