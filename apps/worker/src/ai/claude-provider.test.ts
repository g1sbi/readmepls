import { describe, it, expect, vi } from "vitest";
import { ClaudeProvider } from "./claude-provider.js";

describe("ClaudeProvider", () => {
  it("parses a valid tool/JSON response into AITagResult", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ tags: ["ai", "ml"], summary: "About ML." }),
        },
      ],
    });
    const fakeClient = { messages: { create } } as any;
    const provider = new ClaudeProvider(fakeClient, "claude-haiku-4-5");

    const res = await provider.tagAndSummarize("some long article text");

    expect(res.tags).toEqual(["ai", "ml"]);
    expect(res.summary).toBe("About ML.");
    expect(create).toHaveBeenCalledOnce();
  });

  it("throws on malformed model output", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "not json" }],
    });
    const provider = new ClaudeProvider({ messages: { create } } as any, "m");
    await expect(provider.tagAndSummarize("x")).rejects.toThrow();
  });
});
