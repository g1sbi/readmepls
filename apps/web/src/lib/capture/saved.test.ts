import { describe, it, expect } from "vitest";
import { captureSaved } from "./saved.svelte.js";

describe("captureSaved", () => {
  it("increments on notify", () => {
    const before = captureSaved.count;
    captureSaved.notify();
    expect(captureSaved.count).toBe(before + 1);
  });
});
