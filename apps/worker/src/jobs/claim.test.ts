import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "@readmepls/core/src/pb/test-harness.js";
import { claimNextJob } from "./claim.js";

let h: PbHandle;
beforeAll(async () => {
  h = await startEphemeralPb();
}, 30000);
afterAll(() => h?.stop());

async function seedJob(url: string) {
  return h.pb.collection("jobs").create({
    user: "u1",
    canonical_url: url,
    type: "extract",
    status: "queued",
    attempts: 0,
  });
}

describe("claimNextJob", () => {
  it("claims a queued job exactly once under contention", async () => {
    await seedJob("https://example.com/a");
    const [first, second] = await Promise.all([
      claimNextJob(h.pb, "worker-A"),
      claimNextJob(h.pb, "worker-B"),
    ]);
    const claimed = [first, second].filter(Boolean);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.status).toBe("running");
  });

  it("returns null when no queued jobs remain", async () => {
    const job = await claimNextJob(h.pb, "worker-A");
    expect(job).toBeNull();
  });
});
