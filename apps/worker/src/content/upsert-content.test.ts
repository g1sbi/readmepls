import { describe, it, expect, vi } from "vitest";
import type PocketBase from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { upsertContent, type ContentFields } from "./upsert-content.js";

const fields: ContentFields = {
  content_hash: "hash1",
  source_type: "article",
  title: "T",
  author: null,
  site_name: null,
  lang: null,
  excerpt: "",
  content_html: "",
  content_text: "",
  word_count: 0,
  read_time: 0,
  hero_image: null,
  published_at: null,
  ai_tags_json: [],
  fetched_at: "2026-01-01T00:00:00.000Z",
  extract_status: "failed",
  failure_reason: "no readable content",
};

function fakePb(
  existing: { id: string } | null,
  ops: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> },
  getFirstListItemError?: Error
): PocketBase {
  const pb = {
    filter: (s: string) => s,
    collection: () => ({
      getFirstListItem: async () => {
        if (getFirstListItemError) throw getFirstListItemError;
        if (!existing) {
          const err = new ClientResponseError({
            status: 404,
            data: {},
            response: { code: 404, message: "not found" },
          } as any);
          throw err;
        }
        return existing;
      },
      create: ops.create,
      update: ops.update,
    }),
  };
  return pb as unknown as PocketBase;
}

describe("upsertContent", () => {
  it("creates a new content row when none exists for the canonical_url", async () => {
    const create = vi.fn(async (payload: unknown) => ({ id: "c1", ...(payload as object) }));
    const update = vi.fn();
    const pb = fakePb(null, { create, update });

    const result = await upsertContent(pb, "https://example.com/x", fields);

    expect(create).toHaveBeenCalledWith({ canonical_url: "https://example.com/x", ...fields });
    expect(update).not.toHaveBeenCalled();
    expect(result.id).toBe("c1");
  });

  it("updates the existing content row when one already exists for the canonical_url", async () => {
    const create = vi.fn();
    const update = vi.fn(async (id: string, payload: unknown) => ({ id, ...(payload as object) }));
    const pb = fakePb({ id: "existing1" }, { create, update });

    const result = await upsertContent(pb, "https://example.com/x", fields);

    expect(update).toHaveBeenCalledWith("existing1", fields);
    expect(create).not.toHaveBeenCalled();
    expect(result.id).toBe("existing1");
  });

  it("propagates non-404 errors instead of treating them as not found", async () => {
    const networkError = new ClientResponseError({
      status: 500,
      data: {},
      response: { code: 500, message: "Internal Server Error" },
    } as any);
    const create = vi.fn();
    const update = vi.fn();
    const pb = fakePb(null, { create, update }, networkError);

    await expect(
      upsertContent(pb, "https://example.com/x", fields)
    ).rejects.toThrow(networkError);

    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("recovers from a concurrent create race by updating the row that won", async () => {
    // Two processJob runs for the same canonical_url both see no existing row,
    // both call create(); this run loses the race on the unique index, gets a
    // 400, and must re-read + update the winner instead of throwing.
    const conflictError = new ClientResponseError({
      status: 400,
      data: { data: { canonical_url: { code: "validation_not_unique" } } },
      response: { code: 400, message: "Failed to create record." },
    } as any);
    const create = vi.fn(async () => {
      throw conflictError;
    });
    const update = vi.fn(async (id: string, payload: unknown) => ({ id, ...(payload as object) }));

    let getFirstListItemCalls = 0;
    const pb = {
      filter: (s: string) => s,
      collection: () => ({
        getFirstListItem: async () => {
          getFirstListItemCalls += 1;
          if (getFirstListItemCalls === 1) {
            throw new ClientResponseError({
              status: 404,
              data: {},
              response: { code: 404, message: "not found" },
            } as any);
          }
          return { id: "winner1" };
        },
        create,
        update,
      }),
    } as unknown as PocketBase;

    const result = await upsertContent(pb, "https://example.com/x", fields);

    expect(create).toHaveBeenCalledTimes(1);
    expect(getFirstListItemCalls).toBe(2);
    expect(update).toHaveBeenCalledWith("winner1", fields);
    expect(result.id).toBe("winner1");
  });

  it("propagates non-conflict create errors instead of swallowing them", async () => {
    const serverError = new ClientResponseError({
      status: 500,
      data: {},
      response: { code: 500, message: "Internal Server Error" },
    } as any);
    const create = vi.fn(async () => {
      throw serverError;
    });
    const update = vi.fn();
    const pb = fakePb(null, { create, update });

    await expect(
      upsertContent(pb, "https://example.com/x", fields)
    ).rejects.toThrow(serverError);

    expect(update).not.toHaveBeenCalled();
  });
});
