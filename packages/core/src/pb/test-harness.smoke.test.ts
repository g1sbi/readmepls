import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { startEphemeralPb, makeTestUser, type PbHandle } from "./test-harness.js";

let h: PbHandle;
beforeAll(async () => {
  h = await startEphemeralPb();
}, 30000);
afterAll(() => h?.stop());

describe("ephemeral PB", () => {
  it("starts and creates a user", async () => {
    const id = await makeTestUser(h.pb);
    expect(id).toBeTruthy();
  });
});
