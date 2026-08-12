import { describe, it, expect, afterEach, vi } from "vitest";

const ORIGINAL_PB_BIN = process.env.PB_BIN;

describe("startEphemeralPb with an unusable binary", () => {
  afterEach(() => {
    if (ORIGINAL_PB_BIN === undefined) delete process.env.PB_BIN;
    else process.env.PB_BIN = ORIGINAL_PB_BIN;
    vi.resetModules();
  });

  // A missing binary makes spawn emit 'error' and 'close' but never 'exit'.
  // runOnce only listened for 'exit', so the promise never settled and the
  // whole run hung instead of failing — the worst outcome in CI.
  it("rejects instead of hanging when the binary is missing", async () => {
    vi.resetModules();
    process.env.PB_BIN = "/nonexistent/pocketbase-does-not-exist";
    const { startEphemeralPb } = await import("./test-harness.js");

    await expect(startEphemeralPb()).rejects.toThrow(/ENOENT|could not run/i);
  }, 10000);
});
