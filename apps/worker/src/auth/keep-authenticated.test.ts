import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { keepAuthenticated } from "./keep-authenticated.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("keepAuthenticated", () => {
  it("calls refresh on every tick of the interval", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    keepAuthenticated(1000, { refresh });

    await vi.advanceTimersByTimeAsync(3000);

    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("reports a failed refresh via onError and keeps retrying on later ticks", async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error("token refresh failed"))
      .mockResolvedValue(undefined);
    const onError = vi.fn();
    keepAuthenticated(1000, { refresh, onError });

    await vi.advanceTimersByTimeAsync(2000);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("stops scheduling further refreshes once stopped", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const stop = keepAuthenticated(1000, { refresh });

    await vi.advanceTimersByTimeAsync(1000);
    stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
