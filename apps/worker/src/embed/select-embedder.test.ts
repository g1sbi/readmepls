import { describe, it, expect } from "vitest";
import { selectEmbedder } from "./select-embedder.js";
import { FakeEmbedder } from "./fake-embedder.js";
import type { EmbeddingProvider } from "./provider.js";

const sentinel: EmbeddingProvider = { model: "local", dim: 384, embed: async () => [] };

describe("selectEmbedder", () => {
  it("returns FakeEmbedder when EMBED_PROVIDER=fake", () => {
    const e = selectEmbedder({ EMBED_PROVIDER: "fake" }, () => sentinel);
    expect(e).toBeInstanceOf(FakeEmbedder);
  });
  it("otherwise builds the local embedder lazily via the factory", () => {
    let built = 0;
    const e = selectEmbedder({}, () => { built++; return sentinel; });
    expect(built).toBe(1);
    expect(e).toBe(sentinel);
  });
});
