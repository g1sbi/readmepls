import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { startEphemeralPb, type PbHandle } from "./test-harness.js";

describe("embeddings migration", () => {
  let h: PbHandle;
  beforeAll(async () => { h = await startEphemeralPb(); });
  afterAll(async () => { await h.stop(); });

  it("creates the embeddings collection with worker-only writes", async () => {
    const col = await h.pb.collections.getOne("embeddings");
    const fieldNames = col.fields.map((f: { name: string }) => f.name);
    expect(fieldNames).toEqual(
      expect.arrayContaining(["content", "chunk_index", "char_start", "char_end", "text", "vector", "embed_model", "dim"])
    );
    expect(col.listRule).toBe("@request.auth.id != ''");
    expect(col.viewRule).toBe("@request.auth.id != ''");
    expect(col.createRule).toBeNull();
    expect(col.updateRule).toBeNull();
    expect(col.deleteRule).toBeNull();
  });
});
