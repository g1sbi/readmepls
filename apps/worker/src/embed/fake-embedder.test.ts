import { describe, it, expect } from "vitest";
import { FakeEmbedder } from "./fake-embedder.js";
import { dot } from "@readmepls/core";

describe("FakeEmbedder", () => {
  const e = new FakeEmbedder(64);

  it("is deterministic and returns unit vectors of the configured dim", async () => {
    const [a] = await e.embed(["hello world"], "passage");
    const [b] = await e.embed(["hello world"], "passage");
    expect(a).toEqual(b);
    expect(a).toHaveLength(64);
    expect(dot(a!, a!)).toBeCloseTo(1, 6);
  });

  it("ranks a shared-vocabulary text above an unrelated one", async () => {
    const [q] = await e.embed(["cortisol and sleep quality"], "query");
    const [related] = await e.embed(["sleep and cortisol levels at night"], "passage");
    const [unrelated] = await e.embed(["quarterly tax accounting spreadsheet"], "passage");
    expect(dot(q!, related!)).toBeGreaterThan(dot(q!, unrelated!));
  });
});
