import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "./test-harness.js";
import PocketBase from "pocketbase";

let h: PbHandle;
beforeAll(async () => {
  h = await startEphemeralPb();
}, 30000);
afterAll(() => h?.stop());

async function makeUser(email: string): Promise<{ id: string; client: PocketBase }> {
  const u = await h.pb.collection("users").create({
    email, password: "password12345", passwordConfirm: "password12345",
    tier: "standard", monthly_quota_used: 0,
  });
  const client = new PocketBase(h.url);
  await client.collection("users").authWithPassword(email, "password12345");
  return { id: u.id, client };
}

describe("tier self-update isolation", () => {
  it("a user can update their own tier", async () => {
    const a = await makeUser(`tiera${Date.now()}@test.local`);
    await a.client.collection("users").update(a.id, { tier: "pro" });
    const reread = await h.pb.collection("users").getOne(a.id);
    expect(reread.tier).toBe("pro");
  });

  it("a user cannot update another user's tier", async () => {
    const owner = await makeUser(`tierb${Date.now()}@test.local`);
    const intruder = await makeUser(`tierc${Date.now()}@test.local`);
    await expect(
      intruder.client.collection("users").update(owner.id, { tier: "pro" })
    ).rejects.toThrow();
    const reread = await h.pb.collection("users").getOne(owner.id);
    expect(reread.tier).toBe("standard");
  });
});
