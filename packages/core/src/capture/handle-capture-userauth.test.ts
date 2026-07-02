import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "../pb/test-harness.js";
import { handleCapture } from "./handle-capture.js";
import PocketBase from "pocketbase";

// The production capture route runs handleCapture with `locals.pb` — a client
// authenticated as the end user, NOT a superuser. The jobs collection's API
// rules must therefore allow a user to enqueue their own job; otherwise the
// create is rejected and the article is left with no job to process.
let h: PbHandle;
let userClient: PocketBase;
let userId: string;

beforeAll(async () => {
  h = await startEphemeralPb();
  const email = `cap${Date.now()}@test.local`;
  const u = await h.pb.collection("users").create({
    email,
    password: "password12345",
    passwordConfirm: "password12345",
    tier: "standard",
    monthly_quota_used: 0,
  });
  userId = u.id;
  userClient = new PocketBase(h.url);
  await userClient.collection("users").authWithPassword(email, "password12345");
}, 30000);
afterAll(() => h?.stop());

describe("handleCapture via a user-scoped client", () => {
  it("enqueues a job the authenticated user is allowed to create", async () => {
    const r = await handleCapture(userClient, userId, "https://example.com/userauth");
    expect(r.status).toBe(200);
    const job = await h.pb
      .collection("jobs")
      .getFirstListItem(`canonical_url = "https://example.com/userauth"`);
    expect(job.status).toBe("queued");
    expect(job.user).toBe(userId);
  });
});
