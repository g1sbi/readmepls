import { describe, it, expect, vi, afterEach } from "vitest";
import { ClientResponseError } from "pocketbase";
import { createCollection } from "./actions.js";

function fakePb(create: ReturnType<typeof vi.fn>, uid: string | null = "u1") {
  return {
    authStore: { model: uid ? { id: uid } : null },
    collection: () => ({ create }),
  } as never;
}

describe("createCollection", () => {
  afterEach(() => vi.restoreAllMocks());

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

  it("reports a 500 as failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const create = vi
      .fn()
      .mockRejectedValue(new ClientResponseError({ status: 500 }));
    expect(await createCollection(fakePb(create), "x")).toEqual({
      ok: false,
      error: "failed",
    });
  });

  it("reports a network error (status 0) as failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const create = vi
      .fn()
      .mockRejectedValue(new ClientResponseError({ status: 0 }));
    expect(await createCollection(fakePb(create), "x")).toEqual({
      ok: false,
      error: "failed",
    });
  });

  it("reports an unexpected throw as failed, and logs it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("boom");
    const create = vi.fn().mockRejectedValue(boom);
    expect(await createCollection(fakePb(create), "x")).toEqual({
      ok: false,
      error: "failed",
    });
    // The UI only says "failed"; the cause has to land somewhere.
    expect(error).toHaveBeenCalledWith("createCollection failed", boom);
  });

  it("doesn't log an expected duplicate", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const create = vi
      .fn()
      .mockRejectedValue(new ClientResponseError({ status: 400 }));
    await createCollection(fakePb(create), "Dup");
    expect(error).not.toHaveBeenCalled();
  });

  it("reports no signed-in user as unauthenticated, without a request", async () => {
    const create = vi.fn();
    expect(await createCollection(fakePb(create, null), "x")).toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(create).not.toHaveBeenCalled();
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
