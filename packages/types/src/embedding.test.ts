import { describe, it, expect } from "vitest";
import { EmbeddingRow, EMBED_DIM, EMBED_MODEL } from "./embedding.js";

describe("EmbeddingRow", () => {
  it("parses a valid row", () => {
    const row = EmbeddingRow.parse({
      id: "e1", content: "c1", chunk_index: 0, char_start: 0, char_end: 5,
      text: "hello", vector: [0.1, 0.2], embed_model: EMBED_MODEL, dim: EMBED_DIM,
    });
    expect(row.content).toBe("c1");
  });
  it("rejects a non-numeric vector", () => {
    expect(() => EmbeddingRow.parse({
      id: "e1", content: "c1", chunk_index: 0, char_start: 0, char_end: 5,
      text: "hello", vector: ["x"], embed_model: EMBED_MODEL, dim: EMBED_DIM,
    })).toThrow();
  });
  it("exposes the default model and dim", () => {
    expect(EMBED_DIM).toBe(384);
    expect(EMBED_MODEL).toBe("Xenova/multilingual-e5-small");
  });
});
