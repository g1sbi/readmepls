import { describe, it, expect, vi } from "vitest";
import { submitCapture, CAPTURE_MESSAGES } from "./submit.js";

const res = (status: number) => new Response(null, { status });

describe("submitCapture", () => {
  it("posts the url as JSON and reports ok", async () => {
    const f = vi.fn().mockResolvedValue(res(200));
    expect(await submitCapture(f, "https://example.com")).toEqual({ ok: true });
    expect(f).toHaveBeenCalledWith(
      "/api/capture",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" }),
      }),
    );
  });

  it("maps 402 to quota", async () => {
    const f = vi.fn().mockResolvedValue(res(402));
    expect(await submitCapture(f, "https://e.com")).toEqual({
      ok: false,
      reason: "quota",
    });
  });

  it("maps any other non-ok response to rejected", async () => {
    const f = vi.fn().mockResolvedValue(res(500));
    expect(await submitCapture(f, "https://e.com")).toEqual({
      ok: false,
      reason: "rejected",
    });
  });

  it("maps a thrown error to network", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fail"));
    expect(await submitCapture(f, "https://e.com")).toEqual({
      ok: false,
      reason: "network",
    });
  });

  it("returns empty without fetching for blank input", async () => {
    const f = vi.fn();
    expect(await submitCapture(f, "  ")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(f).not.toHaveBeenCalled();
  });

  it("has the exact user-facing copy", () => {
    expect(CAPTURE_MESSAGES).toEqual({
      quota: "You've reached this month's limit — upgrade to save more.",
      rejected: "That link couldn't be saved. Check the address and try again.",
      network: "You're offline or the server didn't answer. Try again.",
    });
  });
});
