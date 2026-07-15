import { describe, it, expect } from "vitest";
import type PocketBase from "pocketbase";
import { handleCapture } from "./handle-capture.js";

// When a user record has no tier field at all, handleCapture must fall back to
// the standard quota limit (50), not silently allow unlimited captures.
function fakePb(): PocketBase {
  const pb = {
    collection(name: string) {
      if (name === "content") {
        return { getFirstListItem: async () => Promise.reject(new Error("not found")) };
      }
      if (name === "users") {
        // no `tier` field — simulates a pre-migration or malformed row
        return { getOne: async () => ({ monthly_quota_used: 51 }) };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
  return pb as unknown as PocketBase;
}

describe("handleCapture tier fallback", () => {
  it("falls back to the standard quota limit when tier is missing", async () => {
    const r = await handleCapture(fakePb(), "user1", "https://example.com/no-tier");
    expect(r.status).toBe(402);
    expect(r.body.error).toBe("quota exceeded");
  });
});
