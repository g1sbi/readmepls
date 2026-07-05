import { describe, it, expect } from "vitest";
import { load } from "./+page.server.js";

function run(qs: string): { status: number; location: string } {
  try {
    load({ url: new URL(`http://x/search${qs}`) } as never);
    throw new Error("expected redirect");
  } catch (e) {
    return e as { status: number; location: string };
  }
}

describe("/search redirect", () => {
  it("preserves the query", () => {
    const r = run("?q=neural");
    expect(r.status).toBe(308);
    expect(r.location).toBe("/library?q=neural");
  });
  it("redirects bare /search to /library", () => {
    expect(run("").location).toBe("/library");
  });
});
