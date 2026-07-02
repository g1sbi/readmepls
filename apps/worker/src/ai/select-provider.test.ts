import { describe, it, expect, vi } from "vitest";
import { selectAiProvider } from "./select-provider.js";
import { MockAIProvider } from "./mock-provider.js";
import { NullAIProvider } from "./null-provider.js";
import type { AIProvider } from "./provider.js";

describe("selectAiProvider", () => {
  it("returns MockAIProvider for AI_PROVIDER=mock without building the real provider", () => {
    const makeClaude = vi.fn<() => AIProvider>();
    const ai = selectAiProvider({ AI_PROVIDER: "mock" }, makeClaude);
    expect(ai).toBeInstanceOf(MockAIProvider);
    expect(makeClaude).not.toHaveBeenCalled();
  });

  it("builds the real provider lazily when a key is present", () => {
    const fake: AIProvider = { tagAndSummarize: async () => ({ tags: [], summary: "" }) };
    const makeClaude = vi.fn(() => fake);
    const ai = selectAiProvider({ ANTHROPIC_API_KEY: "sk-test" }, makeClaude);
    expect(makeClaude).toHaveBeenCalledOnce();
    expect(ai).toBe(fake);
  });

  it("returns NullAIProvider when no key is configured and AI_PROVIDER is not mock", () => {
    const makeClaude = vi.fn<() => AIProvider>();
    const ai = selectAiProvider({}, makeClaude);
    expect(ai).toBeInstanceOf(NullAIProvider);
    expect(makeClaude).not.toHaveBeenCalled();
  });
});
