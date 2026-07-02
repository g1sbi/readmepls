import { describe, it, expect } from "vitest";
import { NullAIProvider } from "./null-provider.js";

describe("NullAIProvider", () => {
  it("returns empty tags and summary without making any call", async () => {
    const provider = new NullAIProvider();
    const result = await provider.tagAndSummarize("some article text");
    expect(result).toEqual({ tags: [], summary: "" });
  });
});
