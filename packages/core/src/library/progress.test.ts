import { describe, it, expect } from "vitest";
import { STARTED_THRESHOLD, FINISHED_THRESHOLD } from "./progress.js";

describe("progress thresholds", () => {
  it("exposes the exact shared threshold values", () => {
    expect(STARTED_THRESHOLD).toBe(0.02);
    expect(FINISHED_THRESHOLD).toBe(0.98);
  });
});
