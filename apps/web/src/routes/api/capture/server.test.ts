import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@readmepls/core", () => ({
  handleCapture: vi.fn(async () => ({ status: 200, body: { ok: true } })),
}));

import { POST } from "./+server.js";
import { handleCapture } from "@readmepls/core";

const mockCapture = handleCapture as unknown as ReturnType<typeof vi.fn>;

function ev(verified: boolean) {
  return {
    request: new Request("http://localhost/api/capture", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com" }),
    }),
    locals: { userId: "u1", verified, pb: {} },
  } as never;
}

beforeEach(() => {
  delete process.env.SELF_HOSTED;
  mockCapture.mockClear();
});

describe("POST /api/capture verification gate", () => {
  it("rejects an unverified SaaS user with 403 before capturing", async () => {
    await expect(POST(ev(false))).rejects.toMatchObject({ status: 403 });
    expect(mockCapture).not.toHaveBeenCalled();
  });
  it("allows a verified user through", async () => {
    const res = await POST(ev(true));
    expect(res.status).toBe(200);
    expect(mockCapture).toHaveBeenCalled();
  });
  it("allows a self-host user regardless of verified", async () => {
    process.env.SELF_HOSTED = "true";
    await POST(ev(false));
    expect(mockCapture).toHaveBeenCalled();
  });
});
