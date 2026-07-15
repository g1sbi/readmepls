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

describe("source_favorites isolation", () => {
  it("a user cannot list another user's favorites", async () => {
    const src = await h.pb.collection("sources").create({
      host: "iso.com", name: "Iso", favicon_status: "none",
    });

    const a = await makeUser(`sfav-a${Date.now()}@test.local`);
    const b = await makeUser(`sfav-b${Date.now()}@test.local`);

    await a.client.collection("source_favorites").create({ user: a.id, source: src.id });

    const seen = await b.client.collection("source_favorites").getFullList();
    expect(seen.length).toBe(0);
  });

  it("a user cannot delete another user's favorite", async () => {
    const src = await h.pb.collection("sources").create({
      host: "iso2.com", name: "Iso2", favicon_status: "none",
    });

    const a = await makeUser(`sfav-c${Date.now()}@test.local`);
    const b = await makeUser(`sfav-d${Date.now()}@test.local`);

    const fav = await a.client.collection("source_favorites").create({ user: a.id, source: src.id });

    await expect(
      b.client.collection("source_favorites").delete(fav.id)
    ).rejects.toThrow();

    const stillExists = await h.pb.collection("source_favorites").getOne(fav.id);
    expect(stillExists.id).toBe(fav.id);
  });
});
