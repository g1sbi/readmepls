import { describe, it, expect, vi } from "vitest";
import type PocketBase from "pocketbase";
import { handleCapture } from "./handle-capture.js";

// A real failure to enqueue the job (DB down, permission misconfig, etc.) must
// not be silently swallowed — doing so leaves an article with no job to ever
// process. Only the unique-index violation (the same URL already queued) is a
// tolerable no-op.
function fakePb(jobsCreate: () => Promise<unknown>): PocketBase {
  const articlesCreate = vi.fn(async () => ({ id: "art1" }));
  const pb = {
    articlesCreate,
    collection(name: string) {
      if (name === "content") {
        return { getFirstListItem: async () => Promise.reject(new Error("not found")) };
      }
      if (name === "users") {
        return { getOne: async () => ({ tier: "standard", monthly_quota_used: 0 }) };
      }
      if (name === "jobs") {
        return { create: jobsCreate };
      }
      if (name === "articles") {
        return { create: articlesCreate };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
  return pb as unknown as PocketBase;
}

describe("handleCapture enqueue failure handling", () => {
  it("surfaces a non-unique enqueue error instead of orphaning an article", async () => {
    const pb = fakePb(() => Promise.reject(new Error("database is unavailable")));
    await expect(handleCapture(pb, "user1", "https://example.com/boom")).rejects.toThrow(
      /database is unavailable/
    );
    // The article must not have been created when the job could not be enqueued.
    expect((pb as unknown as { articlesCreate: ReturnType<typeof vi.fn> }).articlesCreate).not.toHaveBeenCalled();
  });

  it("tolerates the unique-violation that means the URL is already queued", async () => {
    const uniqueErr = { data: { canonical_url: { code: "validation_not_unique" } } };
    const pb = fakePb(() => Promise.reject(uniqueErr));
    const r = await handleCapture(pb, "user1", "https://example.com/dup");
    expect(r.status).toBe(200);
    expect((pb as unknown as { articlesCreate: ReturnType<typeof vi.fn> }).articlesCreate).toHaveBeenCalled();
  });
});
