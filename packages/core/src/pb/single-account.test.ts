import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "./test-harness.js";
import PocketBase from "pocketbase";

async function statusOf(url: string): Promise<{ locked: boolean }> {
  const res = await fetch(`${url}/api/single-account/status`);
  return res.json();
}

function signup(url: string, email: string) {
  return new PocketBase(url).collection("users").create({
    email,
    password: "password12345",
    passwordConfirm: "password12345",
    tier: "standard",
    monthly_quota_used: 0,
  });
}

describe("single-account mode enabled", () => {
  let h: PbHandle;
  beforeAll(async () => {
    h = await startEphemeralPb({ env: { SELF_HOSTED: "true", SINGLE_ACCOUNT: "true" } });
  }, 30000);
  afterAll(() => h?.stop());

  it("locks signup after the first account, unlocked before", async () => {
    expect(await statusOf(h.url)).toEqual({ locked: false });

    await signup(h.url, `first-${Date.now()}@test.local`);

    expect(await statusOf(h.url)).toEqual({ locked: true });

    await expect(signup(h.url, `second-${Date.now()}@test.local`)).rejects.toThrow();
  });
});

describe("single-account mode disabled (control)", () => {
  let h: PbHandle;
  beforeAll(async () => {
    h = await startEphemeralPb({ env: { SELF_HOSTED: "true", SINGLE_ACCOUNT: "false" } });
  }, 30000);
  afterAll(() => h?.stop());

  it("allows a second signup when SINGLE_ACCOUNT is false", async () => {
    await signup(h.url, `a-${Date.now()}@test.local`);
    await expect(signup(h.url, `b-${Date.now()}@test.local`)).resolves.toBeDefined();
  });
});
