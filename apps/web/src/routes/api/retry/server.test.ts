import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./+server.js";

function ev(verified: boolean) {
  return {
    request: new Request("http://localhost/api/retry", {
      method: "POST",
      body: JSON.stringify({ articleId: "a1" }),
    }),
    // getOne rejects -> handler catches -> null -> 404, proving the gate passed.
    locals: {
      userId: "u1",
      verified,
      pb: { collection: () => ({ getOne: async () => { throw new Error("nf"); } }) },
    },
  } as never;
}

beforeEach(() => {
  delete process.env.SELF_HOSTED;
});

describe("POST /api/retry verification gate", () => {
  it("rejects an unverified SaaS user with 403", async () => {
    await expect(POST(ev(false))).rejects.toMatchObject({ status: 403 });
  });
  it("passes the gate for a verified user (reaches article lookup -> 404)", async () => {
    await expect(POST(ev(true))).rejects.toMatchObject({ status: 404 });
  });
});
