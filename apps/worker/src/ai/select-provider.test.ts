import { describe, it, expect, vi } from "vitest";
import { selectAiProvider } from "./select-provider.js";
import { MockAIProvider } from "./mock-provider.js";
import type { AIProvider } from "./provider.js";

describe("selectAiProvider", () => {
  it("returns MockAIProvider for AI_PROVIDER=mock without building the real provider", () => {
    const makeClaude = vi.fn<() => AIProvider>();
    const ai = selectAiProvider({ AI_PROVIDER: "mock" }, makeClaude);
    expect(ai).toBeInstanceOf(MockAIProvider);
    expect(makeClaude).not.toHaveBeenCalled();
  });

  it("builds the real provider lazily when AI_PROVIDER is unset", () => {
    const fake: AIProvider = { tagAndSummarize: async () => ({ tags: [], summary: "" }) };
    const makeClaude = vi.fn(() => fake);
    const ai = selectAiProvider({}, makeClaude);
    expect(makeClaude).toHaveBeenCalledOnce();
    expect(ai).toBe(fake);
  });
});
